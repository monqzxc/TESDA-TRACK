"""Goals learners shared: collecting them for review (test database), and the reviewed ones in the evaluation sets,
the training queries and the Colab bundle (no database)."""
import json
import uuid
import zipfile
from datetime import date

import pytest
from sqlmodel import select

from tesda_track.models import SHARED_GOAL_CONSENT, Qualification, SharedGoal
from tesda_track.utils.helpers import normalize
from training import bundle, goals, shared_goals
from training.catalog import load_catalog
from training.pairs import HashedExclusions, eval_exclusions, exclusion_hash, load_synthetic, training_pairs

# The test database's catalog names its welding qualification differently from the real one the review files use.
WELDING = "Shielded Metal Arc Welding (SMAW) NC II"
MMAW = "Manual Metal Arc Welding (MMAW) NC II"
COOKERY = "Cookery NC II"


@pytest.fixture
def review_file(tmp_path, monkeypatch):
    path = tmp_path / "learner" / "shared_goals.json"
    monkeypatch.setattr(shared_goals, "REVIEW_PATH", path)
    return path


def share(session, goal, code="SMAW-NC-II", shown=None, goal_id=None):
    ids = dict(session.exec(select(Qualification.code, Qualification.id)).all())
    row = SharedGoal(id=goal_id or uuid.uuid4(), goal=goal, qualification_id=ids[code],
                     shown_qualification_id=ids[shown] if shown else None, consent_version=SHARED_GOAL_CONSENT,
                     shared_on=date(2026, 10, 21))
    session.add(row)
    session.flush()
    return row


def test_collect_adds_new_goals_once_and_keeps_what_reviewers_changed(session, review_file):
    # Collected in id order; an id divisible by three goes to sealed, any other to dev.
    share(session, "gusto ko mag-welding sa barko", goal_id=uuid.UUID(int=1000))
    share(session, "I want to cook in a hotel", code="COOKERY-NC-II", shown="SMAW-NC-II", goal_id=uuid.UUID(int=3000))

    assert shared_goals.collect(session)["added"] == 2
    rows = json.loads(review_file.read_text(encoding="utf-8"))
    assert [(r["goal"], r["accept"], r["shown"], r["split"], r["review_status"], r["lang"]) for r in rows] == [
        ("gusto ko mag-welding sa barko", [WELDING], None, "dev", "pending", ""),
        ("I want to cook in a hotel", [COOKERY], WELDING, "sealed", "pending", "")]
    assert rows[0]["shared_on"] == "2026-10-21"

    rows[0].update(goal="gusto ko mag-welding", lang="taglish", review_status="reviewed")
    review_file.write_text(json.dumps(rows), encoding="utf-8")
    share(session, "I want to weld pipes", goal_id=uuid.UUID(int=1))
    counts = shared_goals.collect(session, rule="train")

    assert (counts["added"], counts["pending"], counts["reviewed"]) == (1, 2, 1)
    rows = json.loads(review_file.read_text(encoding="utf-8"))
    assert (rows[0]["goal"], rows[0]["review_status"]) == ("gusto ko mag-welding", "reviewed")
    assert (rows[2]["goal"], rows[2]["split"]) == ("I want to weld pipes", "train"), "train only once asked to"
    # The reviewed words are the ones kept: the database's original copy is gone, the pending ones stay.
    assert counts["reviewed_or_rejected_deleted"] == 1
    assert sorted(goal.goal for goal in session.exec(select(SharedGoal))) == [
        "I want to cook in a hotel", "I want to weld pipes"]


def test_collect_drops_duplicates_and_forgets_rejected_words(session, review_file):
    curated = goals.curated_texts()[0]
    first = share(session, "I want to be a chef", goal_id=uuid.UUID(int=1))
    share(session, "  i want to be a CHEF ", goal_id=uuid.UUID(int=2))
    share(session, curated, goal_id=uuid.UUID(int=3))
    counts = shared_goals.collect(session)
    assert (counts["added"], counts["duplicates_deleted"]) == (1, 2)
    assert [row.id for row in session.exec(select(SharedGoal))] == [first.id]

    rows = json.loads(review_file.read_text(encoding="utf-8"))
    rows[0]["review_status"] = "rejected"
    review_file.write_text(json.dumps(rows), encoding="utf-8")
    assert shared_goals.collect(session)["reviewed_or_rejected_deleted"] == 1

    [row] = json.loads(review_file.read_text(encoding="utf-8"))
    assert (row["id"], row["goal"], row["review_status"]) == (str(first.id), "", "rejected")
    assert session.exec(select(SharedGoal)).all() == []
    assert shared_goals.collect(session)["reviewed_or_rejected_deleted"] == 0, "counts only what it deleted"


