"""The personalized pathway report: built from each learner's answers, the catalog, the existing rankings and the
learner's own records, never from fixed advice for one trade."""
import json
from datetime import date, timedelta

import pytest
from sqlmodel import select

from tesda_track.models import Competency, Qualification, RankingAudit

WELDER = "I want to be a welder"
CEBU_CITY = (10.3157, 123.8854)
ANSWERS = {"c": "confident", "s": "some_experience", "n": "not_familiar"}
# Two years' experience and no certificate: the "check your skills" route, so readiness picks the pathway.
EXPERIENCED = {"experience_years": 2, "has_certification": False}


@pytest.fixture
def report(client, competency_ids):
    """POST /recommendations/report. `answers` as a string rates the units in catalog order: c, s or n."""
    def report(code="SMAW-NC-II", answers="ccccsn", query=WELDER, profile=None, headers=None, status=200, **body):
        if isinstance(answers, str):
            answers = {str(i): ANSWERS[a] for i, a in zip(competency_ids(code), answers)}
        response = client.post("/api/v1/recommendations/report", headers=headers, json={
            "query": query, "profile": EXPERIENCED if profile is None else profile, "qualification_code": code,
            "answers": answers, **body})
        assert response.status_code == status, response.text
        return response.json()
    return report


def recommended(result):
    chosen = [option for option in result["training_to_consider"] if option["recommended"]]
    assert len(chosen) <= 1
    return chosen[0]["kind"] if chosen else None


def topics(items):
    return {item["topic"]: item for item in items}


def steps(result):
    return [step["kind"] for step in result["next_steps"]]


def test_a_learner_with_strengths_and_a_few_gaps_gets_focused_training(report):
    result = report(answers="ccccsn")

    assert result["readiness"]["available"] and result["readiness"]["score"] == 75.0
    assert [s["name"] for s in result["strengths"]] == [
        "Observe workplace safety procedures", "Interpret welding drawings and symbols", "Set up welding equipment",
        "Perform fillet welding"]
    assert recommended(result) == "focused_training"
    # Two years' experience: going straight to assessment is offered, not recommended.
    assert {o["kind"]: o["recommended"] for o in result["training_to_consider"]}["direct_assessment"] is False

    # The unit the learner doesn't know comes before the one they have some experience in, and only it is "must learn".
    improve = result["skills_to_improve"]
    assert [(a["name"], a["priority"], a["action"], a["basis"], a["must_learn"]) for a in improve] == [
        ("Inspect weld quality and identify common defects", "high", "learn", "required_unit", True),
        ("Perform groove welding", "medium", "practice", "reported_gap", False)]
    assert improve[0]["what_to_do"] == "Learn to inspect weld quality and identify common defects."
    assert any("You answered “I am not familiar with this”." == e for e in improve[0]["evidence"])
    assert [a["name"] for a in result["competencies_to_learn_or_practice"]] == [a["name"] for a in improve]

    why = topics(result["reasoning"])
    assert set(why) == {"strengths", "skill_gaps", "career_goal", "assessment_readiness", "employment"}
    assert why["skill_gaps"]["summary"] == "Start with Inspect weld quality and identify common defects."
    assert "not an official competency assessment" in " ".join(why["assessment_readiness"]["points"])
    assert "focused training" in result["final"]["summary"]
    assert result["final"]["focus"] == ["Inspect weld quality and identify common defects", "Perform groove welding"]


def test_many_missing_units_make_a_full_training_plan_with_core_units_first(report):
    result = report(answers="nnnnnn", profile={"experience_years": 0, "has_certification": False})

    assert result["readiness"]["level"] == "Low Readiness"
    assert recommended(result) == "full_training"
    assert "direct_assessment" not in {o["kind"] for o in result["training_to_consider"]}
    improve = result["skills_to_improve"]
    assert [a["priority"] for a in improve] == ["high"] * 5 + ["medium"]
    assert improve[-1]["category"] == "Basic" and all(a["must_learn"] for a in improve)
    assert steps(result) == ["choose_region", "compare_providers", "train", "recheck", "confirm_requirements", "apply",
                             "explore_jobs"]
    assert "supervised, hands-on practice" in topics(result["considerations"])["equipment"]["text"]


