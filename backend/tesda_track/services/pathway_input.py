"""Choose an existing matcher without changing its scores or rejection policy."""

import re

from tesda_track.schemas.analysis import SearchMode

# Context and negation must remain attached to the sentence. Do not split these into skills.
_CONTEXT = re.compile(
    r"\b(i|i'm|i’ve|i've|my|want|would|experience|experienced|years?|months?|"
    r"working|worked|enjoy|like|learn|looking|hope|interested|interest|career|not|don't|dont|without|never|no|"
    r"ako|akong|kong|gusto|nais|marunong|nagtatrabaho|nagtrabaho|"
    r"hindi|ayaw|wala|walang|magiging|maging)\b",
    re.IGNORECASE,
)


def matching_mode(query: str) -> SearchMode:
    """Short labels/lists use per-term retrieval; contextual prose keeps whole-goal retrieval.

    Resolve once at submission and carry the concrete mode into matching, reports and feedback.
    Explicit legacy modes and saved journeys are never reinterpreted.
    """
    text = query.strip()
    if _CONTEXT.search(text):
        return "goal"
    chunks = [part.strip() for part in re.split(r"[,;\n]+", text) if part.strip()]
    if chunks and all(
        len(part.split()) <= 8 and not re.search(r"[.!?]", part.rstrip(".!?"))
        for part in chunks
    ):
        return "skills"
    return "goal"


def demand_preference(query: str) -> str | None:
    """Demand is an explicit learner request, not the default occupation filter."""
    from tesda_track.services.goal_rules import strip_negated

    positive = strip_negated(query.replace("’", "'"))
    demand = bool(
        re.search(r"\b(?:in[\s-]?demand|mataas\s+na\s+demand)\b", positive, re.I)
    )
    shortage = bool(re.search(r"\bhard[\s-]+to[\s-]+fill\b", positive, re.I))
    return (
        "either"
        if demand and shortage
        else "in_demand" if demand else "hard_to_fill" if shortage else None
    )
