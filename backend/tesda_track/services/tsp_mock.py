"""A stand-in for TESDA Skill Passport and Hercules, for demos and tests (docs/tsp-mock.md).

With TSP_MOCK_ENABLED on, nothing is sent to the real TSP. The synthetic accounts in seed/tsp_mock_accounts.json
play TSP's learners: issue_code is TSP's sign-in (username and password in, one-time handoff code out), and client
is a HerculesClient whose transport answers /v1/tracker/token and /v1/tracker/profile here, in Hercules' own wire
format. Everything after the code (the exchange, parsing, consent, the linked account) is the real sign-in path.

Codes and tokens are signed with SECRET_KEY and carry an audience, so neither passes for a session token. A code
works once per API process, for 60 seconds.
"""
import json
import secrets
import threading
import time
import uuid
from functools import lru_cache, partial
from pathlib import Path

import httpx
import jwt
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, SecretStr

from tesda_track.config import Settings
from tesda_track.schemas.hercules import TrackerProfile
from tesda_track.services.hercules import HerculesClient

ACCOUNTS_PATH = Path(__file__).resolve().parents[2] / "seed" / "tsp_mock_accounts.json"
ALGORITHM = "HS256"
CODE_AUDIENCE, TOKEN_AUDIENCE = "tsp-mock-handoff", "tsp-mock-tracker"
CODE_LIFETIME_SECONDS, TOKEN_LIFETIME_SECONDS = 60, 900
SCOPES = "profile skills experience credentials"

_spent: dict[str, float] = {}  # jti of each code already exchanged -> when it expires
_spent_lock = threading.Lock()


class MockAccount(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=10, max_length=128)
    learner_type: str
    # As Hercules sends it, so the same parsing applies as for a real profile.
    profile: dict


@lru_cache
def accounts() -> tuple[MockAccount, ...]:
    loaded = tuple(MockAccount.model_validate(item) for item in json.loads(ACCOUNTS_PATH.read_text("utf-8")))
    for account in loaded:
        TrackerProfile.model_validate(account.profile)
    if len({a.username.casefold() for a in loaded}) != len(loaded) or \
            len({a.profile["sso_id"] for a in loaded}) != len(loaded):
        raise ValueError("Mock TSP usernames and sso_ids must be unique.")
    return loaded


def issue_code(settings: Settings, username: str, password: str) -> str | None:
    """The handoff code for a synthetic account, or None for a wrong username or password."""
    wanted = username.strip().casefold()
    account = next((a for a in accounts() if a.username.casefold() == wanted), None)
    # Compared even for an unknown username, so the answer takes as long either way.
    expected = account.password if account else secrets.token_urlsafe(16)
    if not secrets.compare_digest(password.encode(), expected.encode()) or account is None:
        return None
    return _sign(settings, account.profile["sso_id"], CODE_AUDIENCE, CODE_LIFETIME_SECONDS)


def client(settings: Settings) -> HerculesClient:
    """A HerculesClient that never leaves this process, whatever HERCULES_BASE_URL is set to."""
    stand_in = settings.model_copy(update={"hercules_base_url": HttpUrl("https://tsp-mock.invalid"),
                                           "tracker_client_id": "tesda-tracker-mock",
                                           "tracker_client_secret": SecretStr("not-a-secret")})
    return HerculesClient(stand_in, transport=httpx.MockTransport(partial(_answer, settings)))


def _answer(settings: Settings, request: httpx.Request) -> httpx.Response:
    path = request.url.path
    if request.method == "POST" and path.endswith("/v1/tracker/token"):
        try:
            code = json.loads(request.content).get("code")
        except (ValueError, AttributeError):
            code = None
        claims = _read(settings, code, CODE_AUDIENCE)
        if claims is None or not _spend(claims):
            return _refusal(400, "Invalid or expired handoff code.", "Bad Request")
        token = _sign(settings, claims["sub"], TOKEN_AUDIENCE, TOKEN_LIFETIME_SECONDS)
        return _success({"access_token": token, "token_type": "Bearer", "expires_in": TOKEN_LIFETIME_SECONDS,
                         "scope": SCOPES})
    if request.method == "GET" and path.endswith("/v1/tracker/profile"):
        claims = _read(settings, request.headers.get("authorization", "").removeprefix("Bearer "), TOKEN_AUDIENCE)
        profile = claims and next((a.profile for a in accounts() if a.profile["sso_id"] == claims["sub"]), None)
        if not profile:
            return _refusal(401, "Unauthorized", "Unauthorized")
        return _success(profile)
    return _refusal(404, "Not Found", "Not Found")


def _success(data: dict) -> httpx.Response:
    return httpx.Response(200, json={"success": True, "data": data})


def _refusal(status: int, message: str, error: str) -> httpx.Response:
    return httpx.Response(status, json={"message": message, "error": error, "statusCode": status})


def _sign(settings: Settings, subject: str, audience: str, lifetime: int) -> str:
    claims = {"sub": subject, "aud": audience, "exp": int(time.time()) + lifetime, "jti": uuid.uuid4().hex}
    return jwt.encode(claims, settings.secret_key.get_secret_value(), algorithm=ALGORITHM)


def _read(settings: Settings, token, audience: str) -> dict | None:
    if not isinstance(token, str) or not token:
        return None
    try:
        return jwt.decode(token, settings.secret_key.get_secret_value(), algorithms=[ALGORITHM], audience=audience,
                          options={"require": ["sub", "aud", "exp", "jti"]})
    except jwt.InvalidTokenError:
        return None


def _spend(claims: dict) -> bool:
    """True the first time a code is exchanged."""
    now = time.time()
    with _spent_lock:
        for jti in [jti for jti, expires in _spent.items() if expires <= now]:
            del _spent[jti]
        if claims["jti"] in _spent:
            return False
        _spent[claims["jti"]] = claims["exp"]
        return True
