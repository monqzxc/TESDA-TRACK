from typing import Annotated

from fastapi import APIRouter, Depends, Query

from tesda_track.db import SessionDep
from tesda_track.deps import require_permission
from tesda_track.schemas.reports import (CompetencyGap, DateRange, FeedbackSummary, Funnel, MatchingReport, Overview,
                                         QualificationDemand, RegionSupply, SkillGapQuery)
from tesda_track.services import reports
from tesda_track.schemas.recommendation_analytics import RecommendationAnalytics, RecommendationAnalyticsPeriod
from tesda_track.services.recommendation_analytics import recommendation_analytics as build_recommendation_analytics

router = APIRouter(prefix="/admin/reports", tags=["admin: reports"], dependencies=[Depends(require_permission("reports:read"))])

Period = Annotated[DateRange, Query()]


@router.get("/recommendation-analytics", response_model=RecommendationAnalytics)
def recommendation_analytics(session: SessionDep, period: Annotated[RecommendationAnalyticsPeriod, Query()]):
    """Positive feedback by qualification, saved-session learner demand, and model/rules review priorities.

    Projections use two complete 30-day windows and sample/history gates. They are trend estimates,
    not trained forecasts. Positive answers are satisfaction responses, not enrollment or distinct people.
    """
    return build_recommendation_analytics(session, period)


@router.get("/overview", response_model=Overview)
def overview(session: SessionDep, period: Period):
    return reports.overview(session, period)


@router.get("/qualification-demand", response_model=list[QualificationDemand])
def qualification_demand(session: SessionDep, period: Period):
    """Per qualification: how often it was the top match or chosen, readiness, and assessment outcomes."""
    return reports.qualification_demand(session, period)


@router.get("/skill-gaps", response_model=list[CompetencyGap])
def skill_gaps(session: SessionDep, query: Annotated[SkillGapQuery, Query()]):
    """How learners rate themselves on each competency; a high gap rate suggests where training is needed."""
    return reports.skill_gaps(session, query.qualification_code,
                              DateRange(date_from=query.date_from, date_to=query.date_to))


@router.get("/funnel", response_model=Funnel)
def funnel(session: SessionDep, period: Period):
    """How many learners reached each stage, from registering to a verified certificate."""
    return reports.funnel(session, period)


@router.get("/feedback", response_model=FeedbackSummary)
def feedback(session: SessionDep, period: Period):
    """How satisfied learners were with their recommendation, and why not: overall, by where the qualification stood
    among their matches, by matching model and by qualification."""
    return reports.feedback(session, period)


@router.get("/supply", response_model=list[RegionSupply])
def supply(session: SessionDep):
    """Training and assessment capacity per region right now."""
    return reports.supply(session)


@router.get("/matching", response_model=MatchingReport)
def matching(session: SessionDep, period: Period):
    """Goal-matching requests and the share that found no match, per day. Anonymous counts only."""
    return reports.matching(session, period)
