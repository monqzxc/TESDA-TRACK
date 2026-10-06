from datetime import timedelta

import pytest
from sqlmodel import select

from tesda_track.models import ReadinessCheck, RecommendationSession, utcnow

CEBU_CITY = (10.3157, 123.8854)


@pytest.fixture
def activity(client, admin, learner, other_learner, competency_ids, make_provider, make_program, make_schedule):
    """Juan: welder session (SMAW chosen), readiness 50, approved then competent. Maria: chef session, readiness 100."""
    smaw_ids = competency_ids("SMAW-NC-II")
    cookery_ids = competency_ids("COOKERY-NC-II")
    juan = client.post("/api/v1/me/recommendations", headers=learner, json={"query": "I want to be a welder."}).json()
    client.patch(f"/api/v1/me/recommendations/{juan['id']}", headers=learner,
                 json={"experience_years": 4, "has_certification": False, "qualification_code": "SMAW-NC-II"})
    client.post("/api/v1/me/recommendations", headers=other_learner, json={"query": "I want to become a chef"})
    client.post("/api/v1/me/readiness-checks", headers=learner, json={
        "qualification_code": "SMAW-NC-II",
        "answers": {str(i): "confident" if n < 3 else "not_familiar" for n, i in enumerate(smaw_ids)}})
    client.post("/api/v1/me/readiness-checks", headers=other_learner, json={
        "qualification_code": "COOKERY-NC-II", "answers": {str(i): "confident" for i in cookery_ids}})
    make_program()
    make_program(provider=make_provider(name="Cebu Skills Center", region_code="VII", location=CEBU_CITY))
    schedule = make_schedule(slots=5)
    application = client.post("/api/v1/me/assessment-applications", headers=learner,
                              json={"schedule_id": schedule["id"]}).json()
    client.patch(f"/api/v1/admin/assessment-applications/{application['id']}", headers=admin, json={"status": "approved"})
    client.patch(f"/api/v1/admin/assessment-applications/{application['id']}", headers=admin,
                 json={"status": "completed", "result": "competent"})


def report(client, admin, name, **params):
    response = client.get(f"/api/v1/admin/reports/{name}", headers=admin, params=params)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("name", ["overview", "qualification-demand", "skill-gaps", "funnel", "supply"])
def test_reports_are_for_administrators_only(client, learner, name):
    assert client.get(f"/api/v1/admin/reports/{name}", headers=learner).status_code == 403
    assert client.get(f"/api/v1/admin/reports/{name}").status_code == 401


def test_overview_counts_activity(client, admin, activity):
    overview = report(client, admin, "overview")
    assert overview["learners"] == 3, "two learners plus the administrator account"
    assert overview["recommendation_sessions"] == 2
    assert overview["readiness_checks"] == 2 and overview["average_readiness"] == 75
    assert overview["assessment_applications"] == {"completed": 1}
    assert overview["certifications"] == {"total": 1, "verified": 1}
    assert overview["semantic_analyses"] == 0


def test_qualification_demand_counts_matches_choices_and_outcomes(client, admin, activity):
    rows = {row["qualification"]["code"]: row for row in report(client, admin, "qualification-demand")}
    smaw, cookery, css = rows["SMAW-NC-II"], rows["COOKERY-NC-II"], rows["CSS-NC-II"]
    assert (smaw["top_match"], smaw["chosen"], smaw["readiness_checks"], smaw["average_readiness"]) == (1, 1, 1, 50)
    assert (smaw["assessment_applications"], smaw["competent"]) == (1, 1)
    assert (cookery["top_match"], cookery["chosen"], cookery["average_readiness"]) == (1, 0, 100)
    assert (css["top_match"], css["readiness_checks"], css["average_readiness"]) == (0, 0, None)


def test_skill_gaps_show_how_learners_rate_each_competency(client, admin, activity):
    gaps = report(client, admin, "skill-gaps", qualification_code="SMAW-NC-II")
    assert [g["position"] for g in gaps] == [1, 2, 3, 4, 5, 6]
    assert gaps[0] == {"competency_id": gaps[0]["competency_id"], "position": 1,
                       "name": "Observe workplace safety procedures", "answers": 1, "confident": 1,
                       "some_experience": 0, "not_familiar": 0, "gap_rate": 0.0}
    assert gaps[5]["not_familiar"] == 1 and gaps[5]["gap_rate"] == 1.0


def test_skill_gaps_need_a_known_qualification(client, admin):
    assert client.get("/api/v1/admin/reports/skill-gaps", headers=admin,
                      params={"qualification_code": "NOPE"}).status_code == 404


def test_funnel_counts_learners_at_each_stage(client, admin, activity):
    assert report(client, admin, "funnel") == {"registered": 3, "saved_a_recommendation": 2,
                                               "checked_readiness": 2, "applied_for_assessment": 1,
                                               "certified": 1}


def test_supply_by_region_counts_programs_and_open_seats(client, admin, activity):
    rows = {row["region_code"]: row for row in report(client, admin, "supply")}
    assert (rows["NCR"]["training_providers"], rows["NCR"]["training_programs"]) == (1, 1)
    assert (rows["NCR"]["upcoming_assessments"], rows["NCR"]["open_seats"]) == (1, 4)
    assert (rows["VII"]["training_programs"], rows["VII"]["upcoming_assessments"]) == (1, 0)
    assert rows["CAR"] == {"region_code": "CAR", "region": "Cordillera Administrative Region", "training_providers": 0,
                           "training_programs": 0, "upcoming_assessments": 0, "open_seats": 0}


def test_date_range_limits_what_is_counted(client, admin, session, activity):
    for model in (RecommendationSession, ReadinessCheck):
        oldest = session.exec(select(model).order_by(model.created_at)).first()
        oldest.created_at = utcnow() - timedelta(days=40)
    session.flush()
    since = (utcnow() - timedelta(days=30)).date().isoformat()
    overview = report(client, admin, "overview", date_from=since)
    assert overview["recommendation_sessions"] == 1 and overview["readiness_checks"] == 1
    assert client.get("/api/v1/admin/reports/overview", headers=admin,
                      params={"date_from": "2026-05-01", "date_to": "2026-04-01"}).status_code == 422