@pytest.mark.parametrize("code, goal", [("CSS-NC-II", "I want to repair computers"),
                                        ("COOKERY-NC-II", "I want to be a cook"),
                                        ("FBS-NC-II", "I want to be a waiter")])
def test_the_report_follows_the_chosen_qualification(report, competency_ids, client, code, goal):
    result = report(code=code, answers="cnsnnc", query=goal)

    catalog = client.get(f"/api/v1/qualifications/{code}").json()
    assert result["qualification"]["code"] == code and result["qualification"]["unit_count"] == 6
    assert {a["competency_id"] for a in result["skills_to_improve"]} <= set(competency_ids(code))
    assert result["employment"]["possible_jobs"] == catalog["possible_jobs"]
    assert result["match"]["strength"] == "named" and result["match"]["rank"] == 1
    # Nothing from another trade leaks in.
    assert "weld" not in json.dumps(result).lower()


def test_location_and_preferences_reorder_and_explain_the_options(report, make_provider, make_program):
    manila = make_program(title="Manila batch")
    cebu = make_program(provider=make_provider(name="Cebu Skills Center", region_code="VII", location=CEBU_CITY),
                        title="Cebu batch", delivery_mode="online", scholarship_available=True)

    def training(result):
        return [p for p in result["providers"] if p["kind"] == "training"]

    near_manila = report(region_code="NCR")
    assert [p["service_id"] for p in training(near_manila)] == [manila["id"], cebu["id"]]
    # From the region's center, rounded to about 10 km by the ranking, as every location is.
    assert training(near_manila)[0]["distance_km"] <= 5 and near_manila["region_name"] == "National Capital Region"
    near_cebu = report(region_code="VII")
    assert [p["service_id"] for p in training(near_cebu)] == [cebu["id"], manila["id"]]
    assert "from Cebu City" in topics(near_cebu["considerations"])["distance"]["text"]
    assert "choose_region" not in steps(near_cebu)

    scholarship = report(needs_scholarship=True, preferred_delivery_mode="online")
    assert training(scholarship)[0]["service_id"] == cebu["id"]
    assert topics(scholarship["considerations"])["scholarship"]["text"] == "Cebu Skills Center lists a scholarship."
    assert any("online training" in p for p in topics(scholarship["reasoning"])["career_goal"]["points"])
    # Without a region the report asks for one rather than guessing.
    assert "Your region, to sort options by distance." in topics(scholarship["considerations"])[
        "missing_information"]["items"]


def test_a_region_sorts_assessment_schedules_without_hiding_other_regions(report, make_center, make_schedule):
    cebu = make_schedule(center=make_center(name="Cebu Assessment Center", region_code="VII", location=CEBU_CITY))
    manila = make_schedule()

    def assessment(result):
        return [p["service_id"] for p in result["providers"] if p["kind"] == "assessment"]

    assert assessment(report(region_code="NCR")) == [manila["id"], cebu["id"]]
    assert assessment(report(region_code="VII")) == [cebu["id"], manila["id"]]


def test_no_providers_is_said_plainly_with_a_way_forward(report):
    result = report(region_code="NCR")

    assert result["providers"] == []
    assert "doesn't list any training programs or assessment schedules" in topics(
        result["considerations"])["providers"]["text"]
    assert "eligibility" not in topics(result["considerations"])
    compare = next(s for s in result["next_steps"] if s["kind"] == "compare_providers")
    assert compare["title"] == "Find training providers for Shielded Metal Arc Welding (SMAW) NC II"
    assert "No providers" in result["final"]["summary"] and result["final"]["providers"] == []


def test_employment_is_general_guidance_without_job_data(report):
    result = report()

    employment = result["employment"]
    assert employment["observed_data"] is False
    assert employment["possible_jobs"] == ["Welder", "Fabricator", "Structural Welder"]
    assert "no job-vacancy or labor-market data" in employment["note"]
    points = " ".join(topics(result["reasoning"])["employment"]["points"])
    assert "doesn't guarantee" not in points and "neither it nor this report guarantees a job" in points
    assert "doesn't guarantee certification or employment" in result["disclaimer"]


