"""Partner API clients: registry, client-credentials sign-in and the access tokens the MCP server accepts."""
import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from sqlmodel import Session, select

from tesda_track.config import Settings
from tesda_track.errors import InvalidRequestError, NotFoundError
from tesda_track.models import ApiClient, utcnow
from tesda_track.security import ALGORITHM, burn_verification_time, hash_password, verify_password

SCOPES: tuple[str, ...] = ("catalog:read", "recommend:run", "reports:read")
_KEY_PURPOSE = b"tesda-track mcp access tokens"
_REQUIRED_CLAIMS = ["sub", "exp", "aud", "ver", "scope"]


@dataclass(frozen=True)
class IssuedToken:
    access_token: str
    expires_in: int
    scope: str


@dataclass(frozen=True)
class PartnerPrincipal:
    client_id: uuid.UUID
    name: str
    scopes: frozenset[str]
    expected_tools: tuple[str, ...]
    rate_limit_per_minute: int
    expires_at: int


class OAuthError(Exception):
    """An RFC 6749 error; the token route turns it into {"error", "error_description"}."""

    def __init__(self, error: str, description: str, status_code: int = 400):
        super().__init__(description)
        self.error = error
        self.description = description
        self.status_code = status_code


class InvalidPartnerToken(Exception):
    def __init__(self, reason: Literal["malformed", "expired", "audience", "revoked", "inactive"],
                 client_id: uuid.UUID | None = None):
        super().__init__(reason)
        self.reason = reason
        self.client_id = client_id


def mcp_resource_url(settings: Settings) -> str:
    return f"{settings.public_base_url}/mcp"


def mcp_signing_key(settings: Settings) -> bytes:
    """Never the learner signing key itself, so a partner token can't be replayed against the learner API."""
    if settings.mcp_token_secret:
        return settings.mcp_token_secret.get_secret_value().encode()
    return hmac.new(settings.secret_key.get_secret_value().encode(), _KEY_PURPOSE, hashlib.sha256).digest()


def _get(session: Session, client_id: uuid.UUID) -> ApiClient:
    client = session.get(ApiClient, client_id)
    if client is None:
        raise NotFoundError("No partner client has that id.")
    return client


def create_client(session: Session, *, name: str, organisation: str, declared_purpose: str, scopes: list[str],
                  expected_tools: list[str], contact_email: str | None = None,
                  rate_limit_per_minute: int = 120) -> tuple[ApiClient, str]:
    """Returns the client and its secret, which is stored only as a hash and can't be shown again."""
    unknown = [scope for scope in scopes if scope not in SCOPES]
    if unknown:
        raise InvalidRequestError(f"Unknown scope: {', '.join(unknown)}. Choose from {', '.join(SCOPES)}.")
    if rate_limit_per_minute < 1:
        raise InvalidRequestError("The rate limit must be at least 1 call per minute.")
    secret = secrets.token_urlsafe(32)
    client = ApiClient(name=name, organisation=organisation, contact_email=contact_email,
                       declared_purpose=declared_purpose, expected_tools=list(expected_tools),
                       scopes=list(dict.fromkeys(scopes)), rate_limit_per_minute=rate_limit_per_minute,
                       secret_hash=hash_password(secret))
    session.add(client)
    return client, secret


def rotate_secret(session: Session, client_id: uuid.UUID) -> tuple[ApiClient, str]:
    client = _get(session, client_id)
    secret = secrets.token_urlsafe(32)
    client.secret_hash = hash_password(secret)
    client.token_version += 1
    session.add(client)
    return client, secret


def revoke_client(session: Session, client_id: uuid.UUID) -> ApiClient:
    client = _get(session, client_id)
    client.is_active = False
    client.token_version += 1
    session.add(client)
    return client


def list_clients(session: Session) -> list[ApiClient]:
    return list(session.exec(select(ApiClient).order_by(ApiClient.name)))


def authenticate_client(session: Session, client_id: str, secret: str) -> ApiClient | None:
    """None for an unknown id, a wrong secret or a revoked client; all take about as long."""
    try:
        client = session.get(ApiClient, uuid.UUID(client_id))
    except ValueError:
        client = None
    if client is None:
        burn_verification_time(secret)
        return None
    valid, new_hash = verify_password(secret, client.secret_hash)
    if not valid or not client.is_active:
        return None
    if new_hash:
        client.secret_hash = new_hash
    return client


def issue_access_token(session: Session, client: ApiClient, requested_scope: str | None, resource: str | None,
                       settings: Settings) -> IssuedToken:
    if resource is not None and resource != mcp_resource_url(settings):
        raise OAuthError("invalid_target", "The resource must be this server's MCP endpoint.")
    requested = requested_scope.split() if requested_scope and requested_scope.strip() else list(client.scopes)
    if any(scope not in client.scopes for scope in requested):
        raise OAuthError("invalid_scope", "The requested scope is unknown or not granted to this client.")
    scope = " ".join(dict.fromkeys(requested))
    now = datetime.now(timezone.utc)
    lifetime = settings.mcp_token_lifetime_seconds
    claims = {"iss": settings.public_base_url, "aud": mcp_resource_url(settings), "sub": str(client.id),
              "scope": scope, "ver": client.token_version, "jti": uuid.uuid4().hex, "iat": now,
              "exp": now + timedelta(seconds=lifetime)}
    token = jwt.encode(claims, mcp_signing_key(settings), algorithm=ALGORITHM)
    client.last_token_at = utcnow()
    session.add(client)
    return IssuedToken(access_token=token, expires_in=lifetime, scope=scope)


def _unverified_client_id(token: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(jwt.decode(token, options={"verify_signature": False}).get("sub", ""))
    except (jwt.InvalidTokenError, ValueError, TypeError, AttributeError):
        return None


def verify_access_token(session: Session, token: str, settings: Settings) -> PartnerPrincipal:
    try:
        claims = jwt.decode(token, mcp_signing_key(settings), algorithms=[ALGORITHM],
                            audience=mcp_resource_url(settings), issuer=settings.public_base_url,
                            options={"require": _REQUIRED_CLAIMS})
    except jwt.ExpiredSignatureError:
        raise InvalidPartnerToken("expired", _unverified_client_id(token)) from None
    except jwt.InvalidAudienceError:
        raise InvalidPartnerToken("audience", _unverified_client_id(token)) from None
    except jwt.InvalidTokenError:
        raise InvalidPartnerToken("malformed") from None
    try:
        client_id = uuid.UUID(claims["sub"])
        version = int(claims["ver"])
    except (ValueError, TypeError):
        raise InvalidPartnerToken("malformed") from None
    client = session.get(ApiClient, client_id)
    if client is None:
        raise InvalidPartnerToken("malformed", client_id)
    if client.token_version != version:
        raise InvalidPartnerToken("revoked", client_id)
    if not client.is_active:
        raise InvalidPartnerToken("inactive", client_id)
    granted = frozenset(str(claims["scope"]).split()) & frozenset(client.scopes)
    return PartnerPrincipal(client_id=client.id, name=client.name, scopes=granted,
                            expected_tools=tuple(client.expected_tools),
                            rate_limit_per_minute=client.rate_limit_per_minute, expires_at=int(claims["exp"]))
