"""Password hashing (Argon2), signed access tokens (JWT, HS256) and the session cookie that can carry them."""
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash
from starlette.responses import Response

from tesda_track.config import Settings

ALGORITHM = "HS256"
# The browser app signs in with this cookie instead of a bearer header. It holds the same access token.
SESSION_COOKIE = "tesda_session"
_hasher = PasswordHash.recommended()
# Verified against when the email is unknown, so response timing doesn't reveal which accounts exist.
_DUMMY_HASH = _hasher.hash("timing-equalizer-not-a-real-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> tuple[bool, str | None]:
    """Returns (valid, new_hash); new_hash is set when the stored hash uses outdated parameters."""
    return _hasher.verify_and_update(password, password_hash)


def burn_verification_time(password: str) -> None:
    _hasher.verify(password, _DUMMY_HASH)


def create_access_token(learner_id: uuid.UUID, token_version: int, settings: Settings) -> tuple[str, int]:
    now = datetime.now(timezone.utc)
    lifetime = timedelta(minutes=settings.access_token_expire_minutes)
    claims = {"sub": str(learner_id), "ver": token_version, "iat": now, "exp": now + lifetime}
    return jwt.encode(claims, settings.secret_key.get_secret_value(), algorithm=ALGORITHM), int(lifetime.total_seconds())


def decode_access_token(token: str, settings: Settings) -> tuple[uuid.UUID, int]:
    """Raises jwt.InvalidTokenError (or ValueError) for anything other than a valid, unexpired token."""
    claims = jwt.decode(token, settings.secret_key.get_secret_value(), algorithms=[ALGORITHM],
                        options={"require": ["sub", "exp", "ver"]})
    return uuid.UUID(claims["sub"]), int(claims["ver"])


def _session_cookie_flags(settings: Settings) -> dict:
    # Scripts can't read it, other sites never get it, and outside local development it only travels over HTTPS.
    return {"path": "/api", "httponly": True, "samesite": "strict", "secure": settings.environment == "production"}


def set_session_cookie(response: Response, token: str, max_age: int, settings: Settings) -> None:
    response.set_cookie(SESSION_COOKIE, token, max_age=max_age, **_session_cookie_flags(settings))


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(SESSION_COOKIE, **_session_cookie_flags(settings))
