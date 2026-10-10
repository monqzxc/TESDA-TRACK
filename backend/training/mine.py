"""Mine hard negatives for fine-tuning: for each training query, the qualifications that look closest but are wrong.

Run from backend/ in the main environment (fastembed ONNX on CPU, no torch):
    python -m training.mine --model-path models/tesda-e5-small-v1 --output training/runs/hard-negatives.json [--k 2]
A query that belongs to several qualifications excludes all of them. Output: [{query, positive_name, negative_name}].
"""
import argparse
import json
import time
from pathlib import Path

import numpy as np

from tesda_track.services.embeddings import qualification_text


def mine_negatives(pairs: list[tuple[str, str]], passages: dict[str, str], embedder, k: int = 2,
                   batch: int = 512) -> list[dict]:
    """pairs are (query, qualification name); passages maps name -> passage text. Returns k rows per pair."""
    names = list(passages)
    matrix = np.asarray(embedder.embed_passages([passages[n] for n in names]), dtype=np.float32)
    owners: dict[str, set[str]] = {}
    for query, name in pairs:
        owners.setdefault(query, set()).add(name)
    queries = list(owners)
    index = {name: i for i, name in enumerate(names)}
    top: dict[str, list[str]] = {}
    for start in range(0, len(queries), batch):
        chunk = queries[start:start + batch]
        scores = np.asarray(embedder.embed_queries(chunk), dtype=np.float32) @ matrix.T
        for row, query in zip(scores, chunk):
            row = row.copy()
            row[[index[n] for n in owners[query]]] = -np.inf
            best = np.argsort(-row)[:k]
            top[query] = [names[i] for i in best if np.isfinite(row[i])]
    return [{"query": query, "positive_name": name, "negative_name": negative}
            for query, name in pairs for negative in top[query]]


def write_negatives(rows: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")


def main() -> None:
    from tesda_track.services.embeddings import E5Embedder
    from training.catalog import load_catalog
    from training.pairs import eval_exclusions, load_synthetic, training_pairs

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model-path", type=Path, required=True, help="e.g. models/tesda-e5-small-v1")
    parser.add_argument("--model-name", help="default: tesda-track/<folder name>")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--k", type=int, default=2)
    parser.add_argument("--limit", type=int, default=None, help="mine only the first N pairs (smoke runs)")
    args = parser.parse_args()

    qualifications, _ = load_catalog()
    by_passage = {qualification_text(q): q.name for q in qualifications}
    pairs = training_pairs(qualifications, eval_exclusions(), load_synthetic())
    named = [(query, by_passage[passage]) for query, passage in pairs]
    if args.limit:
        named = named[::max(1, len(named) // args.limit)][:args.limit]
    embedder = E5Embedder(args.model_name or f"tesda-track/{args.model_path.resolve().name}",
                          model_path=str(args.model_path.resolve()))
    started = time.perf_counter()
    rows = mine_negatives(named, {q.name: qualification_text(q) for q in qualifications}, embedder, args.k)
    write_negatives(rows, args.output)
    print(f"{len(rows)} hard negatives for {len(named)} pairs in {time.perf_counter() - started:.0f}s -> {args.output}")


if __name__ == "__main__":
    main()
