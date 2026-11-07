"""Analysis: nothing a learner types here is stored or logged; matching only adds to anonymous daily totals."""
from fastapi import APIRouter, BackgroundTasks

from tesda_track.db import SessionDep
from tesda_track.deps import OptionalLearner
from tesda_track.schemas.analysis import (GoalAnalysis, GoalRequest, MatchRequest, MatchResult, PathwayRecommendation,
                                          PathwayRequest, ReadinessRequest, ReadinessResult)
from tesda_track.services import analysis, match_stats
from tesda_track.services import learner_assessments, pathway_input
from tesda_track.services.embeddings import EmbedderDep

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/goal", response_model=GoalAnalysis)
def analyze_goal(request: GoalRequest, session: SessionDep, embedder: EmbedderDep):
    result = analysis.analyze_goal(session, request.query, embedder)
    return GoalAnalysis(profile=result.profile, source=result.source,
                        matching_mode=pathway_input.matching_mode(request.query) if request.interpret_input else None)


@router.post("/matches", response_model=MatchResult)
def match_qualifications(request: MatchRequest, session: SessionDep, embedder: EmbedderDep,
                         background: BackgroundTasks, learner: OptionalLearner):
    if request.mode == "skills":
        # A list of skills or job titles: saved assessment answers describe a goal, so they don't apply.
        evidence = analysis.match_evidence(session, request.query, request.profile, embedder, mode="skills", region_code=request.region_code)
        background.add_task(match_stats.record, no_match=not evidence.matches)
        return MatchResult(profile=evidence.profile, matches=evidence.matches, search=evidence.search,eligible_qualification_codes=evidence.eligible_codes)
    answers, _ = learner_assessments.resolve(session, learner, request)
    if answers is None and pathway_input.demand_preference(request.query):
        evidence=analysis.match_evidence(session,request.query,request.profile,embedder,region_code=request.region_code)
        background.add_task(match_stats.record,no_match=not evidence.matches)
        return MatchResult(profile=evidence.profile,matches=evidence.matches,eligible_qualification_codes=evidence.eligible_codes)
    profile, matches = analysis.match(session, request.query, request.profile, embedder, answers)
    background.add_task(match_stats.record, no_match=not matches)
    return MatchResult(profile=profile, matches=matches)


@router.post("/pathway", response_model=PathwayRecommendation)
def recommend_pathway(request: PathwayRequest, session: SessionDep):
    return analysis.pathway(session, request.profile, request.qualification_code)


@router.post("/readiness", response_model=ReadinessResult)
def check_readiness(request: ReadinessRequest, session: SessionDep):
    return analysis.readiness(session, request.qualification_code, request.answers)
