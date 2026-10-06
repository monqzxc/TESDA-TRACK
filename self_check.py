"""Run with python self_check.py; no test dependency needed."""
from services.intent_service import analyze_user_query
from services.recommendation_service import match_qualifications, recommend_pathway
from services.skill_gap_service import calculate_skill_gap
from utils.helpers import load_qualifications


def main():
    qualifications = load_qualifications()
    welding = qualifications[0]
    for query, code in [("I want to be a welder.", "SMAW-NC-II"),
                        ("I want to fix computers", "CSS-NC-II"),
                        ("I want to become an electrician", "EIM-NC-II"),
                        ("I want to become a chef", "COOKERY-NC-II"),
                        ("I want to work as a waiter", "FBS-NC-II")]:
        profile = analyze_user_query(query)
        assert match_qualifications(query, profile, qualifications)[0]["qualification"]["code"] == code
    profile = analyze_user_query("I want to be a welder.")
    assert profile["experience_years"] is None and not profile["existing_skills"]
    assert recommend_pathway(profile, welding)["recommendation"] == "ADDITIONAL_QUESTIONS"
    profile.update(experience_years=4, has_certification=False)
    assert recommend_pathway(profile, welding)["recommendation"] == "ASSESSMENT_READINESS"
    profile = analyze_user_query("I've worked as a welder for 5 years but I don't have an NC.")
    assert profile["experience_years"] == 5 and profile["has_certification"] is False
    assert profile["existing_skills"] == ["Welding"]
    profile = analyze_user_query("I have no experience but I want to become an electrician.")
    profile["has_certification"] = False
    assert recommend_pathway(profile, qualifications[2])["recommendation"] == "TRAINING_AND_ASSESSMENT"
    assert analyze_user_query("I know a little welding because I sometimes help in our welding shop.")["existing_skills"]
    assert analyze_user_query("I want to work in a hotel but I don't know which qualification is suitable.")["intent"] == "career_exploration"
    assert match_qualifications("astronaut", analyze_user_query("astronaut"), qualifications) == []
    for answer, score, level in [("I can do this confidently", 100, "High Readiness"),
                                  ("I have some experience", 50, "Moderate Readiness"),
                                  ("I am not familiar with this", 0, "Low Readiness")]:
        result = calculate_skill_gap(welding, {str(c["id"]): answer for c in welding["competencies"]})
        assert result["score"] == score and result["level"] == level
    try:
        calculate_skill_gap(welding, {})
    except ValueError:
        pass
    else:
        raise AssertionError("Incomplete answers must be rejected")
    print("All prototype workflow checks passed.")


if __name__ == "__main__":
    main()
