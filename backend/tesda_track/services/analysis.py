"""Goal analysis and qualification matching: the rule-based services, optionally blended with semantic search."""
from dataclasses import dataclass
from typing import Literal

from sqlmodel import Session

from tesda_track.config import get_settings
from tesda_track.errors import InvalidRequestError
from tesda_track.models import Qualification
from tesda_track.schemas.analysis import Match, MatchComponents, PathwayRecommendation, Profile, ReadinessResult
from tesda_track.services import catalog, embeddings, pathways
from tesda_track.services.embeddings import Embedder
from tesda_track.services.intent_service import analyze_user_query
from tesda_track.services.recommendation_service import recommend_pathway, refine_profile, score_qualifications
from tesda_track.services.skill_gap_service import calculate_skill_gap

KEYWORD_SCALE = 95  # the highest score the keyword rules give
SEMANTIC_REASON = "Similar in meaning to your goal."


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


def _semantic_strengths(session: Session, embedder: Embedder, query: str) -> dict[int, float]:
    """Each qualification's z-score against the whole catalog, mapped onto the calibrated band."""
    settings = get_settings()
    similarities = embeddings.qualification_similarities(session, embedder, query)
    return {qualification_id: semantic_strength(z, settings.semantic_z_floor, settings.semantic_z_ceiling)
            for qualification_id, z in z_scores(similarities).items()}


def analyze_goal(session: Session, query: str, embedder: Embedder | None = None) -> GoalAnalysisResult:
    """Rules first; when they find no career at all, the closest qualification in meaning fills the gap."""
    profile = analyze_goal_with_rules(session, query)
    if embedder is None or profile.career_goal is not None or profile.intent != "unknown":
        return GoalAnalysisResult(profile, "rules")
    settings = get_settings()
    strengths = _semantic_strengths(session, embedder, query)
    candidates = [q for q in catalog.active_qualifications(session) if q.id in strengths]
    if not candidates:
        return GoalAnalysisResult(profile, "rules")
    best = max(candidates, key=lambda q: strengths[q.id])
    if hybrid_score(0, strengths[best.id], settings.match_weight_keyword) < settings.match_min_score:
        return GoalAnalysisResult(profile, "rules")
    years = profile.experience_years
    intent = ("training_and_assessment" if years == 0
              else "assessment_recommendation" if years is not None and years >= 3 else "training_recommendation")
    inferred = profile.model_copy(update={"career_goal": best.possible_jobs[0], "possible_sector": best.sector.name,
                                          "intent": intent})
    return GoalAnalysisResult(inferred, "ai")


def analyze_goal_with_rules(session: Session, query: str) -> Profile:
    qualifications = [catalog.rule_view(q) for q in catalog.active_qualifications(session)]
    return Profile.model_validate(analyze_user_query(query, qualifications))


def match(session: Session, query: str, profile: Profile,
          embedder: Embedder | None = None) -> tuple[Profile, list[Match]]:
    refined = Profile.model_validate(refine_profile(profile.model_dump()))
    qualifications = catalog.active_qualifications(session)
    # With semantic search on, keywords count only as direct evidence in the learner's own words: the
    # career/sector bonuses would otherwise reward every qualification near a career the model inferred.
    evidence_profile = refined.model_dump() if embedder is None else {}
    keyword = {r["qualification"]["code"]: r for r in score_qualifications(
        query, evidence_profile, [catalog.rule_view(q) for q in qualifications])}
    if embedder is None:
        by_code = {q.code: q for q in qualifications}
        return refined, [Match(qualification=catalog.summary(by_code[code]), score=r["score"], reason=r["reason"])
                         for code, r in list(keyword.items())[:3]]
    settings = get_settings()
    strengths = _semantic_strengths(session, embedder, query)
    matches = []
    for qualification in qualifications:
        evidence = keyword.get(qualification.code)
        keyword_score = evidence["score"] if evidence else 0
        semantic = strengths.get(qualification.id, 0.0)
        score = hybrid_score(keyword_score, semantic, settings.match_weight_keyword)
        if score >= settings.match_min_score:
            matches.append(Match(qualification=catalog.summary(qualification), score=score,
                                 reason=evidence["reason"] if evidence else SEMANTIC_REASON,
                                 components=MatchComponents(keyword=round(keyword_score / KEYWORD_SCALE, 3),
                                                            semantic=round(semantic, 3))))
    matches.sort(key=lambda m: m.score, reverse=True)
    return refined, matches[:3]


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
