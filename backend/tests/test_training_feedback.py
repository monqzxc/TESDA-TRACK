"""The feedback export (test database) and the feedback notebook run against an export (no database)."""
import csv
import json
import sys
import types
from datetime import date, datetime, timedelta

import pytest
from sqlmodel import select

from tesda_track.models import Qualification, RecommendationFeedback
from tesda_track.services.match_stats import PHILIPPINE_TIME
from training import bundle, feedback

NOTEBOOK = bundle.BACKEND / "training/colab/feedback_colab.ipynb"
V3 = "tesda-track/tesda-e5-small-v3"
PARAMS = {"z_floor": 3.5, "z_ceiling": 5.5, "keyword_weight": 0.3, "min_score": 20}


def answer(session, code, satisfied, reason=None, rank=1, **extra):
    qualification = session.exec(select(Qualification).where(Qualification.code == code)).one()
    row = RecommendationFeedback(
        satisfied=satisfied, reason=reason, qualification_id=qualification.id, query_hash="f" * 64, signed_in=True,
        intent="training_and_assessment", experience_years=7.0, has_certification=True, match_count=3, rank=rank,
        score=60 if rank else None, keyword=0.5, z_score=4.2, model=V3, params=PARAMS, readiness_score=62.5,
        readiness_level="Moderate Readiness", **extra)
    session.add(row)
    session.flush()
    return row


def test_the_export_keeps_the_recommendations_numbers_and_nothing_about_the_learner(session, tmp_path):
    smaw = answer(session, "SMAW-NC-II", True)
    answer(session, "COOKERY-NC-II", False, "wrong_qualification", rank=None,
           wanted_qualification_id=smaw.qualification_id)
    path = tmp_path / "feedback.csv"
    feedback.write(path, feedback.rows(session))

    text = path.read_text(encoding="utf-8")
    exported = list(csv.DictReader(text.splitlines()))
    assert tuple(exported[0]) == feedback.COLUMNS
    assert [(r["qualification_code"], r["place"], r["rank"], r["score"], r["satisfied"], r["reason"])
            for r in exported] == [("COOKERY-NC-II", "own_choice", "", "", "False", "wrong_qualification"),
                                   ("SMAW-NC-II", "top_match", "1", "60", "True", "")]
    smaw = exported[1]
    assert (smaw["model"], smaw["min_score"], smaw["z_floor"], smaw["keyword"], smaw["z_score"]) == (
        V3, "20", "3.5", "0.5", "4.2")
    assert smaw["month"] == datetime.now(PHILIPPINE_TIME).strftime("%Y-%m")
    assert (exported[0]["wanted_code"], exported[0]["wanted_name"], smaw["wanted_code"]) == (
        "SMAW-NC-II", "Shielded Metal Arc Welding (SMAW) NC II", "")
    assert {"id", "query_hash", "signed_in", "experience_years", "has_certification", "created_at"}.isdisjoint(
        feedback.COLUMNS)
    assert "f" * 64 not in text and "7.0" not in text


def test_dates_are_philippine_calendar_days_both_included(session):
    last_evening = datetime(2026, 10, 31, 23, 30, tzinfo=PHILIPPINE_TIME)
    answer(session, "SMAW-NC-II", True, created_at=last_evening)
    answer(session, "SMAW-NC-II", False, created_at=last_evening + timedelta(hours=1))

    [october] = feedback.rows(session, date(2026, 10, 1), date(2026, 10, 31))
    [november] = feedback.rows(session, date(2026, 11, 1))
    assert (october["month"], october["satisfied"]) == ("2026-10", True)
    assert (november["month"], november["satisfied"]) == ("2026-11", False)


def code_cells():
    nb = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
    return [(cell["id"], "".join(cell["source"])) for cell in nb["cells"] if cell["cell_type"] == "code"]


def test_the_notebook_is_clean():
    nb = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
    assert "accelerator" not in nb["metadata"], "no GPU needed"
    for cell in nb["cells"]:
        if cell["cell_type"] == "code":
            assert cell["outputs"] == [] and cell["execution_count"] is None
            compile("".join(cell["source"]), cell["id"], "exec")


