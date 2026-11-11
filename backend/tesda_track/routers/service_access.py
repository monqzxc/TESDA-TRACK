"""Private-in-body road-access comparison for a small set of qualification sites."""
import math
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from tesda_track.db import SessionDep
from tesda_track.routers.routes import CLIENT_LIMITED, RouteCache, SettingsDep, route_cache, route_client
from tesda_track.schemas.service_access import ServiceAccessComparison, ServiceAccessRequest
from tesda_track.services import routing, service_access
from tesda_track.services.rate_limit import client_address_key

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.post("/service-access", response_model=ServiceAccessComparison,
             responses={429: {"description": "Too many comparison requests from this client"}})
def compare_service_access(
    body: ServiceAccessRequest, request: Request, session: SessionDep, settings: SettingsDep,
    client: Annotated[routing.RouteClient | None, Depends(route_client)],
    routes_cache: Annotated[RouteCache, Depends(route_cache)],
):
    """Compare up to eight known qualification sites using the chosen road mode.

    The departure point stays in the POST body, is rounded to two decimal places before cache/network use,
    and is not persisted in a ranking audit. Site coordinates are resolved from the catalog, not the body.
    Route evidence does not establish authority, availability or learner eligibility.
    """
    seconds = request.app.state.route_limits.clients.hit(
        client_address_key(request), settings.routing_rate_limit_per_minute,
    )
    if seconds:
        raise HTTPException(status_code=429, detail=CLIENT_LIMITED,
                            headers={"Retry-After": str(math.ceil(seconds))})
    return service_access.build(session, body, client, routes_cache)
