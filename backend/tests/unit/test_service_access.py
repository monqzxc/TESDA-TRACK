"""Road-access comparisons using an in-memory cache and fake OSRM; no database or network.

Run with --confcutdir=backend/tests/unit.
"""
import threading

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from tesda_track.config import get_settings
from tesda_track.db import get_session
from tesda_track.errors import InvalidRequestError
from tesda_track.routers import service_access as access_router
from tesda_track.routers.routes import RouteLimits, route_cache, route_client
from tesda_track.schemas.service_access import ServiceAccessRequest
from tesda_track.services import routing, service_access
from tesda_track.services.service_access import AccessSite, compare

ORIGIN = {"latitude": 14.201234, "longitude": 121.163456}
SITES = [
    AccessSite("training", 1, "Example training site", 14.25, 121.18),
    AccessSite("assessment", 2, "Example assessment site", 14.3, 121.2),
]


class DictCache:
    def __init__(self):
        self.values = {}
        self.threads = []

    def get(self, key):
        self.threads.append(threading.get_ident())
        return self.values.get(key)

    def put(self, key, value):
        self.threads.append(threading.get_ident())
        self.values[key] = value


def request_for(sites=SITES, **overrides):
    return ServiceAccessRequest.model_validate({
        "qualification_code": "CSS-NC-II", "origin": ORIGIN, "mode": "car", "maximum_minutes": 45,
        "candidates": [{"kind": site.kind, "site_id": site.site_id} for site in sites],
        **overrides,
    })


def response_for(request, duration=32, distance=10):
    start, end = [[float(value) for value in point.split(",")]
                  for point in request.url.path.rsplit("/", 1)[1].split(";")]
    return httpx.Response(200, json={
        "code": "Ok",
        "routes": [{"duration": duration * 60, "distance": distance * 1000,
                    "geometry": {"coordinates": [start, end]}}],
        "waypoints": [{"location": start}, {"location": end}],
    })


def client_for(handler=response_for, url="https://router.example.test/routed-car"):
    return routing.RouteClient(url, min_interval=0, transport=httpx.MockTransport(handler))


def test_origin_is_rounded_before_network_or_cache_and_cache_work_stays_on_request_thread():
    sent = []

    def handler(request):
        sent.append(str(request.url))
        return response_for(request)

    cache = DictCache()
    result = compare(request_for(), SITES, client_for(handler), cache)
    assert len(sent) == 2
    assert all("121.160000,14.200000;" in url for url in sent)
    assert all("201234" not in url and "163456" not in url for url in sent)
    assert all(key.startswith("routes:") and "14.2" not in key for key in cache.values)
    assert set(cache.threads) == {threading.get_ident()}
    assert result.origin_precision_decimals == 2
    assert [row.within_budget for row in result.results] == [True, True]
    assert all(row.status == "modeled_route" for row in result.results)
    assert result.network_version is None
    assert "origin" not in result.model_dump()


def test_faster_farther_site_can_be_compared_using_network_time_and_input_order_is_preserved():
    def handler(request):
        farther = request.url.path.endswith("121.200000,14.300000")
        return response_for(request, duration=22 if farther else 52, distance=18 if farther else 8)

    result = compare(request_for(), SITES, client_for(handler), DictCache())
    assert [(row.site_id, row.duration_min, row.within_budget) for row in result.results] == [
        (1, 52, False), (2, 22, True),
    ]
    assert result.results[1].distance_km > result.results[0].distance_km


def test_an_unknown_or_absent_budget_is_never_a_positive_access_claim():
    result = compare(request_for(maximum_minutes=None), SITES, client_for(), DictCache())
    assert all(row.within_budget is None for row in result.results)
    assert all(row.duration_min == 32 for row in result.results)


def test_budget_check_uses_unrounded_modeled_duration():
    result = compare(request_for(), SITES, client_for(lambda req: response_for(req, duration=45.004)), DictCache())
    assert result.results[0].duration_min == 45
    assert result.results[0].within_budget is False


def test_cache_and_colocated_sites_do_not_repeat_network_requests():
    sites = [SITES[0], AccessSite("assessment", 2, "Same campus", SITES[0].latitude, SITES[0].longitude)]
    sent = []

    def handler(request):
        sent.append(request)
        return response_for(request)

    client, cache = client_for(handler), DictCache()
    first = compare(request_for(sites), sites, client, cache)
    second = compare(request_for(sites), sites, client, cache)
    assert len(sent) == 1
    assert [row.duration_min for row in first.results] == [32, 32]
    assert [row.duration_min for row in second.results] == [32, 32]


def test_cached_routes_for_one_mode_do_not_establish_another_mode():
    sent = []

    def handler(request):
        sent.append(request.url.path)
        return response_for(request)

    client, cache = client_for(handler), DictCache()
    compare(request_for(), SITES, client, cache)
    compare(request_for(mode="foot"), SITES, client, cache)
    assert len(sent) == 4
    assert sum("routed-foot/" in path for path in sent) == 2


@pytest.mark.parametrize("handler,status", [
    (lambda req: httpx.Response(400, json={"code": "NoRoute"}), "no_route_in_network"),
    (lambda req: httpx.Response(503, text="Unavailable"), "routing_unavailable"),
])
def test_no_route_and_provider_failure_remain_distinct_and_never_pass_a_budget(handler, status):
    cache = DictCache()
    result = compare(request_for(), SITES, client_for(handler), cache)
    assert {row.status for row in result.results} == {status}
    assert all(row.duration_min is None and row.within_budget is None for row in result.results)
    assert not cache.values


