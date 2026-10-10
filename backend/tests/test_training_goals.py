"""Goal sets: v1 file plus the v2 dev and sealed directories, validated on load."""
import json

import pytest

from training import goals

CARP = "Carpentry NC II"


def goal(text, tags=("job_title",), lang="en", accept=(CARP,), group="G1"):
    return {"goal": text, "accept": list(accept), "lang": lang, "tags": list(tags), "group": group}


@pytest.fixture
def tree(tmp_path, monkeypatch):
    v1 = [{"goal": "v1 dev goal", "accept": [CARP], "lang": "en", "split": "dev"},
          {"goal": "v1 test goal", "accept": [], "lang": "tl", "split": "test"}]
    (tmp_path / "eval_goals.json").write_text(json.dumps(v1), encoding="utf-8")
    monkeypatch.setattr(goals, "V1_PATH", tmp_path / "eval_goals.json")
    monkeypatch.setattr(goals, "GOALS_V2_DIR", tmp_path / "goals_v2")

    def write(kind, name, items):
        folder = tmp_path / "goals_v2" / kind
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_text(json.dumps(items), encoding="utf-8")
    return write


def test_dev_merges_v1_dev_and_v2_files_and_test_v1_is_the_v1_test_goals(tree):
    tree("dev", "a.json", [goal("I want to weld")])
    dev = goals.load("dev")
    assert [g["goal"] for g in dev] == ["v1 dev goal", "I want to weld"]
    assert dev[0]["tags"] == ["v1"] and dev[0]["group"] == "v1" and dev[0]["source"] == "v1"
    assert dev[1]["group"] == "G1" and dev[1]["source"] == "dev/a.json"
    assert [g["goal"] for g in goals.load("test_v1")] == ["v1 test goal"]


def test_an_unknown_tag_lang_or_qualification_raises_naming_the_goal(tree):
    tree("dev", "a.json", [goal("bad tag goal", tags=["nonsense"])])
    with pytest.raises(ValueError, match="bad tag goal"):
        goals.load("dev")
    tree("dev", "a.json", [goal("bad lang goal", lang="fr")])
    with pytest.raises(ValueError, match="bad lang goal"):
        goals.load("dev")
    tree("dev", "a.json", [goal("bad name goal", accept=["Nope NC II"])])
    with pytest.raises(ValueError, match="Nope NC II"):
        goals.load("dev")


def test_a_duplicate_between_dev_and_sealed_names_the_dev_copy(tree):
    tree("dev", "a.json", [goal("Same  Goal")])
    tree("sealed", "s.json", [goal("same goal")])
    with pytest.raises(ValueError, match=r"delete the dev copy in dev/a\.json"):
        goals.load("sealed")


def test_a_duplicate_inside_dev_raises(tree):
    tree("dev", "a.json", [goal("I want to weld"), goal("i want to WELD")])
    with pytest.raises(ValueError, match="duplicate"):
        goals.load("dev")


def test_sealed_is_empty_when_the_directory_is_missing(tree):
    assert goals.load("sealed") == []
