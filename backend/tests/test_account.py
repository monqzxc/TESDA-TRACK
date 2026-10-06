from sqlmodel import func, select

from tesda_track.models import Goal, Learner, ReadinessCheck, RecommendationSession


def count(session, model, **filters):
    query = select(func.count()).select_from(model)
    for field, value in filters.items():
        query = query.where(getattr(model, field) == value)
    return session.exec(query).one()


def test_update_display_name(client, learner):
    response = client.patch("/api/v1/me", headers=learner, json={"full_name": "Juan P. Dela Cruz"})
    assert response.status_code == 200
    assert client.get("/api/v1/me", headers=learner).json()["full_name"] == "Juan P. Dela Cruz"


def test_account_deletion_erases_learner_and_records(client, session, learner, other_learner, competency_ids):
    for headers in (learner, other_learner):
        client.post("/api/v1/me/goals", headers=headers, json={"title": "Become a welder"})
        client.post("/api/v1/me/recommendations", headers=headers, json={"query": "I want to be a welder."})
        client.post("/api/v1/me/readiness-checks", headers=headers, json={
            "qualification_code": "SMAW-NC-II",
            "answers": {str(i): "confident" for i in competency_ids("SMAW-NC-II")}})
    juan_id = client.get("/api/v1/me", headers=learner).json()["id"]

    assert client.delete("/api/v1/me", headers=learner).status_code == 204

    session.expire_all()
    assert session.exec(select(Learner).where(Learner.email == "juan@example.com")).first() is None
    for model in (Goal, RecommendationSession, ReadinessCheck):
        assert count(session, model, learner_id=juan_id) == 0
        assert count(session, model) == 1, "the other learner's records must survive"
    assert client.get("/api/v1/me", headers=learner).status_code == 401


def test_export_contains_only_the_learners_own_records(client, learner, other_learner, competency_ids):
    client.post("/api/v1/me/goals", headers=learner, json={"title": "Become a welder"})
    client.post("/api/v1/me/goals", headers=other_learner, json={"title": "Become a chef"})
    client.post("/api/v1/me/recommendations", headers=learner, json={"query": "I want to be a welder."})
    client.post("/api/v1/me/readiness-checks", headers=learner, json={
        "qualification_code": "SMAW-NC-II", "answers": {str(i): "confident" for i in competency_ids("SMAW-NC-II")}})
    client.post("/api/v1/me/certifications", headers=learner, json={"title": "SMAW NC I"})

    response = client.get("/api/v1/me/export", headers=learner)
    assert response.status_code == 200
    export = response.json()
    assert export["account"]["email"] == "juan@example.com"
    assert [g["title"] for g in export["goals"]] == ["Become a welder"]
    assert [s["query"] for s in export["recommendation_sessions"]] == ["I want to be a welder."]
    assert [c["score"] for c in export["readiness_checks"]] == [100]
    assert [c["title"] for c in export["certifications"]] == ["SMAW NC I"]
    assert "password_hash" not in str(export)