def test_disabled_router_unsupported_mode_and_missing_coordinates_remain_distinct():
    disabled = compare(request_for(), SITES, None, DictCache())
    assert disabled.routing_enabled is False
    assert {row.status for row in disabled.results} == {"routing_unavailable"}
    single_mode = client_for(url="http://osrm.example.test:5000")
    unsupported = compare(request_for(mode="foot"), SITES, single_mode, DictCache())
    assert {row.status for row in unsupported.results} == {"unsupported_mode"}
    sites = [AccessSite("training", 1, "No coordinates", None, None)]
    unknown = compare(request_for(sites), sites, single_mode, DictCache())
    assert unknown.results[0].status == "location_unknown"
    assert unknown.results[0].within_budget is None


def test_busy_router_is_reported_without_dropping_unknown_sites():
    class Busy:
        modes = ["car"]

        def url(self, mode):
            return "https://router.example.test/car"

        def route(self, *args):
            raise routing.RouterBusy(4)

    result = compare(request_for(), SITES, Busy(), DictCache())
    assert len(result.results) == 2
    assert {row.status for row in result.results} == {"routing_busy"}
    assert all(row.within_budget is None for row in result.results)


def test_long_unroutable_journey_never_uses_a_flight_estimate(monkeypatch):
    def forbidden(*args):
        pytest.fail("A flight estimate cannot establish road accessibility")

    monkeypatch.setattr(routing, "flight", forbidden)
    result = compare(request_for(), SITES, client_for(lambda req: httpx.Response(400, json={"code": "NoRoute"})), DictCache())
    assert all(row.status == "no_route_in_network" for row in result.results)


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), -1])
def test_malformed_duration_cannot_pass_budget_or_enter_cache(bad):
    class Broken:
        modes = ["car"]

        def url(self, mode):
            return "https://router.example.test/car"

        def route(self, origin, destination, mode):
            return {"duration_min": bad, "distance_km": 10,
                    "start": [origin["latitude"], origin["longitude"]],
                    "end": [destination["latitude"], destination["longitude"]]}

    cache = DictCache()
    result = compare(request_for(), SITES, Broken(), cache)
    assert all(row.status == "routing_unavailable" and row.within_budget is None for row in result.results)
    assert not cache.values


def test_snapped_road_endpoint_offsets_are_disclosed():
    class Snapped:
        modes = ["car"]

        def url(self, mode):
            return "https://router.example.test/car"

        def route(self, origin, destination, mode):
            return {"duration_min": 20, "distance_km": 10,
                    "start": [origin["latitude"] + .001, origin["longitude"]],
                    "end": [destination["latitude"] + .003, destination["longitude"]]}

    result = compare(request_for(), SITES, Snapped(), DictCache())
    assert result.results[0].origin_snap_distance_km > 0
    assert result.results[0].destination_snap_distance_km > .3
    assert any("unverified" in limitation for limitation in result.limitations)


def test_unresolved_candidate_cannot_be_substituted_for_a_catalog_site():
    with pytest.raises(InvalidRequestError):
        compare(request_for(), SITES[:1], client_for(), DictCache())


@pytest.mark.parametrize("change", [
    {"origin": {"latitude": 60, "longitude": 121}},
    {"origin": {"latitude": 14, "longitude": float("nan")}},
    {"candidates": []},
    {"candidates": [{"kind": "training", "site_id": n} for n in range(1, 10)]},
    {"candidates": [{"kind": "training", "site_id": 1}] * 2},
    {"candidates": [{"kind": "training", "site_id": 1, "destination": ORIGIN}]},
    {"router_url": "https://untrusted.example.test"},
    {"maximum_minutes": float("inf")},
    {"mode": "plane"},
])
def test_request_bounds_reject_arbitrary_destinations_upstreams_duplicates_and_nonroad_modes(change):
    with pytest.raises(ValidationError):
        request_for(**change)


def test_endpoint_takes_location_only_in_body_and_reuses_client_rate_limit(monkeypatch):
    application = FastAPI()
    application.include_router(access_router.router, prefix="/api/v1")
    application.state.route_limits = RouteLimits()
    application.dependency_overrides[get_session] = lambda: None
    application.dependency_overrides[route_client] = lambda: None
    application.dependency_overrides[route_cache] = DictCache
    settings = get_settings().model_copy(update={"routing_rate_limit_per_minute": 1})
    application.dependency_overrides[get_settings] = lambda: settings
    monkeypatch.setattr(service_access, "resolve_sites", lambda session, request: SITES)
    body = request_for().model_dump()
    with TestClient(application) as http:
        response = http.post("/api/v1/recommendations/service-access", json=body)
        assert response.status_code == 200
        assert {item["status"] for item in response.json()["results"]} == {"routing_unavailable"}
        assert "origin" not in response.json()
        assert http.get("/api/v1/recommendations/service-access").status_code == 405
        blocked = http.post("/api/v1/recommendations/service-access", json=body)
        assert blocked.status_code == 429
        assert int(blocked.headers["retry-after"]) > 0
