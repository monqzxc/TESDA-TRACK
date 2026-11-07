"""Standalone v6 trainer: multi-positive queries against the whole qualification catalog.

Needs only torch, sentence-transformers, onnx and fastembed plus a dataset written by `python -m training.v6
--dataset FILE`, so the same file runs locally and in Google Colab (colab/train_colab_v6.ipynb embeds it).

Each step scores a batch of learner queries against all qualification passages: a bank of passage vectors that is
refreshed during training, with gradients through the batch's positives and its hardest negatives (GradCache style,
so memory stays bounded). Every positive must beat the log-sum-exp of all negatives; other levels of an owner's
family are left out of the negatives unless the query names a level. Unrelated goals (no owner: careers with no TESDA
qualification, non-goals, vague requests) are mixed into every batch, and their highest z-score against the catalog,
the number the app rejects on, is pushed below a margin, so matching more does not cost rejection.

    python v6_train.py --data v6-dataset.json --base <recovered v4 folder> --output <new model folder>
"""
import argparse
import hashlib
import json
import math
import random
import shutil
import time
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

import numpy as np

PARITY_TEXTS = 10
MIN_PARITY = 0.999


def digest(path: Path) -> str:
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def load_dataset(path: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    names, families = data["names"], data["families"]
    if len(names) != len(data["passages"]) or len(names) != len(families):
        raise ValueError("Dataset names, passages and families differ in length")
    by_family: dict[str, list[int]] = {}
    for index, fam in enumerate(families):
        by_family.setdefault(fam, []).append(index)
    texts = [row[0] for row in data["items"]]
    positives = np.zeros((len(texts), len(names)), dtype=bool)
    neutral = np.zeros_like(positives)
    held = np.array([bool(row[3]) for row in data["items"]])
    for i, (_, owners, names_level, _) in enumerate(data["items"]):
        if not names_level:
            for owner in owners:
                neutral[i, by_family[families[owner]]] = True
        positives[i, owners] = True
    neutral &= ~positives
    return data, texts, positives, neutral, held


class Trainer:
    def __init__(self, model, passages: list[str], chunk: int, scale: float, device: str, precision: str = "auto"):
        import torch

        self.torch, self.model, self.chunk, self.scale, self.device = torch, model, chunk, scale, device
        self.passages = [f"passage: {p}" for p in passages]
        if precision == "auto":
            # Ampere or newer: bfloat16. Older GPUs such as Colab's T4: float16 with a gradient scaler.
            native_bf16 = device == "cuda" and torch.cuda.get_device_capability()[0] >= 8
            precision = "bf16" if native_bf16 else "fp16" if device == "cuda" else "fp32"
        self.dtype = {"bf16": torch.bfloat16, "fp16": torch.float16, "fp32": torch.float32}[precision]
        self.scaler = torch.amp.GradScaler("cuda", enabled=self.dtype == torch.float16)
        self.bank = None

    def embed(self, texts: list[str]):
        torch = self.torch
        prepare = getattr(self.model, "preprocess", None) or self.model.tokenize
        features = {k: v.to(self.device) if isinstance(v, torch.Tensor) else v for k, v in prepare(texts).items()}
        with torch.autocast(device_type=self.device, dtype=self.dtype, enabled=self.dtype != torch.float32):
            output = self.model(features)["sentence_embedding"]
        return output.float()

    def embed_no_grad(self, texts: list[str]):
        with self.torch.no_grad():
            return self.torch.cat([self.embed(texts[i:i + self.chunk]) for i in range(0, len(texts), self.chunk)])

    def refresh(self):
        self.bank = self.embed_no_grad(self.passages)

    def loss(self, queries, passages, pos, neu, unrelated_weight: float = 1.0, z_margin: float = 3.0):
        """Mean over the batch's rows. A related row (one with owners): every positive must beat the log-sum-exp of
        all negatives, neutral passages left out. An unrelated row: its soft-maximum z-score against the whole
        catalog must stay below z_margin (the app shows nothing below its calibrated floor, about 3.5)."""
        torch = self.torch
        functional = torch.nn.functional
        scores = self.scale * queries @ passages.T
        related = pos.any(1)
        per_row = torch.zeros(len(queries), device=queries.device)
        if related.any():
            s, p, n = scores[related], pos[related], neu[related]
            lse = torch.logsumexp(s.masked_fill(p | n, float("-inf")), dim=1, keepdim=True)
            per_row[related] = (functional.softplus(lse - s) * p).sum(1) / p.sum(1)
        if (~related).any():
            per_row[~related] = unrelated_weight * functional.softplus(2 * (self.top_z(scores[~related]) - z_margin)) / 2
        return per_row.mean()

    @staticmethod
    def top_z(scores, sharpness: float = 4.0):
        """A smooth maximum of each row's z-scores: how far the best qualification stands above the catalog."""
        z = (scores - scores.mean(1, keepdim=True)) / scores.std(1, keepdim=True).clamp_min(1e-6)
        return z.mul(sharpness).logsumexp(1) / sharpness

    def step(self, texts: list[str], pos, neu, hard_k: int, max_passages: int, unrelated_weight: float = 1.0):
        torch = self.torch
        query_texts = [f"query: {t}" for t in texts]
        queries = self.embed_no_grad(query_texts)
        with torch.no_grad():
            hard = (queries @ self.bank.T).masked_fill(pos | neu, float("-inf")).topk(hard_k, dim=1).indices.flatten()
            chosen = list(dict.fromkeys(pos.nonzero()[:, 1].tolist() + hard.tolist()))[:max_passages]
        index = torch.tensor(chosen, device=self.device)
        fresh = self.embed_no_grad([self.passages[i] for i in chosen])
        self.bank[index] = fresh
        q_leaf = queries.clone().requires_grad_()
        p_leaf = fresh.clone().requires_grad_()
        loss = self.loss(q_leaf, self.bank.index_copy(0, index, p_leaf), pos, neu, unrelated_weight)
        loss.backward()
        # Second pass with gradients, chunk by chunk (no dropout: the model is in eval mode, so both passes agree).
        # scaler.scale() multiplies by the loss scale under fp16 and returns the gradient unchanged otherwise.
        for texts_, grads in ((query_texts, q_leaf.grad), ([self.passages[i] for i in chosen], p_leaf.grad)):
            for start in range(0, len(texts_), self.chunk):
                self.embed(texts_[start:start + self.chunk]).backward(
                    self.scaler.scale(grads[start:start + self.chunk]))
        return loss.item(), len(chosen)

    def evaluate(self, texts, pos, neu, batch: int = 128) -> tuple[float, float | None]:
        """Mean loss, and the share of unrelated rows whose top z-score is below 3.5 (a rough rejection proxy)."""
        total, below, unrelated = 0.0, 0, 0
        with self.torch.no_grad():
            for start in range(0, len(texts), batch):
                q = self.embed_no_grad([f"query: {t}" for t in texts[start:start + batch]])
                p, n = pos[start:start + batch], neu[start:start + batch]
                total += float(self.loss(q, self.bank, p, n)) * len(q)
                none = ~p.any(1)
                if none.any():
                    z = self.top_z(self.scale * q[none] @ self.bank.T, sharpness=50.0)
                    below += int((z < 3.5).sum())
                    unrelated += int(none.sum())
        return total / max(len(texts), 1), (below / unrelated if unrelated else None)


def export_onnx(folder: Path) -> Path:
    """The transformer as ONNX with the inputs and output fastembed runs (same export as training/finetune.py)."""
    import torch
    from transformers import AutoModel, AutoTokenizer

    class LastHiddenState(torch.nn.Module):
        def __init__(self, model):
            super().__init__()
            self.model = model

        def forward(self, input_ids, attention_mask, token_type_ids):
            return self.model(input_ids=input_ids, attention_mask=attention_mask,
                              token_type_ids=token_type_ids).last_hidden_state

    model = AutoModel.from_pretrained(folder, attn_implementation="eager").eval()
    sample = AutoTokenizer.from_pretrained(folder)(["query: cook", "passage: a longer text, so the first is padded"],
                                                   padding=True, return_tensors="pt")
    inputs = (sample["input_ids"], sample["attention_mask"], torch.zeros_like(sample["input_ids"]))
    names = ["input_ids", "attention_mask", "token_type_ids"]
    path = folder / "onnx" / "model.onnx"
    path.parent.mkdir(parents=True, exist_ok=True)
    with torch.no_grad():
        torch.onnx.export(LastHiddenState(model), inputs, str(path), input_names=names,
                          output_names=["last_hidden_state"], opset_version=14, dynamo=False,
                          dynamic_axes={name: {0: "batch_size", 1: "sequence_length"}
                                        for name in [*names, "last_hidden_state"]})
    return path


def parity(model, folder: Path, texts: list[str]) -> float:
    """Lowest cosine between fastembed's vectors for the exported folder (what the API runs) and the model's own."""
    from fastembed import TextEmbedding
    from fastembed.common.model_description import ModelSource, PoolingType

    name = "tesda-track/" + folder.name
    if not any(m["model"] == name for m in TextEmbedding.list_supported_models()):
        TextEmbedding.add_custom_model(model=name, pooling=PoolingType.MEAN, normalization=True,
                                       sources=ModelSource(hf=name), dim=384, model_file="onnx/model.onnx")
    served = np.asarray(list(TextEmbedding(name, specific_model_path=str(folder)).embed(texts)), dtype=np.float64)
    reference = np.asarray(model.encode(texts, normalize_embeddings=True), dtype=np.float64)
    return float(np.min(np.sum(served * reference, axis=1)))


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data", type=Path, required=True, help="dataset from `python -m training.v6 --dataset`")
    parser.add_argument("--base", type=Path, required=True, help="sentence-transformers folder to continue from")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--epochs", type=float, default=1.0)
    parser.add_argument("--batch-size", type=int, default=48)
    parser.add_argument("--chunk", type=int, default=8, help="texts per forward pass; lower it if memory runs out")
    parser.add_argument("--train-word-embeddings", action="store_true",
                        help="also update the 250k-token embedding table (needs ~1.1 GB more GPU memory)")
    parser.add_argument("--hard-k", type=int, default=2, help="hardest bank negatives per query that get gradients")
    parser.add_argument("--max-passages", type=int, default=96)
    parser.add_argument("--unrelated-per-batch", type=int, default=8,
                        help="unrelated goals (no owner) added to every batch, cycling through them")
    parser.add_argument("--unrelated-weight", type=float, default=1.0)
    parser.add_argument("--scale", type=float, default=20.0)
    parser.add_argument("--lr", type=float, default=1e-5)
    parser.add_argument("--refresh-steps", type=int, default=100)
    parser.add_argument("--save-steps", type=int, default=100)
    parser.add_argument("--max-steps", type=int, default=None)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--precision", choices=("auto", "bf16", "fp16", "fp32"), default="auto",
                        help="auto: bf16 on Ampere or newer, fp16 with a gradient scaler on older GPUs (T4)")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args(argv)

    import torch
    from sentence_transformers import SentenceTransformer

    data, texts, positives, neutral, held = load_dataset(args.data)
    output = args.output.resolve()
    checkpoint = output / "checkpoint"
    if (output / "onnx" / "model.onnx").exists() or (output / "training.json").exists():
        raise SystemExit(f"{output} already holds a finished model: choose a new folder")
    if checkpoint.exists() and not args.resume:
        raise SystemExit(f"{checkpoint} holds an unfinished run: add --resume or delete the folder")
    # chunk changes memory use, not the result, so a resume may lower it.
    settings = {k: v for k, v in vars(args).items() if k not in ("data", "base", "output", "resume", "chunk")}
    signature = {"settings": settings, "dataset_sha256": digest(args.data)}
    output.mkdir(parents=True, exist_ok=True)
    if args.resume and json.loads((output / "run_config.json").read_text(encoding="utf-8")) != signature:
        raise SystemExit("Resume data/settings differ from run_config.json")
    (output / "run_config.json").write_text(json.dumps(signature, indent=2) + "\n", encoding="utf-8")

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    device = "cuda" if torch.cuda.is_available() and torch.cuda.device_count() else "cpu"
    resuming = args.resume and (checkpoint / "trainer_state.pt").exists()
    model = SentenceTransformer(str(checkpoint if resuming else args.base), device=device)
    model.max_seq_length = 512
    model.eval()  # no dropout: the cached and the re-run forward passes must agree
    if not args.train_word_embeddings:
        # Keeps the multilingual vocabulary as the parent had it and frees the optimizer state of 96M parameters.
        model[0].auto_model.embeddings.word_embeddings.weight.requires_grad_(False)
    trainable = [p for p in model.parameters() if p.requires_grad]
    trainer = Trainer(model, data["passages"], args.chunk, args.scale, device, args.precision)
    to_device = lambda a: torch.from_numpy(a).to(device)  # noqa: E731
    unrelated = ~positives.any(1)
    train_idx, held_idx = np.flatnonzero(~held & ~unrelated), np.flatnonzero(held)
    unrelated_idx = np.flatnonzero(~held & unrelated)
    if args.unrelated_per_batch and not len(unrelated_idx):
        raise SystemExit("The dataset has no unrelated goals; rebuild it or pass --unrelated-per-batch 0")
    held_texts = [texts[i] for i in held_idx]
    held_pos, held_neu = to_device(positives[held_idx]), to_device(neutral[held_idx])

    steps_per_epoch = math.ceil(len(train_idx) / args.batch_size)
    total = args.max_steps or math.ceil(steps_per_epoch * args.epochs)
    optimizer = torch.optim.AdamW(trainable, lr=args.lr, weight_decay=0.01)
    warmup = max(1, round(0.05 * total))
    scheduler = torch.optim.lr_scheduler.LambdaLR(
        optimizer, lambda s: min((s + 1) / warmup, max(0.0, (total - s) / max(1, total - warmup))))
    start_step, before = 0, None
    if resuming:
        state = torch.load(checkpoint / "trainer_state.pt", weights_only=True)
        optimizer.load_state_dict(state["optimizer"])
        scheduler.load_state_dict(state["scheduler"])
        trainer.scaler.load_state_dict(state["scaler"])
        start_step, before = state["step"], state["before"]
        print(f"Resuming at step {start_step}", flush=True)
    order, extra, rng = [], [], random.Random(args.seed)
    for _ in range(math.ceil(total / steps_per_epoch) + 1):
        epoch = train_idx.tolist()
        rng.shuffle(epoch)
        order += [epoch[i:i + args.batch_size] for i in range(0, len(epoch), args.batch_size)]
    while len(extra) < total * args.unrelated_per_batch:
        cycle = unrelated_idx.tolist()
        rng.shuffle(cycle)
        extra += cycle
    order = [batch + extra[step * args.unrelated_per_batch:(step + 1) * args.unrelated_per_batch]
             for step, batch in enumerate(order[:total])]
    print(f"{len(texts)} queries ({len(train_idx)} related and {len(unrelated_idx)} unrelated train, "
          f"{len(held_idx)} held out), {len(data['names'])} passages; {total} steps of {args.batch_size} + "
          f"{args.unrelated_per_batch} unrelated; device {device} ({trainer.dtype})", flush=True)

    trainer.refresh()
    if before is None:
        before = list(trainer.evaluate(held_texts, held_pos, held_neu))
        print(f"held-out loss before: {before[0]:.4f}; unrelated below z 3.5: {before[1]}", flush=True)
    started, recent = time.perf_counter(), []
    for step in range(start_step, total):
        if step > start_step and step % args.refresh_steps == 0:
            trainer.refresh()
        batch = order[step]
        optimizer.zero_grad(set_to_none=True)
        loss, used = trainer.step([texts[i] for i in batch], to_device(positives[batch]), to_device(neutral[batch]),
                                  args.hard_k, args.max_passages, args.unrelated_weight)
        trainer.scaler.unscale_(optimizer)
        torch.nn.utils.clip_grad_norm_(trainable, 1.0)
        trainer.scaler.step(optimizer)
        trainer.scaler.update()
        scheduler.step()
        recent.append(loss)
        if (step + 1) % 20 == 0 or step + 1 == total:
            rate = (step + 1 - start_step) / (time.perf_counter() - started)
            print(f"step {step + 1}/{total} loss {np.mean(recent):.4f} passages {used} "
                  f"lr {scheduler.get_last_lr()[0]:.2e} {rate:.2f} steps/s eta {(total - step - 1) / rate / 60:.0f} min",
                  flush=True)
            recent = []
        if (step + 1) % args.save_steps == 0 and step + 1 < total:
            model.save_pretrained(str(checkpoint))
            torch.save({"optimizer": optimizer.state_dict(), "scheduler": scheduler.state_dict(),
                        "scaler": trainer.scaler.state_dict(), "step": step + 1, "before": before},
                       checkpoint / "trainer_state.pt")
    seconds = time.perf_counter() - started
    trainer.refresh()
    after = list(trainer.evaluate(held_texts, held_pos, held_neu))
    print(f"held-out loss after: {after[0]:.4f}; unrelated below z 3.5: {after[1]}; trained {total - start_step} "
          f"steps in {seconds / 60:.1f} min", flush=True)

    model.save_pretrained(str(output))
    export_onnx(output)
    sample = data["passages"][::max(1, len(data["passages"]) // PARITY_TEXTS)][:PARITY_TEXTS // 2]
    cosine = parity(model, output, [f"passage: {p}" for p in sample] +
                    [f"query: {t}" for t in held_texts[:PARITY_TEXTS // 2]])
    print(f"fastembed parity: lowest cosine {cosine:.6f}", flush=True)
    if not np.isfinite(cosine) or cosine < MIN_PARITY:
        raise SystemExit(f"fastembed parity {cosine:.6f} is below {MIN_PARITY}: the ONNX export does not match")
    recovered = args.base / "recovered_from.txt"
    metadata = {"profile": data.get("profile", "v6"), "base": args.base.name,
                "recovered_from": recovered.read_text(encoding="utf-8").splitlines() if recovered.exists() else None,
                "settings": settings, "dataset_sha256": signature["dataset_sha256"], "data": data["audit"],
                "steps": total, "held_out_loss": {"before": before[0], "after": after[0]},
                "held_out_unrelated_below_z35": {"before": before[1], "after": after[1]},
                "train_seconds": round(seconds, 1), "device": device,
                "gpu": torch.cuda.get_device_name(0) if device == "cuda" else None, "dtype": str(trainer.dtype),
                "parity_cosine": cosine, "date": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "packages": {n: version(n) for n in ("torch", "sentence-transformers", "transformers", "onnx",
                                                     "fastembed")}}
    (output / "training.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    shutil.rmtree(checkpoint, ignore_errors=True)


if __name__ == "__main__":
    main()
