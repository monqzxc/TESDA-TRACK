"""Client for Hercules, TSP's identity backend, as the Tracker backend uses it (31-TRACKER_IFRAME_INTEGRATION.md).

The embedded app hands this server a one-time code that TESDA Skill Passport got for the learner. exchange_code
trades it, with this portal's client credentials, for a short-lived scoped token, and fetch_profile reads the
learner's profile with that token. The client secret is only ever sent to Hercules. Nothing sent or received is
logged: not the code, the secret, the token or any profile value; only statuses and Hercules' error names.

Successful answers are wrapped as {"success": true, "data": {...}}. Errors are not (seen on staging, 2026-11-05):
{"message": str | [str], "error": str, "statusCode": int}.
"""
import logging
from dataclasses import dataclass, field

import httpx
from pydantic import ValidationError

from tesda_track.config import Settings
from tesda_track.schemas.hercules import SENSITIVE_FIELDS, PersonalInformation, TrackerCredentials, TrackerProfile

logger = logging.getLogger("tesda_track")

NOT_CONFIGURED = "Signing in from TESDA Skill Passport isn't set up on this server."
UNAVAILABLE = "TESDA Skill Passport is unavailable right now. Please try again shortly."
CLIENT_REJECTED = "TESDA Skill Passport did not accept this portal's sign-in. Please contact the portal administrator."
SIGN_IN_EXPIRED = ("Your TESDA Skill Passport sign-in has expired. "
                   "Please open TESDA-TRACK from the Skill Passport again.")

MAX_RESPONSE_BYTES = 2_000_000
CODE_MAX_LENGTH = 4096  # Hercules refuses longer codes.
ASSUMED_TOKEN_LIFETIME_SECONDS = 900  # The spec's 15 minutes, when Hercules gives no expires_in.
# How Hercules refuses a client id and secret, as opposed to a code: the first needs an operator, the second
# only a new code.
WRONG_CLIENT_MESSAGE = "Invalid tracker client credentials."


class HerculesError(Exception):
    """str(error) is safe to show a learner."""
    message = UNAVAILABLE

    def __init__(self):
        super().__init__(self.message)


class HerculesNotConfigured(HerculesError):
    message = NOT_CONFIGURED


class HerculesUnavailable(HerculesError):
    message = UNAVAILABLE


class HerculesClientRejected(HerculesError):
    message = CLIENT_REJECTED


class HerculesCodeRejected(HerculesError):
    """The code expired, was used already or was never valid. TSP can hand the app a new one."""
    message = SIGN_IN_EXPIRED


class HerculesTokenRejected(HerculesError):
    message = SIGN_IN_EXPIRED


@dataclass(frozen=True)
class TrackerToken:
    access_token: str = field(repr=False)
    expires_in: int
    scopes: frozenset[str]


def parse_profile(data: dict) -> TrackerProfile:
    try:
        return TrackerProfile.model_validate(data)
    except ValidationError as error:
        # The validation error quotes the input, which is the learner's personal information: never chain it.
        logger.warning("Hercules sent a profile TESDA-TRACK can't read (%d problems)", error.error_count())
        raise HerculesUnavailable() from None


def describe_profile(data: dict) -> dict:
    """The shape of a profile as Hercules sent it, for checking it against the spec: field names, counts and item
    keys, never values. The sso_id shows only its first 4 characters."""
    personal = data.get("personal_information")
    personal = personal if isinstance(personal, dict) else {}
    credentials = data.get("credentials")
    credentials = credentials if isinstance(credentials, dict) else {}
    sections = {name: _section(data.get(name)) for name in ("skills", "experience", "education", "qualifications")}
    sections |= {f"credentials.{name}": _section(credentials.get(name)) for name in TrackerCredentials.model_fields}
    sso_id = str(data.get("sso_id") or "")
    return {
        "sso_id": f"{sso_id[:4]}… ({len(sso_id)} chars)",
        "uli": bool(data.get("uli")),
        "personal_information": sorted(key for key, value in personal.items()
                                       if key in PersonalInformation.model_fields and value),
        "sections": sections,
        "unexpected_fields": sorted([key for key in data if key not in TrackerProfile.model_fields]
                                    + [f"personal_information.{key}" for key in personal
                                       if key not in PersonalInformation.model_fields]),
        "sensitive_fields_sent": sorted(SENSITIVE_FIELDS & (data.keys() | personal.keys())),
    }


