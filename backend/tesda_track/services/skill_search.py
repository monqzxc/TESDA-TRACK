"""Skill and job search for Find my pathway: each skill or job title the learner lists is matched on its own.

The terms come out of the list as Skills Explorer takes them (skills_terms), locally: nothing is sent anywhere.
Each term is scored with goal matching's own keyword rules and semantic band, and a qualification's score is the
best of those single-term scores. How many terms point to it only orders equal scores and explains the match, so
listing more terms can never raise a score above what its strongest term earns alone.
"""
import re
from collections.abc import Sequence
from itertools import zip_longest
from dataclasses import dataclass, field

from sqlmodel import Session

from tesda_track.schemas.analysis import Match, MatchComponents, SkillTerms
from tesda_track.services import analysis, embeddings, goal_rules, skills_terms
from tesda_track.services.catalog import CatalogItem
from tesda_track.services.embeddings import Embedder
from tesda_track.services.recommendation_service import score_qualifications

SKILLS = 6  # competencies shown as what the search was read as
SKILL_SOURCES = 3  # from the strongest matches only
LIMIT = 5  # a job title often fits several qualifications (a welder: SMAW, GMAW, FCAW ...)


@dataclass(frozen=True)
class SkillEvidence:
    """What a skills search worked from, in the shape goal matching keeps for feedback and the report."""
    search: SkillTerms
    matches: list[Match]
    keyword: dict[str, float]  # best single-term keyword strength (0..1) by qualification code
    z_scores: dict[int, float]  # best single-term z-score by qualification id; empty without the model
    supporting: dict[str, tuple[str, ...]] = field(default_factory=dict)  # by code: the terms that reached it


def read_terms(text: str) -> list[str]:
    """The distinct skill and job terms in the learner's list, at most skills_terms.MAX_TERMS of them."""
    seen, terms = set(), []
    for term in skills_terms.extract_skill_terms(goal_rules.strip_negated(text)):
        term = term.strip()[:skills_terms.MAX_TERM_LENGTH]
        if term and term.casefold() not in seen:
            seen.add(term.casefold())
            terms.append(term)
    return terms[:skills_terms.MAX_TERMS]


def search(session: Session, items: Sequence[CatalogItem], rule_views: list[dict], text: str,
           embedder: Embedder | None, params, limit: int = LIMIT) -> SkillEvidence:
    """The qualifications for a list of skills or job titles, strongest first (params: analysis.MatchParams)."""
    return search_terms(session, items, rule_views, read_terms(text), embedder, params, limit, text=text)


