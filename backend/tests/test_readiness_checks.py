from sqlmodel import func, select

from tesda_track.models import ReadinessAnswer, ReadinessCheck


def submit(client, headers, answers, code="SMAW-NC-II", **body):
    return client.post("/api/v1/me/readiness-checks", headers=headers,
                       json={"qualification_code": code, "answers": answers, **body})


def test_readiness_check_is_scored_and_stored_with_answers(client, session, learner, competency_ids):
    ids = competency_ids("SMAW-NC-II")
    answers = {str(i): "confident" if n < 3 else "not_familiar" for n, i in enumerate(ids)}
    response = submit(client, learner, answers)
    assert response.status_code == 201
    check = response.json()
    assert check["score"] == 50 and check["level"] == "Moderate Readiness"
    assert check["qualification"]["code"] == "SMAW-NC-II"
    assert check["skill_gaps"] == ["Perform fillet welding", "Perform groove welding",
                                   "Inspect weld quality and identify common defects"]
    assert check["answers"] == {str(i): answers[str(i)] for i in ids}
    stored = session.exec(select(ReadinessAnswer.competency_id, ReadinessAnswer.answer)).all()
    assert sorted(stored) == sorted((i, answers[str(i)]) for i in ids)


def test_incomplete_answers_are_rejected_and_nothing_is_stored(client, session, learner, competency_ids):
    response = submit(client, learner, {str(competency_ids("SMAW-NC-II")[0]): "confident"})
    assert response.status_code == 422
    assert session.exec(select(func.count()).select_from(ReadinessCheck)).one() == 0


def test_answers_for_other_qualifications_are_not_stored(client, session, learner, competency_ids):
    answers = {str(i): "confident" for i in competency_ids("SMAW-NC-II")}
    answers[str(competency_ids("CSS-NC-II")[0])] = "not_familiar"
    check = submit(client, learner, answers).json()
    assert len(check["answers"]) == 6
    assert session.exec(select(func.count()).select_from(ReadinessAnswer)).one() == 6


def test_history_can_be_filtered_by_qualification(client, learner, competency_ids):
    submit(client, learner, {str(i): "confident" for i in competency_ids("SMAW-NC-II")})
    submit(client, learner, {str(i): "not_familiar" for i in competency_ids("CSS-NC-II")}, code="CSS-NC-II")
    all_checks = client.get("/api/v1/me/readiness-checks", headers=learner).json()
    assert [c["qualification"]["code"] for c in all_checks] == ["CSS-NC-II", "SMAW-NC-II"]
    smaw = client.get("/api/v1/me/readiness-checks?qualification_code=SMAW-NC-II", headers=learner).json()
    assert [c["score"] for c in smaw] == [100]


def test_checks_can_reference_own_recommendation_sessions_only(client, learner, other_learner, competency_ids):
    answers = {str(i): "confident" for i in competency_ids("SMAW-NC-II")}
    mine = client.post("/api/v1/me/recommendations", headers=learner, json={"query": "welder"}).json()
    theirs = client.post("/api/v1/me/recommendations", headers=other_learner, json={"query": "welder"}).json()
    assert submit(client, learner, answers, recommendation_session_id=mine["id"]).status_code == 201
    assert submit(client, learner, answers, recommendation_session_id=theirs["id"]).status_code == 422


def test_other_learners_checks_are_invisible(client, learner, other_learner, competency_ids):
    check = submit(client, other_learner, {str(i): "confident" for i in competency_ids("SMAW-NC-II")}).json()
    assert client.get(f"/api/v1/me/readiness-checks/{check['id']}", headers=learner).status_code == 404
    assert client.get("/api/v1/me/readiness-checks", headers=learner).json() == []
