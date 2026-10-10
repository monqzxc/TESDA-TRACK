"""Rule-based recommendation logic. Pure functions; no database needed."""
import json
from pathlib import Path

import pytest

from tesda_track.services.intent_service import analyze_user_query
from tesda_track.services.recommendation_service import (
    match_qualifications, recommend_pathway, refine_profile, score_qualifications)
from tesda_track.services.skill_gap_service import calculate_skill_gap

SEED_FILE = Path(__file__).resolve().parent / "seed" / "qualifications.json"
CATALOG_FILE = Path(__file__).resolve().parents[1] / "seed" / "qualifications.json"  # the real 319-qualification catalog


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


@pytest.mark.parametrize("query", ["i want to be bob the builder", "I want to be a builder"])
def test_builder_goal_gets_keyword_evidence_from_the_whole_word(query):
    rules = [
        {"code": "CARPENTRY", "name": "Carpentry NC II", "sector": "Construction", "career_keywords": ["karpintero", "builder"]},
        {"code": "ENGINE", "name": "Engine Rebuilding NC II", "sector": "Automotive", "career_keywords": ["rebuilder"]},
    ]
    hits = score_qualifications(query, {}, [{**r, "possible_jobs": []} for r in rules])
    assert [(h["qualification"]["code"], h["reason"]) for h in hits] == [("CARPENTRY", "Matched your words: builder")]


def test_catalog_carpentry_and_masonry_answer_to_builder():
    catalog = {q["code"]: q for q in json.loads(CATALOG_FILE.read_text(encoding="utf-8"))}
    for code in ("CARPENTRY-NC-II", "MASONRY-NC-II"):
        assert "builder" in catalog[code]["career_keywords"]
    hits = score_qualifications("i want to be bob the builder", {}, list(catalog.values()))
    assert {h["qualification"]["code"] for h in hits} == {"CARPENTRY-NC-II", "MASONRY-NC-II"}


# --- typo-tolerant keywords ---

@pytest.fixture(scope="module")
def catalog_rules():
    return json.loads(CATALOG_FILE.read_text(encoding="utf-8"))


def _codes(goal, rules):
    return {h["qualification"]["code"] for h in score_qualifications(goal, {}, rules)}


@pytest.mark.parametrize("goal, code", [
    ("gusto q mging weldr", "MMAW-NC-II"),
    ("karpentero", "CARPENTRY-NC-II"),
    ("CAREGIVR", "CAREGIVING-NC-II"),
    ("I WANT TO BE A WELDR", "MMAW-NC-II"),
    ("karpentero \U0001f528\U0001f528", "CARPENTRY-NC-II"),
])
def test_misspelled_keyword_still_matches(catalog_rules, goal, code):
    assert code in _codes(goal, catalog_rules)


def test_fuzzy_reason_names_the_typed_word_and_the_keyword():
    rules = [{"code": "W", "name": "Welding NC II", "sector": "Metals", "career_keywords": ["welder", "tig welding"]}]
    hits = score_qualifications("i want to be a weldr", {}, rules)
    assert [(h["score"], h["reason"]) for h in hits] == [(65, "Matched your words: weldr (welder)")]
    assert _codes("tig weldng", rules) == set()  # multi-word keywords stay exact


def test_fuzzy_hit_counts_like_exact_hit():
    rules = [{"code": "W", "name": "Welding NC II", "sector": "Metals", "career_keywords": ["welder"]}]
    assert score_qualifications("weldr", {}, rules)[0]["score"] == score_qualifications("welder", {}, rules)[0]["score"]


def test_fuzzy_feeds_the_intent_profile():
    rules = [{"code": "W", "name": "Welding NC II", "sector": "Metals", "skill_label": "welding",
              "career_keywords": ["welder"], "possible_jobs": ["Welder"]}]
    assert analyze_user_query("i want to be a weldr", rules)["career_goal"] == "Welder"


