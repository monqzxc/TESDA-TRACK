import uuid

import pytest
from sqlmodel import select

from tesda_track.config import get_settings
from tesda_track.models import AssessmentCenter, Learner, SuggestionFeedback, TrainingProvider

PATH = "/api/v1/feedback/suggestions"
HEADERS = {"X-Requested-With": "XMLHttpRequest"}
GOAL = {"goal": "I want to learn welding", "consent": True}


@pytest.fixture
def target():
    return {"receipt": str(uuid.uuid4()), "result_kind": "qualification", "result_key": "SMAW-NC-II"}


def test_rating_only_accepts_one_answer_and_does_not_accept_goal_text(client, session, target):
    rating = {**target, "action": "rating", "helpful": True}
    assert client.post(PATH, json=rating, headers=HEADERS).status_code == 204
    assert client.post(PATH, json={**rating, "helpful": False}, headers=HEADERS).status_code == 409
    assert client.post(PATH, json={**rating, "shared_goal": GOAL}, headers=HEADERS).status_code == 422
    assert client.post(PATH, json=rating).status_code == 403
    [saved] = session.exec(select(SuggestionFeedback)).all()
    assert saved.helpful is True
    assert saved.shared_goal is None
    assert saved.qualification_code == "SMAW-NC-II"


@pytest.mark.parametrize(("kind", "model"), [("training", TrainingProvider), ("assessment", AssessmentCenter)])
def test_center_report_uses_catalog_identity(client, session, target, kind, model):
    center = model(name="Example Skills Center", region_code="NCR")
    session.add(center)
    session.flush()
    report = {**target, "result_kind": kind, "result_key": str(center.id),
              "qualification_code": target["result_key"], "action": "report", "reason": "outdated_information"}
    assert client.post(PATH, json=report, headers=HEADERS).status_code == 204
    [saved] = session.exec(select(SuggestionFeedback)).all()
    assert (saved.result_kind, saved.result_name, saved.qualification_code) == (kind, center.name, "SMAW-NC-II")
    assert saved.shared_goal is None
    assert client.post(PATH, json={**report, "result_key": "100000000"}, headers=HEADERS).status_code == 404


def test_only_named_owner_can_read_reports_and_goal_needs_opt_in(client, target, admin, learner, session, login, monkeypatch):
    from tesda_track.cli import create_or_promote_admin

    password = "Test-password-123!"
    create_or_promote_admin(session, email="other-admin@example.com", full_name="Other Admin", password=password)
    other_admin = login("other-admin@example.com", password)
    report = {**target, "action": "report", "reason": "wrong_qualification"}
    assert client.post(PATH, json={**report, "shared_goal": {**GOAL, "consent": False}}, headers=HEADERS).status_code == 422
    assert client.post(PATH, json=report, headers=HEADERS).status_code == 204
    assert client.post(PATH, json={**report, "shared_goal": GOAL}, headers=HEADERS).status_code == 409
    consented = {**report, "receipt": str(uuid.uuid4()), "shared_goal": GOAL}
    assert client.post(PATH, json=consented, headers=HEADERS).status_code == 204
    assert client.post(PATH, json={**target, "action": "rating", "helpful": False}, headers=HEADERS).status_code == 204

    inbox = f"{PATH}/reports"
    owner = session.exec(select(Learner).where(Learner.email == "juan@example.com")).one()
    monkeypatch.setattr(get_settings(), "suggestion_feedback_owner_id", owner.id)
    assert client.get(inbox).status_code == 401
    assert client.get(inbox, headers=admin).status_code == 403
    assert client.get(inbox, headers=other_admin).status_code == 403
    response = client.get(inbox, headers=learner)
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    saved = {entry["receipt"]: entry for entry in response.json()}
    assert set(saved) == {report["receipt"], consented["receipt"]}
    assert saved[report["receipt"]]["shared_goal"] is None
    assert saved[consented["receipt"]]["shared_goal"] == GOAL["goal"]
