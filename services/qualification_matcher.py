"""Small, explainable matching rules for the sample qualification catalogue."""
import re

from utils.helpers import contains, normalize


STOP_WORDS = set("""a an and are as at be been being but by can certification certified
certificate do dont for from get had has have help how i im in into is it like me my
nc ii iii iv no not of on or our qualification qualifications related sample skills
some than that the their them these they this to training want was we were what when
which who will with without work worked working would year years experience know
learn learning develop develops required activities perform performing procedures
using use services service basic""".split())


def _tokens(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-z]+", normalize(text))
            if len(word) > 2 and word not in STOP_WORDS}


def find_matching_qualifications(user_profile: dict, qualifications: list[dict]) -> list[dict]:
    """Return up to three positive lexical matches; scores are prototype points."""
    query = normalize(user_profile.get("query") or "")
    goal = normalize(user_profile.get("career_goal") or "")
    skills = normalize(" ".join(user_profile.get("existing_skills") or []))
    query_words, goal_words, skill_words = _tokens(query), _tokens(goal), _tokens(skills)
    profile_sector_words = _tokens(user_profile.get("possible_sector") or "")
    results = []
    # ponytail: literal English words miss nuanced goals; replace this scorer with
    # sentence-transformers or an LLM if semantic matching is later required.
    for qualification in qualifications:
        keywords = [normalize(word) for word in qualification.get("career_keywords", [])]
        jobs = " ".join(qualification.get("possible_jobs", []))
        name_words = _tokens(qualification["name"])
        job_words = _tokens(jobs)
        description_words = _tokens(qualification.get("description", ""))
        sector_words = _tokens(qualification.get("sector", ""))
        career_words = _tokens(" ".join(keywords)) | name_words | job_words
        hits = [word for word in keywords if _tokens(word) and contains(query, word)]
        score = min(45, 30 + 5 * len(hits)) if hits else 0
        goal_overlap = goal_words & career_words
        if goal_overlap:
            score += min(55, 45 + 5 * len(goal_overlap))
        name_overlap = query_words & name_words
        job_overlap = query_words & job_words
        description_overlap = query_words & description_words
        sector_overlap = (query_words | goal_words | skill_words | profile_sector_words) & sector_words
        skill_overlap = skill_words & (career_words | description_words)
        score += min(15, 5 * len(name_overlap))
        score += min(15, 5 * len(job_overlap))
        score += min(12, 4 * len(description_overlap))
        score += min(10, 5 * len(sector_overlap))
        score += min(20, 10 * len(skill_overlap))
        if not score:
            continue
        evidence = sorted(set(hits) | goal_overlap | name_overlap | job_overlap
                          | description_overlap | sector_overlap | skill_overlap)
        results.append((score, {
            "qualification_id": qualification["code"],
            "name": qualification["name"],
            "match_score": min(95, score),
            "reason": "Matched your goal or skills: " + ", ".join(evidence[:5]) + ".",
            "qualification": qualification,
        }))
    # Sort uncapped points first so two displayed 95s retain their relevance order.
    return [match for _, match in sorted(results, key=lambda item: (-item[0], item[1]["name"]))[:3]]
