"""Analysis: nothing a learner types here is stored or logged; matching only adds to anonymous daily totals."""
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends

from tesda_track.config import Settings, get_settings
from tesda_track.db import SessionDep
from tesda_track.errors import NotFoundError
from tesda_track.deps import OptionalLearner
from tesda_track.schemas.analysis import (GoalAnalysis, GoalRequest, MatchRequest, MatchResult, PathwayRecommendation,
                                          PathwayRequest, ReadinessRequest, ReadinessResult, SuggestionRequest,
                                          SuggestionResult)
from tesda_track.services import analysis, match_stats
from tesda_track.services import learner_assessments
from tesda_track.services.embeddings import EmbedderDep

router = APIRouter(prefix="/analysis", tags=["analysis"])


def suggestions_enabled(settings: Annotated[Settings, Depends(get_settings)]) -> None:
    """Profile suggestions stay off until their release gates pass (TSP_SUGGESTIONS_ENABLED)."""
    if not settings.tsp_suggestions_enabled:
        raise NotFoundError("Not Found")


@router.post("/goal", response_model=GoalAnalysis)
def analyze_goal(request: GoalRequest, session: SessionDep, embedder: EmbedderDep, background: BackgroundTasks):
    result = analysis.analyze_goal(session, request.query, embedder)
    if request.origin:
        background.add_task(match_stats.count, "goal_started", request.origin)
    return GoalAnalysis(profile=result.profile, source=result.source)


@router.post("/matches", response_model=MatchResult)
def match_qualifications(request: MatchRequest, session: SessionDep, embedder: EmbedderDep,
                         background: BackgroundTasks, learner: OptionalLearner):
    answers, _ = learner_assessments.resolve(session, learner, request)
    profile, matches = analysis.match(session, request.query, request.profile, embedder, answers)
    background.add_task(match_stats.record, no_match=not matches)
    return MatchResult(profile=profile, matches=matches)


@router.post("/suggestions", response_model=SuggestionResult, dependencies=[Depends(suggestions_enabled)],
             responses={404: {"description": "Suggestions are turned off on this server (TSP_SUGGESTIONS_ENABLED)"}})
def suggest_qualifications(request: SuggestionRequest, session: SessionDep, embedder: EmbedderDep,
                           background: BackgroundTasks):
    """Qualifications to suggest from a learner profile alone, for the TSP webview's entry page.

    Nothing is typed here: the profile comes from the TSP launch hints and the learner's Skill Passport, so the
    suggestions are worked out from those and `basis` says which of them were used. Like the rest of analysis,
    the profile is neither stored nor logged.
    """
    profile, suggestions = analysis.suggest(session, request.profile, embedder, request.limit)
    if analysis.suggestion_text(profile) is not None:  # a profile with nothing to suggest from isn't a list
        background.add_task(match_stats.count, "suggestions_shown" if suggestions else "suggestions_empty",
                            "suggestion")
    return SuggestionResult(profile=profile, suggestions=suggestions,
                            basis=analysis.suggestion_basis(profile))


@router.post("/pathway", response_model=PathwayRecommendation)
def recommend_pathway(request: PathwayRequest, session: SessionDep):
    return analysis.pathway(session, request.profile, request.qualification_code)


@router.post("/readiness", response_model=ReadinessResult)
def check_readiness(request: ReadinessRequest, session: SessionDep, background: BackgroundTasks):
    result = analysis.readiness(session, request.qualification_code, request.answers)
    if request.origin:
        background.add_task(match_stats.count, "readiness_checked", request.origin)
    return result
