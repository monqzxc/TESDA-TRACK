"""Database-free checks of cookie sign-in. Run with --confcutdir=backend/tests/unit."""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from starlette.requests import Request
from starlette.responses import Response

from tesda_track import deps
from tesda_track.config import Settings
from tesda_track.db import get_session
from tesda_track.errors import AuthenticationError, DomainError, PermissionDeniedError, SessionCookieError
from tesda_track.routers import auth
from tesda_track.security import (SESSION_COOKIE, clear_session_cookie, create_access_token,
                                  set_session_cookie)


def settings(**kwargs):
    return Settings(_env_file=None, database_url="postgresql://unused", secret_key="test-only-" * 8, **kwargs)


def account(token_version=0, is_active=True):
    # `permissions` is a property on the real Learner, read from its role row; the stand-in has to carry it too.
    return SimpleNamespace(id=uuid.uuid4(), email="juan@example.com", full_name="Juan Dela Cruz", role="learner",
                           permissions=[], created_at=datetime.now(timezone.utc), token_version=token_version,
                           is_active=is_active)


class FakeSession:
    def __init__(self, *learners):
        self.learners = {learner.id: learner for learner in learners}

    def get(self, model, learner_id):
        return self.learners.get(learner_id)


def request(method="GET", **headers):
    return Request({"type": "http", "method": method,
                    "headers": [(name.replace("_", "-").encode(), value.encode()) for name, value in headers.items()]})


def set_cookie_header(response: Response) -> str:
    return response.headers["set-cookie"].lower()


@pytest.fixture
def test_settings(monkeypatch):
    test_settings = settings(environment="test")
    monkeypatch.setattr(deps, "get_settings", lambda: test_settings)
    monkeypatch.setattr(auth, "get_settings", lambda: test_settings)
    return test_settings


def test_a_bearer_header_wins_over_the_cookie():
    assert deps.choose_token("bearer", "cookie") == ("bearer", False)
    assert deps.choose_token(None, "cookie") == ("cookie", True)
    assert deps.choose_token(None, "") == (None, False)
    assert deps.choose_token(None, None) == (None, False)


@pytest.mark.parametrize("method", ["GET", "HEAD", "OPTIONS", "get"])
def test_reads_need_no_requested_with_header(method):
    deps.check_requested_with(method, None)


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
def test_writes_need_a_requested_with_header(method):
    with pytest.raises(PermissionDeniedError, match="X-Requested-With"):
        deps.check_requested_with(method, None)
    with pytest.raises(PermissionDeniedError):
        deps.check_requested_with(method, "")
    deps.check_requested_with(method, "fetch")


@pytest.mark.parametrize("environment, secure", [("development", False), ("test", False), ("production", True)])
def test_session_cookie_flags(environment, secure):
    response = Response()
    set_session_cookie(response, "the-token", 480 * 60, settings(environment=environment))
    header = set_cookie_header(response)
    assert header.startswith(f"{SESSION_COOKIE}=the-token;")
    assert "httponly" in header and "samesite=strict" in header and "path=/api" in header
    assert "max-age=28800" in header
    assert ("secure" in header.split("; ")) is secure


def test_clearing_the_cookie_uses_the_same_flags():
    response = Response()
    clear_session_cookie(response, settings(environment="production"))
    header = set_cookie_header(response)
    assert header.startswith(f'{SESSION_COOKIE}="";')
    assert "max-age=0" in header and "path=/api" in header and "httponly" in header
    assert "samesite=strict" in header and "secure" in header.split("; ")


def test_signed_in_by_cookie_reads_without_the_header(test_settings):
    learner = account()
    token, _ = create_access_token(learner.id, 0, test_settings)
    assert deps.get_current_learner(request("GET"), FakeSession(learner), None, token) is learner


def test_cookie_writes_need_the_header_and_bearer_writes_do_not(test_settings):
    learner = account()
    token, _ = create_access_token(learner.id, 0, test_settings)
    session = FakeSession(learner)
    with pytest.raises(PermissionDeniedError):
        deps.get_current_learner(request("POST"), session, None, token)
    assert deps.get_current_learner(request("POST", x_requested_with="fetch"), session, None, token) is learner
    assert deps.get_current_learner(request("DELETE"), session, token, None) is learner
    assert deps.get_current_learner(request("PATCH"), session, token, "stale-cookie") is learner


def test_bad_cookies_raise_the_error_that_clears_them(test_settings):
    learner = account(token_version=1)
    revoked, _ = create_access_token(learner.id, 0, test_settings)
    session = FakeSession(learner)
    for cookie in ("not-a-jwt", revoked):
        with pytest.raises(SessionCookieError):
            deps.get_current_learner(request("GET"), session, None, cookie)
        with pytest.raises(AuthenticationError) as raised:
            deps.get_current_learner(request("GET"), session, cookie, None)
        assert not isinstance(raised.value, SessionCookieError)


def test_optional_learner_reads_the_cookie(test_settings):
    learner = account()
    token, _ = create_access_token(learner.id, 0, test_settings)
    session = FakeSession(learner)
    assert deps.get_optional_learner(request("GET"), session, None, None) is None
    assert deps.get_optional_learner(request("GET"), session, None, token) is learner
    with pytest.raises(PermissionDeniedError):
        deps.get_optional_learner(request("POST"), session, None, token)


@pytest.fixture
def auth_client(test_settings, monkeypatch):
    learner = account()
    monkeypatch.setattr(auth.accounts, "authenticate", lambda session, email, password, settings: learner)
    app = FastAPI()
    app.include_router(auth.router, prefix="/api/v1")
    app.dependency_overrides[get_session] = lambda: FakeSession(learner)
    # A stand-in for tesda_track.main's handler, which needs the full app and its settings.
    app.add_exception_handler(DomainError, lambda request, error: JSONResponse({"detail": error.detail},
                                                                               status_code=error.status_code))
    return TestClient(app)


def test_session_sign_in_sets_the_cookie_but_returns_no_token(auth_client, test_settings):
    response = auth_client.post("/api/v1/auth/session", data={"username": "juan@example.com", "password": "x"},
                                headers={"X-Requested-With": "fetch"})
    assert response.status_code == 200
    body = response.json()
    assert body["learner"]["email"] == "juan@example.com"
    assert body["expires_in"] == test_settings.access_token_expire_minutes * 60
    assert "access_token" not in body
    token = response.cookies[SESSION_COOKIE]
    assert token not in response.text
    header = response.headers["set-cookie"].lower()
    assert "httponly" in header and "samesite=strict" in header and "path=/api" in header
    assert f"max-age={test_settings.access_token_expire_minutes * 60}" in header


def test_session_routes_need_the_requested_with_header(auth_client):
    sign_in = auth_client.post("/api/v1/auth/session", data={"username": "juan@example.com", "password": "x"})
    sign_out = auth_client.delete("/api/v1/auth/session")
    assert sign_in.status_code == 403 and sign_out.status_code == 403
    assert sign_in.json() == {"detail": deps.REQUESTED_WITH_MISSING}
    assert "set-cookie" not in sign_in.headers


def test_session_sign_out_clears_the_cookie(auth_client):
    response = auth_client.delete("/api/v1/auth/session", headers={"X-Requested-With": "fetch"})
    assert response.status_code == 204
    header = response.headers["set-cookie"].lower()
    assert header.startswith(f'{SESSION_COOKIE}="";') and "max-age=0" in header and "path=/api" in header