def _section(items) -> dict:
    items = items if isinstance(items, list) else []
    keys = {key for item in items if isinstance(item, dict) for key in item}
    types = {type(item).__name__ for item in items if not isinstance(item, dict)}
    return {"count": len(items), "item_keys": sorted(keys | types)}


class HerculesClient:
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None):
        if not settings.tracker_integration_enabled:
            raise HerculesNotConfigured()
        self.settings = settings
        self.transport = transport
        self.base_url = str(settings.hercules_base_url).rstrip("/")

    def exchange_code(self, code: str) -> TrackerToken:
        """Never retried: the code works once, and Hercules may have spent it before its answer was lost."""
        if not code or len(code) > CODE_MAX_LENGTH:
            raise HerculesCodeRejected()
        body = {"code": code, "client_id": self.settings.tracker_client_id,
                "client_secret": self.settings.tracker_client_secret.get_secret_value()}
        response, payload = self._send("POST", "/v1/tracker/token", "token exchange", json=body)
        if response.status_code == 401 and payload.get("message") == WRONG_CLIENT_MESSAGE:
            logger.error("Hercules refused this portal's client credentials (TRACKER_CLIENT_ID %r)",
                         self.settings.tracker_client_id)
            raise HerculesClientRejected()
        if response.is_client_error:
            _log_refusal("token exchange", response, payload)
            raise HerculesCodeRejected()
        data = _data(response, payload, "token exchange")
        token = data.get("access_token")
        if not isinstance(token, str) or not token or str(data.get("token_type")).lower() != "bearer":
            logger.warning("Hercules token exchange gave no bearer token")
            raise HerculesUnavailable()
        expires_in = data.get("expires_in")
        if isinstance(expires_in, bool) or not isinstance(expires_in, int) or expires_in <= 0:
            expires_in = ASSUMED_TOKEN_LIFETIME_SECONDS
        scope = data.get("scope")
        return TrackerToken(token, expires_in, frozenset(scope.split()) if isinstance(scope, str) else frozenset())

    def fetch_profile_data(self, token: TrackerToken) -> dict:
        """The profile as Hercules sent it, unchecked. Use fetch_profile unless the raw shape is what's wanted."""
        response, payload = self._send("GET", "/v1/tracker/profile", "profile request",
                                       headers={"Authorization": f"Bearer {token.access_token}"})
        if response.status_code == 401:
            _log_refusal("profile request", response, payload)
            raise HerculesTokenRejected()
        return _data(response, payload, "profile request")

    def fetch_profile(self, token: TrackerToken) -> TrackerProfile:
        return parse_profile(self.fetch_profile_data(token))

    def _send(self, method: str, path: str, what: str, **kwargs) -> tuple[httpx.Response, dict]:
        """The response and its JSON object. Anything that isn't Hercules answering in JSON (a timeout, a server
        or proxy error, a redirect, an oversized or non-JSON body) is HerculesUnavailable."""
        headers = {"Accept": "application/json", **kwargs.pop("headers", {})}
        try:
            with httpx.Client(timeout=self.settings.hercules_timeout_seconds, transport=self.transport,
                              follow_redirects=False) as http:
                response = http.request(method, self.base_url + path, headers=headers, **kwargs)
        except httpx.HTTPError as error:
            logger.warning("Hercules %s failed: %s", what, type(error).__name__)
            raise HerculesUnavailable() from error
        if response.is_server_error or response.is_redirect or len(response.content) > MAX_RESPONSE_BYTES:
            logger.warning("Hercules %s failed: HTTP %d, %d bytes", what, response.status_code, len(response.content))
            raise HerculesUnavailable()
        try:
            payload = response.json()
        except ValueError:
            payload = None
        if not isinstance(payload, dict):
            logger.warning("Hercules %s failed: HTTP %d without a JSON object", what, response.status_code)
            raise HerculesUnavailable()
        return response, payload


def _data(response: httpx.Response, payload: dict, what: str) -> dict:
    data = payload.get("data")
    if not response.is_success or payload.get("success") is not True or not isinstance(data, dict):
        logger.warning("Hercules %s failed: HTTP %d, not a successful answer", what, response.status_code)
        raise HerculesUnavailable()
    return data


def _log_refusal(what: str, response: httpx.Response, payload: dict) -> None:
    # Only the error name: Hercules' message may quote what it was sent.
    error = payload.get("error")
    logger.warning("Hercules refused the %s: HTTP %d %s", what, response.status_code,
                   error[:60] if isinstance(error, str) else "")
