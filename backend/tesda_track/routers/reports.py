from typing import Annotated

from fastapi import APIRouter, Depends, Query

from tesda_track.db import SessionDep
from tesda_track.deps import require_admin
from tesda_track.schemas.reports import (CompetencyGap, DateRange, Funnel, Overview, QualificationDemand,
                                         RegionSupply, SkillGapQuery)
from tesda_track.services import reports

router = APIRouter(prefix="/admin/reports", tags=["admin: reports"], dependencies=[Depends(require_admin)])

Period = Annotated[DateRange, Query()]


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


@router.get("/supply", response_model=list[RegionSupply])
def supply(session: SessionDep):
    """Training and assessment capacity per region right now."""
    return reports.supply(session)
