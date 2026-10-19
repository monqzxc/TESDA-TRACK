from datetime import datetime, timedelta, timezone

import jwt

from tesda_track.config import get_settings
from tesda_track.deps import REQUESTED_WITH_MISSING
from tesda_track.security import SESSION_COOKIE

PASSWORD = "correct horse battery"
TEST_SECRET = get_settings().secret_key.get_secret_value()
# The browser app sends this on every request; any value will do.
FETCH = {"X-Requested-With": "fetch"}


def sign_in(client, email="juan@example.com", password=PASSWORD):
    return client.post("/api/v1/auth/session", data={"username": email, "password": password}, headers=FETCH)


def cookie_flags(response) -> list[str]:
    return [part.strip().lower() for part in response.headers["set-cookie"].split(";")]


def test_session_sign_in_sets_a_strict_http_only_cookie_and_returns_no_token(client, register):
    register("juan@example.com")
    response = sign_in(client)
    assert response.status_code == 200
    body = response.json()
    assert body["learner"]["email"] == "juan@example.com"
    assert body["expires_in"] == get_settings().access_token_expire_minutes * 60
    assert "access_token" not in body and response.cookies[SESSION_COOKIE] not in response.text
    flags = cookie_flags(response)
    assert flags[0].startswith(f"{SESSION_COOKIE}=")
    assert {"httponly", "samesite=strict", "path=/api",
            f"max-age={get_settings().access_token_expire_minutes * 60}"} <= set(flags)
    assert "secure" not in flags  # tests run as ENVIRONMENT=test; production adds Secure


def test_session_sign_in_needs_the_requested_with_header(client, register):
    register("juan@example.com")
    response = client.post("/api/v1/auth/session", data={"username": "juan@example.com", "password": PASSWORD})
    assert response.status_code == 403
    assert response.json() == {"detail": REQUESTED_WITH_MISSING}
    assert "set-cookie" not in response.headers


def test_failed_session_sign_in_is_generic_401_without_a_cookie(client, register):
    register("juan@example.com")
    response = sign_in(client, password="wrong password!")
    assert response.status_code == 401
    assert response.json() == {"detail": "Incorrect email or password."}
    assert "set-cookie" not in response.headers


def test_cookie_authenticates_reads(client, register):
    register("juan@example.com")
    sign_in(client)
    response = client.get("/api/v1/me")
    assert response.status_code == 200
    assert response.json()["email"] == "juan@example.com"


def test_sign_out_clears_the_cookie(client, register):
    register("juan@example.com")
    sign_in(client)
    response = client.delete("/api/v1/auth/session", headers=FETCH)
    assert response.status_code == 204
    flags = cookie_flags(response)
    assert flags[0] == f'{SESSION_COOKIE}=""' and {"max-age=0", "path=/api", "httponly"} <= set(flags)
    assert SESSION_COOKIE not in client.cookies
    assert client.get("/api/v1/me").status_code == 401


def test_sign_out_works_signed_out_too(client):
    assert client.delete("/api/v1/auth/session", headers=FETCH).status_code == 204
    assert client.delete("/api/v1/auth/session").status_code == 403


def test_expired_or_invalid_cookie_is_401_and_cleared(client, register):
    learner_id = register("juan@example.com")["id"]
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    expired = jwt.encode({"sub": learner_id, "ver": 0, "iat": past, "exp": past + timedelta(minutes=5)},
                         TEST_SECRET, algorithm="HS256")
    for cookie in (expired, "not-a-jwt"):
        response = client.get("/api/v1/me", headers={"Cookie": f"{SESSION_COOKIE}={cookie}"})
        assert response.status_code == 401
        assert response.json() == {"detail": "Your session has expired. Please sign in again."}
        assert "max-age=0" in cookie_flags(response)


def test_cookie_writes_need_the_requested_with_header(client, register):
    register("juan@example.com")
    sign_in(client)
    refused = client.patch("/api/v1/me", json={"full_name": "Juan D. Cruz"})
    assert refused.status_code == 403
    assert refused.json() == {"detail": REQUESTED_WITH_MISSING}
    assert client.get("/api/v1/me").json()["full_name"] == "Juan Dela Cruz"
    allowed = client.patch("/api/v1/me", json={"full_name": "Juan D. Cruz"}, headers=FETCH)
    assert allowed.status_code == 200
    assert allowed.json()["full_name"] == "Juan D. Cruz"


def test_bearer_tokens_need_no_header_and_win_over_the_cookie(client, register, login):
    register("juan@example.com")
    register("maria@example.com", full_name="Maria Santos")
    bearer = login("juan@example.com")
    sign_in(client, "maria@example.com")
    assert client.get("/api/v1/me", headers=bearer).json()["email"] == "juan@example.com"
    response = client.patch("/api/v1/me", headers=bearer, json={"full_name": "Juan D. Cruz"})
    assert response.status_code == 200
    assert response.json()["email"] == "juan@example.com"
    assert client.get("/api/v1/me").json()["full_name"] == "Maria Santos"


def test_session_sign_in_locks_after_repeated_failures(client, register):
    register("juan@example.com")
    for _ in range(5):
        assert sign_in(client, password="wrong password!").status_code == 401
    locked = sign_in(client)
    assert locked.status_code == 429
    assert "set-cookie" not in locked.headers
    # The two sign-in routes share one lockout.
    assert client.post("/api/v1/auth/token",
                       data={"username": "juan@example.com", "password": PASSWORD}).status_code == 429


def test_password_change_revokes_cookie_sessions(client, register):
    register("juan@example.com")
    sign_in(client)
    response = client.post("/api/v1/me/password", headers=FETCH,
                           json={"current_password": PASSWORD, "new_password": "a brand new passphrase"})
    assert response.status_code == 204
    revoked = client.get("/api/v1/me")
    assert revoked.status_code == 401
    assert "max-age=0" in cookie_flags(revoked)
    assert sign_in(client, password="a brand new passphrase").status_code == 200
    assert client.get("/api/v1/me").status_code == 200


def test_token_sign_in_failures_lock_session_sign_in(client, register):
    register("juan@example.com")
    for _ in range(5):
        assert client.post("/api/v1/auth/token",
                           data={"username": "juan@example.com", "password": "wrong password!"}).status_code == 401
    locked = sign_in(client)
    assert locked.status_code == 429
    assert "set-cookie" not in locked.headers


def test_admin_writes_by_cookie_need_the_requested_with_header(client, admin):
    sign_in(client, "admin@example.com")
    body = {"name": "Manila Welding Institute", "region_code": "NCR"}
    refused = client.post("/api/v1/admin/training-providers", json=body)
    assert refused.status_code == 403
    assert refused.json() == {"detail": REQUESTED_WITH_MISSING}
    assert client.post("/api/v1/admin/training-providers", json=body, headers=FETCH).status_code == 201


def test_optional_sign_in_routes_refuse_cookie_writes_without_the_header(client, register, make_program):
    make_program()
    register("juan@example.com")
    sign_in(client)
    body = {"qualification_code": "SMAW-NC-II"}
    refused = client.post("/api/v1/recommendations/training", json=body)
    assert refused.status_code == 403
    assert refused.json() == {"detail": REQUESTED_WITH_MISSING}
    assert client.post("/api/v1/recommendations/training", json=body, headers=FETCH).status_code == 200
