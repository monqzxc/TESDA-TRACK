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


@pytest.fixture
def competency_ids(client):
    def competency_ids(code):
        return [c["id"] for c in client.get(f"/api/v1/qualifications/{code}").json()["competencies"]]
    return competency_ids
