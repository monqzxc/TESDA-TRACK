"""Backend fixtures for accounts. Database, app and client fixtures live in the repository-root conftest."""
import pytest

PASSWORD = "correct horse battery"


@pytest.fixture
def register(client):
    def register(email, password=PASSWORD, full_name="Juan Dela Cruz"):
        response = client.post("/api/v1/auth/register", json={
            "email": email, "password": password, "full_name": full_name, "privacy_consent": True})
        assert response.status_code == 201, response.text
        return response.json()
    return register


@pytest.fixture
def login(client):
    def login(email, password=PASSWORD):
        response = client.post("/api/v1/auth/token", data={"username": email, "password": password})
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}
    return login


@pytest.fixture
def learner(register, login):
    register("juan@example.com")
    return login("juan@example.com")


@pytest.fixture
def other_learner(register, login):
    register("maria@example.com", full_name="Maria Santos")
    return login("maria@example.com")


@pytest.fixture
def admin(session, login):
    from tesda_track.cli import create_or_promote_admin

    create_or_promote_admin(session, email="admin@example.com", full_name="Pilot Admin", password=PASSWORD)
    session.flush()
    return login("admin@example.com")


MANILA = (14.5995, 120.9842)


def _post(client, headers, path, body):
    response = client.post(path, headers=headers, json=body)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def make_provider(client, admin):
    def make_provider(name="Manila Welding Institute", region_code="NCR", location=MANILA, **extra):
        body = {"name": name, "region_code": region_code, **extra}
        if location:
            body.update(latitude=location[0], longitude=location[1])
        return _post(client, admin, "/api/v1/admin/training-providers", body)
    return make_provider


@pytest.fixture
def make_program(client, admin, make_provider):
    def make_program(provider=None, qualification_code="SMAW-NC-II", **extra):
        provider = provider or make_provider()
        body = {"provider_id": provider["id"], "qualification_code": qualification_code,
                "title": "SMAW NC II Batch 1", "delivery_mode": "institution_based", **extra}
        return _post(client, admin, "/api/v1/admin/training-programs", body)
    return make_program


@pytest.fixture
def make_center(client, admin):
    def make_center(name="Manila Assessment Center", region_code="NCR", location=MANILA, **extra):
        body = {"name": name, "region_code": region_code, **extra}
        if location:
            body.update(latitude=location[0], longitude=location[1])
        return _post(client, admin, "/api/v1/admin/assessment-centers", body)
    return make_center


@pytest.fixture
def make_schedule(client, admin, make_center):
    def make_schedule(center=None, qualification_code="SMAW-NC-II", days_ahead=14, slots=2, **extra):
        from datetime import datetime, timedelta, timezone

        center = center or make_center()
        body = {"center_id": center["id"], "qualification_code": qualification_code, "slots": slots,
                "scheduled_at": (datetime.now(timezone.utc) + timedelta(days=days_ahead)).isoformat(), **extra}
        return _post(client, admin, "/api/v1/admin/assessment-schedules", body)
    return make_schedule


@pytest.fixture
def competency_ids(client):
    def competency_ids(code):
        return [c["id"] for c in client.get(f"/api/v1/qualifications/{code}").json()["competencies"]]
    return competency_ids