def exported(code, name, satisfied, reason="", rank=1, score=60, model=V3, params=PARAMS, readiness=62.5,
             wanted=(None, None)):
    level = "High Readiness" if readiness >= 80 else "Moderate Readiness" if readiness >= 50 else "Low Readiness"
    return {"month": "2026-10", "qualification_code": code, "qualification_name": name, "place": feedback.place(rank),
            "rank": rank, "match_count": 3, "score": score if rank else None, "keyword": 0.4, "z_score": 4.0,
            "model": model, **{key: (params or {}).get(key) for key in feedback.PARAMS},
            "intent": "training_and_assessment", "readiness_score": readiness, "readiness_level": level,
            "satisfied": satisfied, "reason": reason or None, "wanted_code": wanted[0], "wanted_name": wanted[1]}


def test_the_notebook_turns_an_export_into_a_worklist(tmp_path, monkeypatch):
    pytest.importorskip("pandas")
    smaw = ("SMAW-NC-II", "Shielded Metal Arc Welding (SMAW) NC II")
    cookery = ("COOKERY-NC-II", "Cookery NC II")
    css = ("CSS-NC-II", "Computer Systems Servicing NC II")
    mmaw = ("MMAW-NC-II", "Manual Metal Arc Welding (MMAW) NC II")
    answers = ([exported(*smaw, False, "wrong_qualification", score=s, wanted=w)
                for s, w in ((25, mmaw), (30, mmaw), (30, cookery), (35, (None, None)))]
               + [exported(*smaw, True, score=s, readiness=85) for s in (80, 85)]
               + [exported(*cookery, False, "readiness_off", rank=2, score=50, readiness=78) for _ in range(3)]
               + [exported(*cookery, True, score=70) for _ in range(2)]
               + [exported(*cookery, True, rank=None)]
               + [exported(*css, True, score=55, model=None, params=None) for _ in range(2)])
    path = tmp_path / "feedback.csv"
    feedback.write(path, answers)
    downloads = []
    colab = types.ModuleType("google.colab")
    colab.files = types.SimpleNamespace(upload=lambda: {"feedback.csv": path.read_bytes()}, download=downloads.append)
    monkeypatch.setitem(sys.modules, "google.colab", colab)
    monkeypatch.chdir(tmp_path)

    scope = {"display": lambda value: None}
    for name, source in code_cells():
        exec(compile(source, name, "exec"), scope)

    assert downloads == ["feedback-worklist.csv"]
    worklist = scope["worklist"].reset_index().set_index("qualification_code")
    assert list(worklist.index) == ["SMAW-NC-II", "COOKERY-NC-II"], "CSS was always satisfied; flagged ones first"
    assert worklist.loc["SMAW-NC-II", ["answers", "satisfied", "wrong_qualification", "improve"]].tolist() == [
        6, 2, 4, "matching"]
    assert bool(worklist.loc["SMAW-NC-II", "below_target"]) and not worklist.loc["COOKERY-NC-II", "below_target"]
    assert worklist.loc["COOKERY-NC-II", ["readiness_off", "picked_from_library", "improve"]].tolist() == [
        3, 1, "readiness"]
    assert worklist.loc["SMAW-NC-II", "wanted_instead"] == f"{mmaw[1]} (2); Cookery NC II (1)"
    assert worklist.loc["COOKERY-NC-II", "wanted_instead"] == ""
    # Raising v3's minimum score from 20 to 40 would hide all four wrong SMAW matches and no satisfied one.
    [at_40] = [row for row in scope["rows"] if row["new_min_score"] == 40]
    assert (at_40["model"], at_40["hides_wrong"], at_40["hides_satisfied"]) == (V3, "4 of 4", "0 of 4")
    assert {row["model"] for row in scope["rows"]} == {V3}, "keyword-only answers keep no parameters"
    saved = (tmp_path / "feedback-worklist.csv").read_text(encoding="utf-8")
    assert saved.splitlines()[0].startswith("qualification_code,qualification_name,answers,satisfied,rate,low,high")
