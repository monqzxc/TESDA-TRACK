"""Offline evaluation: the API's scoring on an in-memory catalog, plus the metrics and calibration."""
import pytest

from tesda_track.services.analysis import MatchParams
from training import evaluate
from training.catalog import load_catalog


def test_catalog_loads_from_the_seed_without_a_database():
    qualifications, items = load_catalog()
    assert len(items) == len(qualifications) >= 300
    assert [item.id for item in items[:3]] == [1, 2, 3]
    assert items[0].rules["career_keywords"] and qualifications[0].sector.name == items[0].sector


def result(accept, shown, lang="en"):
    return evaluate.GoalResult(goal={"goal": "g", "accept": accept, "lang": lang, "split": "dev"}, shown=shown)


def test_metrics_reward_right_answers_and_empty_results_for_unrelated_goals():
    m = evaluate.metrics([
        result(["A"], ["A", "B"]),            # top-1 hit
        result(["B"], ["A", "B", "C"]),       # top-3 hit at rank 2
        result(["Z"], ["A"], lang="tl"),      # miss
        result([], []),                       # unrelated, rejected
        result([], ["A"]),                    # unrelated, wrongly matched
    ])
    assert (m.top1, m.top3, m.mrr, m.rejection) == pytest.approx((1 / 3, 2 / 3, 0.5, 0.5))
    assert m.objective == pytest.approx(0.4 / 3 + 0.2 * 2 / 3 + 0.2)
    assert m.by_lang == pytest.approx({"en": 0.5, "tl": 0.0})


class Bag:
    """Same idea as the backend tests' WordEmbedder: shared words make texts similar. A text with none of the
    words points along its own axis, so it resembles only the many catalog names that share none either."""
    def __init__(self, vocabulary):
        self.vocabulary = vocabulary

    def __call__(self, texts):
        vectors = []
        for text in texts:
            counts = [float(word in text.lower()) for word in self.vocabulary]
            vectors.append(counts + [0.0 if any(counts) else 1.0])
        return vectors


def test_evaluation_and_calibration_run_the_api_scoring_offline():
    qualifications, items = load_catalog()
    mmaw = next(i for i, q in enumerate(qualifications) if q.name == "Manual Metal Arc Welding (MMAW) NC II")
    bag = Bag(["weld", "metal", "arc"])
    passages = bag([q.name for q in qualifications])
    goals = [{"goal": "I want to weld metal", "accept": [qualifications[mmaw].name], "lang": "en", "split": "dev"},
             {"goal": "I want to be an astronaut", "accept": [], "lang": "en", "split": "dev"}]
    prepared = evaluate.prepare(goals, items, passages, bag)
    results = evaluate.evaluate(prepared, items, MatchParams(3.0, 5.0, 0.5, 20))
    assert results[1].shown == []
    params, best = evaluate.calibrate(prepared, items, {"z_floor": [1.0, 3.0], "z_span": [1.0],
                                                        "keyword_weight": [0.5], "min_score": [20]})
    assert best.rejection == 1.0 and isinstance(params, MatchParams)
    assert any("Welding" in name for name in results[0].shown)
