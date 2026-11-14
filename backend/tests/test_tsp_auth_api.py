"""POST /api/v1/auth/tsp/session and /api/v1/auth/tsp/consent, with Hercules faked (no network)."""
import httpx
import pytest
from pydantic import HttpUrl, SecretStr

from tesda_track.config import get_settings
from tesda_track.routers.tsp_auth import RATE_LIMIT_PER_MINUTE, hercules_client
from tesda_track.services.hercules import HerculesClient

PROFILE = {"sso_id": "sso-abc", "uli": "ULI-1",
           "personal_information": {"first_name": "Ana", "last_name": "Santos", "region": "VII"},
           "skills": [{"name": "Welding"}]}
TOKEN = {"access_token": "tok-123", "token_type": "Bearer", "expires_in": 900, "scope": "profile skills"}
HEADERS = {"X-Requested-With": "XMLHttpRequest"}
REJECTED = httpx.Response(400, json={"message": "Invalid code.", "error": "Bad Request", "statusCode": 400})


@pytest.fixture
def tsp(app):
    """Turns TSP sign-in on for the app, against a fake Hercules whose token answer the test can change."""
    settings = get_settings().model_copy(update={
        "tsp_sign_in_enabled": True, "hercules_base_url": HttpUrl("https://hercules.example.test"),
        "tracker_client_id": "tesda-tracker", "tracker_client_secret": SecretStr("s" * 64)})
    state = {"token": None}

    def answer(request):
        if request.url.path.endswith("/v1/tracker/token"):
            return state["token"] or httpx.Response(200, json={"success": True, "data": TOKEN})
        return httpx.Response(200, json={"success": True, "data": PROFILE})

    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[hercules_client] = lambda: HerculesClient(settings, transport=httpx.MockTransport(answer))
    return state


def sign_in(client, code="code"):
    return client.post("/api/v1/auth/tsp/session", json={"code": code}, headers=HEADERS)


def test_disabled_answers_404(client):
    assert sign_in(client).status_code == 404
    assert client.post("/api/v1/auth/tsp/consent", json={"pending_id": "x", "accept": True},
                       headers=HEADERS).status_code == 404


def test_new_learner_gets_202_then_consent_sets_cookie(client, tsp):
    first = sign_in(client)
    assert first.status_code == 202
    body = first.json()
    assert body["consent_required"] is True
    assert body["summary"] == {"name": "Ana Santos", "keeps": ["skills", "location"]}
    assert "tesda_session" not in client.cookies
    accepted = client.post("/api/v1/auth/tsp/consent", json={"pending_id": body["pending_id"], "accept": True},
                           headers=HEADERS)
    assert accepted.status_code == 200
    assert accepted.json()["learner"]["full_name"] == "Ana Santos"
    assert client.get("/api/v1/me").json()["full_name"] == "Ana Santos"


def test_known_learner_gets_200_and_cookie(client, tsp):
    pending_id = sign_in(client).json()["pending_id"]
    client.post("/api/v1/auth/tsp/consent", json={"pending_id": pending_id, "accept": True}, headers=HEADERS)
    client.cookies.clear()
    again = sign_in(client)
    assert again.status_code == 200
    assert again.json()["learner"]["email"] is None
    assert client.get("/api/v1/me").status_code == 200


def test_error_body_has_contract_code(client, tsp):
    tsp["token"] = REJECTED
    response = sign_in(client)
    assert response.status_code == 401
    assert response.json()["code"] == "handoff_expired"


def test_requested_with_required(client, tsp):
    assert client.post("/api/v1/auth/tsp/session", json={"code": "code"}).status_code == 403


def test_rate_limit_leaves_room_for_a_shared_network(client, tsp):
    # A training center's class shares one address, and every WebView open signs in again.
    assert RATE_LIMIT_PER_MINUTE >= 60


def test_rate_limited(client, tsp):
    tsp["token"] = REJECTED
    statuses = [sign_in(client).status_code for _ in range(RATE_LIMIT_PER_MINUTE)]
    assert set(statuses) == {401}
    last = sign_in(client)
    assert last.status_code == 429 and last.json()["code"] == "unavailable"


def test_consent_decline_204(client, tsp):
    pending_id = sign_in(client).json()["pending_id"]
    declined = client.post("/api/v1/auth/tsp/consent", json={"pending_id": pending_id, "accept": False},
                           headers=HEADERS)
    assert declined.status_code == 204
    assert "tesda_session" not in client.cookies


def test_consent_for_unknown_pending_is_404_with_code(client, tsp):
    response = client.post("/api/v1/auth/tsp/consent", json={"pending_id": "nope", "accept": True}, headers=HEADERS)
    assert (response.status_code, response.json()["code"]) == (404, "handoff_expired")


def test_profile_gives_the_signed_in_learner_their_passport(client, tsp):
    pending_id = sign_in(client).json()["pending_id"]
    client.post("/api/v1/auth/tsp/consent", json={"pending_id": pending_id, "accept": True}, headers=HEADERS)
    response = client.get("/api/v1/auth/tsp/profile")
    assert response.status_code == 200
    assert response.json() == {"skills": ["Welding"], "experience": [], "education": [], "qualifications": [],
                               "credentials": [], "region_code": "VII"}


def test_profile_needs_a_session(client, tsp):
    assert client.get("/api/v1/auth/tsp/profile").status_code == 401


def test_profile_404_while_disabled(client):
    assert client.get("/api/v1/auth/tsp/profile").status_code == 404


def test_profile_404_for_an_account_without_a_passport(client, tsp, learner):
    assert client.get("/api/v1/auth/tsp/profile", headers=learner).status_code == 404
