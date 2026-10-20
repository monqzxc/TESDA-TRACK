"""Structured personalization against isolated, synthetic catalog and delivery fixtures."""
import uuid

import pytest
from sqlmodel import select

from tesda_track.models import LearnerAssessment, RankingAudit

BASE = "/api/v1/learner-assessments"


def save(client, learner, **answers):
    response = client.post(BASE, headers=learner, json={"answers": answers})
    assert response.status_code == 201, response.text
    return response.json()


def qualifications(client, assessment=None, assessment_id=None, learner=None, **fields):
    body = fields
    if assessment is not None:
        body["assessment"] = assessment
    if assessment_id is not None:
        body["assessment_id"] = assessment_id
    return client.post("/api/v1/recommendations/qualifications", headers=learner, json=body)


def rank(client, assessment=None, assessment_id=None, learner=None, **fields):
    body = {"qualification_code": "SMAW-NC-II", **fields}
    if assessment is not None:
        body["assessment"] = assessment
    if assessment_id is not None:
        body["assessment_id"] = assessment_id
    response = client.post("/api/v1/recommendations/training", headers=learner, json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_assessments_are_owned_immutable_revisions(client, learner, other_learner):
    original = save(client, learner, interests=["welding", "Welding"], experience_years=0)
    assert original["answers"]["interests"] == ["welding"]
    updated = client.patch(f"{BASE}/{original['id']}", headers=learner,
                           json={"answers": {"interests": ["cooking"]}})
    assert updated.status_code == 201, updated.text
    second = updated.json()
    assert second["series_id"] == original["series_id"]
    assert second["revision"] == 2 and second["previous_revision_id"] == original["id"]
    assert client.get(f"{BASE}/{original['id']}", headers=learner).json()["answers"] == original["answers"]
    assert client.get(f"{BASE}/{original['id']}", headers=other_learner).status_code == 404
    assert client.patch(f"{BASE}/{original['id']}", headers=other_learner, json={"answers": {}}).status_code == 404
    assert client.delete(f"{BASE}/{original['id']}", headers=other_learner).status_code == 404
    assert client.patch(f"{BASE}/{original['id']}", headers=learner, json={"answers": {}}).status_code == 409
    assert client.get(BASE, headers=other_learner).json() == []


@pytest.mark.parametrize("answers", [
    {"questionnaire_version": 2}, {"interests": [" "]}, {"interests": ["x"] * 21},
    {"education": "invented_level"}, {"experience_years": -1}, {"personality": "introvert"},
    {"verified_competencies": [1]}, {"preferred_sectors": ["invented_sector"]},
    {"preferred_qualification_codes": ["NOPE"]}, {"competencies": [{"competency_id": 999999, "answer": "confident"}]},
    {"preferences": {"region_code": "NOPE"}}, {"preferences": {"near_lat": 14.6}},
    {"preferences": {"maximum_distance_km": 5}}, {"preferences": {"maximum_budget": -5}},
    {"preferences": {"budget_is_mandatory": True}},
    {"preferences": {"scholarship_is_mandatory": True, "needs_scholarship": False}},
    {"preferences": {"start_after": "2026-12-01", "start_before": "2026-11-01"}},
])
def test_invalid_answers_are_rejected_without_persistence(client, learner, session, answers):
    assert client.post(BASE, headers=learner, json={"answers": answers}).status_code == 422
    assert session.exec(select(LearnerAssessment)).all() == []


def test_guest_matching_does_not_persist_and_uses_explicit_interests(client, session):
    response = qualifications(client, assessment={"interests": ["welding"], "experience_years": 0})
    assert response.status_code == 200, response.text
    first = response.json()["matches"][0]
    assert first["qualification"]["code"] == "SMAW-NC-II"
    assert first["personalization"]["effective_weights"]["skill"] == 0
    assert first["personalization"]["components"]["skill"]["state"] == "not_applicable"
    assert session.exec(select(LearnerAssessment)).all() == []
    assert client.post(BASE, json={"answers": {}}).status_code == 401
    assert client.get(BASE).status_code == 401


def test_saved_assessments_cannot_be_used_by_another_learner(client, learner, other_learner):
    saved = save(client, learner, interests=["welding"])
    assert qualifications(client, assessment_id=saved["id"]).status_code == 401
    assert qualifications(client, assessment_id=saved["id"], learner=other_learner).status_code == 404
    assert qualifications(client, assessment_id=saved["id"], learner=learner).status_code == 200
    assert qualifications(client, assessment={}, assessment_id=saved["id"], learner=learner).status_code == 422


def test_explicit_qualification_goal_changes_rank_without_sensitive_profiling(client):
    welding = qualifications(client, assessment={"preferred_qualification_codes": ["SMAW-NC-II"]}).json()
    computer = qualifications(client, assessment={"preferred_qualification_codes": ["CSS-NC-II"]}).json()
    assert welding["matches"][0]["qualification"]["code"] == "SMAW-NC-II"
    assert computer["matches"][0]["qualification"]["code"] == "CSS-NC-II"
    assert qualifications(client, assessment={"education": "primary", "goal_kind": "employment"}).json()["matches"] == []


def test_duplicate_signal_does_not_get_multiple_weighted_bonuses(client):
    single = qualifications(client, assessment={"interests": ["welding"]}).json()["matches"][0]
    repeated = qualifications(client, assessment={"interests": ["welding"], "existing_skills": ["welding"],
                                                   "career_goal": "welding"}).json()["matches"][0]
    assert repeated["score"] == single["score"]
    assert repeated["personalization"]["effective_weights"]["skill"] == 0
    assert repeated["personalization"]["effective_weights"]["career"] == 0


def test_configurable_weights_change_scores_without_changing_core_logic(client, monkeypatch):
    from tesda_track.config import PersonalizationWeights, get_settings

    answers = {"interests": ["welding"], "existing_skills": ["computer"]}
    before_results = qualifications(client, assessment=answers).json()["matches"]
    before = before_results[0]
    monkeypatch.setattr(get_settings(), "personalization_weights", PersonalizationWeights(
        interest=0.15, skill=0.45, career=0.15, location=0.15, preference=0.10))
    after_results = qualifications(client, assessment=answers).json()["matches"]
    assert before["qualification"]["code"] == "SMAW-NC-II"
    assert after_results[0]["qualification"]["code"] == "CSS-NC-II"
    after = next(match for match in after_results if match["qualification"]["code"] == before["qualification"]["code"])
    assert before["qualification"] == after["qualification"]
    assert before["score"] > after["score"]
    assert after["score"] == round(sum(after["personalization"]["contributions"].values()))


def test_beginner_ties_prefer_lower_levels_without_changing_scores(client, session):
    from tesda_track.models import Qualification
    original = session.exec(select(Qualification).where(Qualification.code == "SMAW-NC-II")).one()
    session.add(Qualification(code="AAA-WELDING-NC-III", name=original.name.replace("NC II", "NC III"),
        sector_id=original.sector_id, skill_label=original.skill_label,
        career_keywords=original.career_keywords, possible_jobs=original.possible_jobs))
    session.flush()
    result = qualifications(client, assessment={"interests": ["welding"], "experience_years": 0}).json()["matches"]
    assert [m["qualification"]["code"] for m in result[:2]] == ["SMAW-NC-II", "AAA-WELDING-NC-III"]
    assert result[0]["score"] == result[1]["score"]


def test_competency_answers_are_explicit_and_remain_self_reported(client):
    qualification = client.get("/api/v1/qualifications/SMAW-NC-II").json()
    competency_id = qualification["competencies"][0]["id"]
    response = qualifications(client, assessment={"interests": ["welding"],
        "competencies": [{"competency_id": competency_id, "answer": "some_experience"}]}).json()
    item = next(match for match in response["matches"] if match["qualification"]["code"] == "SMAW-NC-II")
    assert item["personalization"]["components"]["skill"]["score"] == 50
    duplicated = {"competencies": [{"competency_id": competency_id, "answer": "confident"}] * 2}
    assert qualifications(client, assessment=duplicated).status_code == 422


def test_practical_preferences_change_program_order_and_unknown_cost_has_no_bonus(client, make_program):
    known = make_program(title="Known cost", delivery_mode="online", cost="500.00")
    unknown = make_program(title="Unknown cost", delivery_mode="online")
    answers = {"interests": ["welding"], "preferences": {"delivery_mode": "online", "maximum_budget": 600}}
    first = rank(client, assessment=answers)
    again = rank(client, assessment=answers)
    assert first["results"] == again["results"]
    assert [r["program"]["id"] for r in first["results"]] == [known["id"], unknown["id"]]
    a, b = first["results"]
    assert a["score"] > b["score"]
    assert a["effective_weights"] == b["effective_weights"]
    assert b["component_status"]["preference"] == "unknown"
    for result in first["results"]:
        details = result["personalization"]
        assert result["score"] == round(sum(details["contributions"].values()))
        assert "contributes" in " ".join(result["explanation"])


def test_mandatory_preferences_filter_separately_from_scores(client, make_program):
    good = make_program(cost="500.00")
    make_program(cost="1000.00")
    unknown = make_program()
    result = rank(client, assessment={"interests": ["welding"],
        "preferences": {"maximum_budget": 600, "budget_is_mandatory": True}})
    assert [r["program"]["id"] for r in result["results"]] == [good["id"]]
    assert [r["program"]["id"] for r in result["requires_verification"]] == [unknown["id"]]


def test_radius_and_missing_coordinates_respect_selected_approximate_point(client, make_provider, make_program):
    close = make_program()
    make_program(provider=make_provider(region_code="VII", location=(10.3157, 123.8854)))
    unmapped = make_program(provider=make_provider(location=None))
    result = rank(client, assessment={"interests": ["welding"],
        "preferences": {"near_lat": 14.5995, "near_lon": 120.9842, "maximum_distance_km": 100}})
    assert [r["program"]["id"] for r in result["results"]] == [close["id"]]
    assert [r["program"]["id"] for r in result["requires_verification"]] == [unmapped["id"]]


def test_assessment_does_not_bypass_service_verification_or_mandatory_eligibility(client, make_program):
    unverified = make_program(verified=False)
    result = rank(client, assessment={"preferred_qualification_codes": ["SMAW-NC-II"]})
    assert result["results"] == []
    assert result["requires_verification"][0]["program"]["id"] == unverified["id"]


def test_exports_revision_snapshots_and_deletion_erase_owned_answers(client, learner, other_learner, session, make_program):
    original = save(client, learner, interests=["welding"], preferences={"near_lat": 14.67604, "near_lon": 121.0437})
    assert original["answers"]["preferences"]["near_lat"] == 14.7
    other = save(client, other_learner, interests=["cooking"])
    saved_session = client.post("/api/v1/me/recommendations", headers=learner,
        json={"query": "welder", "assessment_id": original["id"]}).json()
    changed = client.patch(f"{BASE}/{original['id']}", headers=learner,
                          json={"answers": {"interests": ["cooking"]}}).json()
    persisted = client.get(f"/api/v1/me/recommendations/{saved_session['id']}", headers=learner).json()
    assert persisted["assessment_id"] == original["id"] and persisted["matches"] == saved_session["matches"]
    make_program()
    result = rank(client, assessment_id=original["id"], learner=learner)
    audit = session.get(RankingAudit, result["audit_id"])
    assert str(audit.assessment_id) == original["id"]
    assert "interests" not in audit.preferences and "existing_skills" not in audit.preferences
    exported = client.get("/api/v1/me/export", headers=learner).json()["learner_assessments"]
    assert {r["id"] for r in exported} == {original["id"], changed["id"]}
    assert client.delete(f"{BASE}/{changed['id']}", headers=learner).status_code == 204
    session.expire_all()
    assert client.get(f"{BASE}/{original['id']}", headers=learner).status_code == 404
    assert client.get(f"/api/v1/me/recommendations/{saved_session['id']}", headers=learner).status_code == 404
    assert session.get(RankingAudit, result["audit_id"]).assessment_id is None
    assert client.get(f"{BASE}/{other['id']}", headers=other_learner).status_code == 200
    client.delete("/api/v1/me", headers=other_learner)
    session.expire_all()
    assert session.exec(select(LearnerAssessment)).all() == []


def test_no_model_does_not_award_full_semantic_credit(client, make_program):
    make_program()
    result = rank(client, goal="welder")
    item = result["results"][0]
    assert item["components"]["semantic"] == 0
    assert item["effective_weights"]["semantic"] == 0
    assert item["component_status"]["schedule"] == "unknown"
    assert item["evidence_coverage"] < 1


def test_identical_semantic_vectors_are_unknown_not_a_perfect_match(client, semantic, make_program):
    make_program(title="Identical welding")
    make_program(title="Identical welding")
    result = rank(client, goal="welding")
    assert result["semantic_used"] is False
    assert all(item["components"]["semantic"] == 0 and item["component_status"]["semantic"] == "unknown"
               for item in result["results"])
