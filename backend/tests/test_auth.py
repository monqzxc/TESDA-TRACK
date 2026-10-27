from datetime import datetime, timedelta, timezone

import jwt
import pytest
from sqlmodel import select

from tesda_track.config import get_settings
from tesda_track.models import Learner

PASSWORD = "correct horse battery"
TEST_SECRET = get_settings().secret_key.get_secret_value()


def test_register_returns_public_account_with_normalized_email(client):
    response = client.post("/api/v1/auth/register", json={
        "email": "  Juan@Example.COM ", "password": PASSWORD, "full_name": "Juan Dela Cruz", "privacy_consent": True})
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "juan@example.com" and body["full_name"] == "Juan Dela Cruz" and body["role"] == "learner"
    assert "password_hash" not in body and "password" not in body


def test_register_requires_privacy_consent(client):
    response = client.post("/api/v1/auth/register", json={
        "email": "juan@example.com", "password": PASSWORD, "full_name": "Juan", "privacy_consent": False})
    assert response.status_code == 422
    assert response.json() == {"detail": "You must agree to the privacy notice to create an account."}


def test_register_rejects_duplicate_email_case_insensitively(client, register):
    register("juan@example.com")
    response = client.post("/api/v1/auth/register", json={
        "email": "JUAN@example.com", "password": PASSWORD, "full_name": "Juan", "privacy_consent": True})
    assert response.status_code == 409


@pytest.mark.parametrize("password", ["short", "x" * 129])
def test_register_enforces_password_length(client, password):
    response = client.post("/api/v1/auth/register", json={
        "email": "juan@example.com", "password": password, "full_name": "Juan", "privacy_consent": True})
    assert response.status_code == 422


def test_login_token_authenticates_requests(client, register, login):
    register("juan@example.com")
    response = client.get("/api/v1/me", headers=login("juan@example.com"))
    assert response.status_code == 200
    assert response.json()["email"] == "juan@example.com"


@pytest.mark.parametrize("email, password", [("juan@example.com", "wrong password!"),
                                             ("nobody@example.com", PASSWORD)])
def test_failed_login_is_generic_401(client, register, email, password):
    register("juan@example.com")
    response = client.post("/api/v1/auth/token", data={"username": email, "password": password})
    assert response.status_code == 401
    assert response.json() == {"detail": "Incorrect email or password."}
    assert response.headers["www-authenticate"] == "Bearer"


def test_account_locks_after_repeated_failures_then_unlocks(client, session, register, login):
    register("juan@example.com")
    for _ in range(5):
        assert client.post("/api/v1/auth/token",
                           data={"username": "juan@example.com", "password": "wrong password!"}).status_code == 401
    locked = client.post("/api/v1/auth/token", data={"username": "juan@example.com", "password": PASSWORD})
    assert locked.status_code == 429
    learner = session.exec(select(Learner).where(Learner.email == "juan@example.com")).one()
    learner.locked_until = datetime.now(timezone.utc) - timedelta(seconds=1)
    session.flush()
    assert login("juan@example.com")


def test_successful_login_resets_failure_count(client, session, register, login):
    register("juan@example.com")
    for _ in range(4):
        client.post("/api/v1/auth/token", data={"username": "juan@example.com", "password": "wrong password!"})
    login("juan@example.com")
    for _ in range(4):
        client.post("/api/v1/auth/token", data={"username": "juan@example.com", "password": "wrong password!"})
    assert login("juan@example.com")


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer not-a-jwt"}, {"Authorization": "Basic abc"}])
def test_protected_endpoints_reject_missing_or_malformed_tokens(client, headers):
    response = client.get("/api/v1/me", headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_expired_and_foreign_tokens_are_rejected(client, register):
    learner_id = register("juan@example.com")["id"]
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    expired = jwt.encode({"sub": learner_id, "ver": 0, "iat": past, "exp": past + timedelta(minutes=5)},
                         TEST_SECRET, algorithm="HS256")
    forged = jwt.encode({"sub": learner_id, "ver": 0, "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
                        "some-other-secret-that-is-long-enough-to-sign", algorithm="HS256")
    for token in (expired, forged):
        assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_password_change_revokes_existing_tokens(client, register, login):
    register("juan@example.com")
    old_headers = login("juan@example.com")
    response = client.post("/api/v1/me/password", headers=old_headers,
                           json={"current_password": PASSWORD, "new_password": "a brand new passphrase"})
    assert response.status_code == 204
    assert client.get("/api/v1/me", headers=old_headers).status_code == 401
    assert client.post("/api/v1/auth/token",
                       data={"username": "juan@example.com", "password": PASSWORD}).status_code == 401
    assert login("juan@example.com", "a brand new passphrase")


def test_password_change_requires_current_password(client, learner):
    response = client.post("/api/v1/me/password", headers=learner,
                           json={"current_password": "not my password", "new_password": "a brand new passphrase"})
    assert response.status_code == 422
    assert response.json() == {"detail": "Your current password is incorrect."}


def test_deactivated_account_cannot_use_tokens_or_log_in(client, session, learner):
    account = session.exec(select(Learner).where(Learner.email == "juan@example.com")).one()
    account.is_active = False
    session.flush()
    assert client.get("/api/v1/me", headers=learner).status_code == 401
    assert client.post("/api/v1/auth/token",
                       data={"username": "juan@example.com", "password": PASSWORD}).status_code == 401