def write_review(path, *rows):
    defaults = {"accept": [MMAW], "shown": None, "lang": "en", "review_status": "reviewed",
                "shared_on": "2026-10-21"}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps([{"id": str(uuid.uuid4()), **defaults, **row} for row in rows]), encoding="utf-8")


def test_reviewed_goals_join_their_set_and_pending_ones_are_still_kept_out_of_training(review_file):
    write_review(review_file,
                 {"goal": "Welder ako sa Saudi dati, gusto ko ng NC", "lang": "taglish", "split": "dev"},
                 {"goal": "Gusto kong magluto sa barko", "accept": [COOKERY], "lang": "tl", "split": "sealed"},
                 {"goal": "I fix arc welding machines", "split": "dev", "review_status": "pending"},
                 {"goal": "Gusto ko mag weld ng gate", "lang": "taglish", "split": "train"},
                 {"goal": "My name is Juan, call me", "split": "train", "review_status": "rejected"})

    [dev] = [g for g in goals.load("dev") if g["group"] == "learner"]
    [sealed] = [g for g in goals.load("sealed") if g["group"] == "learner"]
    assert (dev["goal"], dev["accept"], dev["lang"], dev["tags"]) == (
        "Welder ako sa Saudi dati, gusto ko ng NC", [MMAW], "taglish", ["learner"])
    assert sealed["accept"] == [COOKERY]
    exclusions = eval_exclusions()
    assert normalize("I fix arc welding machines") in exclusions, "pending evaluation goals stay out of training"
    synthetic = load_synthetic()
    assert "Gusto ko mag weld ng gate" in synthetic[MMAW]
    assert not any("Juan" in query for queries in synthetic.values() for query in queries)


def test_a_reviewed_goal_needs_a_language_and_a_qualification(review_file):
    write_review(review_file, {"goal": "Gusto ko mag weld", "lang": "", "split": "train"})
    with pytest.raises(ValueError, match="unknown lang"):
        load_synthetic()
    write_review(review_file, {"goal": "Gusto ko mag weld", "accept": [], "split": "dev"})
    with pytest.raises(ValueError, match="no accepted qualification"):
        goals.load("dev")


def test_the_bundle_carries_reviewed_training_goals_and_only_hashes_of_the_rest(review_file, tmp_path):
    write_review(review_file,
                 {"goal": "Welder ako sa Saudi dati", "lang": "taglish", "split": "dev"},
                 {"goal": "I fix arc welding machines", "split": "sealed", "review_status": "pending"},
                 {"goal": "Gusto ko mag weld ng gate", "lang": "taglish", "split": "train"},
                 {"goal": "Not reviewed yet", "split": "train", "review_status": "pending"})
    zip_path = bundle.build(tmp_path / "bundle.zip")

    with zipfile.ZipFile(zip_path) as z:
        text = {name: z.read(name).decode("utf-8") for name in z.namelist() if not name.endswith((".pyc", ".onnx"))}
        z.extractall(tmp_path / "unpacked")
    packed = json.loads(text["backend/training/learner/shared_goals.json"])
    assert packed == [{"goal": "Gusto ko mag weld ng gate", "accept": [MMAW], "lang": "taglish", "split": "train",
                       "review_status": "reviewed"}]
    hashes = set(json.loads(text["backend/training/data/exclusions.json"]))
    assert {exclusion_hash("Welder ako sa Saudi dati"), exclusion_hash("I fix arc welding machines")} <= hashes
    assert not any(goal in body for body in text.values()
                   for goal in ("Welder ako sa Saudi dati", "I fix arc welding machines", "Not reviewed yet"))

    qualifications, _ = load_catalog()
    data = tmp_path / "unpacked/backend/training"
    unpacked = load_synthetic(data / "data/synthetic", data / "learner/shared_goals.json")
    assert training_pairs(qualifications, HashedExclusions(hashes), unpacked) == training_pairs(
        qualifications, eval_exclusions(), load_synthetic())
