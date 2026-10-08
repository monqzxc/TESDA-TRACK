import sys
import threading
import time
from datetime import datetime, timedelta, timezone

import pytest
import uvicorn


@pytest.fixture(autouse=True)
def fresh_component_modules():
    """AppTest gives every app its own custom-component registry; re-importing registers the map there."""
    sys.modules.pop("training_view", None)


@pytest.fixture
def training_data(client, session):
    """A welding program in Manila and one in Cebu, plus an upcoming assessment in Manila."""
    from tesda_track.cli import create_or_promote_admin

    create_or_promote_admin(session, email="admin@example.com", full_name="Admin", password="correct horse battery")
    session.flush()
    token = client.post("/api/v1/auth/token",
                        data={"username": "admin@example.com", "password": "correct horse battery"}).json()
    admin = {"Authorization": f"Bearer {token['access_token']}"}

    def post(path, body):
        response = client.post(f"/api/v1/admin/{path}", headers=admin, json=body)
        assert response.status_code == 201, response.text
        return response.json()

    manila = post("training-providers", {"name": "Manila Welding Institute", "region_code": "NCR",
                                         "city": "Manila", "latitude": 14.5995, "longitude": 120.9842})
    cebu = post("training-providers", {"name": "Cebu Skills Center", "region_code": "VII",
                                       "city": "Cebu City", "latitude": 10.3157, "longitude": 123.8854})
    for provider, title in ((cebu, "SMAW NC II Cebu batch"), (manila, "SMAW NC II Manila batch")):
        post("training-programs", {"provider_id": provider["id"], "qualification_code": "SMAW-NC-II", "title": title,
                                   "delivery_mode": "institution_based", "duration_hours": 268})
    center = post("assessment-centers", {"name": "Manila Assessment Center", "region_code": "NCR", "city": "Manila",
                                         "latitude": 14.5995, "longitude": 120.9842})
    schedule = post("assessment-schedules", {
        "center_id": center["id"], "qualification_code": "SMAW-NC-II", "slots": 10,
        "scheduled_at": (datetime.now(timezone.utc) + timedelta(days=21)).isoformat()})
    return {"schedule": schedule}


@pytest.fixture
def live_api(app, monkeypatch):
    """Serve the backend (bound to the per-test database transaction) over real HTTP on a free port."""
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started:
        if time.monotonic() > deadline:
            raise RuntimeError("The test API server did not start")
        time.sleep(0.02)
    port = server.servers[0].sockets[0].getsockname()[1]
    base_url = f"http://127.0.0.1:{port}"
    monkeypatch.setenv("API_BASE_URL", base_url)
    yield base_url
    server.should_exit = True
    thread.join(timeout=10)
