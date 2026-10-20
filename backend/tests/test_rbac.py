import uuid

import pytest
from sqlmodel import select

from tesda_track.models import Learner
from tesda_track.rbac import PERMISSIONS, ROLES, system_permissions_for
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
    assert me.json()["permissions"] == system_permissions_for(role)
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
        expected = (200 if method == "get" else 422) if permission in system_permissions_for(role) else 403
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


# --- Roles an administrator composes -------------------------------------------------------------------------

def test_permission_vocabulary_is_read_only_and_complete(client, admin):
    listed = client.get("/api/v1/admin/permissions", headers=admin)
    assert {row["key"] for row in listed.json()} == set(PERMISSIONS)
    # There is no way to invent a permission: the vocabulary has no write route.
    assert client.post("/api/v1/admin/permissions", headers=admin, json={"key": "x:y"}).status_code == 405


def test_built_in_roles_are_listed_with_their_permissions(client, admin):
    roles = {row["key"]: row for row in client.get("/api/v1/admin/roles", headers=admin).json()}
    assert set(roles) == set(ROLES)
    for key in ROLES:
        assert roles[key]["permissions"] == system_permissions_for(key)
        assert roles[key]["is_system"] is True


def test_create_role_then_assign_it_grants_exactly_its_permissions(client, session, login, admin):
    created = client.post("/api/v1/admin/roles", headers=admin, json={
        "key": "regional_coordinator", "label": "Regional Coordinator",
        "description": "Runs training in one region.", "permissions": ["training:manage", "reports:read"]})
    assert created.status_code == 201, created.text
    assert created.json()["permissions"] == ["reports:read", "training:manage"]
    assert created.json()["is_system"] is False

    record = seed_role(session, "learner")
    headers = login(record.email, PASSWORD)
    user_id = client.get("/api/v1/me", headers=headers).json()["id"]
    assigned = client.patch(f"/api/v1/admin/users/{user_id}/role", headers=admin,
                            json={"role": "regional_coordinator"})
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["permissions"] == ["reports:read", "training:manage"]

    headers = login(record.email, PASSWORD)
    assert client.get("/api/v1/me", headers=headers).json()["permissions"] == ["reports:read", "training:manage"]
    assert client.get("/api/v1/admin/reports/overview", headers=headers).status_code == 200
    assert client.post("/api/v1/admin/training-providers", headers=headers).status_code == 422
    # Nothing it was not given, including the one that would let it edit roles.
    assert client.post("/api/v1/admin/pathways", headers=headers).status_code == 403
    assert client.get("/api/v1/admin/roles", headers=headers).status_code == 403


def test_rescoping_a_role_takes_effect_without_a_new_token(client, session, login, admin):
    record = seed_role(session, "analyst")
    headers = login(record.email, PASSWORD)
    assert client.get("/api/v1/admin/reports/overview", headers=headers).status_code == 200

    assert client.patch("/api/v1/admin/roles/analyst", headers=admin,
                        json={"permissions": []}).status_code == 200
    # Same token, no re-login: permissions are read from the role row on every request.
    assert client.get("/api/v1/admin/reports/overview", headers=headers).status_code == 403
    assert client.get("/api/v1/me", headers=headers).json()["permissions"] == []


def test_role_create_rejects_unknown_permissions_bad_keys_and_duplicates(client, admin):
    def create(**overrides):
        body = {"key": "auditor", "label": "Auditor", "permissions": []}
        body.update(overrides)
        return client.post("/api/v1/admin/roles", headers=admin, json=body)

    unknown = create(permissions=["reports:read", "database:drop"])
    assert unknown.status_code == 422
    assert "database:drop" in unknown.json()["detail"]
    assert create(key="Regional Coordinator").status_code == 422
    assert create(key="1st_role").status_code == 422
    assert create(key="a").status_code == 422
    assert create(permissions=["reports:read"]).status_code == 201
    assert create(label="Auditor Again").status_code == 409
    # The key is normalised, so a differently-cased duplicate is still a duplicate.
    assert create(key="AUDITOR").status_code == 409


def test_admin_role_cannot_be_edited_or_deleted(client, admin):
    assert client.patch("/api/v1/admin/roles/admin", headers=admin,
                        json={"permissions": ["reports:read"]}).status_code == 422
    assert client.patch("/api/v1/admin/roles/admin", headers=admin, json={"label": "Root"}).status_code == 422
    assert client.delete("/api/v1/admin/roles/admin", headers=admin).status_code == 422
    # Still holds everything, so /admin can never be locked away.
    roles = {row["key"]: row for row in client.get("/api/v1/admin/roles", headers=admin).json()}
    assert roles["admin"]["permissions"] == sorted(PERMISSIONS)


def test_built_in_roles_cannot_be_deleted_but_can_be_relabelled(client, admin):
    assert client.delete("/api/v1/admin/roles/trainer", headers=admin).status_code == 422
    renamed = client.patch("/api/v1/admin/roles/trainer", headers=admin, json={"label": "Trainor"})
    assert renamed.status_code == 200
    assert renamed.json()["label"] == "Trainor"
    assert renamed.json()["key"] == "trainer"


