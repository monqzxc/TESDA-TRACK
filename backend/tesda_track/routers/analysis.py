"""Stateless analysis: nothing a learner types here is stored or logged."""
from fastapi import APIRouter

from tesda_track.db import SessionDep
from tesda_track.schemas.analysis import (GoalAnalysis, GoalRequest, MatchRequest, MatchResult, PathwayRecommendation,
                                          PathwayRequest, ReadinessRequest, ReadinessResult)
from tesda_track.services import analysis

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/goal", response_model=GoalAnalysis)
def analyze_goal(request: GoalRequest, session: SessionDep):
    return GoalAnalysis(profile=analysis.analyze_goal_with_rules(session, request.query), source="rules")


@router.post("/matches", response_model=MatchResult)
def match_qualifications(request: MatchRequest, session: SessionDep):
    profile, matches = analysis.match(session, request.query, request.profile)
    return MatchResult(profile=profile, matches=matches)


@router.post("/pathway", response_model=PathwayRecommendation)
def recommend_pathway(request: PathwayRequest, session: SessionDep):
    return analysis.pathway(session, request.profile, request.qualification_code)


@router.post("/readiness", response_model=ReadinessResult)
def check_readiness(request: ReadinessRequest, session: SessionDep):
    return analysis.readiness(session, request.qualification_code, request.answers)
