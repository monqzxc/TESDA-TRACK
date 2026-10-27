"""Database-free checks of GET /api/v1/routes, with a fake OSRM router (no network). Run with
--confcutdir=backend/tests/unit."""
import logging

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tesda_track.config import Settings, get_settings
from tesda_track.routers.routes import HideCoordinatesFilter, RouteLimits, route_cache, route_client, router
from tesda_track.schemas.routes import Directions
from tesda_track.services.routing import RouteClient

FOUND = {"code": "Ok",
         "routes": [{"geometry": {"type": "LineString",
                                  "coordinates": [[120.590012, 15.470031], [120.596289, 15.475512]]},
                     "duration": 204.3, "distance": 1240.1}],
         "waypoints": [{"location": [120.590012, 15.470031]}, {"location": [120.596289, 15.475512]}]}
TARLAC = "15.47,120.59"
TARLAC_CENTER = "15.4755,120.5963"
ILOILO_CITY = "10.72,122.56"
MANILA_CENTER = "14.5995,120.9842"


def settings(**kwargs):
    return Settings(_env_file=None, database_url="postgresql://unused", secret_key="test-only-" * 8, **kwargs)


class DictCache:
    def __init__(self):
        self.values = {}

    def get(self, key):
        return self.values.get(key)

    def put(self, key, value):
        self.values[key] = value


class Router:
    """A fake OSRM server: FOUND for every mode unless told otherwise, recording each URL asked."""

    def __init__(self):
        self.asked = []
        self.answer = lambda request: httpx.Response(200, json=FOUND)

    def __call__(self, request):
        self.asked.append(str(request.url))
        return self.answer(request)


def make_api(url="https://router.example.test/routed-car", **overrides):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.state.route_limits = RouteLimits()
    fake, response_cache = Router(), DictCache()
    test_settings = settings(routing_url=url, **overrides)
    client = RouteClient(url, min_interval=0, transport=httpx.MockTransport(fake)) if url else None
    app.dependency_overrides[get_settings] = lambda: test_settings
    app.dependency_overrides[route_client] = lambda: client
    app.dependency_overrides[route_cache] = lambda: response_cache
    return app, fake, response_cache


@pytest.fixture
def api():
    app, fake, _ = make_api()
    with TestClient(app) as client:
        yield client, fake


def directions(client, origin=TARLAC, destination=TARLAC_CENTER):
    return client.get("/api/v1/routes", params={"origin": origin, "destination": destination})


def test_each_travel_mode_comes_back_with_its_route(api):
    client, fake = api
    response = directions(client)
    assert response.status_code == 200
    body = Directions.model_validate(response.json()).model_dump()
    assert body["routing_enabled"] is True and body["missing_modes"] == []
    assert [route["mode"] for route in body["routes"]] == ["car", "bike", "foot"]
    car = body["routes"][0]
    assert car["path"] == [[15.47003, 120.59001], [15.47551, 120.59629]]
    assert (car["start"], car["end"]) == ([15.47003, 120.59001], [15.47551, 120.59629])
    assert car["distance_km"] == pytest.approx(1.2401) and car["duration_min"] == pytest.approx(3.405)
    assert len(fake.asked) == 3


def test_a_long_trip_ends_with_an_estimated_flight(api):
    client, _ = api
    routes = directions(client, ILOILO_CITY, MANILA_CENTER).json()["routes"]
    assert [route["mode"] for route in routes] == ["car", "bike", "foot", "plane"]
    plane = routes[-1]
    assert (plane["departure"]["iata"], plane["arrival"]["iata"]) == ("ILO", "MNL")
    assert {"to_departure_km", "from_arrival_km", "path", "duration_min"} <= set(plane)


def test_modes_that_fail_are_listed_as_missing(api):
    client, fake = api
    fake.answer = lambda request: (httpx.Response(502, text="busy") if "/routed-foot/" in str(request.url)
                                   else httpx.Response(200, json=FOUND))
    body = directions(client).json()
    assert [route["mode"] for route in body["routes"]] == ["car", "bike"]
    assert body["missing_modes"] == ["foot"]


def test_no_road_route_is_not_found(api):
    client, fake = api
    fake.answer = lambda request: httpx.Response(400, json={"code": "NoRoute", "message": "Impossible route"})
    response = directions(client)
    assert response.status_code == 404
    assert "No road route" in response.json()["detail"]


