"""Skill and job search for Find my pathway: each skill or job title the learner lists is matched on its own.

The terms come out of the list as Skills Explorer takes them (skills_terms), locally: nothing is sent anywhere.
Each term is scored with goal matching's own keyword rules and semantic band, and a qualification's score is the
best of those single-term scores. How many terms point to it only orders equal scores and explains the match, so
listing more terms can never raise a score above what its strongest term earns alone.
"""
from collections.abc import Sequence
from dataclasses import dataclass

from sqlmodel import Session

from tesda_track.schemas.analysis import Match, MatchComponents, SkillTerms
from tesda_track.services import analysis, embeddings, goal_rules, skills_terms
from tesda_track.services.catalog import CatalogItem
from tesda_track.services.embeddings import Embedder
from tesda_track.services.recommendation_service import score_qualifications

LIMIT = 5  # a job title often fits several qualifications (a welder: SMAW, GMAW, FCAW ...)


@dataclass(frozen=True)
class SkillEvidence:
    """What a skills search worked from, in the shape goal matching keeps for feedback and the report."""
    search: SkillTerms
    matches: list[Match]
    keyword: dict[str, float]  # best single-term keyword strength (0..1) by qualification code
    z_scores: dict[int, float]  # best single-term z-score by qualification id; empty without the model


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
    keyword_by_term = {}
    for term in read_terms(text):
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

    scored = []
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
        scored.append((match, len(supporting), keyword))

    # Equal scores: the qualification more of the terms point to first, then the one the words name directly.
    scored.sort(key=lambda entry: (-entry[0].score, -entry[1], -entry[2], entry[0].qualification.code))
    matches = goal_rules.order_within_families([m for m, _, _ in scored], items, text)[:limit]
    keyword_strength = {}
    for found in keyword_by_term.values():
        for code, r in found.items():
            strength = round(r["score"] / analysis.KEYWORD_SCALE, 3)
            keyword_strength[code] = max(keyword_strength.get(code, 0.0), strength)
    best_z = {}
    for by_id in z_by_term:
        for qualification_id, z in by_id.items():
            best_z[qualification_id] = max(best_z.get(qualification_id, z), z)
    return SkillEvidence(found_terms, matches, keyword_strength, best_z)


def _reason(supporting: list[str], total: int) -> str:
    if total > 1:
        return f"Matched {len(supporting)} of your {total} skills or jobs: " + ", ".join(supporting)
    return "Matched your skill or job: " + ", ".join(supporting)
