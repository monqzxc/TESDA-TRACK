from utils.helpers import contains, normalize


def match_qualifications(query: str, profile: dict, qualifications: list[dict]) -> list[dict]:
    text = normalize(query)
    context = normalize(" ".join([profile.get("career_goal") or "", *profile.get("existing_skills", [])]))
    results = []
    # ponytail: transparent keyword scores, not semantic confidence; embeddings can improve recall.
    for qualification in qualifications:
        hits = [word for word in qualification["career_keywords"] if contains(text, word)]
        score = min(95, 55 + 10 * len(hits)) if hits else 0
        if any(contains(context, word) for word in qualification["career_keywords"]):
            score = min(95, score + 15)
        if contains(text, normalize(qualification["name"])):
            score = 95
        if contains(text, normalize(qualification["sector"])) or profile.get("possible_sector") == qualification["sector"]:
            score = min(95, score + 20)
        if score:
            results.append({"qualification": qualification, "score": score,
                            "reason": "Matched your words: " + ", ".join(hits) if hits else "Matched your reported career, skills, or sector."})
    return sorted(results, key=lambda item: item["score"], reverse=True)[:3]


def recommend_pathway(user_profile: dict, qualification: dict) -> dict:
    years = user_profile.get("experience_years")
    certified = user_profile.get("has_certification")
    name = qualification["name"]
    if years is None or certified is None:
        result = ("ADDITIONAL_QUESTIONS", "Your experience or certification status is still unknown.", "Answer the follow-up questions to refine your pathway.")
    elif years == 0:
        result = ("TRAINING_AND_ASSESSMENT", f"You reported no practical experience relevant to {name}.", "Take training, then consider formal competency assessment.")
    elif years >= 3 and not certified:
        result = ("ASSESSMENT_READINESS", f"Your reported {years:g} years of practical experience may cover several competencies in {name}.", "Complete the readiness check before deciding whether full training is necessary.")
    else:
        result = ("SKILL_GAP_CHECK", "Your existing experience or certification makes a competency check useful before choosing further training.", "Check your skills to identify focused training or assessment preparation needs.")
    return dict(zip(("recommendation", "reason", "next_step"), result))
