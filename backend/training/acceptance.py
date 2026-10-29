"""The frozen gate a matching model must pass before it is adopted: training/model_acceptance.json.

Absolute minimums on the policy's evaluation set, and goals the top match must get right or reject, so a headline
average cannot hide a critical regression. tests/test_model_acceptance.py runs it on the configured model, and
`python -m training.round check` on a newly trained one.
"""
import json
from pathlib import Path

POLICY_PATH = Path(__file__).resolve().parent / "model_acceptance.json"


def policy() -> dict:
    return json.loads(POLICY_PATH.read_text(encoding="utf-8"))


def check(embedder, rules: dict | None = None):
    """The model's metrics on the policy's goals, scored with its own calibration as the API scores them, and what
    it misses of the policy: each metric below its minimum and each must-match or must-reject goal it gets wrong.
    It passes when the list is empty."""
    from tesda_track.services.analysis import match_params, score_matches
    from tesda_track.services.embeddings import qualification_text
    from training.catalog import load_catalog
    from training.evaluate import evaluate, metrics, prepare
    from training.goals import load

    rules = rules or policy()
    qualifications, items = load_catalog()
    passages = embedder.embed_passages([qualification_text(q) for q in qualifications])
    params = match_params(embedder)
    measured = metrics(evaluate(prepare(load(rules["evaluation_set"]), items, passages, embedder.embed_queries),
                                items, params))
    failures = [{"metric": key, "actual": getattr(measured, key), "minimum": minimum}
                for key, minimum in rules["minimum_metrics"].items() if getattr(measured, key) < minimum]
    required = [{"goal": goal, "accept": [name]} for goal, name in rules["must_match"].items()]
    required += [{"goal": goal, "accept": []} for goal in rules["must_reject"]]
    for row in prepare(required, items, passages, embedder.embed_queries):
        matches = score_matches(items, row.keyword, row.similarities, params, query=row.goal["goal"])
        actual = [matches[0].qualification.name] if matches else []
        if actual != row.goal["accept"]:
            failures.append({"goal": row.goal["goal"], "expected": row.goal["accept"], "actual": actual})
    return measured, failures
