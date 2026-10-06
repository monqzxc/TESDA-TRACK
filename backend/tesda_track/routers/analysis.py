"""Stateless analysis: nothing a learner types here is stored or logged."""
from fastapi import APIRouter

from tesda_track.db import SessionDep
from tesda_track.schemas.analysis import (GoalAnalysis, GoalRequest, MatchRequest, MatchResult, PathwayRecommendation,
                                          PathwayRequest, ReadinessRequest, ReadinessResult)
from tesda_track.services import analysis
from tesda_track.services.embeddings import EmbedderDep

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/goal", response_model=GoalAnalysis)
def analyze_goal(request: GoalRequest, session: SessionDep, embedder: EmbedderDep):
    result = analysis.analyze_goal(session, request.query, embedder)
    return GoalAnalysis(profile=result.profile, source=result.source)


@router.post("/matches", response_model=MatchResult)
def match_qualifications(request: MatchRequest, session: SessionDep, embedder: EmbedderDep):
    profile, matches = analysis.match(session, request.query, request.profile, embedder)
    return MatchResult(profile=profile, matches=matches)


@router.post("/pathway", response_model=PathwayRecommendation)
def recommend_pathway(request: PathwayRequest, session: SessionDep):
    return analysis.pathway(session, request.profile, request.qualification_code)


@router.post("/readiness", response_model=ReadinessResult)
def check_readiness(request: ReadinessRequest, session: SessionDep):
    return analysis.readiness(session, request.qualification_code, request.answers)
