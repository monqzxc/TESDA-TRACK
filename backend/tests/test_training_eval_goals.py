"""The labelled goals the matching model is evaluated and calibrated on."""
import json
from collections import Counter
from pathlib import Path

from tesda_track.seed import SEED_DIR
from tesda_track.utils.helpers import normalize

GOALS_FILE = Path(__file__).resolve().parents[1] / "training" / "data" / "eval_goals.json"


def load():
    return json.loads(GOALS_FILE.read_text(encoding="utf-8"))


def test_every_goal_is_well_formed_and_names_real_qualifications():
    names = {q["name"] for q in json.loads((SEED_DIR / "qualifications.json").read_text(encoding="utf-8"))}
    goals = load()
    for goal in goals:
        assert set(goal) == {"goal", "accept", "lang", "split"}, goal
        assert goal["lang"] in {"en", "tl", "taglish"} and goal["split"] in {"dev", "test"}, goal
        assert set(goal["accept"]) <= names, goal
    assert len({normalize(g["goal"]) for g in goals}) == len(goals), "goals are unique"


def test_the_set_is_big_and_varied_enough():
    goals = load()
    related = [g for g in goals if g["accept"]]
    unrelated = [g for g in goals if not g["accept"]]
    assert len(related) >= 120 and len(unrelated) >= 30
    languages = Counter(g["lang"] for g in related)
    assert languages["tl"] >= 30 and languages["taglish"] >= 25
    assert sum(g["lang"] != "en" for g in unrelated) >= 8
    assert max(Counter(g["accept"][0] for g in related).values()) <= 4


def test_dev_and_test_halves_are_balanced():
    goals = load()
    for kind in (lambda g: bool(g["accept"]), lambda g: not g["accept"]):
        chosen = [g for g in goals if kind(g)]
        dev = sum(g["split"] == "dev" for g in chosen)
        assert abs(dev - len(chosen) / 2) <= max(2, len(chosen) * 0.1)


def test_the_unit_test_goals_are_in_the_dev_half():
    import importlib.util

    spec = importlib.util.spec_from_file_location("semantic_goals", Path(__file__).with_name("test_semantic.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    by_goal = {g["goal"]: g for g in load()}
    for goal, name in module.RELATED_GOALS.items():
        assert by_goal[goal]["split"] == "dev" and name in by_goal[goal]["accept"]
    for goal in module.NO_TVET_MATCH:
        assert by_goal[goal]["split"] == "dev" and by_goal[goal]["accept"] == []
