"""Measure and calibrate the matching model offline, with the same scoring code the API uses.

Run from backend/:  python -m training.evaluate --set dev   (add --calibrate to search the score parameters)
"""
import argparse
import itertools
import json
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np

from tesda_track.config import get_settings
from tesda_track.services.analysis import MatchParams, match_params, score_matches
from tesda_track.services.catalog import CatalogItem
from tesda_track.services.embeddings import E5Embedder, qualification_text
from tesda_track.services.recommendation_service import score_qualifications
from training import goals as goal_sets
from training.catalog import load_catalog

DEFAULT_GRID = {"z_floor": [1.5, 2.0, 2.5, 3.0, 3.5, 4.0], "z_span": [1.0, 1.5, 2.0, 3.0],
                "keyword_weight": [0.3, 0.4, 0.5, 0.6, 0.7], "min_score": [15, 20, 25, 30, 35]}


@dataclass
class GoalResult:
    goal: dict
    shown: list[str]  # qualification names, best first


@dataclass
class Metrics:
    top1: float
    top3: float
    mrr: float
    rejection: float
    objective: float
    by_lang: dict[str, float]  # top-1 per language over related goals
    by_tag: dict[str, dict] = field(default_factory=dict)  # per tag: n, top1/top3 (related), rejection (no TVET)


@dataclass
class Prepared:
    """What does not depend on the score parameters: the keyword evidence and similarities of one goal."""
    goal: dict
    keyword: dict[str, dict]
    similarities: dict[int, float]


def _mean(values: list) -> float:
    return sum(values) / len(values) if values else 0.0


def metrics(results: list[GoalResult]) -> Metrics:
    related = [r for r in results if r.goal["accept"]]
    unrelated = [r for r in results if not r.goal["accept"]]
    top1 = [bool(r.shown) and r.shown[0] in r.goal["accept"] for r in related]
    top3 = [any(name in r.goal["accept"] for name in r.shown[:3]) for r in related]
    reciprocal = [next((1 / rank for rank, name in enumerate(r.shown[:3], 1) if name in r.goal["accept"]), 0.0)
                  for r in related]
    rejection = _mean([not r.shown for r in unrelated])
    by_lang = {lang: _mean([hit for r, hit in zip(related, top1) if r.goal["lang"] == lang])
               for lang in sorted({r.goal["lang"] for r in related})}
    by_tag = {}
    for tag in sorted({t for r in results for t in r.goal.get("tags", [])}):
        row: dict = {"n": sum(tag in r.goal.get("tags", []) for r in results)}
        tagged = [i for i, r in enumerate(related) if tag in r.goal.get("tags", [])]
        if tagged:
            row["top1"] = _mean([top1[i] for i in tagged])
            row["top3"] = _mean([top3[i] for i in tagged])
        rejected = [not r.shown for r in unrelated if tag in r.goal.get("tags", [])]
        if rejected:
            row["rejection"] = _mean(rejected)
        by_tag[tag] = row
    return Metrics(top1=_mean(top1), top3=_mean(top3), mrr=_mean(reciprocal), rejection=rejection,
                   objective=0.4 * _mean(top1) + 0.2 * _mean(top3) + 0.4 * rejection, by_lang=by_lang,
                   by_tag=by_tag)


def errors(results: list[GoalResult]) -> list[dict]:
    """Related goals whose top result is wrong, and no-TVET goals that got a match. rank is the 1-based position
    of the first accepted name in shown, or None."""
    found = []
    for r in results:
        wrong = bool(r.shown) if not r.goal["accept"] else not (r.shown and r.shown[0] in r.goal["accept"])
        if wrong:
            found.append({"goal": r.goal["goal"], "lang": r.goal["lang"], "tags": r.goal.get("tags", []),
                          "accept": r.goal["accept"], "shown": r.shown,
                          "rank": next((i for i, n in enumerate(r.shown, 1) if n in r.goal["accept"]), None)})
    return found


def prepare(goals: list[dict], items: list[CatalogItem], passages: list[list[float]],
            embed_queries: Callable[[list[str]], list[list[float]]]) -> list[Prepared]:
    """Cosine similarity (pgvector's 1 - cosine distance) of every goal to every passage, plus keyword evidence."""
    def unit(vectors):
        array = np.asarray(vectors, dtype=np.float64)
        return array / np.maximum(np.linalg.norm(array, axis=1, keepdims=True), 1e-12)

    cosine = unit(embed_queries([g["goal"] for g in goals])) @ unit(passages).T
    rules = [item.rules for item in items]
    prepared = []
    for goal, row in zip(goals, cosine):
        keyword = {r["qualification"]["code"]: r for r in score_qualifications(goal["goal"], {}, rules)}
        prepared.append(Prepared(goal, keyword, {item.id: float(value) for item, value in zip(items, row)}))
    return prepared


def evaluate(prepared: list[Prepared], items: list[CatalogItem], params: MatchParams) -> list[GoalResult]:
    return [GoalResult(p.goal, [m.qualification.name for m in score_matches(items, p.keyword, p.similarities, params)])
            for p in prepared]


