import uuid

import pytest
from sqlmodel import select

from tesda_track.models import Learner
from tesda_track.rbac import ROLES, permissions_for
from tesda_track.seed_accounts import SeedAccount, seed_accounts

PASSWORD = "test-only-long-password"


def seed_role(session, role):
    record = SeedAccount(email=f"{role}@example.com", full_name=f"Test {role}", role=role, password=PASSWORD)
    seed_accounts(session, [record])
    session.flush()
    return record


@pytest.mark.parametrize("role", ROLES)
def test_role_access_matrix(client, session, login, role):
    record = seed_role(session, role)
    headers = login(record.email, PASSWORD)
    me = client.get("/api/v1/me", headers=headers)
    assert me.json()["role"] == role
    assert me.json()["permissions"] == permissions_for(role)
    # Invalid writes return 422 only after authorization succeeds.
    endpoints = [
        ("get", "/admin/reports/overview", "reports:read"),
        ("get", "/admin/users", "users:manage"),
        ("post", "/admin/training-providers", "training:manage"),
        ("post", "/admin/pathways", "pathways:manage"),
        ("post", "/admin/assessment-centers", "assessments:manage"),
        ("post", "/admin/service-verifications/import", "verifications:manage"),
    ]
    for method, path, permission in endpoints:
        response = getattr(client, method)("/api/v1" + path, headers=headers)
        expected = (200 if method == "get" else 422) if permission in permissions_for(role) else 403
        assert response.status_code == expected, (role, path, response.text)


def test_role_assignment_revokes_tokens_and_rejects_escalation(client, session, login, admin):
    record = seed_role(session, "learner")
    headers = login(record.email, PASSWORD)
    user_id = client.get("/api/v1/me", headers=headers).json()["id"]
    path = f"/api/v1/admin/users/{user_id}/role"
    assert client.patch(path, headers=headers, json={"role": "admin"}).status_code == 403
    assert client.patch(path, headers=admin, json={"role": "superuser"}).status_code == 422
    assert client.patch(path, headers=admin, json={"role": "analyst"}).json()["role"] == "analyst"
    assert client.get("/api/v1/me", headers=headers).status_code == 401
    headers = login(record.email, PASSWORD)
    assert client.get("/api/v1/admin/reports/overview", headers=headers).status_code == 200
    admin_id = client.get("/api/v1/me", headers=admin).json()["id"]
    assert client.patch(f"/api/v1/admin/users/{admin_id}/role", headers=admin,
                        json={"role": "learner"}).status_code == 422
    assert client.patch(f"/api/v1/admin/users/{uuid.uuid4()}/role", headers=admin,
                        json={"role": "learner"}).status_code == 404


def test_public_registration_cannot_assign_staff_role(client):
    response = client.post("/api/v1/auth/register", json={
        "email": "public@example.com", "password": PASSWORD, "full_name": "Public User",
        "privacy_consent": True, "role": "admin", "permissions": ["users:manage"],
    })
    assert response.status_code == 201
    assert response.json()["role"] == "learner"
    assert response.json()["permissions"] == []


def test_seed_is_idempotent_and_never_overwrites_accounts(session, login):
    records = [seed_role(session, role) for role in ROLES]
    before = {row.email: (row.id, row.password_hash) for row in session.exec(select(Learner))}
    assert seed_accounts(session, records) == {"created": 0, "skipped": len(ROLES)}
    assert {row.email: (row.id, row.password_hash) for row in session.exec(select(Learner))} == before
    for record in records:
        assert login(record.email, PASSWORD)


def test_seed_role_conflict_rolls_back_entire_batch(session):
    record = seed_role(session, "learner")
    first = SeedAccount(email="new@example.com", full_name="New", password=PASSWORD, role="trainer")
    with pytest.raises(ValueError, match="different role"):
        seed_accounts(session, [first, record.model_copy(update={"role": "admin"})])
    assert session.exec(select(Learner).where(Learner.email == first.email)).first() is None


def test_staff_routes_require_authentication(client):
    assert client.get("/api/v1/admin/roles").status_code == 401
    assert client.get("/api/v1/admin/reports/overview").status_code == 401
