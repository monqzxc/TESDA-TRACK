"""Database-free checks of Directions: road routes asked of a fake OSRM routing server (no network), estimated
flights, and how the two are put together. Run with --confcutdir=backend/tests/unit.

Ported from classic/tests/test_directions.py and test_flights.py.
"""
import time
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import httpx
import pytest

from tesda_track.services.routing import (GROUND_MINUTES, NO_ROUTE, UNAVAILABLE, RouteClient, RouteError,
                                          RouterBusy, airports, cache_key, directions, flight, flight_minutes,
                                          profile_urls, round_origin)

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


def no_road(request=None):
    return httpx.Response(400, json={"message": "Impossible route between points", "code": "NoRoute"})


def server_error(request=None):
    return httpx.Response(502, text="<html>Bad gateway</html>")


ILOILO = {"iata": "ILO", "name": "Iloilo International Airport", "latitude": 10.83302, "longitude": 122.49305}
MANILA = {"iata": "MNL", "name": "Ninoy Aquino International Airport", "latitude": 14.5086, "longitude": 121.01944}
CLARK = {"iata": "CRK", "name": "Clark International Airport", "latitude": 15.18598, "longitude": 120.55998}
AIRPORTS = (ILOILO, MANILA, CLARK)
ILOILO_CITY = {"latitude": 10.72, "longitude": 122.56}
MAKATI = {"latitude": 14.55, "longitude": 121.02}
MANILA_CENTER = {"latitude": 14.5995, "longitude": 120.9842}


def router(answer, **options):
    """A client whose server replies with `answer`: a response, or an exception to raise instead."""
    def handler(request):
        if isinstance(answer, Exception):
            raise answer
        return answer(request) if callable(answer) else answer
    return RouteClient(ROUTER, transport=httpx.MockTransport(handler), **options)


class DictCache:
    """Stands in for the PostgreSQL cache."""
    def __init__(self):
        self.values = {}

    def get(self, key):
        return self.values.get(key)

    def put(self, key, value):
        self.values[key] = value


# --- Road routes (from test_directions.py) -------------------------------------------------------------------

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


def test_all_modes_of_one_trip_start_a_turn_apart_and_run_side_by_side():
    started, release = [], Event()

    def answer(request):
        started.append(time.monotonic())
        if len(started) == 3:
            release.set()
        release.wait(2)
        return httpx.Response(200, json=FOUND)

    begun = time.monotonic()
    outcomes = router(answer, min_interval=0.2).routes(MY_PLACE, TARLAC_CENTER, ["car", "bike", "foot"])
    assert list(outcomes) == ["car", "bike", "foot"]
    assert all(isinstance(route, dict) for route in outcomes.values())
    gaps = [later - earlier for earlier, later in zip(sorted(started), sorted(started)[1:])]
    assert all(gap >= 0.15 for gap in gaps)
    assert time.monotonic() - begun < 1.5


def test_a_request_that_would_wait_too_long_for_its_turn_is_not_sent():
    sent = []

    def answer(request):
        sent.append(request)
        return httpx.Response(200, json=FOUND)

    client = router(answer, min_interval=5, max_wait=8)
    client.routes(MY_PLACE, TARLAC_CENTER, ["car"])  # starts now; the next turn is 5 s away
    with pytest.raises(RouterBusy) as busy:
        client.routes(MY_PLACE, TARLAC_CENTER, ["car", "bike"])  # the second would start 10 s from now
    assert busy.value.retry_after == pytest.approx(2, abs=0.2)
    assert len(sent) == 1, "a refused trip takes no turns and sends nothing"


# --- Estimated flights (from test_flights.py) ----------------------------------------------------------------

def test_a_long_trip_flies_between_the_airports_nearest_each_end():
    trip = flight(ILOILO_CITY, MANILA_CENTER, AIRPORTS)
    assert (trip["departure"]["iata"], trip["arrival"]["iata"]) == ("ILO", "MNL")
    assert trip["distance_km"] == pytest.approx(450, abs=15)
    assert trip["duration_min"] == pytest.approx(flight_minutes(trip["distance_km"]))
    assert trip["to_departure_km"] < 20 and trip["from_arrival_km"] < 15
    assert (trip["start"], trip["end"]) == ([10.83302, 122.49305], [14.5086, 121.01944]), "the path runs airport to airport"


def test_a_short_trip_is_not_flown():
    assert flight(MAKATI, MANILA_CENTER, AIRPORTS) is None


def test_two_ends_served_by_airports_too_close_together_are_not_flown():
    tarlac = {"latitude": 15.4755, "longitude": 120.5963}
    assert flight(tarlac, {"latitude": 12.0, "longitude": 121.0}, (CLARK, MANILA)) is None, \
        "Clark and Manila are about 90 km apart: the road is the way"


def test_flight_time_adds_ground_time_to_the_time_in_the_air():
    assert flight_minutes(0) == GROUND_MINUTES
    assert flight_minutes(650) == pytest.approx(GROUND_MINUTES + 60)


