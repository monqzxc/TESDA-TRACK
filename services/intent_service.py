import re

from utils.helpers import contains, load_qualifications, normalize


def analyze_user_query(query: str) -> dict:
    """Rule-based interpretation; replace this function with an LLM later."""
    text = normalize(query)
    matches = [q for q in load_qualifications()
               if any(contains(text, word) for word in q["career_keywords"])]
    qualification = matches[0] if matches else None
    years = re.search(r"(\d+(?:\.\d+)?)\s*(?:\+\s*)?(?:years?|yrs?)\b", text)
    months = re.search(r"(\d+)\s*months?\b", text)
    experience = float(years[1]) if years else float(months[1]) / 12 if months else None
    if re.search(r"\b(no experience|without experience|never worked|don't have (?:any )?experience|do not have (?:any )?experience)\b", text):
        experience = 0.0
    certification = None
    if re.search(r"\b(no|without)\s+(?:any |an? )?(?:related )?(?:certification|certificate|nc)\b|(?:don't|do not) have\s+(?:any |an? )?(?:certification|certificate|nc)\b|not certified", text):
        certification = False
    elif re.search(r"\b(?:i am|i'm|already) certified\b|\b(?:have|hold) (?:a |an )?(?:nc(?: ii)?|certification|certificate)\b", text):
        certification = True
    skills = []
    # ponytail: sentence-level keyword rules miss nuanced language; use an LLM when needed.
    for sentence in re.split(r"[.!?;]|\bbut\b", text):
        if re.search(r"\b(know|working|worked|experience|help|repairing|installing)\b", sentence) and not re.search(r"\b(no|without|don't|do not)\b", sentence):
            skills.extend(q["skill_label"] for q in matches
                          if any(contains(sentence, word) for word in q["career_keywords"]))
    if experience == 0:
        skills = []
    exploration = any(phrase in text for phrase in ("don't know which", "not sure which", "explore", "work in a hotel"))
    intent = "unknown"
    if qualification:
        intent = "training_and_assessment" if experience == 0 else "assessment_recommendation" if (experience is not None and experience >= 3) or (skills and "certif" in text) else "training_recommendation"
    if exploration:
        intent = "career_exploration"
    return {"career_goal": qualification["possible_jobs"][0] if qualification else None,
            "possible_sector": qualification["sector"] if qualification else "Tourism" if exploration else None,
            "existing_skills": list(dict.fromkeys(skills)), "experience_years": experience,
            "has_certification": certification, "intent": intent}

