"""Runs the rule-based services against the catalog stored in PostgreSQL."""
from sqlmodel import Session

from tesda_track.errors import InvalidRequestError
from tesda_track.schemas.analysis import Match, PathwayRecommendation, Profile, ReadinessResult
from tesda_track.services import catalog
from tesda_track.services.intent_service import analyze_user_query
from tesda_track.services.recommendation_service import match_qualifications, recommend_pathway, refine_profile
from tesda_track.services.skill_gap_service import calculate_skill_gap


def analyze_goal_with_rules(session: Session, query: str) -> Profile:
    qualifications = [catalog.rule_view(q) for q in catalog.active_qualifications(session)]
    return Profile.model_validate(analyze_user_query(query, qualifications))


def match(session: Session, query: str, profile: Profile) -> tuple[Profile, list[Match]]:
    refined = Profile.model_validate(refine_profile(profile.model_dump()))
    qualifications = catalog.active_qualifications(session)
    by_code = {q.code: q for q in qualifications}
    results = match_qualifications(query, refined.model_dump(), [catalog.rule_view(q) for q in qualifications])
    return refined, [Match(qualification=catalog.summary(by_code[r["qualification"]["code"]]), score=r["score"],
                           reason=r["reason"]) for r in results]


def pathway(session: Session, profile: Profile, qualification_code: str) -> PathwayRecommendation:
    qualification = catalog.get_active_qualification(session, qualification_code)
    return PathwayRecommendation.model_validate(recommend_pathway(profile.model_dump(), catalog.rule_view(qualification)))


def readiness(session: Session, qualification_code: str, answers: dict[int, str]) -> ReadinessResult:
    qualification = catalog.get_active_qualification(session, qualification_code)
    try:
        result = calculate_skill_gap(catalog.rule_view(qualification), answers)
    except ValueError as error:
        raise InvalidRequestError(str(error)) from error
    return ReadinessResult.model_validate(result)
