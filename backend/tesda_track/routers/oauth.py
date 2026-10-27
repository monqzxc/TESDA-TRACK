"""OAuth 2.0 client credentials for partner systems (RFC 6749 section 4.4) and the server's metadata (RFC 8414)."""
import base64
import binascii
from typing import Annotated
from urllib.parse import unquote_plus

from fastapi import APIRouter, Form, Request
from fastapi.responses import JSONResponse

from tesda_track.config import get_settings
from tesda_track.db import SessionDep
from tesda_track.services import partner_clients
from tesda_track.services.partner_clients import OAuthError
from tesda_track.services.rate_limit import RateLimiter, client_address_key

router = APIRouter(prefix="/oauth", tags=["oauth"])
metadata_router = APIRouter()

TOKEN_REQUESTS_PER_MINUTE = 30
NO_STORE = {"Cache-Control": "no-store", "Pragma": "no-cache"}


def _error(error: str, description: str, status_code: int, headers: dict | None = None) -> JSONResponse:
    return JSONResponse({"error": error, "error_description": description}, status_code=status_code,
                        headers={**NO_STORE, **(headers or {})})


def _invalid_client() -> JSONResponse:
    return _error("invalid_client", "Client authentication failed.", 401,
                  {"WWW-Authenticate": 'Basic realm="tesda-track"'})


def _basic_credentials(header: str | None) -> tuple[str, str] | None:
    """(client_id, secret) from an HTTP Basic header, or None when there is none. ("", "") when it is unreadable."""
    if not header or not header.lower().startswith("basic "):
        return None
    try:
        decoded = base64.b64decode(header[6:].strip(), validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return "", ""
    client_id, separator, secret = decoded.partition(":")
    return (unquote_plus(client_id), unquote_plus(secret)) if separator else ("", "")


@router.post("/token", summary="Client credentials token for partner systems")
def token(request: Request, session: SessionDep, grant_type: Annotated[str | None, Form()] = None,
          scope: Annotated[str | None, Form()] = None, resource: Annotated[str | None, Form()] = None,
          client_id: Annotated[str | None, Form()] = None, client_secret: Annotated[str | None, Form()] = None):
    """Send the client id and secret as HTTP Basic (client_secret_basic) or as form fields (client_secret_post)."""
    settings = get_settings()
    credentials = _basic_credentials(request.headers.get("authorization"))
    if credentials is None and client_id and client_secret:
        credentials = (client_id, client_secret)
    # Keyed by the caller's address, not the claimed client id, so a stranger can't lock a partner out.
    wait = request.app.state.oauth_limits.hit(client_address_key(request), TOKEN_REQUESTS_PER_MINUTE)
    if wait:
        return JSONResponse({"error": "slow_down"}, status_code=429, headers={**NO_STORE, "Retry-After": str(int(wait) + 1)})
    if not grant_type:
        return _error("invalid_request", "grant_type is required.", 400)
    if grant_type != "client_credentials":
        return _error("unsupported_grant_type", "Only client_credentials is supported.", 400)
    if not credentials:
        return _invalid_client()
    client = partner_clients.authenticate_client(session, *credentials)
    if client is None:
        return _invalid_client()
    try:
        issued = partner_clients.issue_access_token(session, client, scope, resource, settings)
    except OAuthError as error:
        return _error(error.error, error.description, error.status_code)
    session.commit()
    return JSONResponse({"access_token": issued.access_token, "token_type": "Bearer", "expires_in": issued.expires_in,
                         "scope": issued.scope}, headers=NO_STORE)


@metadata_router.get("/.well-known/oauth-authorization-server", include_in_schema=False)
def authorization_server_metadata():
    settings = get_settings()
    return {"issuer": settings.public_base_url,
            "token_endpoint": f"{settings.public_base_url}/api/v1/oauth/token",
            "grant_types_supported": ["client_credentials"],
            "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],
            "scopes_supported": list(partner_clients.SCOPES),
            "response_types_supported": []}


def new_limits() -> RateLimiter:
    return RateLimiter()
