"""A bounded road-access comparison; no flight estimates or learner eligibility inference."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
import math

from sqlalchemy import or_
from sqlmodel import Session, select

from tesda_track.errors import InvalidRequestError
from tesda_track.models import (
    AssessmentCenter, AssessmentSchedule, ServiceVerification, TrainingProgram, TrainingProvider, utcnow,
)
from tesda_track.schemas.service_access import (
    ServiceAccessComparison, ServiceAccessRequest, ServiceAccessResult, ServiceKind,
)
from tesda_track.services import catalog, routing


@dataclass(frozen=True)
class AccessSite:
    kind: ServiceKind
    site_id: int
    name: str
    latitude: float | None
    longitude: float | None


def resolve_sites(session: Session, request: ServiceAccessRequest) -> list[AccessSite]:
    """Only active sites linked to this qualification can consume the configured router."""
    qualification = catalog.resolve_qualification(session, request.qualification_code)
    by_key = {}
    training_ids = [item.site_id for item in request.candidates if item.kind == "training"]
    assessment_ids = [item.site_id for item in request.candidates if item.kind == "assessment"]
    if training_ids:
        providers = session.exec(
            select(TrainingProvider)
            .join(TrainingProgram, TrainingProgram.provider_id == TrainingProvider.id)
            .where(TrainingProvider.id.in_(training_ids), TrainingProvider.is_active,
                   TrainingProgram.is_active, TrainingProgram.qualification_id == qualification.id)
            .distinct()
        ).all()
        for site in providers:
            by_key[("training", site.id)] = AccessSite("training", site.id, site.name, site.latitude, site.longitude)
    if assessment_ids:
        has_schedule = select(AssessmentSchedule.id).where(
            AssessmentSchedule.center_id == AssessmentCenter.id,
            AssessmentSchedule.qualification_id == qualification.id,
        ).exists()
        has_registration = select(ServiceVerification.id).where(
            ServiceVerification.center_id == AssessmentCenter.id,
            ServiceVerification.qualification_id == qualification.id,
        ).exists()
        centers = session.exec(
            select(AssessmentCenter).where(
                AssessmentCenter.id.in_(assessment_ids), AssessmentCenter.is_active,
                or_(has_schedule, has_registration),
            )
        ).all()
        for site in centers:
            by_key[("assessment", site.id)] = AccessSite("assessment", site.id, site.name, site.latitude, site.longitude)
    keys = [(item.kind, item.site_id) for item in request.candidates]
    if any(key not in by_key for key in keys):
        raise InvalidRequestError("Choose active sites associated with the selected qualification.")
    return [by_key[key] for key in keys]


def _point(latitude, longitude) -> dict | None:
    if latitude is None or longitude is None:
        return None
    if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in (latitude, longitude)):
        return None
    if not (4 <= latitude <= 22 and 116 <= longitude <= 127.5):
        return None
    return {"latitude": latitude, "longitude": longitude}


def _modeled(site: AccessSite, route: dict, origin: dict, destination: dict,
             maximum_minutes: float | None) -> ServiceAccessResult | None:
    """Reject malformed upstream/cache data before it can pass a budget."""
    try:
        duration = float(route["duration_min"])
        distance = float(route["distance_km"])
        start = _point(*route["start"])
        end = _point(*route["end"])
        if not start or not end or not all(math.isfinite(value) and value >= 0 for value in (duration, distance)):
            return None
    except (KeyError, TypeError, ValueError, OverflowError):
        return None
    return ServiceAccessResult(
        kind=site.kind, site_id=site.site_id, name=site.name, status="modeled_route",
        duration_min=round(duration, 2), distance_km=round(distance, 3),
        within_budget=duration <= maximum_minutes if maximum_minutes is not None else None,
        origin_snap_distance_km=round(routing.distance_km(origin, start), 3),
        destination_snap_distance_km=round(routing.distance_km(destination, end), 3),
        explanation="Modeled road travel in the selected mode, without traffic or unverified endpoint connections.",
    )


def compare(request: ServiceAccessRequest, sites: list[AccessSite], client: routing.RouteClient | None,
            routes_cache: routing.RouteCache) -> ServiceAccessComparison:
    # Round before constructing cache keys or sending anything to the routing service.
    origin = routing.round_origin(request.origin.model_dump())
    by_key = {(site.kind, site.site_id): site for site in sites}
    ordered = [(item.kind, item.site_id) for item in request.candidates]
    if any(key not in by_key for key in ordered):
        raise InvalidRequestError("Choose active sites associated with the selected qualification.")
    outcomes = {}
    pending = {}

    def unresolved(site: AccessSite, status: str, explanation: str):
        return ServiceAccessResult(kind=site.kind, site_id=site.site_id, name=site.name,
                                   status=status, explanation=explanation)

    for key in ordered:
        site = by_key[key]
        destination = _point(site.latitude, site.longitude)
        if destination is None:
            outcomes[key] = unresolved(site, "location_unknown", "This site has no usable confirmed map point.")
        elif client is None:
            outcomes[key] = unresolved(site, "routing_unavailable", "Road routing is not enabled on this service.")
        elif request.mode not in client.modes:
            outcomes[key] = unresolved(site, "unsupported_mode", "The configured router does not support this travel mode.")
        else:
            cache_key = routing.cache_key(client.url(request.mode), origin, destination)
            cached = routes_cache.get(cache_key)
            modeled = _modeled(site, cached, origin, destination, request.maximum_minutes) if cached else None
            if modeled is not None:
                outcomes[key] = modeled
            else:
                # Co-located training/assessment sites share one network request for this mode.
                pending.setdefault(cache_key, (destination, []))[1].append((key, site))

    if pending:
        # Only HTTP happens in workers. Cache/database access stays on the request's own thread/session.
        # RouteClient preserves its shared upstream start-rate and maximum queue wait across comparisons.
        with ThreadPoolExecutor(max_workers=len(pending)) as pool:
            futures = {pool.submit(client.route, origin, destination, request.mode): (destination, cache_key, entries)
                       for cache_key, (destination, entries) in pending.items()}
            for future in as_completed(futures):
                destination, cache_key, entries = futures[future]
                try:
                    route = future.result()
                except routing.RouterBusy:
                    for key, site in entries:
                        outcomes[key] = unresolved(site, "routing_busy", "The router is busy; retry this comparison shortly.")
                except routing.RouteError as failure:
                    no_route = failure.message == routing.NO_ROUTE
                    for key, site in entries:
                        outcomes[key] = unresolved(
                            site, "no_route_in_network" if no_route else "routing_unavailable",
                            "No route was found in this network; another mode or access point may be needed."
                            if no_route else "The router is unavailable; travel time is unknown.",
                        )
                else:
                    for key, site in entries:
                        modeled = _modeled(site, route, origin, destination, request.maximum_minutes)
                        outcomes[key] = modeled or unresolved(
                            site, "routing_unavailable", "The router returned unusable route evidence.",
                        )
                    if modeled is not None:
                        routes_cache.put(cache_key, route)

    return ServiceAccessComparison(
        qualification_code=request.qualification_code, mode=request.mode, maximum_minutes=request.maximum_minutes,
        checked_at=utcnow(), routing_enabled=client is not None, results=[outcomes[key] for key in ordered],
    )


def build(session: Session, request: ServiceAccessRequest, client: routing.RouteClient | None,
          routes_cache: routing.RouteCache) -> ServiceAccessComparison:
    return compare(request, resolve_sites(session, request), client, routes_cache)
