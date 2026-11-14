"""The mock TSP (docs/tsp-mock.md): synthetic accounts sign in through the real TSP sign-in path, with no network."""
import json
import uuid

import pytest

from tesda_track.config import Settings, get_settings
from tesda_track.security import create_access_token
from tesda_track.services import hercules, tsp_mock

HEADERS = {"X-Requested-With": "XMLHttpRequest"}
ANA = ("ana.reyes@example.com", "TspDemo-Ana-2026")


@pytest.fixture
def mock_tsp(app):
    # No Hercules client is set: the mock needs none.
    settings = get_settings().model_copy(update={"tsp_sign_in_enabled": True, "tsp_mock_enabled": True})
    app.dependency_overrides[get_settings] = lambda: settings
    return settings


def handoff(client, username=ANA[0], password=ANA[1], **extra):
    return client.post("/api/v1/tsp-mock/handoff", json={"username": username, "password": password, **extra},
                       headers=HEADERS)


def session_for(client, code):
    return client.post("/api/v1/auth/tsp/session", json={"code": code}, headers=HEADERS)


def sign_in(client, username=ANA[0], password=ANA[1]):
    """Through consent, as a learner's first sign-in goes."""
    first = session_for(client, handoff(client, username, password).json()["data"]["code"])
    assert first.status_code == 202, first.text
    accepted = client.post("/api/v1/auth/tsp/consent", json={"pending_id": first.json()["pending_id"],
                                                             "accept": True}, headers=HEADERS)
    assert accepted.status_code == 200, accepted.text
    return accepted.json()["learner"]


def test_off_by_default(client):
    assert handoff(client).status_code == 404


def test_needs_tsp_sign_in_as_well(client, app):
    settings = get_settings().model_copy(update={"tsp_mock_enabled": True})
    app.dependency_overrides[get_settings] = lambda: settings
    assert handoff(client).status_code == 404


def test_handoff_answers_like_hercules(client, mock_tsp):
    body = handoff(client, state="abc").json()
    assert body["success"] is True
    assert body["data"]["state"] == "abc" and body["data"]["expires_in"] == 60 and body["data"]["code"]


def test_synthetic_account_signs_in_and_sees_its_profile(client, mock_tsp):
    learner = sign_in(client, "gina.bautista@example.com", "TspDemo-Gina-2026")
    assert learner["full_name"] == "Gina Aquino Bautista" and learner["email"] is None
    assert client.get("/api/v1/me").json()["full_name"] == "Gina Aquino Bautista"
    profile = client.get("/api/v1/auth/tsp/profile").json()
    assert profile["skills"] == ["Cooking", "Baking", "Menu planning", "Teaching"]
    assert profile["qualifications"] == ["Cookery NC II", "Bread and Pastry Production NC II",
                                         "Trainers Methodology Level I"]
    assert profile["experience"] == ["Line Cook", "Cookery Trainer"]


def test_second_sign_in_needs_no_consent(client, mock_tsp):
    sign_in(client)
    client.cookies.clear()
    again = session_for(client, handoff(client).json()["data"]["code"])
    assert again.status_code == 200 and again.json()["learner"]["full_name"] == "Ana Lopez Reyes"


def test_username_ignores_case_and_spaces(client, mock_tsp):
    assert handoff(client, "  ANA.Reyes@example.com ").status_code == 200


@pytest.mark.parametrize("username, password", [(ANA[0], "wrong password"), ("nobody@example.com", ANA[1]),
                                                (ANA[0], "TspDemo-Ben-2026")])
def test_wrong_credentials_are_refused(client, mock_tsp, username, password):
    response = handoff(client, username, password)
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect TSP username or password."
    assert "tesda_session" not in client.cookies


def test_requested_with_required(client, mock_tsp):
    assert client.post("/api/v1/tsp-mock/handoff", json={"username": ANA[0], "password": ANA[1]}).status_code == 403


def test_code_works_once(client, mock_tsp):
    code = handoff(client).json()["data"]["code"]
    assert session_for(client, code).status_code == 202
    again = session_for(client, code)
    assert (again.status_code, again.json()["code"]) == (401, "handoff_expired")


def test_expired_code_is_refused(client, mock_tsp, monkeypatch):
    monkeypatch.setattr(tsp_mock, "CODE_LIFETIME_SECONDS", -1)
    response = session_for(client, handoff(client).json()["data"]["code"])
    assert (response.status_code, response.json()["code"]) == (401, "handoff_expired")


@pytest.mark.parametrize("code", ["not-a-code", "a.b.c"])
def test_made_up_code_is_refused(client, mock_tsp, code):
    response = session_for(client, code)
    assert (response.status_code, response.json()["code"]) == (401, "handoff_expired")


def test_session_token_is_not_a_handoff_code(client, mock_tsp):
    sign_in(client)
    response = session_for(client, client.cookies["tesda_session"])
    assert (response.status_code, response.json()["code"]) == (401, "handoff_expired")


def test_expired_session_is_signed_out(client, mock_tsp):
    learner = sign_in(client)
    assert client.get("/api/v1/auth/tsp/profile").status_code == 200
    expired, _ = create_access_token(uuid.UUID(learner["id"]), 0,
                                     mock_tsp.model_copy(update={"access_token_expire_minutes": -1}))
    client.cookies.set("tesda_session", expired)
    assert client.get("/api/v1/me").status_code == 401
    assert client.get("/api/v1/auth/tsp/profile").status_code == 401


def test_mock_is_used_even_when_hercules_is_set(mock_tsp):
    # Nothing can reach the real TSP: the stand-in address never resolves, and the transport never leaves the process.
    client = tsp_mock.client(mock_tsp)
    assert client.base_url == "https://tsp-mock.invalid"
    token = client.exchange_code(tsp_mock.issue_code(mock_tsp, *ANA))
    assert client.fetch_profile(token).sso_id == "mock-sso-0001"


def test_accounts_are_synthetic_and_in_hercules_format():
    accounts = tsp_mock.accounts()
    regions = {r["code"] for r in json.loads((tsp_mock.ACCOUNTS_PATH.parent / "regions.json").read_text())}
    assert len(accounts) >= 6
    assert len({a.profile["personal_information"]["region"] for a in accounts}) >= 6
    for account in accounts:
        personal = account.profile["personal_information"]
        assert hercules.profile_problems(account.profile) == []
        assert hercules.describe_profile(account.profile)["unexpected_fields"] == []
        assert hercules.describe_profile(account.profile)["sensitive_fields_sent"] == []
        assert personal["region"] in regions
        assert account.username.endswith("@example.com") and personal["email_address"].endswith("@example.com")
        assert account.profile["sso_id"].startswith("mock-sso-")
        assert (personal["mobile_number"] or "+63900").startswith("+63900")  # an unassigned prefix


def test_mock_alone_satisfies_the_settings_check():
    assert Settings(tsp_sign_in_enabled=True, tsp_mock_enabled=True, hercules_base_url=None, tracker_client_id=None,
                    tracker_client_secret=None, _env_file=None).tsp_mock_enabled
    with pytest.raises(ValueError):
        Settings(tsp_sign_in_enabled=True, tsp_mock_enabled=False, hercules_base_url=None, tracker_client_id=None,
                 tracker_client_secret=None, _env_file=None)
