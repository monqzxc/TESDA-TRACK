"""Frozen engineering regression gates, independent of a database or sealed-set tuning."""
import json
import os
from pathlib import Path

import pytest

POLICY = json.loads((Path(__file__).resolve().parents[1] / "training" / "model_acceptance.json").read_text(encoding="utf-8"))


def test_acceptance_policy_has_absolute_thresholds_and_catalog_owned_goals():
    from training.catalog import load_catalog
    from training.goals import load

    names = {qualification.name for qualification in load_catalog()[0]}
    assert len(load(POLICY["evaluation_set"])) == POLICY["expected_goal_count"]
    assert set(POLICY["minimum_metrics"]) == {"top1", "top3", "mrr", "rejection", "objective"}
    assert all(0 < threshold <= 1 for threshold in POLICY["minimum_metrics"].values())
    assert POLICY["must_match"] and POLICY["must_reject"]
    assert set(POLICY["must_match"].values()) <= names
    assert not set(POLICY["must_match"]) & set(POLICY["must_reject"])


@pytest.mark.skipif(not os.environ.get("TESDA_MODEL_TESTS"), reason="set TESDA_MODEL_TESTS=1 to run the real model")
def test_real_model_meets_frozen_metrics_and_must_match_goals():
    from tesda_track.config import get_settings
    from tesda_track.services.analysis import match_params, score_matches
    from tesda_track.services.embeddings import E5Embedder, qualification_text
    from training.catalog import load_catalog
    from training.evaluate import evaluate, metrics, prepare
    from training.goals import load

    settings = get_settings()
    assert settings.embedding_model == POLICY["model"], "update the decision and policy explicitly when adopting a model"
    embedder = E5Embedder(settings.embedding_model, settings.embedding_cache_dir, settings.embedding_model_path)
    qualifications, items = load_catalog()
    passages = embedder.embed_passages([qualification_text(q) for q in qualifications])
    params = match_params(embedder)
    goals = load(POLICY["evaluation_set"])
    results = evaluate(prepare(goals, items, passages, embedder.embed_queries), items, params)
    measured = metrics(results)
    failures = {key: {"actual": getattr(measured, key), "minimum": minimum}
                for key, minimum in POLICY["minimum_metrics"].items() if getattr(measured, key) < minimum}
    assert not failures, failures
    # Ownership examples remain explicit so a headline average cannot hide a critical regression.
    required = [{"goal": goal, "accept": [name]} for goal, name in POLICY["must_match"].items()]
    required += [{"goal": goal, "accept": []} for goal in POLICY["must_reject"]]
    for row in prepare(required, items, passages, embedder.embed_queries):
        matches = score_matches(items, row.keyword, row.similarities, params, query=row.goal["goal"])
        actual = [matches[0].qualification.name] if matches else []
        assert actual == row.goal["accept"], {"goal": row.goal["goal"], "expected": row.goal["accept"], "actual": actual}