def test_missing_readiness_answers_lead_to_the_readiness_check(report):
    none = report(answers={})
    assert none["readiness"]["available"] is False
    assert none["readiness"]["counts"]["not_answered"] == 6
    assert steps(none)[0] == "complete_readiness"
    assert none["skills_to_improve"] == [] and none["strengths"] == []
    # Two years and no certificate: the experience route still suggests focused training.
    assert recommended(none) == "focused_training"

    partial = report(answers="cn")
    assert partial["readiness"]["available"] is False
    assert "You've rated 2 of 6 units" in partial["readiness"]["summary"]
    assert [a["name"] for a in partial["skills_to_improve"]] == ["Interpret welding drawings and symbols"]

    unknown = report(answers={}, profile={})
    assert recommended(unknown) is None
    assert "Finish the readiness check" in unknown["final"]["summary"]
    missing = topics(unknown["considerations"])["missing_information"]["items"]
    assert "How much practical experience you have." in missing


def test_an_unmatched_or_other_goal_is_flagged(report):
    unmatched = report(query="I want to be an astronaut")
    assert unmatched["match"] == {"strength": "none", "rank": None, "match_count": 0, "score": None,
                                  "explanation": unmatched["match"]["explanation"], "alternatives": []}
    assert steps(unmatched)[0] == "explore_alternatives"
    assert "alternatives" in topics(unmatched["considerations"])

    other = report(query="I want to be a cook")
    assert other["match"]["strength"] == "chosen"
    assert [q["code"] for q in other["match"]["alternatives"]] == ["COOKERY-NC-II"]
    assert topics(other["considerations"])["alternatives"]["items"] == ["Cookery NC II"]


def test_a_qualification_without_units_or_an_unknown_one(report, session):
    qualification = session.exec(select(Qualification).where(Qualification.code == "EIM-NC-II")).one()
    for competency in session.exec(select(Competency).where(Competency.qualification_id == qualification.id)):
        competency.is_active = False
        session.add(competency)
    session.flush()

    result = report(code="EIM-NC-II", answers={}, query="I want to be an electrician")
    assert result["readiness"]["available"] is False and "no units of competency" in result["readiness"]["summary"]
    assert result["skills_to_improve"] == [] and "complete_readiness" not in steps(result)
    assert "no units of competency" in topics(result["considerations"])["missing_information"]["items"][0]

    report(code="NOPE-NC-II", answers={}, status=422)
    report(region_code="ATLANTIS", status=422)


def test_existing_matching_and_rankings_are_reused_unchanged(client, report, make_program, make_schedule):
    first, second = make_program(title="Starts soon", start_date=(date.today() + timedelta(days=20)).isoformat()), \
        make_program(title="No date")
    schedule = make_schedule()

    result = report(region_code="NCR")
    ranked = client.post("/api/v1/recommendations/training", json={
        "qualification_code": "SMAW-NC-II", "goal": WELDER, "near_lat": 14.5995, "near_lon": 120.9842, "limit": 3})
    direct = ranked.json()
    assert direct["weights"] == {"semantic": 0.5, "proximity": 0.2, "assessment": 0.15, "schedule": 0.1,
                                 "preference": 0.05}
    shown = [(p["service_id"], p["score"]) for p in result["providers"] if p["kind"] == "training"]
    assert shown == [(r["program"]["id"], r["score"]) for r in direct["results"]]
    assert [s for s, _ in shown] == [first["id"], second["id"]]
    assessment = [p for p in result["providers"] if p["kind"] == "assessment"]
    assert [(p["service_id"], p["status"]) for p in assessment] == [(schedule["id"], "confirmed")]

    matches = client.post("/api/v1/analysis/matches", json={"query": WELDER, "profile": EXPERIENCED}).json()
    assert result["match"]["rank"] == 1 and matches["matches"][0]["qualification"]["code"] == "SMAW-NC-II"
    assert result["match"]["score"] == matches["matches"][0]["score"]
    assert result["rankings"]["training_policy"] == "verified-services-v2"


def test_unverified_and_demonstration_listings_are_never_presented_as_verified(report, make_provider, make_program,
                                                                               verify_service):
    unverified = make_program(title="Unverified batch", verified=False)
    demo = make_provider(name="Demo Welding School")
    verify_service("training", demo["id"], status="unknown", is_synthetic=True)  # as the delivery fixtures are
    make_program(provider=demo, title="Demo batch", verified=False)

    result = report(region_code="NCR")
    statuses = {p["name"]: (p["status"], p["score"]) for p in result["providers"]}
    assert statuses == {"Manila Welding Institute": ("needs_verification", None),
                        "Demo Welding School": ("demonstration", None)}
    verification = topics(result["considerations"])["verification"]
    assert "aren't verified" in verification["text"]
    assert verification["items"] == ["Options marked “Demonstration” are sample records, not real providers."]
    assert "Manila Welding Institute is listed (not yet verified)" in result["final"]["summary"]
    assert unverified["id"] in {p["service_id"] for p in result["providers"]}


