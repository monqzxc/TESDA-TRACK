from typing import Annotated

from fastapi import APIRouter, Depends, Query

from tesda_track.db import SessionDep
from tesda_track.deps import require_permission
from tesda_track.schemas.mcp_usage import ApiClientPublic, UsageReport
from tesda_track.schemas.reports import DateRange
from tesda_track.services import mcp_usage, partner_clients

router = APIRouter(prefix="/admin/mcp", tags=["admin: mcp"], dependencies=[Depends(require_permission("mcp:manage"))])


@router.get("/usage", response_model=UsageReport)
def usage(session: SessionDep, period: Annotated[DateRange, Query()]):
    """Which partner calls which tool, how often, and whether that matches what it declared."""
    return mcp_usage.usage_report(session, period)


@router.get("/clients", response_model=list[ApiClientPublic])
def clients(session: SessionDep):
    return partner_clients.list_clients(session)
