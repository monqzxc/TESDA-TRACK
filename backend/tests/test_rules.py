"""Rule-based recommendation logic. Pure functions; no database needed."""
import json
from pathlib import Path

import pytest

from tesda_track.services.intent_service import analyze_user_query
from tesda_track.services.recommendation_service import match_qualifications, recommend_pathway, refine_profile
from tesda_track.services.skill_gap_service import calculate_skill_gap

SEED_FILE = Path(__file__).resolve().parent / "seed" / "qualifications.json"


@pytest.fixture(scope="module")
def qualifications():
    return json.loads(SEED_FILE.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def welding(qualifications):
    return next(q for q in qualifications if q["code"] == "SMAW-NC-II")


@pytest.mark.parametrize("query, code", [
    ("I want to be a welder.", "SMAW-NC-II"),
    ("I want to fix computers", "CSS-NC-II"),
    ("I want to become an electrician", "EIM-NC-II"),
    ("I want to become a chef", "COOKERY-NC-II"),
    ("I want to work as a waiter", "FBS-NC-II"),
])
def test_goal_matches_expected_qualification_first(qualifications, query, code):
    profile = analyze_user_query(query, qualifications)
    assert match_qualifications(query, profile, qualifications)[0]["qualification"]["code"] == code


def test_goal_without_details_asks_follow_up_questions(qualifications, welding):
    profile = analyze_user_query("I want to be a welder.", qualifications)
    assert profile["experience_years"] is None and not profile["existing_skills"]
    assert recommend_pathway(profile, welding)["recommendation"] == "ADDITIONAL_QUESTIONS"


def test_experienced_uncertified_learner_is_sent_to_readiness_check(qualifications, welding):
    profile = analyze_user_query("I want to be a welder.", qualifications)
    profile.update(experience_years=4, has_certification=False)
    assert recommend_pathway(profile, welding)["recommendation"] == "ASSESSMENT_READINESS"


def test_years_and_missing_certificate_are_extracted(qualifications):
    profile = analyze_user_query("I've worked as a welder for 5 years but I don't have an NC.", qualifications)
    assert profile["experience_years"] == 5 and profile["has_certification"] is False
    assert profile["existing_skills"] == ["Welding"]


def test_no_experience_leads_to_training_and_assessment(qualifications):
    profile = analyze_user_query("I have no experience but I want to become an electrician.", qualifications)
    profile["has_certification"] = False
    electrical = next(q for q in qualifications if q["code"] == "EIM-NC-II")
    assert recommend_pathway(profile, electrical)["recommendation"] == "TRAINING_AND_ASSESSMENT"


def test_informal_experience_counts_as_existing_skill(qualifications):
    profile = analyze_user_query("I know a little welding because I sometimes help in our welding shop.", qualifications)
    assert profile["existing_skills"] == ["Welding"]


def test_undecided_hotel_goal_is_career_exploration(qualifications):
    query = "I want to work in a hotel but I don't know which qualification is suitable."
    assert analyze_user_query(query, qualifications)["intent"] == "career_exploration"


def test_unknown_career_has_no_matches(qualifications):
    assert match_qualifications("astronaut", analyze_user_query("astronaut", qualifications), qualifications) == []


@pytest.mark.parametrize("years, certified, intent", [
    (0, None, "training_and_assessment"),
    (4, False, "assessment_recommendation"),
    (3, False, "assessment_recommendation"),
    (4, True, "training_recommendation"),
    (2, False, "training_recommendation"),
    (None, None, "training_recommendation"),
])
def test_follow_up_answers_refine_intent(years, certified, intent):
    profile = {"career_goal": "Welder", "possible_sector": None, "existing_skills": [],
               "experience_years": years, "has_certification": certified, "intent": "training_recommendation"}
    assert refine_profile(profile)["intent"] == intent
    assert profile["intent"] == "training_recommendation", "the input profile must not be mutated"


@pytest.mark.parametrize("answer, score, level", [
    ("confident", 100, "High Readiness"),
    ("some_experience", 50, "Moderate Readiness"),
    ("not_familiar", 0, "Low Readiness"),
])
def test_uniform_answers_give_expected_readiness(welding, answer, score, level):
    result = calculate_skill_gap(welding, {str(c["id"]): answer for c in welding["competencies"]})
    assert result["score"] == score and result["level"] == level


def test_mixed_answers_split_strengths_and_gaps(welding):
    answers = {str(c["id"]): "confident" if c["id"] <= 3 else "some_experience" for c in welding["competencies"]}
    result = calculate_skill_gap(welding, answers)
    assert result["score"] == 75 and result["level"] == "Moderate Readiness"
    assert result["strengths"] == ["Observe workplace safety procedures", "Interpret welding drawings and symbols",
                                   "Set up welding equipment"]
    assert len(result["skill_gaps"]) == 3


def test_incomplete_answers_are_rejected(welding):
    with pytest.raises(ValueError):
        calculate_skill_gap(welding, {})


def test_unknown_answer_value_is_rejected(welding):
    with pytest.raises(ValueError):
        calculate_skill_gap(welding, {str(c["id"]): "I can do this confidently" for c in welding["competencies"]})