def test_rankings_are_audited_and_feedback_still_works_without_storing_the_goal(client, session, learner, report,
                                                                               make_program):
    make_program()
    result = report(headers=learner, region_code="NCR")

    training = session.get(RankingAudit, result["rankings"]["training_audit_id"])
    assessment = session.get(RankingAudit, result["rankings"]["assessment_audit_id"])
    assert training.learner_id is not None and training.query_hash and assessment.query_hash
    for audit in (training, assessment):
        assert WELDER not in json.dumps({"preferences": audit.preferences, "results": audit.results})
    # Neither the goal's words nor a learner location come back.
    text = json.dumps(result)
    assert WELDER not in text and "near_lat" not in text and "latitude" not in text

    feedback = client.post("/api/v1/feedback/recommendations", json={
        "query": WELDER, "profile": EXPERIENCED, "qualification_code": "SMAW-NC-II",
        "answers": {str(a["competency_id"]): a["status"] for a in result["skills_to_improve"]}
        | {str(s["competency_id"]): "confident" for s in result["strengths"]}, "satisfied": False})
    assert feedback.status_code == 201, feedback.text
    assert client.get(f"/api/v1/recommendations/{result['rankings']['training_audit_id']}",
                      headers=learner).status_code == 200


def test_recommendations_change_when_the_learners_answers_change(report):
    low = report(answers="nnnnnn", profile={"experience_years": 0, "has_certification": False})
    high = report(answers="cccccc", profile={"experience_years": 4, "has_certification": False})

    assert recommended(low) == "full_training" and recommended(high) == "direct_assessment"
    assert high["skills_to_improve"] == []
    # Heading for assessment: be ready to show the core units, a general recommendation rather than a gap.
    demonstrate = high["competencies_to_learn_or_practice"]
    assert {(a["action"], a["basis"], a["must_learn"], a["category"]) for a in demonstrate} == {
        ("demonstrate", "general_recommendation", False, "Core")}
    assert len(demonstrate) == 5
    assert steps(high) == ["choose_region", "confirm_requirements", "apply", "explore_jobs"]
    assert topics(high["reasoning"])["skill_gaps"]["summary"] == "You didn't report any gaps."


def test_a_signed_in_learners_application_certificate_and_goal_shape_the_report(client, admin, learner, report,
                                                                                make_schedule):
    target = (date.today() + timedelta(days=90)).isoformat()
    client.post("/api/v1/me/goals", headers=learner, json={
        "title": "Weld for a shipyard", "target_qualification_code": "SMAW-NC-II", "target_date": target})
    schedule = make_schedule()
    application = client.post("/api/v1/me/assessment-applications", headers=learner,
                              json={"schedule_id": schedule["id"]}).json()

    client.post("/api/v1/me/certifications", headers=learner, json={
        "title": "SMAW NC II", "qualification_code": "SMAW-NC-II"})  # self-reported, so unverified

    applied = report(headers=learner, answers="ccccsn")
    assert recommended(applied) == "current_application"
    assert any("isn't verified yet" in p for p in topics(applied["reasoning"])["career_goal"]["points"])
    assert "pending" in applied["training_to_consider"][0]["reasons"][0]
    assert "prepare_assessment" in steps(applied)
    assert "target date" in applied["final"]["summary"]
    assessment = next(p for p in applied["providers"] if p["kind"] == "assessment")
    assert assessment["notes"][0] == "You've applied for this schedule (pending)."
    # A guest with the same answers gets none of it.
    assert recommended(report(answers="ccccsn")) == "focused_training"

    for body in ({"status": "approved"}, {"status": "completed", "result": "competent"}):
        response = client.patch(f"/api/v1/admin/assessment-applications/{application['id']}", headers=admin,
                                json=body)
        assert response.status_code == 200, response.text
    certified = report(headers=learner, answers="cccccc")
    assert recommended(certified) == "already_certified"
