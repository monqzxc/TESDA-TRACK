"""Skills Explorer: skill and role terms pulled out of a learner's sentence, then looked up in Skills Bridge.

Only the extracted terms leave this module. The sentence itself is never logged, cached or sent upstream.
Extraction and classification are copied from the Streamlit view (classic/skills_bridge_view.py), which keeps
its own copy until it is retired.
"""
import re
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel, ValidationError

from tesda_track.schemas.skills_bridge import (SkillsBridgeExploreResponse, SkillsBridgeOccupationMatch,
                                               SkillsBridgeQualificationMatch, SkillsBridgeTermResolution)

# The same bounds as the lookup endpoints' request models.
MAX_TERMS = 25
MAX_OCCUPATION_TERMS = 10
MAX_TERM_LENGTH = 80
LOOKUP_LIMIT = 6

_LEADING_REQUEST = re.compile(
    r"^\s*(?:please\s+)?(?:i\s+(?:want|would\s+like|need|plan|hope|am\s+looking)\s+to\s+|"
    r"i(?:'m|\s+am)\s+(?:currently\s+)?|i\s+(?:have|know)\s+(?:some\s+|the\s+)?|"
    r"my\s+(?:skills?|experience)\s+(?:include|are)\s+|"
    r"skills?\s*:\s*|what\s+(?:jobs?|occupations?|careers?)\s+(?:can\s+i\s+get\s+with|fit\s+my\s+skills?\s+in)\s*)",
    re.IGNORECASE,
)
_ROLE_PREFIX = re.compile(r"^(?:to\s+)?(?:become|be|work\s+as|learn|study|pursue)\s+", re.IGNORECASE)
_OCCUPATION_WORDS = {
    "welder", "programmer", "developer", "engineer", "technician", "mechanic", "electrician", "carpenter",
    "plumber", "mason", "chef", "cook", "baker", "barista", "bartender", "caregiver", "driver", "nurse",
    "teacher", "accountant", "designer", "analyst", "farmer", "tailor", "machinist", "waiter", "waitress",
    "hairdresser", "housekeeper", "architect", "operator", "fabricator", "stylist", "manager",
}
# A phrase made only of these words names no skill or role, so it isn't sent: Skills Bridge matches substrings, and
# "suggest" alone found "Suggestive selling" and dozens of others. English and Filipino, after normalise().
_FILLER_WORDS = {
    "i", "im", "m", "me", "my", "myself", "you", "your", "a", "an", "the", "to", "for", "of", "in", "on", "at",
    "with", "about", "what", "which", "where", "how", "some", "something", "maybe", "please", "pls", "just", "yet",
    "still", "really", "very", "also", "so", "or", "but", "if", "is", "are", "am", "be", "do", "does", "did", "dont",
    "don", "t", "not", "no", "can", "could", "would", "should", "will", "ll", "ve", "d", "s", "re", "that", "this",
    "there", "good", "best", "right", "kind", "want", "wants", "like", "need", "think", "give", "show", "tell",
    "find", "get", "have", "skill", "skills", "one", "ok", "okay",
    "hindi", "di", "ko", "ako", "ano", "anong", "ang", "ng", "sa", "mga", "na", "mo", "po", "ba", "gusto",
    "pwede", "puwede", "paki", "naman", "lang", "yung",
}
# Words of a learner who doesn't know yet and is asking for ideas, including job words with no job named ("what
# jobs suit me"). Text of only these and filler gets the reason "asked_for_suggestions": the page points to Find my
# pathway.
_UNSURE_WORDS = {
    "know", "sure", "unsure", "idea", "ideas", "clue", "idk", "dunno", "undecided", "decide", "choose", "suggest",
    "suggestion", "suggestions", "recommend", "recommendation", "recommendations", "advice", "advise", "help",
    "any", "anything", "whatever", "fit", "fits", "suit", "suits", "suitable", "role", "roles", "job", "jobs",
    "career", "careers", "work", "occupation", "occupations", "course", "courses", "option", "options", "path",
    "pathway", "alam", "ewan", "kahit", "pakisuggest", "mungkahi", "tulong", "trabaho", "kurso",
}

Lookup = Callable[..., dict]


def extract_skill_terms(text: str) -> list[str]:
    """Turn a short natural-language skills request into provider search terms.

    Explicit comma/newline separated phrases remain intact so terms such as ``network configuration`` are not
    broken apart. In a sentence, only the common request filler and a final ``and`` joiner are removed, and a phrase
    with no skill or role word in it ("not sure", "suggest") is dropped. This keeps the transformation deterministic
    and visible to the learner.
    """
    return list(dict.fromkeys(phrase for phrase in _phrases(text) if not _words_only(phrase)))


def asks_for_suggestions(text: str) -> bool:
    """Whether the text asks for ideas ("i dont know what roles i want, suggest") rather than naming a skill."""
    return any(words & _UNSURE_WORDS for phrase in _phrases(text) if (words := _words_only(phrase)))


def _words_only(phrase: str) -> set[str]:
    """The phrase's words when all of them are filler or unsure words, else an empty set."""
    words = set(normalise(phrase).split())
    return words if words and words <= _FILLER_WORDS | _UNSURE_WORDS else set()


