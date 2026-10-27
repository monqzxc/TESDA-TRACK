"""Routes for the center finder's Directions, from OSRM routing services with OpenStreetMap data.

The Streamlit server asks for routes, not the browser: the routing service then sees this server's address rather
than the learner's, and a self-hosted router can stay on the internal network.
"""
from __future__ import annotations

import threading
import time

import httpx

DEFAULT_ROUTING_URL = "https://routing.openstreetmap.de/routed-car"
# Travel modes in the order they are offered, each with the public router's name for its profile.
PROFILES = {"car": "routed-car", "bike": "routed-bike", "foot": "routed-foot"}
USER_AGENT = "TESDA-TRACK learner portal (training center directions)"
NO_ROUTE = "No road route was found to this center. Google Maps may know another way to get there."
UNAVAILABLE = "Directions can't be loaded right now. Try again shortly, or open Google Maps."


class RouteError(Exception):
    """No route to draw; `message` is safe to show to the learner."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def travel_time(minutes: float) -> str:
    """Minutes as a learner reads them: "25 min", "1 hr", "2 hr 5 min"."""
    hours, rest = divmod(max(1, round(minutes)), 60)
    if not hours:
        return f"{rest} min"
    return f"{hours} hr {rest} min" if rest else f"{hours} hr"


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
    may then run side by side: the public router can take many seconds over a long route.

    The public OpenStreetMap router allows one request a second from each app, whatever the travel mode, and asks
    it to name itself. `base_url` is the car router; see `profile_urls` for the other modes.
    """

    def __init__(self, base_url: str, timeout: float = 20, min_interval: float = 1.0,
                 transport: httpx.BaseTransport | None = None):
        self._urls = profile_urls(base_url)
        self._http = httpx.Client(timeout=timeout, transport=transport, headers={"User-Agent": USER_AGENT})
        self._min_interval = min_interval
        self._lock = threading.Lock()
        self._last_request = float("-inf")

    @property
    def modes(self) -> list[str]:
        """The travel modes this client can route, car first."""
        return list(self._urls)

    def _wait_turn(self) -> None:
        """Hold a request back until it may start: one start per `min_interval`, in the order asked."""
        with self._lock:
            start = max(time.monotonic(), self._last_request + self._min_interval)
            self._last_request = start
        time.sleep(max(0.0, start - time.monotonic()))

    def route(self, origin: dict, destination: dict, mode: str = "car") -> dict:
        """The route between two points for a travel mode: [latitude, longitude] points, its length and time."""
        points = ";".join(f"{point['longitude']:.6f},{point['latitude']:.6f}" for point in (origin, destination))
        self._wait_turn()
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
