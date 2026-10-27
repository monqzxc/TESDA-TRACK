import logging
import math
from functools import lru_cache
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from sqlmodel import Session

from tesda_track.config import Settings, get_settings
from tesda_track.db import SessionDep
from tesda_track.schemas.routes import Directions
from tesda_track.services import cache, routing
from tesda_track.services.rate_limit import RateLimiter, client_address_key

router = APIRouter(prefix="/routes", tags=["directions"])
SettingsDep = Annotated[Settings, Depends(get_settings)]

PATH = "/api/v1/routes"
CLIENT_LIMITED = "You've asked for many directions in the last minute. Please wait a moment and try again."
UPSTREAM_BUSY = "Directions are busy right now. Please try again in a moment, or open Google Maps."
# The map's view of the Philippines, with a margin. Points elsewhere aren't routed: the public router is shared,
# and the airports are Philippine ones.
LATITUDES, LONGITUDES = (4.0, 22.0), (116.0, 127.5)
POINT_PATTERN = r"^\s*-?\d{1,3}(\.\d{1,10})?\s*,\s*-?\d{1,3}(\.\d{1,10})?\s*$"
NOT_A_POINT = "Give a place in the Philippines as latitude,longitude, e.g. 14.5995,120.9842."


class RouteLimits:
    """Route requests per client address. One instance per app (see tesda_track.main); the router's own limit of
    one request a second is kept by the shared RouteClient."""

    def __init__(self):
        self.clients = RateLimiter()


class RouteCache:
    """Found routes in the PostgreSQL cache. Keys are hashes, so places never appear in them."""

    def __init__(self, session: Session, ttl_seconds: int):
        self._session = session
        self._ttl = ttl_seconds

    def get(self, key: str) -> Any | None:
        return cache.get(self._session, key) if self._ttl else None

    def put(self, key: str, value: Any) -> None:
        if self._ttl:
            cache.put(self._session, key, value, self._ttl)
            self._session.commit()


@lru_cache
def _client_for(url: str) -> routing.RouteClient:
    # One client for every learner, so the routing service's request limit holds across requests.
    return routing.RouteClient(url)


def route_client(settings: SettingsDep) -> routing.RouteClient | None:
    """The router, or None when ROUTING_URL is empty and Directions are off."""
    url = settings.routing_url.strip()
    return _client_for(url) if url else None


def route_cache(session: SessionDep, settings: SettingsDep) -> RouteCache:
    return RouteCache(session, settings.routing_cache_ttl_seconds)


class HideCoordinatesFilter(logging.Filter):
    """Drops the query string from uvicorn's access log line for /api/v1/routes: it holds the learner's location."""

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 3 and isinstance(args[2], str) \
                and args[2].split("?", 1)[0] == PATH and "?" in args[2]:
            record.args = (*args[:2], PATH, *args[3:])
        return True


def hide_coordinates_in_access_log() -> None:
    access = logging.getLogger("uvicorn.access")
    if not any(isinstance(existing, HideCoordinatesFilter) for existing in access.filters):
        access.addFilter(HideCoordinatesFilter())


def _point(name: str, value: str) -> dict:
    latitude, longitude = (float(part) for part in value.split(","))
    if not (LATITUDES[0] <= latitude <= LATITUDES[1] and LONGITUDES[0] <= longitude <= LONGITUDES[1]):
        # The value isn't echoed back: an origin is the learner's location.
        raise RequestValidationError([{"type": "value_error", "loc": ("query", name), "msg": NOT_A_POINT}])
    return {"latitude": latitude, "longitude": longitude}


def _wait(seconds: float, detail: str) -> None:
    if seconds:
        raise HTTPException(status_code=429, detail=detail, headers={"Retry-After": str(math.ceil(seconds))})


PointQuery = Query(pattern=POINT_PATTERN, max_length=60, description="latitude,longitude",
                   examples=["14.5995,120.9842"])


@router.get("", response_model=Directions, responses={
    404: {"description": "No travel mode has a route to the center"},
    429: {"description": "Too many requests from this client, or the router is busy; see Retry-After"},
    503: {"description": "The router can't be reached right now"}})
def get_routes(request: Request, settings: SettingsDep, origin: Annotated[str, PointQuery],
               destination: Annotated[str, PointQuery],
               client: Annotated[routing.RouteClient | None, Depends(route_client)],
               routes_cache: Annotated[RouteCache, Depends(route_cache)]):
    """Directions from the learner's location to a center: a road route for each travel mode the router has (car,
    bike and foot from the public router; car only from a self-hosted one), then an estimated flight for a long
    trip. No sign-in needed.

    The origin is rounded to about a kilometre before it's used, cached or sent to the router, and isn't logged.
    When this server has no router (ROUTING_URL empty), the answer is `routing_enabled: false` with no routes:
    link to Google Maps instead.
    """
    start, end = _point("origin", origin), _point("destination", destination)
    if client is None:
        return Directions(routing_enabled=False, routes=[], missing_modes=[])
    limits: RouteLimits = request.app.state.route_limits
    _wait(limits.clients.hit(client_address_key(request), settings.routing_rate_limit_per_minute), CLIENT_LIMITED)
    try:
        found = routing.directions(client, routes_cache, start, end)
    except routing.RouterBusy as busy:
        _wait(busy.retry_after, UPSTREAM_BUSY)
        raise
    except routing.RouteError as failure:
        status = 404 if failure.message == routing.NO_ROUTE else 503
        raise HTTPException(status_code=status, detail=failure.message) from None
    return Directions(routing_enabled=True, missing_modes=found.missing_modes,
                      routes=[{"mode": mode, **route} for mode, route in found.routes.items()])
