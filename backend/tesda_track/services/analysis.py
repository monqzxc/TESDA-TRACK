"""Goal analysis and qualification matching: the rule-based services, optionally blended with semantic search."""
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from sqlmodel import Session

from tesda_track.config import get_settings
from tesda_track.errors import InvalidRequestError
from tesda_track.models import Qualification
from tesda_track.schemas.analysis import Match, MatchComponents, PathwayRecommendation, Profile, ReadinessResult
from tesda_track.services import catalog, embeddings, goal_rules, pathways
from tesda_track.services.catalog import CatalogItem
from tesda_track.services.embeddings import Embedder
from tesda_track.services.intent_service import analyze_user_query
from tesda_track.services.recommendation_service import recommend_pathway, refine_profile, score_qualifications
from tesda_track.services.skill_gap_service import calculate_skill_gap
from tesda_track.schemas.learner_assessments import AssessmentAnswers
from tesda_track.services import personalization

KEYWORD_SCALE = 95  # the highest score the keyword rules give
SEMANTIC_REASON = "Similar in meaning to your goal."


@dataclass(frozen=True)
class MatchParams:
    """The numbers that turn evidence into a score; explicit so the offline evaluation can try others."""
    z_floor: float
    z_ceiling: float
    keyword_weight: float
    min_score: int

    @classmethod
    def from_settings(cls, settings) -> "MatchParams":
        return cls(settings.semantic_z_floor, settings.semantic_z_ceiling, settings.match_weight_keyword,
                   settings.match_min_score)


def match_params(embedder: Embedder | None) -> MatchParams:
    """A fine-tuned model's own calibration when it has one, else the settings'."""
    return getattr(embedder, "calibration", None) or MatchParams.from_settings(get_settings())


@dataclass(frozen=True)
class GoalAnalysisResult:
    profile: Profile
    source: Literal["rules", "ai"]


def semantic_strength(value: float, floor: float, ceiling: float) -> float:
    """Map a value onto 0..1: nothing at or below the floor, everything at or above the ceiling."""
    return min(max((value - floor) / (ceiling - floor), 0.0), 1.0)


def hybrid_score(keyword_score: float, semantic: float, keyword_weight: float) -> int:
    return round(100 * (keyword_weight * keyword_score / KEYWORD_SCALE + (1 - keyword_weight) * semantic))


def z_scores(similarities: dict[int, float]) -> dict[int, float]:
    """How many standard deviations each similarity stands above the catalog's average; empty if all are alike."""
    if len(similarities) < 2:
        return {}
    values = list(similarities.values())
    mean = sum(values) / len(values)
    deviation = (sum((value - mean) ** 2 for value in values) / len(values)) ** 0.5
    if deviation < 1e-9:
        return {}
    return {key: (value - mean) / deviation for key, value in similarities.items()}


def strengths(similarities: dict[int, float], params: MatchParams) -> dict[int, float]:
    """Each qualification's z-score against the whole catalog, mapped onto the calibrated band."""
    return {qualification_id: semantic_strength(z, params.z_floor, params.z_ceiling)
            for qualification_id, z in z_scores(similarities).items()}


def score_matches(items: Sequence[CatalogItem], keyword: dict[str, dict], similarities: dict[int, float],
                  params: MatchParams, limit: int = 3, query: str | None = None) -> list[Match]:
    """The hybrid score for every qualification, strongest first; the API and the offline evaluation share it.

    With the learner's `query`, the plain-language rules apply: no match when it names no trade, and the level
    they need comes first within a family (see goal_rules)."""
    if query is not None and goal_rules.gives_no_match(query, bool(keyword)):
        return []
    semantic_by_id = strengths(similarities, params)
    matches = []
    for item in items:
        evidence = keyword.get(item.code)
        keyword_score = evidence["score"] if evidence else 0
        semantic = semantic_by_id.get(item.id, 0.0)
        score = hybrid_score(keyword_score, semantic, params.keyword_weight)
        if score >= params.min_score:
            matches.append(Match(qualification=item.summary, score=score,
                                 reason=evidence["reason"] if evidence else SEMANTIC_REASON,
                                 components=MatchComponents(keyword=round(keyword_score / KEYWORD_SCALE, 3),
                                                            semantic=round(semantic, 3))))
    matches.sort(key=lambda m: m.score, reverse=True)
    if query is not None:
        matches = goal_rules.order_within_families(matches, items, query)
    return matches[:limit]


