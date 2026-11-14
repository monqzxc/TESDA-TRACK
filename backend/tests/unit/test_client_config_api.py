"""Database-free checks of GET /api/v1/client-config. Run with --confcutdir=backend/tests/unit."""
import re

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tesda_track.config import Settings, get_settings
from tesda_track.routers.meta import router


def settings(**kwargs):
    return Settings(_env_file=None, database_url="postgresql://unused", secret_key="test-only-" * 8,
                    **{"tsp_suggestions_enabled": False, **kwargs})


def client_config(test_settings: Settings):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_settings] = lambda: test_settings
    return TestClient(app).get("/api/v1/client-config")


def test_reports_the_map_key_and_the_optional_services():
    response = client_config(settings(carto_api=" carto-public-key ", routing_url="https://router.example.test",
                                      skills_bridge_mcp_enabled=True))
    assert response.status_code == 200
    assert response.json() == {"carto_key": "carto-public-key", "routing_enabled": True,
                               "skills_bridge_enabled": True, "tsp_sign_in": False, "tsp_mock": False, "tsp_suggestions": False,
                               "map_engine": "maplibre", "maptiler_key": "", "map_tiles_url": "",
                               "map_3d": True}


def test_reports_services_that_are_turned_off():
    response = client_config(settings(routing_url=" ", skills_bridge_mcp_enabled=False))
    assert response.json() == {"carto_key": "", "routing_enabled": False, "skills_bridge_enabled": False,
                               "tsp_sign_in": False, "tsp_mock": False, "tsp_suggestions": False,
                               "map_engine": "maplibre", "maptiler_key": "", "map_tiles_url": "",
                               "map_3d": True}


def test_reports_tsp_sign_in():
    response = client_config(settings(hercules_base_url="https://hercules.example.test", tracker_client_id="tesda-tracker",
                                      tracker_client_secret="s" * 64, tsp_sign_in_enabled=True))
    assert response.json()["tsp_sign_in"] is True


def test_reports_tsp_suggestions_only_when_turned_on():
    assert client_config(settings()).json()["tsp_suggestions"] is False
    assert client_config(settings(tsp_suggestions_enabled=True)).json()["tsp_suggestions"] is True


def test_reports_the_map_renderer_and_its_vector_tiles():
    response = client_config(settings(maptiler_key=" maptiler-public-key ", map_3d_enabled=False))
    assert {key: value for key, value in response.json().items() if key.startswith("map")} == {
        "map_engine": "maplibre", "maptiler_key": "maptiler-public-key", "map_tiles_url": "", "map_3d": False}

    tiles = client_config(settings(map_engine="LEAFLET", map_tiles_url=" https://tiles.example.test/planet "))
    assert {key: value for key, value in tiles.json().items() if key.startswith("map")} == {
        "map_engine": "leaflet", "maptiler_key": "", "map_tiles_url": "https://tiles.example.test/planet",
        "map_3d": True}


@pytest.mark.parametrize("values, message", [
    ({"map_engine": "openlayers"}, "map_engine"),
    ({"map_tiles_url": "tiles.example.test/planet"}, "https://"),
    ({"environment": "production", "map_tiles_url": "http://tiles.example.test/planet"}, "https://"),
])
def test_refuses_map_settings_the_browser_could_not_use(values, message):
    with pytest.raises(ValueError, match=re.escape(message)):
        settings(**values)


def test_can_be_cached_for_a_few_minutes():
    assert client_config(settings()).headers["cache-control"] == "public, max-age=300"


@pytest.fixture
def environment(monkeypatch):
    for name, value in {"DATABASE_URL": "postgresql+psycopg://unused@127.0.0.1:1/unused",
                        "SECRET_KEY": "test-only-secret-key-that-is-long-enough-0123456789",
                        "CARTO_API": "carto-from-the-environment", "ROUTING_URL": "",
                        "SKILLS_BRIDGE_MCP_ENABLED": "true", "TSP_SUGGESTIONS_ENABLED": "false",
                        "MAP_ENGINE": " Leaflet ", "MAPTILER_KEY": "maptiler-from-the-environment",
                        "MAP_3D_ENABLED": "false"}.items():
        monkeypatch.setenv(name, value)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_the_app_serves_it_from_the_environment_without_sign_in_or_a_database(environment):
    from tesda_track.main import create_app

    # Without `with`, TestClient skips the app's start-up tasks, which use the database.
    response = TestClient(create_app()).get("/api/v1/client-config")
    assert response.status_code == 200
    assert response.json() == {"carto_key": "carto-from-the-environment", "routing_enabled": False,
                               "skills_bridge_enabled": True, "tsp_sign_in": False, "tsp_mock": False, "tsp_suggestions": False,
                               "map_engine": "leaflet", "maptiler_key": "maptiler-from-the-environment",
                               "map_tiles_url": "", "map_3d": False}
