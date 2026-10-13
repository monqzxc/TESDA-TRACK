"""Directions to a training or assessment center: road routes from OSRM routing services with OpenStreetMap data,
and an estimated flight for long trips. Ported from the Streamlit app's directions.py and flights.py.

The API asks for routes, not the browser: the routing service then sees this server's address rather than the
learner's, and a self-hosted router can stay on the internal network. The learner's location is rounded before
anything else sees it (`round_origin`), and is never logged.

No airline schedules are used for flights: whether a flight runs between the two airports, and when, is for the
learner to check with the airlines. The time is an estimate from the distance between the airports.
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from functools import cache
from math import asin, cos, radians, sin, sqrt
from pathlib import Path
from typing import Any, Protocol

import httpx

DEFAULT_ROUTING_URL = "https://routing.openstreetmap.de/routed-car"
# Travel modes in the order they are offered, each with the public router's name for its profile.
PROFILES = {"car": "routed-car", "bike": "routed-bike", "foot": "routed-foot"}
USER_AGENT = "TESDA-TRACK learner portal (training center directions)"
NO_ROUTE = "No road route was found to this center. Google Maps may know another way to get there."
UNAVAILABLE = "Directions can't be loaded right now. Try again shortly, or open Google Maps."
# Two decimals of a degree is about 1 km: what the Streamlit app keeps of a learner's location and sends to the
# router. Finer than the ranking audit's one decimal (services.ranking.LOCATION_DECIMALS, about 11 km), which
# would start a route to a nearby center several kilometres from the learner.
ORIGIN_DECIMALS = 2
# The longest a request waits for its turn at the router. Past this the API answers 429 rather than holding the
# learner, and the request isn't sent.
MAX_WAIT_SECONDS = 10

AIRPORTS_FILE = Path(__file__).resolve().parents[2] / "seed" / "airports_ph.json"
MIN_TRIP_KM = 250  # nearer than this, the road is faster than getting to an airport and checking in
MIN_FLIGHT_KM = 150  # airports closer than this have no sensible flight between them
GROUND_MINUTES = 30  # taxiing, climbing and descending
CRUISE_KMH = 650  # what domestic jets and turboprops average between airports
_EARTH_RADIUS_KM = 6371.0088


class RouteError(Exception):
    """No route to draw; `message` is safe to show to the learner."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class RouterBusy(Exception):
    """The router's request limit is used up for the next `retry_after` seconds; nothing was sent."""

    def __init__(self, retry_after: float):
        super().__init__(f"The router is busy for {retry_after:.1f} s")
        self.retry_after = retry_after


class RouteCache(Protocol):
    """Where found routes are kept between requests (the PostgreSQL cache in the API, a dict in tests)."""

    def get(self, key: str) -> Any | None: ...

    def put(self, key: str, value: Any) -> None: ...


def round_origin(point: dict) -> dict:
    """The learner's location as the API uses it: to about a kilometre, before any cache key or request."""
    return {"latitude": round(point["latitude"], ORIGIN_DECIMALS),
            "longitude": round(point["longitude"], ORIGIN_DECIMALS)}


def distance_km(origin: dict, destination: dict) -> float:
    """Great-circle distance between two points with latitude and longitude."""
    lat1, lon1, lat2, lon2 = map(radians, (origin["latitude"], origin["longitude"],
                                           destination["latitude"], destination["longitude"]))
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * asin(sqrt(a))


def profile_urls(car_url: str) -> dict[str, str]:
    """The router for each travel mode. A self-hosted OSRM server serves one profile, so only a car URL named the
    way the public router names it (".../routed-car") has bicycle and walking routers beside it."""
    car_url = car_url.rstrip("/")
    head, _, profile = car_url.rpartition("/")
    if profile != PROFILES["car"]:
        return {"car": car_url}
    return {mode: f"{head}/{name}" for mode, name in PROFILES.items()}


def _point(longitude_latitude: list[float]) -> list[float]:
    """OSRM's [longitude, latitude] as the map's [latitude, longitude], to about a metre."""
    longitude, latitude = longitude_latitude
    return [round(latitude, 5), round(longitude, 5)]


