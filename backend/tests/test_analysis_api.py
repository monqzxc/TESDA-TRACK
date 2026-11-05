import pytest
from unittest.mock import ANY


def competency_ids(client, code):
    return [c["id"] for c in client.get(f"/api/v1/qualifications/{code}").json()["competencies"]]


def test_goal_analysis_extracts_a_profile(client):
    response = client.post("/api/v1/analysis/goal",
                           json={"query": "I've worked as a welder for 5 years but I don't have an NC."})
    assert response.status_code == 200
    assert response.json() == {
        "source": "rules",
        "profile": {"career_goal": "Welder", "possible_sector": "Metals and Engineering",
                    "existing_skills": ["Welding"], "experience_years": 5.0, "has_certification": False,
                    "intent": "assessment_recommendation"},
    }


@pytest.mark.parametrize("query", ["", "   ", "x" * 1001])
def test_goal_text_must_be_present_and_bounded(client, query):
    assert client.post("/api/v1/analysis/goal", json={"query": query}).status_code == 422


def test_matches_rank_qualifications_and_refine_intent(client):
    profile = client.post("/api/v1/analysis/goal", json={"query": "I want to be a welder."}).json()["profile"]
    profile.update(experience_years=4, has_certification=False)
    response = client.post("/api/v1/analysis/matches", json={"query": "I want to be a welder.", "profile": profile})
    assert response.status_code == 200
    body = response.json()
    assert body["profile"]["intent"] == "assessment_recommendation"
    assert body["matches"][0] == {
        "qualification": {"code": "SMAW-NC-II", "name": "Shielded Metal Arc Welding (SMAW) NC II",
                          "sector": "Metals and Engineering", "provenance": {
                              "status": "incomplete", "source_name": "TESDA-TRACK curated qualification catalog",
                              "source_reference": "backend/seed/qualifications.json", "source_url": None,
                              "source_updated_on": None, "reviewed_at": None, "record_updated_at": ANY}},
        "score": 95, "reason": "Matched your words: welder", "components": None}


def test_no_matches_for_unknown_careers(client):
    profile = client.post("/api/v1/analysis/goal", json={"query": "astronaut"}).json()["profile"]
    response = client.post("/api/v1/analysis/matches", json={"query": "astronaut", "profile": profile})
    assert response.json()["matches"] == []


def test_pathway_for_experienced_uncertified_learner(client):
    profile = {"career_goal": "Welder", "existing_skills": [], "experience_years": 4,
               "has_certification": False, "intent": "assessment_recommendation"}
    response = client.post("/api/v1/analysis/pathway", json={"profile": profile, "qualification_code": "SMAW-NC-II"})
    assert response.status_code == 200
    body = response.json()
    assert body["recommendation"] == "ASSESSMENT_READINESS"
    assert body["reason"].startswith("Your reported 4 years of practical experience")


def test_pathway_for_unknown_qualification_is_404(client):
    response = client.post("/api/v1/analysis/pathway", json={"profile": {}, "qualification_code": "NOPE"})
    assert response.status_code == 404


def test_readiness_scores_answers_by_competency_id(client):
    ids = competency_ids(client, "SMAW-NC-II")
    answers = {str(i): "confident" if n < 3 else "some_experience" for n, i in enumerate(ids)}
    response = client.post("/api/v1/analysis/readiness", json={"qualification_code": "SMAW-NC-II", "answers": answers})
    assert response.status_code == 200
    body = response.json()
    assert body["score"] == 75 and body["level"] == "Moderate Readiness"
    assert body["strengths"][0] == "Observe workplace safety procedures"


def test_incomplete_readiness_answers_are_422_with_guidance(client):
    ids = competency_ids(client, "SMAW-NC-II")
    response = client.post("/api/v1/analysis/readiness",
                           json={"qualification_code": "SMAW-NC-II", "answers": {str(ids[0]): "confident"}})
    assert response.status_code == 422
    assert response.json() == {"detail": "Please answer every competency before analyzing your skills."}


def test_readiness_rejects_unknown_answer_values(client):
    ids = competency_ids(client, "SMAW-NC-II")
    response = client.post("/api/v1/analysis/readiness",
                           json={"qualification_code": "SMAW-NC-II", "answers": {str(i): "maybe" for i in ids}})
    assert response.status_code == 422


def test_matches_fall_back_to_keywords_when_the_model_has_no_embeddings(client, session, semantic):
    from sqlmodel import delete

    from tesda_track.models import QualificationEmbedding

    session.exec(delete(QualificationEmbedding))
    session.flush()
    response = client.post("/api/v1/analysis/matches", json={"query": "I want to be a welder.", "profile": {
        "career_goal": None, "possible_sector": None, "existing_skills": [], "experience_years": None,
        "has_certification": None, "intent": "unknown"}})
    assert response.status_code == 200
    assert "SMAW-NC-II" in [m["qualification"]["code"] for m in response.json()["matches"]]


# --- Profile-only suggestions (TSP webview entry page) ---


def test_suggestions_rank_qualifications_from_the_profile_alone(client):
    profile = {"career_goal": None, "possible_sector": None, "existing_skills": ["welding", "reading drawings"],
               "experience_years": 0, "has_certification": False, "intent": "unknown"}
    response = client.post("/api/v1/analysis/suggestions", json={"profile": profile})
    assert response.status_code == 200
    body = response.json()
    codes = [item["qualification"]["code"] for item in body["suggestions"]]
    assert "SMAW-NC-II" in codes
    assert body["profile"]["intent"] == "training_and_assessment"


def test_suggestions_never_claim_the_learner_typed_the_words(client):
    profile = {"existing_skills": ["welding"], "experience_years": 0}
    body = client.post("/api/v1/analysis/suggestions", json={"profile": profile}).json()
    assert body["suggestions"], "expected at least one suggestion from a welding skill"
    for item in body["suggestions"]:
        assert not item["reason"].startswith("Matched your words")


def test_suggestions_report_what_they_were_worked_out_from(client):
    profile = {"career_goal": "Welder", "existing_skills": ["welding"], "experience_years": 2,
               "has_certification": False}
    body = client.post("/api/v1/analysis/suggestions", json={"profile": profile}).json()
    assert "Your TSP career goal: Welder" in body["basis"]
    assert "Skills on your TSP profile: welding" in body["basis"]
    assert "2 year(s) of experience reported" in body["basis"]
    assert "No TESDA certificate reported" in body["basis"]


def test_an_empty_profile_suggests_nothing(client):
    body = client.post("/api/v1/analysis/suggestions", json={"profile": {}}).json()
    assert body["suggestions"] == []
    assert body["basis"] == []


def test_suggestions_respect_the_requested_limit(client):
    profile = {"existing_skills": ["welding", "cooking", "caregiving", "driving"]}
    body = client.post("/api/v1/analysis/suggestions", json={"profile": profile, "limit": 2}).json()
    assert len(body["suggestions"]) <= 2


@pytest.mark.parametrize("limit", [0, 11])
def test_suggestion_limit_is_bounded(client, limit):
    assert client.post("/api/v1/analysis/suggestions",
                       json={"profile": {"existing_skills": ["welding"]}, "limit": limit}).status_code == 422
