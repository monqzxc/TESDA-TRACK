"""Road routes for the center finder, asked of a fake OSRM routing server (no network).

Run with:
    .venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_directions.py
"""
import time

import httpx
import pytest

from directions import RouteClient, RouteError, profile_urls, travel_time

ROUTER = "https://router.example.test/routed-car"
MY_PLACE = {"latitude": 15.47, "longitude": 120.59}
TARLAC_CENTER = {"latitude": 15.4755, "longitude": 120.5963}
# What the OpenStreetMap router answers, cut down to three points.
FOUND = {"code": "Ok",
         "routes": [{"geometry": {"type": "LineString", "coordinates": [[120.590012, 15.470031], [120.593481, 15.472876],
                                                                        [120.596289, 15.475512]]},
                     "legs": [{"steps": [], "summary": "", "weight": 204.3, "duration": 204.3, "distance": 1240.1}],
                     "weight_name": "routability", "weight": 204.3, "duration": 204.3, "distance": 1240.1}],
         "waypoints": [{"hint": "a", "distance": 3.5, "name": "MacArthur Highway", "location": [120.590012, 15.470031]},
                       {"hint": "b", "distance": 1.2, "name": "Romulo Boulevard", "location": [120.596289, 15.475512]}]}


def router(answer, **options):
    """A client whose server replies with `answer`: a response, or an exception to raise instead."""
    def handler(request):
        if isinstance(answer, Exception):
            raise answer
        return answer(request) if callable(answer) else answer
    return RouteClient(ROUTER, transport=httpx.MockTransport(handler), **options)


def test_a_route_is_asked_for_in_longitude_latitude_order_and_returned_as_map_points():
    asked = []

    def answer(request):
        asked.append(request)
        return httpx.Response(200, json=FOUND)

    route = router(answer).route(MY_PLACE, TARLAC_CENTER)

    [request] = asked
    assert request.url.path == "/routed-car/route/v1/driving/120.590000,15.470000;120.596300,15.475500"
    assert (request.url.params["overview"], request.url.params["geometries"]) == ("full", "geojson")
    assert route["path"] == [[15.47003, 120.59001], [15.47288, 120.59348], [15.47551, 120.59629]]
    assert (route["start"], route["end"]) == ([15.47003, 120.59001], [15.47551, 120.59629]), "where the roads begin"
    assert route["distance_km"] == pytest.approx(1.2401)
    assert route["duration_min"] == pytest.approx(3.405)


def test_each_travel_mode_asks_its_own_router():
    paths = []

    def answer(request):
        paths.append(request.url.path)
        return httpx.Response(200, json=FOUND)

    client = router(answer, min_interval=0)
    assert client.modes == ["car", "bike", "foot"]
    for mode in client.modes:
        client.route(MY_PLACE, TARLAC_CENTER, mode)
    assert [path.split("/route/")[0] for path in paths] == ["/routed-car", "/routed-bike", "/routed-foot"]


@pytest.mark.parametrize("url, modes", [
    ("https://routing.openstreetmap.de/routed-car/", {"car": "https://routing.openstreetmap.de/routed-car",
                                                      "bike": "https://routing.openstreetmap.de/routed-bike",
                                                      "foot": "https://routing.openstreetmap.de/routed-foot"}),
    ("http://osrm:5000", {"car": "http://osrm:5000"}),
], ids=["public router", "self-hosted"])
def test_only_the_public_routers_naming_brings_bicycle_and_walking_routes(url, modes):
    assert profile_urls(url) == modes


def test_no_road_to_the_center_is_reported_as_such():
    no_road = httpx.Response(400, json={"message": "Impossible route between points", "code": "NoRoute"})
    with pytest.raises(RouteError, match="No road route"):
        router(no_road).route(MY_PLACE, TARLAC_CENTER)


@pytest.mark.parametrize("answer", [
    httpx.ConnectError("connection refused"),
    httpx.ReadTimeout("timed out"),
    httpx.Response(502, text="<html>Bad gateway</html>"),
    httpx.Response(200, text="not json"),
    httpx.Response(200, json={"code": "Ok", "routes": [], "waypoints": []}),
    httpx.Response(400, json={"message": "Invalid coordinate value.", "code": "InvalidValue"}),
], ids=["unreachable", "too slow", "server error", "not json", "no routes", "rejected"])
def test_a_router_that_fails_reads_as_unavailable(answer):
    with pytest.raises(RouteError, match="right now"):
        router(answer).route(MY_PLACE, TARLAC_CENTER)


def test_requests_name_the_app_to_the_routing_service():
    agents = []

    def answer(request):
        agents.append(request.headers["user-agent"])
        return httpx.Response(200, json=FOUND)

    router(answer).route(MY_PLACE, TARLAC_CENTER)
    assert "TESDA-TRACK" in agents[0], "the public router's usage policy asks for an identifying user agent"


def test_back_to_back_requests_wait_out_the_minimum_interval():
    sent = []

    def answer(request):
        sent.append(time.monotonic())
        return httpx.Response(200, json=FOUND)

    client = router(answer, min_interval=0.3)
    client.route(MY_PLACE, TARLAC_CENTER)
    client.route(TARLAC_CENTER, MY_PLACE)
    assert sent[1] - sent[0] >= 0.25, "the public router allows one request a second"


def test_requests_from_several_threads_start_a_turn_apart_and_then_run_side_by_side():
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event

    started, release = [], Event()

    def answer(request):
        started.append(time.monotonic())
        if len(started) == 3:
            release.set()
        release.wait(2)  # a slow router: no answer comes back until every request has started
        return httpx.Response(200, json=FOUND)

    client = router(answer, min_interval=0.2)
    begun = time.monotonic()
    with ThreadPoolExecutor(3) as pool:
        list(pool.map(lambda mode: client.route(MY_PLACE, TARLAC_CENTER, mode), client.modes))
    gaps = [later - earlier for earlier, later in zip(sorted(started), sorted(started)[1:])]
    assert all(gap >= 0.15 for gap in gaps), "starts stay a turn apart"
    assert time.monotonic() - begun < 1.5, "a slow answer doesn't hold back the next request"


@pytest.mark.parametrize("minutes, words", [(0.2, "1 min"), (3.4, "3 min"), (20.4, "20 min"), (59.6, "1 hr"),
                                            (75, "1 hr 15 min"), (125.2, "2 hr 5 min")])
def test_travel_time_reads_in_hours_and_minutes(minutes, words):
    assert travel_time(minutes) == words