def calibrate(prepared: list[Prepared], items: list[CatalogItem], grid: dict[str, list],
              min_rejection: float | None = None) -> tuple[MatchParams, Metrics]:
    """The parameters with the best objective on these goals; ties go to the combination listed first.

    With min_rejection, only combinations rejecting at least that share of the no-TVET goals compete, since the
    objective alone will trade wrong matches for right ones. If none does, the one rejecting the most wins."""
    def rank(m: Metrics) -> tuple:
        if min_rejection is None:
            return (m.objective,)
        qualifies = m.rejection >= min_rejection
        return (qualifies, m.objective if qualifies else m.rejection, m.objective)

    best: tuple[MatchParams, Metrics] | None = None
    for floor, span, weight, minimum in itertools.product(grid["z_floor"], grid["z_span"], grid["keyword_weight"],
                                                          grid["min_score"]):
        params = MatchParams(floor, floor + span, weight, minimum)
        result = metrics(evaluate(prepared, items, params))
        if best is None or rank(result) > rank(best[1]):
            best = (params, result)
    return best


def _format(label: str, m: Metrics) -> str:
    langs = "  ".join(f"{lang}={value:.3f}" for lang, value in m.by_lang.items())
    text = (f"{label:<7} top1={m.top1:.3f}  top3={m.top3:.3f}  mrr={m.mrr:.3f}  rejection={m.rejection:.3f}  "
            f"objective={m.objective:.3f}\n        top-1 by language: {langs}")
    for tag, row in m.by_tag.items():
        values = "  ".join(f"{k}={row[k]:.3f}" for k in ("top1", "top3", "rejection") if k in row)
        text += f"\n        [{tag}] n={row['n']}  {values}"
    return text


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", default=None, help="embedding model name (default: the settings' model and folder)")
    parser.add_argument("--model-path", type=Path, default=None, help="folder of a fine-tuned model")
    parser.add_argument("--set", dest="goal_set", choices=list(goal_sets.SETS), default=None,
                        help="goal set to report (default test_v1); sealed needs --final")
    parser.add_argument("--split", choices=["dev", "test", "all"], default=None,
                        help="alias: dev=dev, test=test_v1, all=dev and test_v1")
    parser.add_argument("--final", action="store_true", help="allow --set sealed (once per candidate, at the end)")
    parser.add_argument("--calibrate", action="store_true", help="search the score parameters on the dev set")
    parser.add_argument("--min-rejection", type=float, default=None,
                        help="with --calibrate, consider only parameters that reject at least this share of dev "
                             "goals with no TVET match")
    parser.add_argument("--params", nargs=4, type=float, metavar=("FLOOR", "CEILING", "WEIGHT", "MIN"))
    parser.add_argument("--json", type=Path, default=None, help="write the numbers to this file")
    args = parser.parse_args(argv)
    if args.goal_set and args.split:
        parser.error("use --set or --split, not both")
    requested = ([args.goal_set] if args.goal_set else
                 {"dev": ["dev"], "test": ["test_v1"], "all": ["dev", "test_v1"]}[args.split or "test"])
    if "sealed" in requested:
        if not args.final:
            parser.error("--set sealed requires --final")
        print("WARNING: the sealed set must be evaluated once per candidate, at the end; never tune on it.")

    settings = get_settings()
    model = args.model or (f"tesda-track/{args.model_path.name}" if args.model_path else settings.embedding_model)
    model_path = args.model_path or (None if args.model else settings.embedding_model_path)
    embedder = E5Embedder(model, settings.embedding_cache_dir, str(model_path) if model_path else None)
    qualifications, items = load_catalog()
    passages = embedder.embed_passages([qualification_text(q) for q in qualifications])
    prepared = {name: prepare(goal_sets.load(name), items, passages, embedder.embed_queries)
                for name in dict.fromkeys(requested + (["dev"] if args.calibrate else []))}

    params = (MatchParams(args.params[0], args.params[1], args.params[2], int(args.params[3])) if args.params
              else match_params(embedder))  # like the API: a fine-tuned model's calibration.json, else the settings
    if args.calibrate:
        started = time.perf_counter()
        params, dev = calibrate(prepared["dev"], items, DEFAULT_GRID, args.min_rejection)
        print(f"Calibrated on dev in {time.perf_counter() - started:.0f}s")
        if args.min_rejection is not None and dev.rejection < args.min_rejection:
            print(f"No parameters reach rejection {args.min_rejection} on dev; using those that reject the most")
    results = {name: evaluate(prepared[name], items, params) for name in requested}
    shown = {name: metrics(r) for name, r in results.items()}
    if len(requested) > 1:
        shown["all"] = metrics([r for name in requested for r in results[name]])
    print(f"Model: {model}  Parameters: {params}")
    for name, m in shown.items():
        print(_format(name, m))
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        numbers = {"model": model, "params": asdict(params), "min_rejection": args.min_rejection,
                   "metrics": {n: asdict(m) for n, m in shown.items()}}
        if "dev" in results:
            numbers["errors"] = errors(results["dev"])
        args.json.write_text(json.dumps(numbers, indent=2), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
