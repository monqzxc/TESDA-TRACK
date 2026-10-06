ANSWER_VALUES = {"I can do this confidently": 1.0, "I have some experience": 0.5,
                 "I am not familiar with this": 0.0}


def calculate_skill_gap(qualification: dict, learner_answers: dict) -> dict:
    competencies = qualification["competencies"]
    if not competencies:
        raise ValueError("This qualification has no sample competencies.")
    values = []
    strengths, gaps = [], []
    for competency in competencies:
        answer = learner_answers.get(str(competency["id"]), learner_answers.get(competency["id"]))
        if answer not in ANSWER_VALUES:
            raise ValueError("Please answer every competency before analyzing your skills.")
        value = ANSWER_VALUES[answer]
        values.append(value)
        (strengths if value == 1 else gaps).append(competency["name"])
    raw_score = sum(values) / len(values) * 100
    if raw_score >= 80:
        level, recommendation = "High Readiness", "Consider formal assessment, subject to official eligibility and assessment requirements."
    elif raw_score >= 50:
        level, recommendation = "Moderate Readiness", "Take focused training or review in the identified skill gaps before assessment."
    else:
        level, recommendation = "Low Readiness", "Take formal training before attempting competency assessment."
    return {"score": round(raw_score, 1), "level": level, "strengths": strengths,
            "skill_gaps": gaps, "recommendation": recommendation}
