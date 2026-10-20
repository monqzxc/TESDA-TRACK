"""Durable retry, isolation, deletion and transaction behavior using the real database."""
from uuid import uuid4

from sqlmodel import select

from tesda_track.models import WriteReceipt


def test_recommendation_retry_conflict_and_account_isolation(client, learner, other_learner):
    path = "/api/v1/me/recommendations"
    body = {"query": "I want to be a welder", "request_id": str(uuid4())}
    first = client.post(path, headers=learner, json=body)
    assert first.status_code == 201
    retry = client.post(path, headers=learner, json=body)
    assert retry.status_code == 201 and retry.json()["id"] == first.json()["id"]
    assert len(client.get(path, headers=learner).json()) == 1
    conflict = client.post(path, headers=learner, json={**body, "query": "I want to cook"})
    assert conflict.status_code == 409
    other = client.post(path, headers=other_learner, json=body)
    assert other.status_code == 201 and other.json()["id"] != first.json()["id"]
    client.delete(f"{path}/{first.json()['id']}", headers=learner)
    assert client.post(path, headers=learner, json=body).status_code == 410
    assert client.get(path, headers=learner).json() == []


def test_guest_assessment_conversion_is_not_duplicated(client, learner):
    body = {"query": "I want to be a welder", "assessment": {"interests": ["welding"]}, "request_id": str(uuid4())}
    first = client.post("/api/v1/me/recommendations", headers=learner, json=body).json()
    second = client.post("/api/v1/me/recommendations", headers=learner, json=body).json()
    assert first["id"] == second["id"]
    assert first["assessment_id"] == second["assessment_id"]
    assert len(client.get("/api/v1/learner-assessments", headers=learner).json()) == 1


def test_readiness_retry_preserves_one_record_and_rejects_changed_answers(client, learner):
    qualification = next(q for q in client.get("/api/v1/qualifications").json() if q["code"] == "SMAW-NC-II")
    answers = {str(c["id"]): "confident" for c in qualification["competencies"]}
    path = "/api/v1/me/readiness-checks"
    body = {"qualification_code": qualification["code"], "answers": answers, "request_id": str(uuid4())}
    first = client.post(path, headers=learner, json=body)
    assert first.status_code == 201
    assert client.post(path, headers=learner, json=body).json()["id"] == first.json()["id"]
    assert len(client.get(path, headers=learner).json()) == 1
    body["answers"] = {key: "not_familiar" for key in answers}
    assert client.post(path, headers=learner, json=body).status_code == 409


def test_assessment_revision_retry_before_latest_revision_check(client, learner):
    path = "/api/v1/learner-assessments"
    first_body = {"answers": {"interests": ["welding"]}, "request_id": str(uuid4())}
    first = client.post(path, headers=learner, json=first_body).json()
    assert client.post(path, headers=learner, json=first_body).json()["id"] == first["id"]
    next_body = {"answers": {"interests": ["cooking"]}, "request_id": str(uuid4())}
    revised = client.patch(f"{path}/{first['id']}", headers=learner, json=next_body)
    assert revised.status_code == 201
    retry = client.patch(f"{path}/{first['id']}", headers=learner, json=next_body)
    assert retry.status_code == 201 and retry.json()["id"] == revised.json()["id"]
    assert len(client.get(path, headers=learner).json()) == 2


def test_application_retry_cannot_resubmit_after_withdrawal(client, learner, make_schedule):
    schedule = make_schedule()
    path = "/api/v1/me/assessment-applications"
    body = {"schedule_id": schedule["id"], "request_id": str(uuid4())}
    first = client.post(path, headers=learner, json=body)
    assert first.status_code == 201, first.text
    application_id = first.json()["id"]
    assert client.post(path, headers=learner, json=body).json()["id"] == application_id
    withdraw = f"{path}/{application_id}/withdraw"
    assert client.post(withdraw, headers=learner).status_code == 200
    assert client.post(withdraw, headers=learner).json()["status"] == "withdrawn"
    assert client.post(path, headers=learner, json=body).json()["status"] == "withdrawn"
    assert len(client.get(path, headers=learner).json()) == 1


def test_failed_write_has_no_receipt_and_account_deletion_cascades(client, learner, session):
    body = {"qualification_code": "missing", "answers": {}, "request_id": str(uuid4())}
    assert client.post("/api/v1/me/readiness-checks", headers=learner, json=body).status_code == 404
    assert not list(session.exec(select(WriteReceipt)))
    client.post("/api/v1/me/recommendations", headers=learner,
                json={"query": "I want to weld", "request_id": str(uuid4())})
    assert list(session.exec(select(WriteReceipt)))
    assert client.delete("/api/v1/me", headers=learner).status_code == 204
    assert not list(session.exec(select(WriteReceipt)))
