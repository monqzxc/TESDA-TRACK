"""Database-free checks of the Hercules client, against a fake Hercules (no network). Error bodies are the ones
Hercules staging gave on 2026-11-05. Run with --confcutdir=backend/tests/unit."""
import json
import logging

import httpx
import pytest

from tesda_track.config import Settings
from tesda_track.schemas.hercules import SENSITIVE_FIELDS
from tesda_track.services.hercules import (CLIENT_REJECTED, SIGN_IN_EXPIRED, UNAVAILABLE, HerculesClient,
                                           HerculesClientRejected, HerculesCodeRejected, HerculesError,
                                           HerculesNotConfigured, HerculesTokenRejected, HerculesUnavailable,
                                           TrackerToken)

CODE = "code-xyz"
SECRET = "s" * 64
HERCULES = dict(hercules_base_url="https://hercules.example.test", tracker_client_id="tesda-tracker",
                tracker_client_secret=SECRET)
TOKEN_OK_DATA = {"access_token": "tok-123", "token_type": "Bearer", "expires_in": 900,
                 "scope": "profile skills experience credentials"}
TOKEN = TrackerToken("tok-123", 900, frozenset({"profile", "skills", "experience", "credentials"}))
PROFILE_DATA = {"sso_id": "sso-abc", "uli": "ULI-1",
                "personal_information": {"first_name": "Juana", "mobile_number": "+639170000000"},
                "skills": [{"name": "Welding", "level": "NC II"}]}
WRONG_CLIENT = {"message": "Invalid tracker client credentials.", "error": "Unauthorized", "statusCode": 401}
TOKEN_MISSING = {"message": "Tracker access token is missing.", "error": "Unauthorized", "statusCode": 401}


def ok(data):
    return httpx.Response(200, json={"success": True, "data": data})


def refused(status, message="Handoff code is invalid or has expired."):
    return httpx.Response(status, json={"message": message, "error": "Refused", "statusCode": status})


def timeout(request):
    raise httpx.ConnectTimeout("timed out", request=request)


class FakeHercules:
    """Answers POST /v1/tracker/token with ``token_response`` and GET /v1/tracker/profile with
    ``profile_response``: an httpx.Response, or a callable taking the request (which may raise)."""

    def __init__(self, token_response=None, profile_response=None):
        self.token_response = token_response or ok(TOKEN_OK_DATA)
        self.profile_response = profile_response or ok(PROFILE_DATA)
        self.requests = []

    def __call__(self, request):
        self.requests.append(request)
        response = self.token_response if request.url.path.endswith("/v1/tracker/token") else self.profile_response
        return response(request) if callable(response) else response


def settings(**overrides):
    return Settings(_env_file=None, database_url="postgresql://unused", secret_key="test-only-" * 8,
                    **{**HERCULES, **overrides})


def client(fake, **overrides):
    return HerculesClient(settings(**overrides), transport=httpx.MockTransport(fake))


def test_exchange_posts_code_and_credentials_as_json():
    fake = FakeHercules()
    token = client(fake).exchange_code(CODE)
    request = fake.requests[0]
    assert (request.method, str(request.url)) == ("POST", "https://hercules.example.test/v1/tracker/token")
    assert json.loads(request.content) == {"code": CODE, "client_id": "tesda-tracker", "client_secret": SECRET}
    assert token == TOKEN


def test_base_url_path_prefix_and_trailing_slash_kept():
    fake = FakeHercules()
    client(fake, hercules_base_url="https://hercules.example.test/api/").exchange_code(CODE)
    assert fake.requests[0].url.path == "/api/v1/tracker/token"


def test_wrong_client_credentials_raise_client_rejected():
    with pytest.raises(HerculesClientRejected) as error:
        client(FakeHercules(token_response=httpx.Response(401, json=WRONG_CLIENT))).exchange_code(CODE)
    assert str(error.value) == CLIENT_REJECTED


@pytest.mark.parametrize("status", [400, 401, 403, 404, 410])
def test_other_refusals_mean_the_code_is_spent(status):
    with pytest.raises(HerculesCodeRejected) as error:
        client(FakeHercules(token_response=refused(status))).exchange_code(CODE)
    assert str(error.value) == SIGN_IN_EXPIRED


@pytest.mark.parametrize("code", ["", "x" * 4097])
def test_impossible_codes_are_refused_without_a_request(code):
    fake = FakeHercules()
    with pytest.raises(HerculesCodeRejected):
        client(fake).exchange_code(code)
    assert fake.requests == []


@pytest.mark.parametrize("response", [
    httpx.Response(502, text="<html>Bad gateway</html>"),
    httpx.Response(200, text="not json"),
    httpx.Response(200, json=["not", "an", "object"]),
    httpx.Response(200, json={"success": False, "data": None}),
    httpx.Response(200, json={"success": True, "data": {"token_type": "Bearer", "expires_in": 900}}),
    httpx.Response(200, json={"success": True, "data": {**TOKEN_OK_DATA, "token_type": "mac"}}),
    httpx.Response(302, headers={"Location": "https://elsewhere.example.test/"}),
    httpx.Response(200, content=b"x" * 2_000_001),
], ids=["502", "not-json", "not-object", "success-false", "no-token", "not-bearer", "redirect", "too-large"])
def test_unusable_token_responses_mean_unavailable(response):
    with pytest.raises(HerculesUnavailable) as error:
        client(FakeHercules(token_response=response)).exchange_code(CODE)
    assert str(error.value) == UNAVAILABLE