def search_terms(session: Session, items: Sequence[CatalogItem], rule_views: list[dict], given: Sequence[str],
                 embedder: Embedder | None, params, limit: int = LIMIT, *, text: str | None = None) -> SkillEvidence:
    """search() for terms already separated, such as a Skill Passport's skills and unit titles, whose own commas
    ("Prepare stocks, sauces and soups") must not split them. `text` is what family ordering reads; by default the
    terms one per line."""
    text = text if text is not None else "\n".join(given)
    keyword_by_term = {}
    for term in given:
        keyword_by_term[term] = {r["qualification"]["code"]: r for r in score_qualifications(term, {}, rule_views)}
    # The same safety rules as a goal: a term naming no trade TESDA trains for is set aside, whatever its meaning.
    terms = [t for t, found in keyword_by_term.items() if not goal_rules.gives_no_match(t, bool(found))]
    unmatched = [t for t in keyword_by_term if t not in terms]
    found_terms = SkillTerms(terms=terms, unmatched=unmatched)
    if not terms:
        return SkillEvidence(found_terms, [], {}, {})

    similarities = embeddings.qualification_similarities_many(session, embedder, terms) if embedder else []
    strength_by_term = [analysis.strengths(s, params) for s in similarities]
    z_by_term = [analysis.z_scores(s) for s in similarities]

    scored, by_code = [], {}
    for item in items:
        keyword_scores = [keyword_by_term[t][item.code]["score"] if item.code in keyword_by_term[t] else 0
                          for t in terms]
        semantic_scores = [by_id.get(item.id, 0.0) for by_id in strength_by_term] or [0.0] * len(terms)
        if embedder is None:
            term_scores = keyword_scores
        else:
            term_scores = [analysis.hybrid_score(k, s, params.keyword_weight)
                           for k, s in zip(keyword_scores, semantic_scores)]
        score = max(term_scores)
        if score <= 0 or (embedder is not None and score < params.min_score):
            continue
        floor = 1 if embedder is None else params.min_score
        supporting = [t for t, s in zip(terms, term_scores) if s >= floor]
        keyword, semantic = max(keyword_scores), max(semantic_scores)
        match = Match(qualification=item.summary, score=score, reason=_reason(supporting, len(terms)),
                      components=MatchComponents(keyword=round(keyword / analysis.KEYWORD_SCALE, 3),
                                                 semantic=round(semantic, 3)) if embedder else None)
        raw = max((row.get(item.id, 0.0) for row in similarities), default=0.0)
        scored.append((match, len(supporting), keyword, raw))
        by_code[item.code] = tuple(supporting)

    # Equal scores: the qualification more of the terms point to first, then the one the words name directly.
    scored.sort(key=lambda entry: (-entry[0].score, -entry[1], -entry[2], -entry[3], entry[0].qualification.code))
    matches = goal_rules.order_within_families([entry[0] for entry in scored], items, text)[:limit]
    keyword_strength = {}
    for found in keyword_by_term.values():
        for code, r in found.items():
            strength = round(r["score"] / analysis.KEYWORD_SCALE, 3)
            keyword_strength[code] = max(keyword_strength.get(code, 0.0), strength)
    best_z = {}
    for by_id in z_by_term:
        for qualification_id, z in by_id.items():
            best_z[qualification_id] = max(best_z.get(qualification_id, z), z)
    return SkillEvidence(found_terms, matches, keyword_strength, best_z, by_code)


def _reason(supporting: list[str], total: int) -> str:
    if total > 1:
        return f"Matched {len(supporting)} of your {total} skills or jobs: " + ", ".join(supporting)
    return "Matched your skill or job: " + ", ".join(supporting)


_WORD = re.compile(r"[a-z0-9]+")
_STOP = {"and", "the", "for", "with", "use", "using", "work", "job", "skill", "skills", "perform", "apply", "carry",
         "out", "of", "in", "on", "to", "a", "an", "or", "at", "my", "i", "can", "know", "how"}


def _words(text: str) -> set[str]:
    return {w.removesuffix("s") for w in _WORD.findall(text.lower()) if len(w) > 2 and w not in _STOP}


def _same(a: str, b: str) -> bool:
    """cook against cookery, weld against welding: one word starting the other, four letters or more."""
    short, long_ = sorted((a, b), key=len)
    return short == long_ or (len(short) >= 4 and long_.startswith(short))


def matched_skills(items: Sequence[CatalogItem], matches: Sequence[Match], text: str, limit: int = SKILLS) -> list[str]:
    """The competencies of the strongest matches, as the skills the search was read as: first the ones the learner's
    words name (strongest match first), then each match's CORE units in turn, so no one qualification fills the list.
    Catalog titles, never the learner's own words."""
    by_code = {item.code: item for item in items}
    sources = [by_code[m.qualification.code].rules["competencies"] for m in matches[:SKILL_SOURCES]
               if m.qualification.code in by_code]
    words = _words(text)
    named = [c["name"] for units in sources for c in units
             if any(_same(w, u) for w in words for u in _words(c["name"]))]
    cores = [[c["name"] for c in units if c["category"] == "Core"] for units in sources]
    in_turn = [name for row in zip_longest(*cores) for name in row if name]
    seen, skills = set(), []
    for name in [*named, *in_turn]:
        name = " ".join(name.split()).rstrip(".")
        key = name.casefold()
        if name and key not in seen:
            seen.add(key)
            skills.append(name[:1].upper() + name[1:])
    return skills[:limit]
