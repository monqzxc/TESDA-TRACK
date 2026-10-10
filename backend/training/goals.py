"""Evaluation goal sets: the v1 file plus the v2 dev and sealed directories, validated on load.

dev = v1 dev goals + goals_v2/dev/*.json; test_v1 = v1 test goals; sealed = goals_v2/sealed/*.json.
The sealed directory is read only when the sealed set is requested (the harness's --final mode), so dev work
never touches it; duplicates against it are therefore checked when the sealed set is loaded."""
import json
import re
from pathlib import Path

from training.catalog import load_catalog

DATA_DIR = Path(__file__).resolve().parent / "data"
V1_PATH = DATA_DIR / "eval_goals.json"
GOALS_V2_DIR = DATA_DIR / "goals_v2"
SETS = ("dev", "test_v1", "sealed")
TAGS = frozenset({"job_title", "task", "indirect", "experience", "certification", "abroad", "typo", "short", "long",
                  "multi", "negation", "near_tvet", "no_tvet", "vague", "non_goal"})
LANGS = frozenset({"en", "tl", "taglish"})
GROUPS = frozenset({"G1", "G2", "G3", "G4", "G5", "G6", "X"})


def normalise(goal: str) -> str:
    return re.sub(r"\s+", " ", goal.casefold()).strip()


def _check_accept(goal: dict, label: str, names: set[str]) -> None:
    for name in goal["accept"]:
        if name not in names:
            raise ValueError(f"{label} accepts unknown qualification {name!r}")


def _validate(goal: dict, where: str, names: set[str]) -> dict:
    text = goal.get("goal")
    if not isinstance(text, str) or not text.strip():
        raise ValueError(f"{where}: a goal has no text")
    label = f"{where}: goal {text!r}"
    if goal.get("lang") not in LANGS:
        raise ValueError(f"{label} has unknown lang {goal.get('lang')!r}")
    tags = goal.get("tags")
    if not isinstance(tags, list) or not tags:
        raise ValueError(f"{label} has no tags")
    for tag in tags:
        if tag not in TAGS:
            raise ValueError(f"{label} has unknown tag {tag!r}")
    if goal.get("group") not in GROUPS:
        raise ValueError(f"{label} has unknown group {goal.get('group')!r}")
    if not isinstance(goal.get("accept"), list):
        raise ValueError(f"{label} has no accept list")
    _check_accept(goal, label, names)
    return {"goal": text, "accept": list(goal["accept"]), "lang": goal["lang"], "tags": list(tags),
            "group": goal["group"], "source": where}


def _read(split: str, names: set[str]) -> list[dict]:
    goals = []
    if split in ("dev", "test_v1"):
        wanted = "dev" if split == "dev" else "test"
        for g in json.loads(V1_PATH.read_text(encoding="utf-8")):
            if g.get("split") == wanted:
                if g["lang"] not in LANGS:
                    raise ValueError(f"v1: goal {g['goal']!r} has unknown lang {g['lang']!r}")
                _check_accept(g, f"v1: goal {g['goal']!r}", names)
                goals.append({"goal": g["goal"], "accept": list(g["accept"]), "lang": g["lang"], "tags": ["v1"],
                              "group": "v1", "source": "v1"})
    if split in ("dev", "sealed"):
        directory = GOALS_V2_DIR / split
        for path in sorted(directory.glob("*.json")) if directory.is_dir() else []:
            where = f"{split}/{path.name}"
            for g in json.loads(path.read_text(encoding="utf-8")):
                goals.append(_validate(g, where, names))
    return goals


def load(split: str) -> list[dict]:
    """The goals of one set, validated. A goal that appears twice, in this or another set, raises ValueError."""
    if split not in SETS:
        raise ValueError(f"unknown goal set {split!r}; choose from {', '.join(SETS)}")
    names = {q.name for q in load_catalog()[0]}
    own = _read(split, names)
    others = [(other, _read(other, names)) for other in SETS
              if other != split and (split == "sealed" or other != "sealed")]
    seen: dict[str, tuple[str, dict]] = {}
    for name, goals in others + [(split, own)]:
        for goal in goals:
            key = normalise(goal["goal"])
            if key in seen:
                first_set, first = seen[key]
                if "sealed" in (name, first_set):
                    dev_copy = first if name == "sealed" else goal
                    raise ValueError(f"duplicate goal {goal['goal']!r} is also in the sealed set: delete the dev "
                                     f"copy in {dev_copy['source']}")
                raise ValueError(f"duplicate goal {goal['goal']!r} in {first['source']} and {goal['source']}")
            seen[key] = (name, goal)
    return own
