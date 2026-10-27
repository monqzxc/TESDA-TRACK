"""All authority/availability records here are synthetic fixtures in the isolated test DB."""
from datetime import timedelta, timezone

import pytest
from sqlmodel import select

from tesda_track.models import AssessmentSchedule, Learner, LearnerAssessment, RankingAudit, utcnow
from backend.tests.test_verification import certificate, prerequisite

BASE = "/api/v1/recommendations/assessments"


def rank(client, headers=None, **fields):
    response = client.post(BASE, headers=headers, json={"qualification_code": "SMAW-NC-II", **fields})
    assert response.status_code == 200, response.text
    return response.json()


def ids(result):
    return [r["schedule"]["id"] for r in result["results"]]


def test_distinct_schedule_results_arithmetic_reproducibility_and_privacy(client, make_schedule, session):
    expensive = make_schedule(fee="2500")
    cheap = make_schedule(fee="500")
    answers = {"interests": ["welding"], "existing_skills": ["weld"], "career_goal": "private welder goal"}
    first = rank(client, assessment=answers, maximum_fee="1000")
    second = rank(client, assessment=answers, maximum_fee="1000")
    assert ids(first) == ids(second) == [cheap["id"], expensive["id"]]
    assert first["result_type"] == "assessment" and first["policy_version"] == "assessment-center-v1"
    for item in first["results"]:
        assert "program" not in item and item["eligibility"]["status"] == "satisfied"
        score = item["personalization"]
        assert item["score"] == round(sum(score["contributions"].values()))
        assert sum(score["effective_weights"].values()) == pytest.approx(1)
        assert item["explanation"]
    assert session.exec(select(LearnerAssessment)).all() == []
    audit = session.get(RankingAudit, first["audit_id"])
    assert "private welder goal" not in str(audit.model_dump())
    assert "interests" not in audit.preferences
    assert audit.assessment_id is None


def test_empty_preferences_do_not_award_perfect_fit(client, make_schedule):
    late = make_schedule(days_ahead=20)
    early = make_schedule(days_ahead=5)
    result = rank(client)
    assert ids(result) == [early["id"], late["id"]]
    assert all(r["score"] == 0 for r in result["results"])
    assert all(r["personalization"]["evidence_coverage"] == 0 for r in result["results"])


@pytest.mark.parametrize("change,pending", [
    ({"status": "unknown"}, True), ({"status": "unavailable"}, False),
    ({"status": "expired"}, False), ({"requirements_reviewed": False}, True),
    ({"valid_until": (utcnow() + timedelta(days=2)).isoformat()}, True),
    ({"requirements": [prerequisite("manual_review")]}, True),
])
def test_authority_is_checked_before_scoring(client, make_schedule, verify_service, change, pending):
    schedule = make_schedule()
    verify_service("assessment", schedule["center"]["id"], **change)
    result = rank(client, assessment={"interests": ["welding"]})
    assert not result["results"]
    assert bool(result["requires_verification"]) == pending
    if pending:
        assert "score" not in result["requires_verification"][0]


@pytest.mark.parametrize("availability", ["unknown", "unavailable", "stale"])
def test_unconfirmed_availability_never_recommended(client, make_schedule, availability):
    extra = {"availability_status": availability} if availability != "stale" else {
        "availability_checked_at": (utcnow() - timedelta(days=3)).isoformat(),
        "availability_valid_until": (utcnow() - timedelta(days=1)).isoformat()}
    make_schedule(**extra)
    result = rank(client)
    assert not result["results"]
    assert bool(result["requires_verification"]) == (availability != "unavailable")


def test_training_authority_does_not_establish_assessment_authority(client, make_schedule, verify_service):
    schedule = make_schedule(verified=False)
    result = rank(client)
    assert not result["results"] and result["requires_verification"][0]["schedule"]["id"] == schedule["id"]


@pytest.mark.parametrize("state,confirmed,pending", [("missing", False, True), ("self_reported", False, True),
    ("other", False, True), ("expired", False, False), ("before_exam", False, False), ("valid", True, False)])
def test_only_owned_verified_certificate_valid_on_exam_date_passes(client, make_schedule, verify_service,
                                                                  learner, other_learner, session, state, confirmed, pending):
    schedule = make_schedule(days_ahead=3 if state != "before_exam" else 14)
    verify_service("assessment", schedule["center"]["id"], requirements=[prerequisite()])
    if state != "missing":
        certificate(session, email="maria@example.com" if state == "other" else "juan@example.com",
                    verified=state != "self_reported", expired=state == "expired")
    result = rank(client, learner, assessment={"has_certification": True, "experience_years": 20})
    assert bool(result["results"]) == confirmed
    assert bool(result["requires_verification"]) == pending
    assert not rank(client)["results"], "Guest answers cannot establish certificate ownership"