def test_role_still_held_cannot_be_deleted_until_accounts_move_off_it(client, session, login, admin):
    client.post("/api/v1/admin/roles", headers=admin,
                json={"key": "auditor", "label": "Auditor", "permissions": ["reports:read"]})
    record = seed_role(session, "learner")
    user_id = client.get("/api/v1/me", headers=login(record.email, PASSWORD)).json()["id"]
    client.patch(f"/api/v1/admin/users/{user_id}/role", headers=admin, json={"role": "auditor"})

    assert client.get("/api/v1/admin/roles/assignments", headers=admin).json()["auditor"] == 1
    blocked = client.delete("/api/v1/admin/roles/auditor", headers=admin)
    assert blocked.status_code == 409
    assert "1 account" in blocked.json()["detail"]

    client.patch(f"/api/v1/admin/users/{user_id}/role", headers=admin, json={"role": "learner"})
    assert client.delete("/api/v1/admin/roles/auditor", headers=admin).status_code == 204
    assert "auditor" not in {row["key"] for row in client.get("/api/v1/admin/roles", headers=admin).json()}
    # The account that used to hold it is untouched.
    assert client.get("/api/v1/admin/roles/assignments", headers=admin).json().get("auditor") is None


def test_editing_a_role_only_changes_the_fields_sent(client, admin):
    client.post("/api/v1/admin/roles", headers=admin, json={
        "key": "auditor", "label": "Auditor", "description": "Reads reports.", "permissions": ["reports:read"]})
    relabelled = client.patch("/api/v1/admin/roles/auditor", headers=admin, json={"label": "Internal Auditor"})
    assert relabelled.json()["permissions"] == ["reports:read"]
    assert relabelled.json()["description"] == "Reads reports."
    cleared = client.patch("/api/v1/admin/roles/auditor", headers=admin, json={"description": None})
    assert cleared.json()["description"] is None
    assert cleared.json()["label"] == "Internal Auditor"


def test_missing_role_is_404_to_edit_and_422_to_assign(client, session, login, admin):
    assert client.patch("/api/v1/admin/roles/ghost", headers=admin, json={"label": "Ghost"}).status_code == 404
    assert client.delete("/api/v1/admin/roles/ghost", headers=admin).status_code == 404
    record = seed_role(session, "learner")
    user_id = client.get("/api/v1/me", headers=login(record.email, PASSWORD)).json()["id"]
    unknown = client.patch(f"/api/v1/admin/users/{user_id}/role", headers=admin, json={"role": "ghost"})
    assert unknown.status_code == 422
    assert client.get("/api/v1/me", headers=login(record.email, PASSWORD)).json()["role"] == "learner"


def test_only_users_manage_reaches_the_role_routes(client, session, login):
    record = seed_role(session, "analyst")
    headers = login(record.email, PASSWORD)
    for method, path in [("get", "/admin/roles"), ("get", "/admin/permissions"),
                         ("get", "/admin/roles/assignments"), ("delete", "/admin/roles/trainer")]:
        assert getattr(client, method)("/api/v1" + path, headers=headers).status_code == 403
    assert client.post("/api/v1/admin/roles", headers=headers,
                       json={"key": "mine", "label": "Mine", "permissions": []}).status_code == 403
    assert client.post("/api/v1/admin/roles", json={"key": "mine", "label": "Mine"}).status_code == 401


def test_sync_system_roles_is_idempotent_and_restores_admin(session):
    from tesda_track.models import Role
    from tesda_track.services.roles import sync_system_roles

    assert sync_system_roles(session) == {"created": 0, "repaired": 0}
    admin_role = session.get(Role, "admin")
    admin_role.permissions = ["reports:read"]
    session.add(admin_role)
    session.flush()
    assert sync_system_roles(session) == {"created": 0, "repaired": 1}
    assert session.get(Role, "admin").permissions == sorted(PERMISSIONS)
    # A re-scoped built-in role is left alone.
    trainer = session.get(Role, "trainer")
    trainer.permissions = ["reports:read"]
    session.add(trainer)
    session.flush()
    assert sync_system_roles(session) == {"created": 0, "repaired": 0}
    assert session.get(Role, "trainer").permissions == ["reports:read"]


def test_unknown_permission_left_in_the_database_grants_nothing(client, session, login):
    from tesda_track.models import Role

    session.add(Role(key="legacy", label="Legacy", permissions=["reports:read", "database:drop"]))
    session.flush()
    record = SeedAccount(email="legacy@example.com", full_name="Legacy", role="legacy", password=PASSWORD)
    seed_accounts(session, [record])
    session.flush()
    headers = login(record.email, PASSWORD)
    # The real permission still works; the one no guard names is filtered out rather than trusted.
    assert client.get("/api/v1/admin/reports/overview", headers=headers).status_code == 200
    assert client.get("/api/v1/me", headers=headers).json()["permissions"] == ["reports:read"]