def test_the_path_bends_away_from_the_straight_line():
    path = flight(ILOILO_CITY, MANILA_CENTER, AIRPORTS)["path"]
    middle = path[len(path) // 2]
    straight = [(ILOILO["latitude"] + MANILA["latitude"]) / 2, (ILOILO["longitude"] + MANILA["longitude"]) / 2]
    assert abs(middle[0] - straight[0]) + abs(middle[1] - straight[1]) > 0.3


def test_the_bundled_airports_include_the_main_hubs():
    codes = {airport["iata"] for airport in airports()}
    assert {"MNL", "CEB", "DVO", "ILO", "CRK"} <= codes
    assert all(airport["latitude"] and airport["longitude"] and airport["municipality"] for airport in airports())


# --- Directions: modes, flights, cache and rounding ----------------------------------------------------------

def counting_router(answers=None, **options):
    """A client answering FOUND, or with the answer given for a mode's router, recording the URLs it was asked."""
    asked = []

    def answer(request):
        asked.append(str(request.url))
        profile = request.url.path.split("/route/")[0].rsplit("/", 1)[-1]
        return (answers or {}).get(profile, lambda: httpx.Response(200, json=FOUND))()

    return router(answer, **{"min_interval": 0, **options}), asked


def test_every_mode_the_router_has_is_routed_car_first():
    client, asked = counting_router()
    found = directions(client, DictCache(), MY_PLACE, TARLAC_CENTER)
    assert list(found.routes) == ["car", "bike", "foot"]
    assert found.missing_modes == []
    assert len(asked) == 3


def test_a_long_trip_adds_an_estimated_flight_after_the_roads():
    client, _ = counting_router()
    found = directions(client, DictCache(), ILOILO_CITY, MANILA_CENTER)
    assert list(found.routes) == ["car", "bike", "foot", "plane"]
    assert (found.routes["plane"]["departure"]["iata"], found.routes["plane"]["arrival"]["iata"]) == ("ILO", "MNL")


def test_a_mode_without_a_route_is_left_out_and_asked_again_next_time():
    client, asked = counting_router({"routed-bike": server_error})
    response_cache = DictCache()
    found = directions(client, response_cache, MY_PLACE, TARLAC_CENTER)
    assert list(found.routes) == ["car", "foot"]
    assert found.missing_modes == ["bike"]
    assert len(response_cache.values) == 2, "failures aren't cached"
    asked.clear()
    directions(client, response_cache, MY_PLACE, TARLAC_CENTER)
    assert len(asked) == 1 and "/routed-bike/" in asked[0], "only the missing mode is asked again"


def test_found_routes_come_from_the_cache():
    client, asked = counting_router()
    response_cache = DictCache()
    first = directions(client, response_cache, MY_PLACE, TARLAC_CENTER)
    second = directions(client, response_cache, MY_PLACE, TARLAC_CENTER)
    assert first == second
    assert len(asked) == 3


def test_no_road_anywhere_is_reported_as_such():
    client, _ = counting_router({mode: no_road for mode in ("routed-car", "routed-bike", "routed-foot")})
    with pytest.raises(RouteError) as failure:
        directions(client, DictCache(), MY_PLACE, TARLAC_CENTER)
    assert failure.value.message == NO_ROUTE


def test_an_unreachable_router_is_reported_as_unavailable():
    with pytest.raises(RouteError) as failure:
        directions(router(httpx.ConnectError("refused"), min_interval=0), DictCache(), MY_PLACE, TARLAC_CENTER)
    assert failure.value.message == UNAVAILABLE


def test_a_long_trip_still_gets_its_flight_when_the_roads_fail():
    found = directions(router(httpx.ConnectError("refused"), min_interval=0), DictCache(), ILOILO_CITY,
                       MANILA_CENTER)
    assert list(found.routes) == ["plane"]
    assert found.missing_modes == ["car", "bike", "foot"]


def test_a_self_hosted_router_routes_by_car_only():
    asked = []

    def answer(request):
        asked.append(request.url.path)
        return httpx.Response(200, json=FOUND)

    client = RouteClient("http://osrm:5000", min_interval=0, transport=httpx.MockTransport(answer))
    found = directions(client, DictCache(), MY_PLACE, TARLAC_CENTER)
    assert list(found.routes) == ["car"] and found.missing_modes == []
    assert asked == ["/route/v1/driving/120.590000,15.470000;120.596300,15.475500"]


def test_the_origin_is_rounded_before_it_is_sent_or_cached():
    client, asked = counting_router()
    response_cache = DictCache()
    precise = {"latitude": 15.471234, "longitude": 120.586789}
    directions(client, response_cache, precise, TARLAC_CENTER)
    assert all("120.590000,15.470000;" in url for url in asked), "the router gets about a kilometre, no finer"
    assert round_origin(precise) == {"latitude": 15.47, "longitude": 120.59}
    nearby = {"latitude": 15.468, "longitude": 120.5912}  # the same rounded place: the cached routes serve it
    asked.clear()
    directions(client, response_cache, nearby, TARLAC_CENTER)
    assert asked == []


def test_cache_keys_hold_no_coordinates():
    key = cache_key(ROUTER, MY_PLACE, TARLAC_CENTER)
    assert key.startswith("routes:")
    assert "15.47" not in key and "120.59" not in key
    assert key != cache_key(ROUTER.replace("car", "bike"), MY_PLACE, TARLAC_CENTER), "each mode has its own"