class RouteClient:
    """Routes from OSRM servers. Requests start no more than one per `min_interval` seconds, across threads, and
    may then run side by side: the public router can take many seconds over a long route. A request that would
    wait more than `max_wait` seconds for its turn isn't sent (`RouterBusy`).

    The public OpenStreetMap router allows one request a second from each app, whatever the travel mode, and asks
    it to name itself. `base_url` is the car router; see `profile_urls` for the other modes. One client serves
    every learner, so the limit holds across requests.
    """

    def __init__(self, base_url: str, timeout: float = 20, min_interval: float = 1.0,
                 max_wait: float = MAX_WAIT_SECONDS, transport: httpx.BaseTransport | None = None):
        self._urls = profile_urls(base_url)
        self._http = httpx.Client(timeout=timeout, transport=transport, headers={"User-Agent": USER_AGENT})
        self._min_interval = min_interval
        self._max_wait = max_wait
        self._lock = threading.Lock()
        self._last_request = float("-inf")

    @property
    def modes(self) -> list[str]:
        """The travel modes this client can route, car first."""
        return list(self._urls)

    def url(self, mode: str) -> str:
        return self._urls[mode]

    def _reserve(self, count: int) -> list[float]:
        """Turns for `count` requests, one `min_interval` apart and in the order asked: all of them or none."""
        with self._lock:
            now = time.monotonic()
            first = max(now, self._last_request + self._min_interval)
            starts = [first + turn * self._min_interval for turn in range(count)]
            if starts and starts[-1] - now > self._max_wait:
                raise RouterBusy(starts[-1] - now - self._max_wait)
            if starts:
                self._last_request = starts[-1]
        return starts

    def route(self, origin: dict, destination: dict, mode: str = "car", start: float | None = None) -> dict:
        """The route between two points for a travel mode: [latitude, longitude] points, its length and time.

        `start` is a turn from `_reserve`; without one, the request takes the next turn.
        """
        points = ";".join(f"{point['longitude']:.6f},{point['latitude']:.6f}" for point in (origin, destination))
        start = self._reserve(1)[0] if start is None else start
        time.sleep(max(0.0, start - time.monotonic()))
        try:
            # OSRM ignores the profile named in the path; each server routes with its own.
            response = self._http.get(f"{self._urls[mode]}/route/v1/driving/{points}", params={
                "overview": "full", "geometries": "geojson", "steps": "false", "alternatives": "false"})
        except httpx.HTTPError as error:
            raise RouteError(UNAVAILABLE) from error
        try:
            answer = response.json()
        except ValueError as error:
            raise RouteError(UNAVAILABLE) from error
        if isinstance(answer, dict) and answer.get("code") == "NoRoute":
            raise RouteError(NO_ROUTE)
        try:
            if response.status_code != 200 or answer["code"] != "Ok":
                raise RouteError(UNAVAILABLE)
            route, waypoints = answer["routes"][0], answer["waypoints"]
            return {"path": [_point(coordinate) for coordinate in route["geometry"]["coordinates"]],
                    "distance_km": route["distance"] / 1000, "duration_min": route["duration"] / 60,
                    "start": _point(waypoints[0]["location"]), "end": _point(waypoints[-1]["location"])}
        except (KeyError, IndexError, TypeError, ValueError) as error:
            raise RouteError(UNAVAILABLE) from error

    def routes(self, origin: dict, destination: dict, modes: list[str]) -> dict[str, dict | RouteError]:
        """A route, or the error in its place, for each mode. Turns are taken for every mode at once (or
        `RouterBusy` is raised and nothing is sent); then the requests run side by side, since the router may take
        many seconds each."""
        starts = self._reserve(len(modes))
        if not modes:
            return {}

        def attempt(mode_start: tuple[str, float]) -> dict | RouteError:
            try:
                return self.route(origin, destination, *mode_start)
            except RouteError as failure:
                return failure

        with ThreadPoolExecutor(max_workers=len(modes)) as pool:
            return dict(zip(modes, pool.map(attempt, zip(modes, starts))))


