"""What MCP tools share with the REST API: the database session, the embedding model and who is calling."""
import uuid
from collections.abc import Iterator
from contextvars import ContextVar
from contextlib import contextmanager
from dataclasses import dataclass

from fastapi import FastAPI
from mcp.server.auth.middleware.auth_context import get_access_token
from sqlmodel import Session

from tesda_track.db import get_engine, get_session
from tesda_track.services.embeddings import Embedder, get_embedder


@dataclass(frozen=True)
class CallerPrincipal:
    client_id: uuid.UUID
    scopes: frozenset[str]
    expected_tools: tuple[str, ...]
    rate_limit_per_minute: int


@contextmanager
def open_session(app: FastAPI) -> Iterator[Session]:
    """The session the app's get_session override gives (the tests' rolled-back one, left open), else a new one."""
    override = app.dependency_overrides.get(get_session)
    if override is not None:
        yield override()
        return
    with Session(get_engine()) as session:
        yield session


def embedder(app: FastAPI) -> Embedder | None:
    return app.dependency_overrides.get(get_embedder, get_embedder)()


def principal() -> CallerPrincipal:
    """The partner client behind the current MCP request, from its verified access token."""
    token = get_access_token()
    if token is None:
        raise LookupError("No partner access token in this context.")
    claims = token.claims or {}
    return CallerPrincipal(client_id=uuid.UUID(token.client_id), scopes=frozenset(token.scopes),
                           expected_tools=tuple(claims["expected_tools"]),
                           rate_limit_per_minute=int(claims["rate_limit_per_minute"]))


# Sync tools run on a worker thread with a copy of the request's context, so a value set there would never reach the
# caller. The box is made by the caller (begin_ranking_audit) and shared by the copy.
_ranking_audit: ContextVar[list[int] | None] = ContextVar("mcp_ranking_audit", default=None)


def begin_ranking_audit() -> None:
    """Start collecting the ranking audit of the call about to run."""
    _ranking_audit.set([])


def note_ranking_audit(audit_id: int) -> None:
    """Record the ranking audit the running tool wrote, for the usage log. Nothing happens unless a call began one."""
    box = _ranking_audit.get()
    if box is not None:
        box.append(audit_id)


def take_ranking_audit() -> int | None:
    """The audit the call wrote, or None."""
    box = _ranking_audit.get()
    return box[-1] if box else None


def hide_inputs_in_errors(server) -> None:
    """The SDK puts a failed argument check's text in the tool error and logs it, input values included. Drop the values."""
    for tool in server._tool_manager.list_tools():
        model = tool.fn_metadata.arg_model
        model.model_config["hide_input_in_errors"] = True
        model.model_rebuild(force=True)
