"""GET /api/v1/routes through the full app, with routes kept in the PostgreSQL cache. The router is a fake
(httpx MockTransport): tests never call a real routing server."""
from datetime import timedelta

import httpx
from sqlmodel import select

from tesda_track.config import get_settings
from tesda_track.models import CacheEntry, utcnow
from tesda_track.routers.routes import route_client
from tesda_track.services.routing import RouteClient

FOUND = {"code": "Ok",
         "routes": [{"geometry": {"type": "LineString",
                                  "coordinates": [[120.590012, 15.470031], [120.596289, 15.475512]]},
                     "duration": 204.3, "distance": 1240.1}],
         "waypoints": [{"location": [120.590012, 15.470031]}, {"location": [120.596289, 15.475512]}]}


def fake_router(app):
    asked = []

    def answer(request):
        asked.append(str(request.url))
        return httpx.Response(200, json=FOUND)

    client = RouteClient("https://router.example.test/routed-car", min_interval=0,
                         transport=httpx.MockTransport(answer))
    app.dependency_overrides[route_client] = lambda: client
    return asked


def test_routes_are_public_and_cached_without_coordinates_in_the_keys(app, client, session, monkeypatch):
    monkeypatch.setattr(get_settings(), "routing_cache_ttl_seconds", 3600)
    asked = fake_router(app)
    params = {"origin": "15.471234,120.586789", "destination": "15.4755,120.5963"}

    first = client.get("/api/v1/routes", params=params)
    second = client.get("/api/v1/routes", params=params)

    assert first.status_code == second.status_code == 200, first.text
    assert first.json() == second.json()
    assert [route["mode"] for route in first.json()["routes"]] == ["car", "bike", "foot"]
    assert len(asked) == 3, "the second request is served from the cache"
    assert all("120.590000,15.470000;" in url for url in asked), "the router gets the rounded origin"
    entries = session.exec(select(CacheEntry).where(CacheEntry.key.startswith("routes:"))).all()
    assert len(entries) == 3
    assert all("15.47" not in entry.key and "120.5" not in entry.key for entry in entries)
    assert all(entry.expires_at > utcnow() + timedelta(minutes=59) for entry in entries)


def test_routing_turned_off_sends_nothing(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "routing_url", "")
    response = client.get("/api/v1/routes", params={"origin": "15.47,120.59", "destination": "15.4755,120.5963"})
    assert response.status_code == 200
    assert response.json() == {"routing_enabled": False, "routes": [], "missing_modes": []}


def test_points_outside_the_philippines_are_refused(app, client):
    asked = fake_router(app)
    response = client.get("/api/v1/routes", params={"origin": "51.5,-0.12", "destination": "15.4755,120.5963"})
    assert response.status_code == 422
    assert asked == []