def test_timeouts_mean_unavailable():
    with pytest.raises(HerculesUnavailable):
        client(FakeHercules(token_response=timeout)).exchange_code(CODE)


@pytest.mark.parametrize("response", [httpx.Response(502, text="Bad gateway"), timeout], ids=["502", "timeout"])
def test_exchange_is_never_retried(response):
    # The code works once and may already be spent; a second try can't help and might sign in twice.
    fake = FakeHercules(token_response=response)
    with pytest.raises(HerculesUnavailable):
        client(fake).exchange_code(CODE)
    assert len(fake.requests) == 1


def test_missing_expires_in_assumes_fifteen_minutes():
    data = {key: value for key, value in TOKEN_OK_DATA.items() if key != "expires_in"}
    assert client(FakeHercules(token_response=ok(data))).exchange_code(CODE).expires_in == 900


def test_narrower_scope_is_reported_as_granted():
    token = client(FakeHercules(token_response=ok({**TOKEN_OK_DATA, "scope": "profile"}))).exchange_code(CODE)
    assert token.scopes == frozenset({"profile"})


def test_profile_uses_the_bearer_token_and_no_sso_id():
    fake = FakeHercules()
    profile = client(fake).fetch_profile(TOKEN)
    request = fake.requests[0]
    assert (request.method, str(request.url)) == ("GET", "https://hercules.example.test/v1/tracker/profile")
    assert request.headers["Authorization"] == "Bearer tok-123" and not request.url.query
    assert profile.sso_id == "sso-abc" and profile.skills == [{"name": "Welding", "level": "NC II"}]


def test_profile_drops_sensitive_fields():
    data = {**PROFILE_DATA, "nat_id": "1234-5678", "digital_id": "D-1", "blood_type": "O+",
            "personal_information": {**PROFILE_DATA["personal_information"], "face_url": "https://faces.example/1"}}
    profile = client(FakeHercules(profile_response=ok(data))).fetch_profile(TOKEN)
    dumped = json.dumps(profile.model_dump())
    assert not any(name in dumped for name in SENSITIVE_FIELDS)
    assert profile.personal_information.first_name == "Juana"


def test_profile_sections_missing_for_narrower_scope_are_empty():
    profile = client(FakeHercules(profile_response=ok({"sso_id": "sso-abc"}))).fetch_profile(TOKEN)
    assert profile.skills == [] and profile.credentials.certificates == []
    assert profile.personal_information.first_name is None


def test_expired_profile_token_raises_token_rejected():
    with pytest.raises(HerculesTokenRejected) as error:
        client(FakeHercules(profile_response=httpx.Response(401, json=TOKEN_MISSING))).fetch_profile(TOKEN)
    assert str(error.value) == SIGN_IN_EXPIRED


@pytest.mark.parametrize("data", [{}, {"sso_id": ""}, {"sso_id": 42}, {"sso_id": "a", "skills": "Welding"}],
                         ids=["no-sso-id", "empty-sso-id", "number-sso-id", "skills-not-a-list"])
def test_malformed_profiles_mean_unavailable(data):
    with pytest.raises(HerculesUnavailable):
        client(FakeHercules(profile_response=ok(data))).fetch_profile(TOKEN)


@pytest.mark.parametrize("response", [httpx.Response(500, text="oops"), timeout], ids=["500", "timeout"])
def test_profile_server_errors_mean_unavailable(response):
    with pytest.raises(HerculesUnavailable):
        client(FakeHercules(profile_response=response)).fetch_profile(TOKEN)


def test_failures_never_log_secret_code_or_token(caplog):
    caplog.set_level(logging.DEBUG)
    failures = [
        (FakeHercules(token_response=httpx.Response(401, json=WRONG_CLIENT)), "exchange"),
        (FakeHercules(token_response=refused(400, f"code {CODE} is invalid")), "exchange"),
        (FakeHercules(token_response=httpx.Response(502, text="Bad gateway")), "exchange"),
        (FakeHercules(token_response=timeout), "exchange"),
        (FakeHercules(profile_response=httpx.Response(401, json=TOKEN_MISSING)), "profile"),
        (FakeHercules(profile_response=ok({**PROFILE_DATA, "sso_id": 42})), "profile"),
    ]
    messages = []
    for fake, call in failures:
        with pytest.raises(HerculesError) as error:
            client(fake).exchange_code(CODE) if call == "exchange" else client(fake).fetch_profile(TOKEN)
        messages.append(str(error.value))
    assert caplog.records, "failures should be logged for operators"
    for text in (caplog.text, *messages):
        assert not any(value in text for value in (SECRET, CODE, "tok-123", "Juana", "+639170000000"))


def test_token_repr_hides_access_token():
    assert "tok-123" not in repr(TOKEN)


def test_unconfigured_settings_raise_not_configured():
    unconfigured = Settings(_env_file=None, database_url="postgresql://unused", secret_key="test-only-" * 8)
    with pytest.raises(HerculesNotConfigured):
        HerculesClient(unconfigured)
