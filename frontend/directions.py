"""Road routes for the center finder's Directions, from an OSRM routing service with OpenStreetMap data.

The Streamlit server asks for routes, not the browser: the routing service then sees this server's address rather
than the learner's, and a self-hosted router can stay on the internal network.
"""
from __future__ import annotations

import threading
import time

import httpx

DEFAULT_ROUTING_URL = "https://routing.openstreetmap.de/routed-car"
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


def _point(longitude_latitude: list[float]) -> list[float]:
    """OSRM's [longitude, latitude] as the map's [latitude, longitude], to about a metre."""
    longitude, latitude = longitude_latitude
    return [round(latitude, 5), round(longitude, 5)]


class RouteClient:
    """Driving routes from an OSRM server, one request at a time and no more than one per `min_interval` seconds.

    The public OpenStreetMap router allows one request a second from each app, and asks it to name itself.
    """

    def __init__(self, base_url: str, timeout: float = 8, min_interval: float = 1.0,
                 transport: httpx.BaseTransport | None = None):
        self._http = httpx.Client(base_url=base_url, timeout=timeout, transport=transport,
                                  headers={"User-Agent": USER_AGENT})
        self._min_interval = min_interval
        self._lock = threading.Lock()
        self._last_request = float("-inf")

    def route(self, origin: dict, destination: dict) -> dict:
        """The road route between two points: [latitude, longitude] points, then its length and time by car."""
        points = ";".join(f"{point['longitude']:.6f},{point['latitude']:.6f}" for point in (origin, destination))
        with self._lock:
            time.sleep(max(0.0, self._last_request + self._min_interval - time.monotonic()))
            try:
                response = self._http.get(f"route/v1/driving/{points}", params={
                    "overview": "full", "geometries": "geojson", "steps": "false", "alternatives": "false"})
            except httpx.HTTPError as error:
                raise RouteError(UNAVAILABLE) from error
            finally:
                self._last_request = time.monotonic()
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