def test_an_unreachable_router_is_service_unavailable(api):
    client, fake = api

    def refuse(request):
        raise httpx.ConnectError("refused")

    fake.answer = refuse
    response = directions(client)
    assert response.status_code == 503
    assert "right now" in response.json()["detail"]


def test_routing_turned_off_answers_so_the_app_can_link_to_google_maps():
    app, fake, _ = make_api(url="")
    with TestClient(app) as client:
        response = directions(client)
    assert response.status_code == 200
    assert response.json() == {"routing_enabled": False, "routes": [], "missing_modes": []}
    assert fake.asked == []


@pytest.mark.parametrize("origin", ["", "15.47", "15.47,120.59,3", "north", "15.47;120.59", "1e2,120",
                                    "51.5,-0.12", "15.47,140.0", "95,120.59"],
                         ids=["empty", "one number", "three numbers", "words", "semicolon", "exponent", "london",
                              "pacific", "off the globe"])
def test_points_outside_the_philippines_or_malformed_are_refused(api, origin):
    client, fake = api
    assert directions(client, origin=origin).status_code == 422
    assert directions(client, destination=origin).status_code == 422
    assert fake.asked == []


def test_points_may_have_spaces_after_the_comma(api):
    client, _ = api
    assert directions(client, origin="15.47, 120.59").status_code == 200


def test_the_router_gets_the_origin_rounded_to_about_a_kilometre(api):
    client, fake = api
    directions(client, origin="15.471234,120.586789")
    assert all("/120.590000,15.470000;120.596300,15.475500" in url for url in fake.asked)


def test_repeated_trips_are_served_from_the_cache():
    app, fake, response_cache = make_api()
    with TestClient(app) as client:
        first, second = directions(client).json(), directions(client).json()
    assert first == second
    assert len(fake.asked) == 3 and len(response_cache.values) == 3
    assert all("15.47" not in key for key in response_cache.values)


def test_each_client_gets_a_limited_number_of_directions():
    app, fake, _ = make_api(routing_rate_limit_per_minute=2)
    with TestClient(app, client=("203.0.113.5", 50000)) as client:
        for _ in range(2):
            assert directions(client).status_code == 200
        response = directions(client)
    assert response.status_code == 429
    assert "minute" in response.json()["detail"]
    assert 1 <= int(response.headers["Retry-After"]) <= 60


def test_invalid_requests_do_not_use_up_the_limit():
    app, _, _ = make_api(routing_rate_limit_per_minute=1)
    with TestClient(app) as client:
        assert directions(client, origin="nowhere").status_code == 422
        assert directions(client).status_code == 200


def test_a_busy_router_answers_429_with_retry_after():
    app, fake, _ = make_api()
    busy = RouteClient("https://router.example.test/routed-car", min_interval=30, max_wait=40,
                       transport=httpx.MockTransport(fake))
    app.dependency_overrides[route_client] = lambda: busy
    busy._reserve(1)  # someone else's request just took the router's turn: the next three need 90 s
    with TestClient(app) as client:
        response = directions(client)
    assert response.status_code == 429
    assert "busy" in response.json()["detail"]
    assert 45 <= int(response.headers["Retry-After"]) <= 51
    assert fake.asked == []


def test_the_access_log_leaves_out_the_coordinates():
    record = logging.LogRecord("uvicorn.access", logging.INFO, __file__, 1, '%s - "%s %s HTTP/%s" %d',
                               ("203.0.113.5:50000", "GET", f"/api/v1/routes?origin={TARLAC}&destination=x", "1.1",
                                200), None)
    assert HideCoordinatesFilter().filter(record)
    assert record.getMessage() == '203.0.113.5:50000 - "GET /api/v1/routes HTTP/1.1" 200'
    other = logging.LogRecord("uvicorn.access", logging.INFO, __file__, 1, '%s - "%s %s HTTP/%s" %d',
                              ("203.0.113.5:50000", "GET", "/api/v1/qualifications?q=welding", "1.1", 200), None)
    HideCoordinatesFilter().filter(other)
    assert "q=welding" in other.getMessage(), "other paths are logged as before"
