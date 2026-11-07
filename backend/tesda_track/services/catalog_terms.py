"""Literal catalog evidence shared by goal analysis and ranking across input languages."""
from tesda_track.utils.helpers import contains, normalize


def _mentioned(text: str, term: str) -> bool:
    term = normalize(term)
    return bool(term and term in text and contains(text, term))


def named_qualification(text: str, rule: dict) -> bool:
    return any(_mentioned(text, term) for term in (rule["name"], rule.get("code", "")))


def catalog_activity(text: str, rule: dict) -> str | None:
    # Very broad jobs such as "Attendant" and "Helper" don't identify a trade.
    for job in rule.get("possible_jobs", []):
        if len(job.strip()) >= 3 and normalize(job) not in {"attendant", "helper", "technician", "operator", "supervisor", "worker"} and _mentioned(text, job):
            return job
    for unit in rule.get("competencies", []):
        if unit.get("category") == "Core" and _mentioned(text, unit["name"]):
            return unit["name"]
    return None
