"""Measure fixed MVP probes through the same hybrid ranker as the learner API."""
import argparse
import hashlib
import json
from dataclasses import asdict
from pathlib import Path

from tesda_track.services.embeddings import qualification_text, read_calibration
from tesda_track.services.goal_rules import strip_negated
from tesda_track.utils.helpers import normalize
from training.catalog import load_catalog
from training.evaluate import evaluate, metrics, prepare
from training.v5 import vectors

PROBES = Path(__file__).parent / "data" / "v5_eval" / "mvp_probes.json"


def read_probes(names):
    probes = json.loads(PROBES.read_text(encoding="utf-8"))
    if len({normalize(row["goal"]) for row in probes}) != len(probes):
        raise ValueError("Duplicate probe in MVP evaluation")
    for row in probes:
        if missing := set(row["accept"]) - names:
            raise ValueError(f"Unknown qualification in MVP probes: {sorted(missing)}")
        row["tags"] = [row["kind"]]
    return probes


def score(folder):
    qualifications, items = load_catalog()
    probes = read_probes({q.name for q in qualifications})
    params = read_calibration(str(folder))
    if params is None:
        raise ValueError(f"Candidate lacks valid calibration: {folder}")
    inputs = [strip_negated(row["goal"]) for row in probes]
    queries, passages = vectors(folder, inputs, [qualification_text(q) for q in qualifications])

    def cached_queries(texts):
        assert inputs == texts
        return queries

    results = evaluate(prepare(probes, items, passages, cached_queries), items, params)
    return {
        "model": folder.name, "params": asdict(params),
        "probe_sha256": hashlib.sha256(PROBES.read_bytes()).hexdigest(),
        "status": "Synthetic draft probes. Regional phrasing and labels need fluent review.",
        "metrics": asdict(metrics(results)),
        "cases": [{"goal": row.goal["goal"], "lang": row.goal["lang"], "kind": row.goal["kind"],
                   "accept": row.goal["accept"], "shown": row.shown} for row in results],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-path", type=Path, required=True)
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()
    report = score(args.model_path)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(report["model"], json.dumps({k: report["metrics"][k] for k in ("top1", "top3", "rejection")}))