@pytest.mark.parametrize("goal", [
    "book", "I want to read a book", "the reason I want a job",
    "nurses are great", "a hello and a thank you", "magkano ang assessment", "asdfgh", "stable na trabaho",
])
def test_near_words_do_not_create_matches(goal):
    rules = [
        {"code": "COOK", "name": "Cookery NC II", "sector": "Tourism", "career_keywords": ["cook", "cookery"]},
        {"code": "MASON", "name": "Masonry NC II", "sector": "Construction", "career_keywords": ["mason", "masonry"]},
        {"code": "BOOKKEEP", "name": "Bookkeeping NC III", "sector": "Other", "career_keywords": ["bookkeeper"]},
    ]
    assert _codes(goal, rules) == set()


def test_inflected_word_is_within_one_edit():
    rules = [{"code": "N", "name": "Health Care NC II", "sector": "Health", "career_keywords": ["nurse"]}]
    assert _codes("we need nurses", rules) == {"N"}


def test_fuzzy_adds_no_matches_on_goals_that_must_be_rejected(catalog_rules):
    dev = Path(__file__).resolve().parents[1] / "training" / "data" / "goals_v2" / "dev"
    goals = [g for f in sorted(dev.glob("*.json")) for g in json.loads(f.read_text(encoding="utf-8"))
             if not g["accept"]]
    if not goals:
        pytest.skip("no dev goals present")
    fuzzy = [g["goal"] for g in goals
             if any("(" in h["reason"] for h in score_qualifications(g["goal"], {}, catalog_rules))]
    assert len(fuzzy) <= max(1, len(goals) // 100), f"{len(fuzzy)} of {len(goals)} reject goals got fuzzy hits"


@pytest.mark.parametrize("goal", ["I want to be an airline pilot", "I'm looking for work", "the reason I need a job"])
def test_catalog_near_words_pilot_looking_reason_do_not_match(catalog_rules, goal):
    assert _codes(goal, catalog_rules) == set()


@pytest.mark.parametrize("goal", [
    "I finished high school", "wedding planner", "take care of my baby", "my machines are old", "the lines were long",
    "i like to bake", "we serve food", "maghinang", "bakery near me", "cooling system", "baryo namin",
])
def test_ordinary_words_are_not_typos(catalog_rules, goal):
    from tesda_track.utils.helpers import fuzzy_matches, normalize
    assert fuzzy_matches(normalize(goal), catalog_rules) == {}
    assert not any("(" in h["reason"] for h in score_qualifications(goal, {}, catalog_rules))
    assert analyze_user_query(goal, catalog_rules)["career_goal"] is None


def test_typos_still_hit_once_per_goal_word(catalog_rules):
    from tesda_track.utils.helpers import fuzzy_matches
    for goal, keyword in [("weldr", "welder"), ("karpentero", "karpintero"), ("caregivr", "caregiver"),
                          ("bilder", "builder"), ("electrcian", "electrician")]:
        assert fuzzy_matches(goal, catalog_rules) == {keyword: goal}
    assert len(fuzzy_matches("weldr welder", catalog_rules)) == 1


def test_fuzzy_hits_on_dev_goals_never_come_from_excluded_words(catalog_rules):
    from tesda_track.utils.helpers import COMMON_WORDS, FuzzyKeywords, normalize
    dev = Path(__file__).resolve().parents[1] / "training" / "data" / "goals_v2" / "dev"
    files = sorted(dev.glob("*.json"))
    if not files:
        pytest.skip("no dev goals present")
    fuzzy = FuzzyKeywords(catalog_rules)
    hit_words = {}
    for f in files:
        for g in json.loads(f.read_text(encoding="utf-8")):
            for keyword, word in fuzzy.matches(normalize(g["goal"])).items():
                hit_words[word] = keyword
    print("still fuzzy-hit:", sorted(f"{w}->{k}" for w, k in hit_words.items()))
    assert not set(hit_words) & (COMMON_WORDS | fuzzy.known)


def test_rule_views_is_one_list_per_snapshot(client, session):
    from tesda_track.services import catalog
    snap = catalog.snapshot(session)
    assert snap.rule_views is snap.rule_views
