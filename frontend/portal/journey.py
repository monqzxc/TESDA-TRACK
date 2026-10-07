"""Pure helpers for the guided finder and the qualification library. No Streamlit, no network."""
import re
from math import ceil

CATEGORY_ORDER = ("Basic", "Common", "Core")
_LEVEL = re.compile(r"\bNC\s+(IV|III|II|I)\b")

EXAMPLES = {
    "Become a welder": "I want to be a welder.",
    "Get my skills certified": "I've worked as a welder for 5 years but I don't have an NC.",
    "Work in a hotel": "I want to work in a hotel but I don't know which qualification fits me.",
    "Marunong akong mag-ayos ng computer": "Marunong akong mag-ayos ng computer.",
}
EXPERIENCE = {"No experience": 0, "Less than 1 year": 0.5, "1–3 years": 2, "More than 3 years": 4}
# "Not sure" counts as no certificate, so the pathway still includes getting assessed.
CERTIFICATE = {"Yes": True, "No": False, "I'm not sure": False}
ANSWERS = {"Confident": "confident", "Some experience": "some_experience", "New to me": "not_familiar"}
ROUTE_TITLES = {
    "TRAINING_AND_ASSESSMENT": "Train first, then get certified",
    "ASSESSMENT_READINESS": "Check your readiness, then get assessed",
    "SKILL_GAP_CHECK": "Close your skill gaps, then get assessed",
    "ADDITIONAL_QUESTIONS": "Tell us a little more",
}
CATEGORY_HELP = {
    "Basic": "Workplace skills every TESDA qualification shares, like teamwork and safety.",
    "Common": "Skills shared by the trades in this sector.",
    "Core": "The technical skills of this qualification.",
}
_MARKDOWN = re.compile(r"([\\`*_{}\[\]()#+\-.!|>~:$])")


def plain(text: str) -> str:
    """Escape Markdown so learner-typed text shows exactly as typed."""
    return _MARKDOWN.sub(r"\\\1", text)


def group_competencies(competencies: list[dict]) -> list[tuple[str, list[dict]]]:
    """Group competencies Basic, Common, Core, then any other category, each in position order."""
    groups: dict[str, list[dict]] = {}
    for item in sorted(competencies, key=lambda item: item["position"]):
        groups.setdefault(item["category"], []).append(item)
    known = [category for category in CATEGORY_ORDER if category in groups]
    others = sorted(category for category in groups if category not in CATEGORY_ORDER)
    return [(category, groups[category]) for category in known + others]


def qualification_level(name: str) -> str | None:
    match = _LEVEL.search(name)
    return f"NC {match[1]}" if match else None


def filter_qualifications(qualifications: list[dict], query: str, sector: str | None,
                          level: str | None) -> list[dict]:
    needle = query.strip().casefold()
    return [item for item in qualifications
            if (sector is None or item["sector"] == sector)
            and (level is None or qualification_level(item["name"]) == level)
            and needle in " ".join([item["name"], item["code"], item["sector"], *item["possible_jobs"]]).casefold()]


def page_count(total: int, per_page: int) -> int:
    return max(1, ceil(total / per_page))


def page_items(items: list, page: int, per_page: int) -> list:
    page = min(max(page, 1), page_count(len(items), per_page))
    return items[(page - 1) * per_page:page * per_page]