def analyze_goal(session: Session, query: str, embedder: Embedder | None = None) -> GoalAnalysisResult:
    """Rules first; when they find no career at all, the closest qualification in meaning fills the gap."""
    current = catalog.snapshot(session)
    profile = Profile.model_validate(analyze_user_query(query, current.rule_views))
    if embedder is None or profile.career_goal is not None or profile.intent != "unknown":
        return GoalAnalysisResult(profile, "rules")
    params = match_params(embedder)
    semantic_by_id = strengths(embeddings.qualification_similarities(session, embedder, goal_rules.strip_negated(query)),
                               params)
    candidates = [item for item in current.items if item.id in semantic_by_id]
    if not candidates:
        return GoalAnalysisResult(profile, "rules")
    best = max(candidates, key=lambda q: semantic_by_id[q.id])
    if hybrid_score(0, semantic_by_id[best.id], params.keyword_weight) < params.min_score:
        return GoalAnalysisResult(profile, "rules")
    years = profile.experience_years
    intent = ("training_and_assessment" if years == 0
              else "assessment_recommendation" if years is not None and years >= 3 else "training_recommendation")
    inferred = profile.model_copy(update={"career_goal": best.possible_jobs[0], "possible_sector": best.sector,
                                          "intent": intent})
    return GoalAnalysisResult(inferred, "ai")


def structured_matches(items: Sequence[CatalogItem], assessment: AssessmentAnswers, limit: int = 3) -> list[Match]:
    """Shared by the API and offline evaluation; no database or embedding model required."""
    scored = []
    for item in items:
        details = personalization.qualification_score(assessment, item)
        if details.score > 0:
            scored.append(Match(qualification=item.summary, score=details.score,
                reason=" ".join(personalization.explanations(details)), personalization=details))

    def tie_key(result):
        parsed = goal_rules.level_of(result.qualification.name)
        family, level = parsed if parsed else (result.qualification.name, 0)
        level_order = level if assessment.experience_years == 0 else {2: 0, 1: 1, 3: 2, 4: 3}.get(level, 9)
        return (-result.score, family.casefold(), level_order, result.qualification.code)

    scored.sort(key=tie_key)
    return scored[:limit]


def match(session: Session, query: str, profile: Profile,
          embedder: Embedder | None = None, assessment: AssessmentAnswers | None = None,
          limit: int = 3) -> tuple[Profile, list[Match]]:
    if assessment is not None:
        if assessment.career_goal is None and query.strip():
            assessment = assessment.model_copy(update={"career_goal": query.strip()})
        updates = {field: getattr(assessment, field) for field in ("experience_years", "has_certification")
                   if getattr(assessment, field) is not None}
        if assessment.career_goal:
            updates["career_goal"] = assessment.career_goal[:200]
        if assessment.existing_skills:
            updates["existing_skills"] = assessment.existing_skills
        refined = Profile.model_validate(refine_profile(profile.model_copy(update=updates).model_dump()))
        current = catalog.snapshot(session)
        return refined, structured_matches(current.items, assessment, limit)
    refined = Profile.model_validate(refine_profile(profile.model_dump()))
    current = catalog.snapshot(session)
    # With semantic search on, keywords count only as direct evidence in the learner's own words: the
    # career/sector bonuses would otherwise reward every qualification near a career the model inferred.
    evidence_profile = refined.model_dump() if embedder is None else {}
    keyword = {r["qualification"]["code"]: r for r in score_qualifications(query, evidence_profile,
                                                                            current.rule_views)}
    if embedder is None:
        by_code = {item.code: item for item in current.items}
        return refined, [Match(qualification=by_code[code].summary, score=r["score"], reason=r["reason"])
                         for code, r in list(keyword.items())[:3]]
    params = match_params(embedder)
    similarities = embeddings.qualification_similarities(session, embedder, goal_rules.strip_negated(query))
    return refined, score_matches(current.items, keyword, similarities, params, query=query)


def pathway(session: Session, profile: Profile, qualification_code: str) -> PathwayRecommendation:
    qualification = catalog.get_active_qualification(session, qualification_code)
    recommendation = PathwayRecommendation.model_validate(
        recommend_pathway(profile.model_dump(), catalog.rule_view(qualification)))
    curated = pathways.for_route(session, qualification, recommendation.recommendation)
    recommendation.pathway = pathways.to_public(curated) if curated else None
    return recommendation


def readiness(session: Session, qualification_code: str, answers: dict[int, str]) -> ReadinessResult:
    return score_readiness(catalog.get_active_qualification(session, qualification_code), answers)


def score_readiness(qualification: Qualification, answers: dict[int, str]) -> ReadinessResult:
    try:
        result = calculate_skill_gap(catalog.rule_view(qualification), answers)
    except ValueError as error:
        raise InvalidRequestError(str(error)) from error
    return ReadinessResult.model_validate(result)
