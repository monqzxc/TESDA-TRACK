"""Fine-tune the matching model on catalog pairs, export it to ONNX and check fastembed reproduces it.

Run from backend/ inside .venv-train:  python -m training.finetune --output models/<name>
(add --resume to continue an interrupted run from its last epoch checkpoint).
Dev-only: torch and sentence-transformers are imported inside main(), so this module imports without them.
"""
import argparse
import hashlib
import json
import random
import re
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from tesda_track.models import Qualification
from tesda_track.services.embeddings import qualification_text
from training.catalog import load_catalog
from tesda_track.utils.helpers import normalize
from training.pairs import eval_exclusions, family, load_synthetic, names_a_level, training_pairs

BASE_MODEL = "intfloat/multilingual-e5-small"
HELD_OUT = 0.05
MIN_PARITY = 0.999


def check_output_folder(output: Path, resume: bool, checkpoint: str | None) -> None:
    """Refuse a folder that already holds a model, so one folder and name never mix two vector spaces.

    Stored embeddings are keyed by model name and text, and calibration.json lives in the folder, so a retrain under
    the same name would keep stale vectors and scores. Only an unfinished run may continue, with --resume.
    """
    if resume and checkpoint is None:
        raise SystemExit(f"--resume: no checkpoint in {output / 'checkpoints'}")
    if checkpoint and not resume:
        raise SystemExit(f"{output / 'checkpoints'} holds an unfinished run: add --resume to continue it, "
                         "or delete the folder")
    if (output / "onnx" / "model.onnx").exists() or (output / "training.json").exists():
        if not (resume and checkpoint):
            raise SystemExit(f"{output} already holds a finished model: train into a new folder and give the model "
                             "a new name, e.g. tesda-e5-small-v2")


def split_pairs(pairs: list[tuple], seed: int) -> tuple[list[tuple], list[tuple]]:
    """A seeded 5% of the pairs for the evaluation loss; every qualification keeps most of its pairs for training."""
    shuffled = list(pairs)
    random.Random(seed).shuffle(shuffled)
    cut = max(1, round(len(shuffled) * HELD_OUT))
    return shuffled[cut:], shuffled[:cut]


