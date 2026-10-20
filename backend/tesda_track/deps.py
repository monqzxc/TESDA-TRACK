"""Authentication dependencies shared by the routers."""
from typing import Annotated

import jwt
from fastapi import Depends, Request
from fastapi.security import APIKeyCookie, OAuth2PasswordBearer

from tesda_track.config import get_settings
from tesda_track.db import SessionDep
from tesda_track.errors import AuthenticationError, PermissionDeniedError, SessionCookieError
from tesda_track.models import Learner
from tesda_track.security import SESSION_COOKIE, decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)
cookie_scheme = APIKeyCookie(name=SESSION_COOKIE, scheme_name="SessionCookie", auto_error=False,
                             description="Set by POST /api/v1/auth/session. Writes must also send X-Requested-With.")
BearerToken = Annotated[str | None, Depends(oauth2_scheme)]
CookieToken = Annotated[str | None, Depends(cookie_scheme)]

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
REQUESTED_WITH_MISSING = "Requests signed in with the session cookie must send the X-Requested-With header."


def choose_token(bearer: str | None, cookie: str | None) -> tuple[str | None, bool]:
    """The token to check and whether it came from the cookie. A bearer header wins, so /api/docs and scripts
    behave the same whether or not the browser also holds a session cookie."""
    if bearer:
        return bearer, False
    return (cookie, True) if cookie else (None, False)


def check_requested_with(method: str, requested_with: str | None) -> None:
    """Other sites can't add custom headers to a request without the API's consent (CORS), so requiring one on
    writes stops cross-site requests from acting with the learner's cookie."""
    if method.upper() not in SAFE_METHODS and not requested_with:
        raise PermissionDeniedError(REQUESTED_WITH_MISSING)


def require_requested_with(request: Request) -> None:
    check_requested_with(request.method, request.headers.get("x-requested-with"))


RequestedWith = Depends(require_requested_with)


def get_current_learner(request: Request, session: SessionDep, bearer: BearerToken, cookie: CookieToken) -> Learner:
    token, by_cookie = choose_token(bearer, cookie)
    if not token:
        raise AuthenticationError("Sign in to continue.")
    if by_cookie:
        require_requested_with(request)
    # A bad cookie is cleared by the error response, so the browser stops sending it.
    expired = SessionCookieError if by_cookie else AuthenticationError
    try:
        learner_id, token_version = decode_access_token(token, get_settings())
    except (jwt.InvalidTokenError, ValueError):
        raise expired("Your session has expired. Please sign in again.") from None
    learner = session.get(Learner, learner_id)
    # token_version goes up on a password change, which revokes bearer tokens and cookies alike.
    if learner is None or not learner.is_active or learner.token_version != token_version:
        raise expired("Your session has expired. Please sign in again.")
    return learner


CurrentLearner = Annotated[Learner, Depends(get_current_learner)]


def get_optional_learner(request: Request, session: SessionDep, bearer: BearerToken,
                         cookie: CookieToken) -> Learner | None:
    """For endpoints that work signed out too; a token or cookie that is sent must still be valid."""
    return get_current_learner(request, session, bearer, cookie) if bearer or cookie else None


OptionalLearner = Annotated[Learner | None, Depends(get_optional_learner)]


def require_admin(learner: CurrentLearner) -> Learner:
    if learner.role != "admin":
        raise PermissionDeniedError("This action requires an administrator account.")
    return learner


AdminUser = Annotated[Learner, Depends(require_admin)]


def require_permission(permission: str):
    """Guard an endpoint with one permission from the fixed vocabulary. The account's permissions come from its
    role row and are read on every request, so re-scoping a role takes effect at once."""
    from tesda_track.rbac import PERMISSIONS

    # A typo here would be a guard nobody can satisfy, so fail at import rather than in production.
    if permission not in PERMISSIONS:
        raise ValueError(f"Unknown permission: {permission}")

    def check(learner: CurrentLearner) -> Learner:
        if permission not in learner.permissions:
            raise PermissionDeniedError("Your account does not have permission to perform this action.")
        return learner

    return check
