"""What MCP tools share with the REST API: the database session, the embedding model and who is calling."""
import uuid
from collections.abc import Iterator
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