def parity_texts(qualifications: list[Qualification]) -> list[str]:
    """Ten catalog texts of very different lengths, so fastembed has to pad within its batch."""
    sample = qualifications[::max(1, len(qualifications) // 10)][:10]
    return ([f"passage: {qualification_text(q)}" for q in sample[:5]] +
            [f"query: {q.name.lower()}" for q in sample[5:]])


def attach_negatives(pairs: list[tuple[str, str]], rows: list[dict], qualifications: list[Qualification],
                     seed: int, allow_sibling: bool = False) -> tuple[list[tuple[str, str, str]], int]:
    """(query, passage, negative passage) for every pair, plus how many had no mined negative.

    One dataset needs the same columns in every row, so each pair gets exactly one negative: a seeded pick among its
    mined ones. A pair with none mined gets a random passage of a qualification that does not own the query,
    which is no harder than an in-batch negative, so those pairs still train like plain pairs.

    Another level of the positive's own family ("Cookery NC III" for "Cookery NC II") is often a correct answer, so
    it is dropped as a negative unless the query names a level or allow_sibling is set."""
    passage_of = {q.name: qualification_text(q) for q in qualifications}
    name_of = {passage: name for name, passage in passage_of.items()}
    mined: dict[tuple[str, str], list[str]] = {}
    for row in rows:
        sibling = family(row["negative_name"]) == family(row["positive_name"])
        if sibling and not allow_sibling and not names_a_level(row["query"]):
            continue
        if row["negative_name"] in passage_of:
            mined.setdefault((row["query"], row["positive_name"]), []).append(passage_of[row["negative_name"]])
    # Every qualification a query belongs to is a correct answer, so none may be its random negative either.
    owners: dict[str, set[str]] = {}
    for query, passage in pairs:
        owners.setdefault(normalize(query), set()).add(name_of[passage])
    for row in rows:
        owners.setdefault(normalize(row["query"]), set()).add(row["positive_name"])
    rng = random.Random(seed)
    names = sorted(passage_of)
    triplets, missing = [], 0
    for query, passage in pairs:
        options = mined.get((query, name_of[passage]))
        if not options:
            missing += 1
            own = owners[normalize(query)]
            own_families = {family(n) for n in own}
            skip_family = not (allow_sibling or names_a_level(query))
            candidates = [n for n in names if n not in own and not (skip_family and family(n) in own_families)]
            options = [passage_of[rng.choice(candidates)]]
        triplets.append((query, passage, rng.choice(options)))
    return triplets, missing


def _dataset(pairs: list[tuple]):
    from datasets import Dataset

    columns = {"anchor": [f"query: {row[0]}" for row in pairs], "positive": [f"passage: {row[1]}" for row in pairs]}
    if pairs and len(pairs[0]) == 3:
        columns["negative"] = [f"passage: {row[2]}" for row in pairs]
    return Dataset.from_dict(columns)


def export_onnx(folder: Path) -> Path:
    """The saved transformer as ONNX with the base export's inputs and output, which is what fastembed runs.

    Uses the TorchScript exporter: optimum (sentence-transformers' ONNX backend) does not support transformers 5.
    Eager attention and a padded example keep the attention mask in the traced graph.
    """
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
    """The lowest cosine between fastembed's vectors for the exported folder and sentence-transformers' own."""
    from tesda_track.services.embeddings import E5Embedder

    # The loader the API uses; its model is called directly because the texts already carry E5's prefixes.
    embedder = E5Embedder(f"tesda-track/{folder.name}", model_path=str(folder))
    onnx = np.asarray(list(embedder._model.embed(texts)), dtype=np.float64)
    reference = np.asarray(model.encode(texts, normalize_embeddings=True), dtype=np.float64)
    return float(np.min(np.sum(onnx * reference, axis=1)))


def _git_commit() -> str | None:
    try:
        result = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True,
                                cwd=Path(__file__).resolve().parent)
        return result.stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output", type=Path, required=True, help="model folder, e.g. models/e5-small-tesda")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--mini-batch-size", type=int, default=8, help="GradCache chunk; lower it if memory runs out")
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-steps", type=int, default=None, help="stop early (smoke runs)")
    parser.add_argument("--hard-negatives", type=Path, default=None,
                        help="file from `python -m training.mine`: train on (query, positive, hard negative) triplets")
    parser.add_argument("--allow-sibling-negatives", action="store_true",
                        help="keep other levels of the positive's own family as hard negatives (default: drop them "
                             "unless the query names a level)")
    parser.add_argument("--augment-share", type=float, default=0.15, help="share of synthetic queries given a typo copy")
    parser.add_argument("--no-synthetic", action="store_true", help="catalog-only pairs, without data/synthetic")
    parser.add_argument("--resume", action="store_true", help="continue from the checkpoint in <output>/checkpoints")
    args = parser.parse_args()

    import torch
    from sentence_transformers import (SentenceTransformer, SentenceTransformerTrainer,
                                       SentenceTransformerTrainingArguments)
    from sentence_transformers.base.sampler import BatchSamplers
    from sentence_transformers.sentence_transformer.losses import CachedMultipleNegativesRankingLoss
    from transformers.trainer_utils import get_last_checkpoint

    output = args.output.resolve()
    checkpoints = output / "checkpoints"
    checkpoint = get_last_checkpoint(str(checkpoints)) if checkpoints.is_dir() else None
    check_output_folder(output, args.resume, checkpoint)
    # training.json marks a finished, verified model: drop any old one until this run passes the parity check.
    (output / "training.json").unlink(missing_ok=True)

    qualifications, _ = load_catalog()
    synthetic = {} if args.no_synthetic else load_synthetic()
    exclusions = eval_exclusions()
    pairs = training_pairs(qualifications, exclusions, synthetic, args.augment_share)
    plain = len(training_pairs(qualifications, exclusions, synthetic, 0))
    synthetic_pairs = plain - len(training_pairs(qualifications, exclusions))
    augmented_pairs = len(pairs) - plain
    train, held_out = split_pairs(pairs, args.seed)
    negatives_hash = unmined = None
    if args.hard_negatives:
        raw = args.hard_negatives.read_bytes()
        negatives_hash = hashlib.sha256(raw).hexdigest()
        train, unmined = attach_negatives(train, json.loads(raw), qualifications, args.seed, args.allow_sibling_negatives)
        held_out, _ = attach_negatives(held_out, json.loads(raw), qualifications, args.seed, args.allow_sibling_negatives)
        print(f"Hard negatives from {args.hard_negatives} (sha256 {negatives_hash[:12]}): "
              f"{unmined} of {len(train)} train pairs had none mined and got a random negative")
    cuda = torch.cuda.is_available()
    print(f"{len(pairs)} pairs from {len(qualifications)} qualifications: {len(train)} train, "
          f"{len(held_out)} held out; device {'cuda' if cuda else 'cpu'}")

    model = SentenceTransformer(BASE_MODEL)
    model.max_seq_length = 512
    loss = CachedMultipleNegativesRankingLoss(model, mini_batch_size=args.mini_batch_size)
    # A checkpoint at the end of every epoch, so an interrupted run loses at most one epoch.
    training_args = SentenceTransformerTrainingArguments(
        output_dir=str(checkpoints), num_train_epochs=args.epochs, max_steps=args.max_steps or -1,
        per_device_train_batch_size=args.batch_size, per_device_eval_batch_size=args.batch_size,
        learning_rate=args.lr, warmup_steps=0.1, fp16=cuda, batch_sampler=BatchSamplers.NO_DUPLICATES,
        eval_strategy="no", save_strategy="epoch", save_total_limit=1, logging_steps=10, report_to="none",
        seed=args.seed)
    trainer = SentenceTransformerTrainer(model=model, args=training_args, train_dataset=_dataset(train),
                                         eval_dataset=_dataset(held_out), loss=loss)
    # The held-out loss is measured outside train() so the steps/s below count training only.
    before = trainer.evaluate()["eval_loss"]
    resumed_at = int(re.search(r"(\d+)$", checkpoint).group(1)) if checkpoint else 0
    if checkpoint:
        print(f"Resuming from {checkpoint} (step {resumed_at})")
    started = time.perf_counter()
    result = trainer.train(resume_from_checkpoint=checkpoint)
    seconds = time.perf_counter() - started
    after = trainer.evaluate()["eval_loss"]
    steps = result.global_step - resumed_at
    print(f"Trained {steps} steps in {seconds:.0f}s ({steps / max(seconds, 1e-9):.3f} steps/s), {result.global_step} "
          f"in all; held-out loss {before:.4f} -> {after:.4f}")

    model.save_pretrained(str(output))
    export_onnx(output)
    cosine = parity(model, output, parity_texts(qualifications))
    print(f"Saved {output} (ONNX at onnx/model.onnx); fastembed parity: lowest cosine {cosine:.6f}")
    if cosine < MIN_PARITY:
        raise SystemExit(f"fastembed parity {cosine:.6f} is below {MIN_PARITY}: the ONNX export does not match")
    metadata = {"base_model": BASE_MODEL, "seed": args.seed, "epochs": args.epochs, "max_steps": args.max_steps,
                "batch_size": args.batch_size, "mini_batch_size": args.mini_batch_size, "learning_rate": args.lr,
                "pairs": len(pairs), "synthetic_queries": sum(len(v) for v in synthetic.values()),
                "synthetic_pairs": synthetic_pairs, "augment_share": args.augment_share,
                "augmented_pairs": augmented_pairs, "allow_sibling_negatives": args.allow_sibling_negatives,
                "hard_negatives_sha256": negatives_hash, "pairs_without_mined_negative": unmined, "train_pairs": len(train), "held_out_pairs": len(held_out),
                "held_out_loss": {"before": before, "after": after}, "steps": result.global_step,
                "resumed_at_step": resumed_at, "train_seconds": round(seconds, 1), "device": "cuda" if cuda else "cpu",
                "parity_cosine": cosine, "date": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "git_commit": _git_commit()}
    (output / "training.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8", newline="\n")
    shutil.rmtree(checkpoints, ignore_errors=True)


if __name__ == "__main__":
    main()
