"""GET /api/v1/client-config through the full app, as the React app calls it when it starts."""
from tesda_track.config import get_settings


def test_client_config_is_public_and_follows_the_settings(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "carto_api", "carto-public-key")
    monkeypatch.setattr(get_settings(), "routing_url", "")
    monkeypatch.setattr(get_settings(), "skills_bridge_mcp_enabled", False)

    response = client.get("/api/v1/client-config")

    assert response.status_code == 200
    assert response.json() == {"carto_key": "carto-public-key", "routing_enabled": False,
                               "skills_bridge_enabled": False, "tsp_sign_in": False,
                               "tsp_suggestions": get_settings().tsp_suggestions_enabled,
                               "map_engine": get_settings().map_engine, "maptiler_key": get_settings().maptiler_key,
                               "map_tiles_url": get_settings().map_tiles_url,
                               "map_glyphs_url": get_settings().map_glyphs_url, "map_3d": get_settings().map_3d_enabled}
    assert response.headers["cache-control"] == "public, max-age=300"
