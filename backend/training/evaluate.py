"""Measure and calibrate the matching model offline, with the same scoring code the API uses.

Run from backend/:  python -m training.evaluate --split all   (add --calibrate to search the score parameters)
"""
import argparse
import itertools
import json
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from tesda_track.config import get_settings
from tesda_track.services.analysis import MatchParams, match_params, score_matches
from tesda_track.services.catalog import CatalogItem
from tesda_track.services.embeddings import E5Embedder, qualification_text
from tesda_track.services.recommendation_service import score_qualifications
from training.catalog import load_catalog

GOALS_PATH = Path(__file__).resolve().parent / "data" / "eval_goals.json"
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
    return Metrics(top1=_mean(top1), top3=_mean(top3), mrr=_mean(reciprocal), rejection=rejection,
                   objective=0.4 * _mean(top1) + 0.2 * _mean(top3) + 0.4 * rejection, by_lang=by_lang)


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
    return (f"{label:<5} top1={m.top1:.3f}  top3={m.top3:.3f}  mrr={m.mrr:.3f}  rejection={m.rejection:.3f}  "
            f"objective={m.objective:.3f}\n      top-1 by language: {langs}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", default=None, help="embedding model name (default: the settings' model and folder)")
    parser.add_argument("--model-path", type=Path, default=None, help="folder of a fine-tuned model")
    parser.add_argument("--split", choices=["dev", "test", "all"], default="test")
    parser.add_argument("--calibrate", action="store_true", help="search the score parameters on the dev split")
    parser.add_argument("--min-rejection", type=float, default=None,
                        help="with --calibrate, consider only parameters that reject at least this share of dev "
                             "goals with no TVET match")
    parser.add_argument("--params", nargs=4, type=float, metavar=("FLOOR", "CEILING", "WEIGHT", "MIN"))
    parser.add_argument("--json", type=Path, default=None, help="write the numbers to this file")
    args = parser.parse_args()

    settings = get_settings()
    model = args.model or (f"tesda-track/{args.model_path.name}" if args.model_path else settings.embedding_model)
    model_path = args.model_path or (None if args.model else settings.embedding_model_path)
    embedder = E5Embedder(model, settings.embedding_cache_dir, str(model_path) if model_path else None)
    qualifications, items = load_catalog()
    passages = embedder.embed_passages([qualification_text(q) for q in qualifications])
    goals = json.loads(GOALS_PATH.read_text(encoding="utf-8"))
    prepared = prepare(goals, items, passages, embedder.embed_queries)
    by_split = {name: [p for p in prepared if p.goal["split"] == name] for name in ("dev", "test")}

    params = (MatchParams(args.params[0], args.params[1], args.params[2], int(args.params[3])) if args.params
              else match_params(embedder))  # like the API: a fine-tuned model's calibration.json, else the settings
    if args.calibrate:
        started = time.perf_counter()
        params, dev = calibrate(by_split["dev"], items, DEFAULT_GRID, args.min_rejection)
        print(f"Calibrated on dev in {time.perf_counter() - started:.0f}s")
        if args.min_rejection is not None and dev.rejection < args.min_rejection:
            print(f"No parameters reach rejection {args.min_rejection} on dev; using those that reject the most")
        shown = {"dev": dev, "test": metrics(evaluate(by_split["test"], items, params))}
    else:
        shown = {name: metrics(evaluate(by_split[name], items, params)) for name in ("dev", "test")}
        shown = {"dev": shown["dev"], "test": shown["test"],
                 "all": metrics(evaluate(prepared, items, params))}
        shown = {name: m for name, m in shown.items() if args.split == "all" or name == args.split}
    print(f"Model: {model}  Parameters: {params}")
    for name, m in shown.items():
        print(_format(name, m))
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        numbers = {"model": model, "params": asdict(params), "min_rejection": args.min_rejection,
                   "metrics": {n: asdict(m) for n, m in shown.items()}}
        args.json.write_text(json.dumps(numbers, indent=2), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
