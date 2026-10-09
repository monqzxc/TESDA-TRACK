"""Fine-tune the matching model on catalog pairs, export it to ONNX and check fastembed reproduces it.

Run from backend/ inside .venv-train:  python -m training.finetune --output models/<name>
Dev-only: torch and sentence-transformers are imported inside main(), so this module imports without them.
"""
import argparse
import json
import random
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from tesda_track.models import Qualification
from tesda_track.services.embeddings import qualification_text
from training.catalog import load_catalog
from training.pairs import eval_exclusions, training_pairs

BASE_MODEL = "intfloat/multilingual-e5-small"
DIMENSIONS = 384
HELD_OUT = 0.05
MIN_PARITY = 0.999


def split_pairs(pairs: list[tuple[str, str]], seed: int) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
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


def _dataset(pairs: list[tuple[str, str]]):
    from datasets import Dataset

    return Dataset.from_dict({"anchor": [f"query: {query}" for query, _ in pairs],
                              "positive": [f"passage: {passage}" for _, passage in pairs]})


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
    from fastembed import TextEmbedding
    from fastembed.common.model_description import ModelSource, PoolingType

    # Registered the way tesda_track.services.embeddings registers CUSTOM_MODELS; the files come from the folder.
    name = f"tesda-track/{folder.name}"
    if not any(m["model"] == name for m in TextEmbedding.list_supported_models()):
        TextEmbedding.add_custom_model(model=name, pooling=PoolingType.MEAN, normalization=True,
                                       sources=ModelSource(hf=BASE_MODEL), dim=DIMENSIONS, model_file="onnx/model.onnx")
    onnx = np.asarray(list(TextEmbedding(name, specific_model_path=str(folder)).embed(texts)), dtype=np.float64)
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
    args = parser.parse_args()

    import torch
    from sentence_transformers import (SentenceTransformer, SentenceTransformerTrainer,
                                       SentenceTransformerTrainingArguments)
    from sentence_transformers.base.sampler import BatchSamplers
    from sentence_transformers.sentence_transformer.losses import CachedMultipleNegativesRankingLoss

    qualifications, _ = load_catalog()
    pairs = training_pairs(qualifications, eval_exclusions())
    train, held_out = split_pairs(pairs, args.seed)
    cuda = torch.cuda.is_available()
    print(f"{len(pairs)} pairs from {len(qualifications)} qualifications: {len(train)} train, "
          f"{len(held_out)} held out; device {'cuda' if cuda else 'cpu'}")

    model = SentenceTransformer(BASE_MODEL)
    model.max_seq_length = 512
    loss = CachedMultipleNegativesRankingLoss(model, mini_batch_size=args.mini_batch_size)
    with tempfile.TemporaryDirectory() as scratch:
        training_args = SentenceTransformerTrainingArguments(
            output_dir=scratch, num_train_epochs=args.epochs, max_steps=args.max_steps or -1,
            per_device_train_batch_size=args.batch_size, per_device_eval_batch_size=args.batch_size,
            learning_rate=args.lr, warmup_steps=0.1, fp16=cuda, batch_sampler=BatchSamplers.NO_DUPLICATES,
            eval_strategy="no", save_strategy="no", logging_steps=10, report_to="none", seed=args.seed)
        trainer = SentenceTransformerTrainer(model=model, args=training_args, train_dataset=_dataset(train),
                                             eval_dataset=_dataset(held_out), loss=loss)
        # The held-out loss is measured outside train() so the steps/s below count training only.
        before = trainer.evaluate()["eval_loss"]
        started = time.perf_counter()
        result = trainer.train()
        seconds = time.perf_counter() - started
        after = trainer.evaluate()["eval_loss"]
    print(f"Trained {result.global_step} steps in {seconds:.0f}s ({result.global_step / seconds:.3f} steps/s); "
          f"held-out loss {before:.4f} -> {after:.4f}")

    output = args.output.resolve()
    model.save_pretrained(str(output))
    export_onnx(output)
    cosine = parity(model, output, parity_texts(qualifications))
    metadata = {"base_model": BASE_MODEL, "seed": args.seed, "epochs": args.epochs, "max_steps": args.max_steps,
                "batch_size": args.batch_size, "mini_batch_size": args.mini_batch_size, "learning_rate": args.lr,
                "pairs": len(pairs), "train_pairs": len(train), "held_out_pairs": len(held_out),
                "held_out_loss": {"before": before, "after": after}, "steps": result.global_step,
                "train_seconds": round(seconds, 1), "device": "cuda" if cuda else "cpu", "parity_cosine": cosine,
                "date": datetime.now(timezone.utc).isoformat(timespec="seconds"), "git_commit": _git_commit()}
    (output / "training.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"Saved {output} (ONNX at onnx/model.onnx); fastembed parity: lowest cosine {cosine:.6f}")
    if cosine < MIN_PARITY:
        raise SystemExit(f"fastembed parity {cosine:.6f} is below {MIN_PARITY}: the ONNX export does not match")


if __name__ == "__main__":
    main()
