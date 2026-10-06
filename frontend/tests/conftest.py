import threading
import time

import pytest
import uvicorn


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
