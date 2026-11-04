"""A retraining round: preparing the bundle from the reviewed shared goals, and the checks before the gate runs
(no database: --no-collect)."""
import json
import uuid
import zipfile

import pytest

from training import round as training_round
from training import shared_goals

MMAW = "Manual Metal Arc Welding (MMAW) NC II"
COOKERY = "Cookery NC II"


@pytest.fixture
def review_file(tmp_path, monkeypatch):
    path = tmp_path / "learner" / "shared_goals.json"
    monkeypatch.setattr(shared_goals, "REVIEW_PATH", path)
    monkeypatch.setattr(training_round, "MODELS", tmp_path / "models")
    return path


def write_review(path, *rows):
    defaults = {"accept": [MMAW], "shown": None, "lang": "taglish", "split": "train", "review_status": "reviewed"}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps([{"id": str(uuid.uuid4()), **defaults, **row} for row in rows]), encoding="utf-8")


def test_prepare_stops_while_goals_wait_for_review_unless_allowed(review_file, tmp_path):
    write_review(review_file,
                 {"goal": "Gusto ko mag weld ng gate", "shown": COOKERY},
                 {"goal": "Welder ako sa Saudi", "split": "dev"},
                 {"goal": "Not reviewed yet", "review_status": "pending"})
    output = tmp_path / "bundle.zip"
    with pytest.raises(SystemExit, match="1 shared goals wait for review"):
        training_round.prepare("v4-test", output, collect=False)
    assert not output.exists()

    counts = training_round.prepare("v4-test", output, collect=False, allow_pending=True)
    assert counts == {"pending": 1, "reviewed_dev": 1, "reviewed_sealed": 0, "reviewed_train": 1,
                      "learner_negatives": 2}
    with zipfile.ZipFile(output) as bundle:
        packed = json.loads(bundle.read("backend/training/learner/shared_goals.json"))
    assert [(row["goal"], row["shown"]) for row in packed] == [("Gusto ko mag weld ng gate", COOKERY)]


def test_a_round_name_is_used_once(review_file, tmp_path):
    training_round.model_folder("v4-test").mkdir(parents=True)
    with pytest.raises(SystemExit, match="choose a new round name"):
        training_round.prepare("v4-test", tmp_path / "bundle.zip", collect=False)
    with pytest.raises(SystemExit):
        training_round.main(["prepare", "../v4", "--no-collect"])


def test_check_needs_a_finished_calibrated_model(review_file):
    folder = training_round.model_folder("v4-test")
    folder.mkdir(parents=True)
    with pytest.raises(SystemExit, match="no finished model"):
        training_round.check("v4-test")
    (folder / "training.json").write_text("{}", encoding="utf-8")
    with pytest.raises(SystemExit, match="no calibration.json"):
        training_round.check("v4-test")
