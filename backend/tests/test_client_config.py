"""GET /api/v1/client-config through the full app, as the React app calls it when it starts."""
from tesda_track.config import get_settings


def test_client_config_is_public_and_follows_the_settings(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "carto_api", "carto-public-key")
    monkeypatch.setattr(get_settings(), "routing_url", "")
    monkeypatch.setattr(get_settings(), "skills_bridge_mcp_enabled", False)

    response = client.get("/api/v1/client-config")

    assert response.status_code == 200
    assert response.json() == {"carto_key": "carto-public-key", "routing_enabled": False,
                               "skills_bridge_enabled": False}
    assert response.headers["cache-control"] == "public, max-age=300"