def _phrases(text: str) -> list[str]:
    phrases: list[str] = []
    for chunk in re.split(r"[,;\n]+", text or ""):
        chunk = re.sub(r"[?.!]+$", "", chunk.strip())
        if not chunk:
            continue
        chunk = _LEADING_REQUEST.sub("", chunk, count=1).strip()
        chunk = _ROLE_PREFIX.sub("", chunk, count=1).strip()
        # Articles are request grammar, not taxonomy terms. Remove them only at phrase boundaries; keep all words
        # inside a multi-word skill.
        chunk = re.sub(r"^(?:a|an|the)\s+", "", chunk, flags=re.IGNORECASE)
        for part in re.split(r"\s+(?:and|&)\s+", chunk, flags=re.IGNORECASE):
            part = re.sub(r"^(?:and|&)\s+", "", part.strip(), flags=re.IGNORECASE)
            part = _ROLE_PREFIX.sub("", part.strip(), count=1).strip()
            part = re.sub(r"^(?:a|an|the)\s+", "", part, flags=re.IGNORECASE).strip()
            if part:
                phrases.append(part)
    return phrases


def classify_terms(terms: list[str]) -> tuple[list[str], list[str]]:
    """Split target job titles from capability terms: titles use the occupation lookup, the rest match_skills."""
    occupations, skills = [], []
    for term in terms:
        (occupations if set(normalise(term).split()) & _OCCUPATION_WORDS else skills).append(term)
    return occupations, skills


def normalise(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def unusable_reason(terms: list[str], occupation_terms: list[str]) -> str | None:
    """Why these terms can't be looked up, or None. The lookup endpoints would refuse the same terms."""
    if not terms:
        return "no_terms"
    if len(terms) > MAX_TERMS or len(occupation_terms) > MAX_OCCUPATION_TERMS:
        return "too_many_terms"
    if any(len(term) > MAX_TERM_LENGTH for term in terms):
        return "term_too_long"
    return None


def _unique(terms: list[str]) -> list[str]:
    """Drop repeats that differ only in case, as the lookup endpoints do, so both share cached answers."""
    seen, unique = set(), []
    for term in terms:
        if term.casefold() not in seen:
            seen.add(term.casefold())
            unique.append(term)
    return unique


def _valid(model: type[BaseModel], items: Any, **extra: Any) -> list:
    """Records that fit the response model. One malformed upstream record is skipped rather than failing all."""
    records = []
    for item in items if isinstance(items, list) else []:
        try:
            records.append(model.model_validate({**item, **extra} if isinstance(item, dict) else item))
        except ValidationError:
            continue
    return records


def explore(text: str, lookup: Lookup) -> SkillsBridgeExploreResponse:
    """Extract terms from `text`, look up title terms as occupations and the rest as skills, and combine both.

    `lookup(operation, **arguments)` runs one Skills Bridge lookup (the router's rate-limited, cached ``Lookup``)
    and returns ``{"source", "source_url", "retrieved_at", "data"}``. Only extracted terms are passed to it.
    """
    terms = extract_skill_terms(text)
    occupation_terms, skill_terms = classify_terms(terms)
    reason = unusable_reason(terms, occupation_terms)
    if reason == "no_terms" and asks_for_suggestions(text):
        reason = "asked_for_suggestions"
    result = SkillsBridgeExploreResponse(terms=terms, occupation_terms=occupation_terms, skill_terms=skill_terms,
                                         searched=False, reason=reason)
    if result.reason:
        return result
    occupation_response = (lookup("search_occupations", occupations=_unique(occupation_terms), limit=LOOKUP_LIMIT)
                           if occupation_terms else None)
    skill_response = (lookup("match_skills", skills=_unique(skill_terms), limit=LOOKUP_LIMIT)
                      if skill_terms else None)
    occupation_data = (occupation_response or {}).get("data") or {}
    skill_data = (skill_response or {}).get("data") or {}

    # Title matches first, then capability matches; an occupation found by both keeps its title match.
    occupations, seen_ids = [], set()
    for occupation in [*_valid(SkillsBridgeOccupationMatch, occupation_data.get("occupations"),
                               match_kind="occupation"),
                       *_valid(SkillsBridgeOccupationMatch, skill_data.get("occupations"), match_kind="skill")]:
        if occupation.occupation_id not in seen_ids:
            seen_ids.add(occupation.occupation_id)
            occupations.append(occupation)
    unmatched = []
    for term in [*(occupation_data.get("unmatched") or []), *(skill_data.get("unmatched") or [])]:
        if str(term) not in unmatched:
            unmatched.append(str(term))
    first = occupation_response or skill_response
    return result.model_copy(update={
        "searched": True,
        "source": first.get("source", result.source),
        "source_url": first.get("source_url", result.source_url),
        "retrieved_at": first.get("retrieved_at"),
        "unmatched": unmatched,
        "resolution": [*_valid(SkillsBridgeTermResolution, occupation_data.get("resolution")),
                       *_valid(SkillsBridgeTermResolution, skill_data.get("resolution"))],
        "occupations": occupations,
        "qualifications": _valid(SkillsBridgeQualificationMatch, skill_data.get("qualifications")),
    })
