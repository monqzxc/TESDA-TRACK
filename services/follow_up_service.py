EXPERIENCE_OPTIONS = {
    "No experience": 0,
    "Less than 1 year": 0.5,
    "1–3 years": 2,
    "More than 3 years": 4,
}
CERTIFICATION_OPTIONS = {"Yes": True, "No": False, "I'm not sure": None}


def get_missing_information(user_profile: dict) -> list[dict]:
    """Ask only for facts the learner has not already supplied."""
    questions = []
    if user_profile.get("experience_years") is None:
        topic = user_profile.get("experience_topic", "related").lower()
        questions.append({
            "field": "experience_years",
            "question": f"How much {topic} experience do you have?",
            "options": list(EXPERIENCE_OPTIONS),
        })
    if user_profile.get("has_certification") is None and not user_profile.get("certification_response"):
        questions.append({
            "field": "has_certification",
            "question": "Do you currently have a related certification?",
            "options": list(CERTIFICATION_OPTIONS),
        })
    return questions


def apply_follow_up_answers(user_profile: dict, answers: dict) -> dict:
    """Return an updated profile, retaining the learner's range or uncertainty."""
    profile = dict(user_profile)
    for question in get_missing_information(profile):
        field = question["field"]
        answer = answers.get(field)
        if answer not in question["options"]:
            raise ValueError("Choose an answer for each follow-up question.")
        if field == "experience_years":
            profile[field] = EXPERIENCE_OPTIONS[answer]
            profile["experience_response"] = answer
        else:
            profile[field] = CERTIFICATION_OPTIONS[answer]
            profile["certification_response"] = answer
    years = profile.get("experience_years")
    if years == 0:
        profile["intent"] = "training_and_assessment"
    elif years is not None and years >= 3:
        profile["intent"] = "assessment_recommendation"
    elif profile.get("career_goal"):
        profile["intent"] = "training_recommendation"
    return profile