def test_mandatory_fee_date_and_unknown_cost_are_separate_from_scores(client, make_schedule):
    cheap = make_schedule(fee="0", days_ahead=5)
    unknown = make_schedule(fee=None, days_ahead=6)
    expensive = make_schedule(fee="1000", days_ahead=7)
    outside = make_schedule(fee="0", days_ahead=20)
    before = (utcnow().astimezone(timezone(timedelta(hours=8))).date() + timedelta(days=10)).isoformat()
    hard = rank(client, maximum_fee="0", fee_is_mandatory=True, scheduled_before=before, schedule_is_mandatory=True)
    assert ids(hard) == [cheap["id"]]
    assert hard["requires_verification"][0]["schedule"]["id"] == unknown["id"]
    soft = rank(client, maximum_fee="0", scheduled_before=before)
    assert set(ids(soft)) == {cheap["id"], unknown["id"], expensive["id"], outside["id"]}
    missing = next(r for r in soft["results"] if r["schedule"]["id"] == unknown["id"])
    assert missing["personalization"]["components"]["preference"]["score"] == 50
    assert missing["personalization"]["components"]["preference"]["state"] == "unknown"


def test_training_preferences_are_not_reinterpreted_as_exam_logistics(client, make_schedule):
    schedule = make_schedule(fee="8000")
    result = rank(client, assessment={"preferences": {"delivery_mode": "online", "delivery_is_mandatory": True,
        "maximum_budget": "0", "budget_is_mandatory": True, "needs_scholarship": True,
        "scholarship_is_mandatory": True, "start_before": utcnow().date().isoformat(), "schedule_is_mandatory": True}})
    assert ids(result) == [schedule["id"]]
    assert result["results"][0]["personalization"]["components"]["preference"]["state"] == "not_applicable"
    assert any("Training delivery" in r for r in result["results"][0]["explanation"])


def test_geographic_constraints_round_before_use_and_missing_coordinates_are_unconfirmed(client, make_center, make_schedule):
    near = make_schedule(center=make_center(location=(14.6, 121.0)))
    far = make_schedule(center=make_center(region_code="VII", location=(10.3, 123.9)))
    missing = make_schedule(center=make_center(location=None))
    result = rank(client, near_lat=14.599599, near_lon=120.984234, maximum_distance_km=20)
    assert ids(result) == [near["id"]]
    assert result["results"][0]["schedule"]["distance_km"] == 0
    assert [r["schedule"]["id"] for r in result["requires_verification"]] == [missing["id"]]
    soft = rank(client, near_lat=14.6, near_lon=121)
    unmapped = next(r for r in soft["results"] if r["schedule"]["id"] == missing["id"])
    assert unmapped["score"] == 0 and unmapped["personalization"]["components"]["location"]["state"] == "unknown"
    assert far["id"] in ids(soft)


def test_full_closed_past_inactive_wrong_qualification_are_excluded(client, admin, learner, make_schedule, make_center):
    full = make_schedule(slots=1)
    app = client.post("/api/v1/me/assessment-applications", headers=learner, json={"schedule_id": full["id"]}).json()
    assert client.patch(f"/api/v1/admin/assessment-applications/{app['id']}", headers=admin,
                        json={"status": "approved"}).status_code == 200
    make_schedule(days_ahead=-1)
    closed = make_schedule()
    client.patch(f"/api/v1/admin/assessment-schedules/{closed['id']}", headers=admin, json={"status": "closed"})
    inactive = make_schedule()
    client.patch(f"/api/v1/admin/assessment-centers/{inactive['center']['id']}", headers=admin, json={"is_active": False})
    make_schedule(qualification_code="CSS-NC-II")
    assert rank(client)["total"] == 0


def test_complete_application_workflow_and_recheck_after_ranking(client, admin, learner, other_learner, make_schedule, verify_service):
    schedule = make_schedule(slots=2)
    result = rank(client, learner)
    assert ids(result) == [schedule["id"]]
    application = client.post("/api/v1/me/assessment-applications", headers=learner, json={"schedule_id": schedule["id"]})
    assert application.status_code == 201
    assert rank(client, learner)["results"][0]["application_status"] == "pending"
    application_id = application.json()["id"]
    assert client.patch(f"/api/v1/admin/assessment-applications/{application_id}", headers=admin,
                        json={"status": "approved"}).status_code == 200
    assert client.patch(f"/api/v1/admin/assessment-applications/{application_id}", headers=admin,
                        json={"status": "completed", "result": "competent"}).status_code == 200
    assert client.get("/api/v1/me/certifications", headers=learner).json()[0]["verified"] is True
    assert client.get("/api/v1/me/assessment-applications", headers=learner).json()[0]["status"] == "completed"
    verify_service("assessment", schedule["center"]["id"], status="unavailable")
    assert client.post("/api/v1/me/assessment-applications", headers=other_learner,
                       json={"schedule_id": schedule["id"]}).status_code == 422