@cache
def airports() -> tuple[dict, ...]:
    """Philippine airports with scheduled passenger flights."""
    return tuple(json.loads(AIRPORTS_FILE.read_text(encoding="utf-8"))["airports"])


def flight_minutes(kilometres: float) -> float:
    return GROUND_MINUTES + kilometres / CRUISE_KMH * 60


def _arc(start: dict, end: dict, steps: int = 32) -> list[list[float]]:
    """A gentle curve between two airports, as flight paths are drawn: a quadratic curve through a point beside the
    straight line's middle, a sixth of its length off to one side."""
    (lat1, lon1), (lat2, lon2) = (start["latitude"], start["longitude"]), (end["latitude"], end["longitude"])
    bend_lat, bend_lon = (lat1 + lat2) / 2 + (lon2 - lon1) / 6, (lon1 + lon2) / 2 - (lat2 - lat1) / 6
    return [[round((1 - t) ** 2 * lat1 + 2 * (1 - t) * t * bend_lat + t ** 2 * lat2, 5),
             round((1 - t) ** 2 * lon1 + 2 * (1 - t) * t * bend_lon + t ** 2 * lon2, 5)]
            for t in (step / steps for step in range(steps + 1))]


def flight(origin: dict, destination: dict, choices: tuple[dict, ...] | None = None) -> dict | None:
    """An estimated flight between the airports nearest each end, or None when the trip is too short to fly.

    Shaped like a road route (path, start, end, distance and minutes), plus both airports and how far each end is
    from its airport in a straight line.
    """
    choices = airports() if choices is None else choices
    if not choices or distance_km(origin, destination) < MIN_TRIP_KM:
        return None
    departure = min(choices, key=lambda airport: distance_km(origin, airport))
    arrival = min(choices, key=lambda airport: distance_km(destination, airport))
    kilometres = distance_km(departure, arrival)
    if departure is arrival or kilometres < MIN_FLIGHT_KM:
        return None
    path = _arc(departure, arrival)
    return {"path": path, "start": path[0], "end": path[-1], "distance_km": kilometres,
            "duration_min": flight_minutes(kilometres), "departure": departure, "arrival": arrival,
            "to_departure_km": distance_km(origin, departure), "from_arrival_km": distance_km(arrival, destination)}


def cache_key(router_url: str, origin: dict, destination: dict) -> str:
    """A hash, so cached routes can't be looked up or listed by place. The router's URL names the travel mode."""
    trip = json.dumps([router_url, origin, destination], sort_keys=True)
    return "routes:" + hashlib.sha256(trip.encode()).hexdigest()


@dataclass
class Directions:
    routes: dict[str, dict]  # car, bike and foot as the router has them, then "plane" for a long trip
    missing_modes: list[str]  # road modes the router has but couldn't route this time; asking again retries them


def directions(client: RouteClient, routes_cache: RouteCache, origin: dict, destination: dict) -> Directions:
    """Routes from the learner's location to a center for every travel mode the router has, car first, then an
    estimated flight when the trip is long enough to fly.

    Found routes are cached, so the router is asked once per trip and mode. A mode without a route is left out and
    asked again next time. Raises `RouteError` when no mode has a route, and `RouterBusy` when the router's limit
    is used up.
    """
    origin = round_origin(origin)
    destination = {"latitude": destination["latitude"], "longitude": destination["longitude"]}
    keys = {mode: cache_key(client.url(mode), origin, destination) for mode in client.modes}
    found = {mode: route for mode, key in keys.items() if (route := routes_cache.get(key)) is not None}
    missing = [mode for mode in client.modes if mode not in found]
    error = None
    for mode, outcome in client.routes(origin, destination, missing).items():
        if isinstance(outcome, RouteError):
            error = error or outcome.message
        else:
            found[mode] = outcome
            routes_cache.put(keys[mode], outcome)
    routes = {mode: found[mode] for mode in client.modes if mode in found}
    plane = flight(origin, destination)
    if plane:
        routes["plane"] = plane
    if not routes:
        raise RouteError(error or UNAVAILABLE)
    return Directions(routes, [mode for mode in client.modes if mode not in routes])
