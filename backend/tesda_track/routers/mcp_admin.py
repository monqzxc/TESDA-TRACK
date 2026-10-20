import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.exc import IntegrityError

from tesda_track.db import SessionDep
from tesda_track.deps import require_permission
from tesda_track.errors import ConflictError
from tesda_track.mcp.scopes import TOOL_SCOPES
from tesda_track.schemas.mcp_usage import (ApiClientCreate, ApiClientCredentials, ApiClientPublic,
                                          UsageReport)
from tesda_track.schemas.reports import DateRange
from tesda_track.services import mcp_usage, partner_clients

router = APIRouter(prefix="/admin/mcp", tags=["admin: mcp"], dependencies=[Depends(require_permission("mcp:manage"))])


@router.get("/tools", response_model=dict[str, str])
def tools() -> dict[str, str]:
    """Available MCP tool names and the scope required to call each one."""
    return TOOL_SCOPES


@router.get("/usage", response_model=UsageReport)
def usage(session: SessionDep, period: Annotated[DateRange, Query()]):
    """Which partner calls which tool, how often, and whether that matches what it declared."""
    return mcp_usage.usage_report(session, period)


@router.get("/clients", response_model=list[ApiClientPublic])
def clients(session: SessionDep):
    return partner_clients.list_clients(session)


@router.post("/clients", response_model=ApiClientCredentials, status_code=201)
def create_client(request: ApiClientCreate, session: SessionDep):
    client, secret = partner_clients.create_client(session, **request.model_dump())
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise ConflictError(f"A client named {request.name} already exists.") from None
    session.refresh(client)
    return ApiClientCredentials(client=client, client_secret=secret)


@router.post("/clients/{client_id}/rotate-secret", response_model=ApiClientCredentials)
def rotate_client_secret(client_id: uuid.UUID, session: SessionDep):
    client, secret = partner_clients.rotate_secret(session, client_id)
    session.commit()
    session.refresh(client)
    return ApiClientCredentials(client=client, client_secret=secret)


@router.post("/clients/{client_id}/revoke", response_model=ApiClientPublic)
def revoke_client(client_id: uuid.UUID, session: SessionDep):
    client = partner_clients.revoke_client(session, client_id)
    session.commit()
    session.refresh(client)
    return client