def test_full_schedule_cannot_accept_new_application(client, admin, learner, other_learner, make_schedule):
    schedule = make_schedule(slots=1)
    application = client.post("/api/v1/me/assessment-applications", headers=learner, json={"schedule_id": schedule["id"]}).json()
    client.patch(f"/api/v1/admin/assessment-applications/{application['id']}", headers=admin, json={"status": "approved"})
    assert rank(client)["results"] == []
    assert client.post("/api/v1/me/assessment-applications", headers=other_learner,
                       json={"schedule_id": schedule["id"]}).status_code == 422


def test_rank_all_candidates_before_pagination_with_stable_ties(client, session, make_schedule):
    initial = make_schedule(fee="5000")
    row = session.get(AssessmentSchedule, initial["id"])
    extra = []
    for index in range(105):
        schedule = AssessmentSchedule(center_id=row.center_id, qualification_id=row.qualification_id,
            scheduled_at=row.scheduled_at, slots=2, fee=0 if index == 104 else 5000,
            availability_status="available", availability_source="Isolated test-only observation",
            availability_checked_at=utcnow() - timedelta(minutes=1), availability_valid_until=utcnow() + timedelta(days=30))
        session.add(schedule)
        extra.append(schedule)
    session.flush()
    first = rank(client, maximum_fee="1000", limit=5)
    assert first["total"] == 106 and ids(first)[0] == extra[-1].id
    second = rank(client, maximum_fee="1000", limit=5, offset=5)
    assert not set(ids(first)) & set(ids(second))
    assert ids(first) == ids(rank(client, maximum_fee="1000", limit=5))
    assert rank(client, limit=5, offset=500)["results"] == []


def test_saved_assessment_and_history_ownership_and_separate_exports(client, learner, other_learner, make_schedule, make_program):
    make_schedule()
    saved = client.post("/api/v1/learner-assessments", headers=learner, json={"answers": {"interests": ["welding"]}}).json()
    result = rank(client, learner, assessment_id=saved["id"])
    assert client.post(BASE, json={"qualification_code": "SMAW-NC-II", "assessment_id": saved["id"]}).status_code == 401
    assert client.post(BASE, headers=other_learner, json={"qualification_code": "SMAW-NC-II", "assessment_id": saved["id"]}).status_code == 404
    history_url = f"/api/v1/recommendations/{result['audit_id']}"
    assert client.get(history_url).status_code == 401
    assert client.get(history_url, headers=other_learner).status_code == 404
    history = client.get(history_url, headers=learner).json()
    assert history["result_type"] == "assessment" and history["assessment_id"] == saved["id"]
    assert history["results"][0]["schedule"]["id"] == result["results"][0]["schedule"]["id"]
    make_program()
    client.post("/api/v1/recommendations/training", headers=learner, json={"qualification_code": "SMAW-NC-II"})
    export = client.get("/api/v1/me/export", headers=learner).json()
    assert len(export["assessment_rankings"]) == len(export["training_rankings"]) == 1
    guest = rank(client)
    assert client.get(f"/api/v1/recommendations/{guest['audit_id']}", headers=learner).status_code == 404


@pytest.mark.parametrize("fields", [
    {"maximum_fee": -1}, {"fee_is_mandatory": True}, {"schedule_is_mandatory": True},
    {"near_lat": 14}, {"near_lat": float("inf"), "near_lon": 121},
    {"maximum_distance_km": 10}, {"maximum_distance_km": 10, "assessment": {}},
    {"region_code": "NOT-A-REGION"}, {"scheduled_after": "2030-01-01", "scheduled_before": "2029-01-01"},
    {"limit": 51}, {"offset": -1}, {"invented": True}, {"qualification_code": "invented"},
])
def test_invalid_inputs_do_not_create_audit(client, session, fields):
    # Infinite coordinates are sent as a JSON string to exercise schema validation without nonstandard JSON.
    if fields.get("near_lat") == float("inf"):
        fields = {**fields, "near_lat": "Infinity"}
    assert client.post(BASE, json={"qualification_code": "SMAW-NC-II", **fields}).status_code == (404 if fields.get("qualification_code") == "invented" else 422)
    assert session.exec(select(RankingAudit)).all() == []
