"""Catalog-resolved access comparisons against isolated test records and a fake road router.

These tests establish API/catalog behavior, not real travel accuracy or service availability.
"""
import pytest
from sqlmodel import select

from tesda_track.models import Qualification, RankingAudit
from tesda_track.routers.routes import route_cache, route_client
from tesda_track.services.routing import NO_ROUTE, UNAVAILABLE, RouteError

BASE = "/api/v1/recommendations/service-access"
CODE = "SMAW-NC-II"
ORIGIN = {"latitude": 14.599599, "longitude": 120.984234}


class FakeRoadRouter:
    modes = ["car", "bike", "foot"]

    def __init__(self):
        self.calls = []
        self.durations = {}
        self.failures = {}

    def url(self, mode):
        return f"https://router.example.invalid/{mode}"

    def route(self, origin, destination, mode):
        self.calls.append((dict(origin), dict(destination), mode))
        key = destination["latitude"], destination["longitude"]
        if key in self.failures:
            raise RouteError(self.failures[key])
        return {
            "duration_min": self.durations.get(key, 32), "distance_km": 12,
            "start": [origin["latitude"], origin["longitude"]],
            "end": [destination["latitude"], destination["longitude"]],
        }


class MemoryRoutes:
    def __init__(self):
        self.values = {}

    def get(self, key):
        return self.values.get(key)

    def put(self, key, value):
        self.values[key] = value


@pytest.fixture
def access_routing(app):
    fake, cache = FakeRoadRouter(), MemoryRoutes()
    app.dependency_overrides[route_client] = lambda: fake
    app.dependency_overrides[route_cache] = lambda: cache
    return fake


def payload(*sites, **changes):
    return {"qualification_code": CODE, "origin": ORIGIN, "mode": "car", "maximum_minutes": 45,
            "candidates": [{"kind": kind, "site_id": site_id} for kind, site_id in sites], **changes}


def compare(client, *sites, **changes):
    response = client.post(BASE, json=payload(*sites, **changes))
    assert response.status_code == 200, response.text
    return response.json()


def test_active_training_site_is_resolved_from_its_actual_qualification(client, make_program, access_routing, session):
    # A road route is permitted for an unverified catalog listing, without turning it into a verified recommendation.
    program = make_program(verified=False)
    site_id = program["provider"]["id"]
    audits_before = len(session.exec(select(RankingAudit)).all())
    result = compare(client, ("training", site_id))
    [site] = result["results"]
    assert (site["kind"], site["site_id"], site["name"]) == ("training", site_id, program["provider"]["name"])
    assert site["status"] == "modeled_route" and site["within_budget"] is True
    assert site["duration_min"] == 32
    assert result["mode"] == "car" and result["network_version"] is None
    assert access_routing.calls[0][0] == {"latitude": 14.6, "longitude": 120.98}
    assert "origin" not in result
    assert all("eligibility" not in row and "verification" not in row for row in result["results"])
    assert len(session.exec(select(RankingAudit)).all()) == audits_before


def test_assessment_sites_resolve_from_schedule_or_qualification_authority_record(
    client, make_center, make_schedule, verify_service, access_routing,
):
    scheduled = make_center(name="Scheduled assessment fixture", location=(14.65, 121.0))
    make_schedule(center=scheduled, verified=False)
    registered = make_center(name="Registered assessment fixture", location=(14.67, 121.02))
    verify_service("assessment", registered["id"], CODE, status="unknown")
    result = compare(client, ("assessment", scheduled["id"]), ("assessment", registered["id"]))
    assert [(row["kind"], row["site_id"]) for row in result["results"]] == [
        ("assessment", scheduled["id"]), ("assessment", registered["id"]),
    ]
    assert all(row["status"] == "modeled_route" for row in result["results"])
    assert len(access_routing.calls) == 2


@pytest.mark.parametrize("kind", ["training", "assessment"])
def test_unrelated_qualification_site_is_rejected_before_any_router_call(
    client, make_program, make_schedule, access_routing, kind,
):
    if kind == "training":
        site_id = make_program(qualification_code="CSS-NC-II")["provider"]["id"]
    else:
        site_id = make_schedule(qualification_code="CSS-NC-II")["center"]["id"]
    response = client.post(BASE, json=payload((kind, site_id)))
    assert response.status_code == 422
    assert "selected qualification" in response.json()["detail"]
    assert not access_routing.calls


@pytest.mark.parametrize("inactive", ["provider", "program", "assessment_center"])
def test_inactive_sites_or_training_offerings_do_not_consume_routing(
    client, admin, make_program, make_schedule, access_routing, inactive,
):
    if inactive == "assessment_center":
        schedule = make_schedule()
        site_id, kind = schedule["center"]["id"], "assessment"
        target = f"/api/v1/admin/assessment-centers/{site_id}"
    else:
        program = make_program()
        site_id, kind = program["provider"]["id"], "training"
        target = (f"/api/v1/admin/training-providers/{site_id}" if inactive == "provider"
                  else f"/api/v1/admin/training-programs/{program['id']}")
    changed = client.patch(target, headers=admin, json={"is_active": False})
    assert changed.status_code == 200, changed.text
    assert client.post(BASE, json=payload((kind, site_id))).status_code == 422
    assert not access_routing.calls


def test_nonexistent_or_unlinked_site_is_rejected_without_arbitrary_destination(
    client, make_center, access_routing,
):
    unlinked = make_center(name="No qualification relationship")
    for kind, site_id in [("training", 99999999), ("assessment", unlinked["id"])]:
        assert client.post(BASE, json=payload((kind, site_id))).status_code == 422
    assert not access_routing.calls


def test_inactive_and_unknown_qualifications_cannot_route(client, make_program, access_routing, session):
    program = make_program()
    site = ("training", program["provider"]["id"])
    assert client.post(BASE, json=payload(site, qualification_code="NO-SUCH-CODE")).status_code == 422
    qualification = session.exec(select(Qualification).where(Qualification.code == CODE)).one()
    qualification.is_active = False
    session.add(qualification)
    session.flush()
    assert client.post(BASE, json=payload(site)).status_code == 422
    assert not access_routing.calls


def test_budget_outside_and_unknown_results_are_distinct_and_never_fabricate_time(
    client, make_program, make_provider, access_routing,
):
    near = make_provider(name="Within modeled budget", location=(14.6, 121.0))
    far = make_provider(name="Outside modeled budget", location=(14.8, 121.1))
    unrouted = make_provider(name="No road in network", location=(14.9, 121.2))
    unavailable = make_provider(name="Temporary router problem", location=(15.0, 121.3))
    missing = make_provider(name="No map point", location=None)
    for provider in [near, far, unrouted, unavailable, missing]:
        make_program(provider=provider)
    access_routing.durations[(14.8, 121.1)] = 56
    access_routing.failures[(14.9, 121.2)] = NO_ROUTE
    access_routing.failures[(15.0, 121.3)] = UNAVAILABLE
    result = compare(client, *(("training", provider["id"]) for provider in [near, far, unrouted, unavailable, missing]))
    assert [(row["status"], row["within_budget"]) for row in result["results"]] == [
        ("modeled_route", True), ("modeled_route", False), ("no_route_in_network", None),
        ("routing_unavailable", None), ("location_unknown", None),
    ]
    assert all(row["duration_min"] is None for row in result["results"][2:])


def test_cross_region_site_is_allowed_and_cache_respects_selected_mode(
    client, make_provider, make_program, access_routing,
):
    provider = make_provider(name="Cross-boundary site fixture", region_code="VII", location=(10.3157, 123.8854))
    make_program(provider=provider)
    site = ("training", provider["id"])
    assert compare(client, site, maximum_minutes=None)["results"][0]["within_budget"] is None
    compare(client, site, maximum_minutes=None)
    assert len(access_routing.calls) == 1
    compare(client, site, mode="foot")
    assert len(access_routing.calls) == 2
    assert access_routing.calls[-1][2] == "foot"


def test_unknown_mode_does_not_reuse_a_car_result(client, make_program, access_routing):
    program = make_program()
    access_routing.modes = ["car"]
    result = compare(client, ("training", program["provider"]["id"]), mode="foot")
    assert result["results"][0]["status"] == "unsupported_mode"
    assert result["results"][0]["within_budget"] is None
    assert not access_routing.calls


def test_strict_comparison_bound_and_no_arbitrary_upstream_or_destination(client, access_routing):
    bodies = [
        payload(*[("training", site_id) for site_id in range(1, 10)]),
        payload(("training", 1), ("training", 1)),
        payload(("training", 1), router_url="https://untrusted.example.invalid"),
        payload(("training", 1), origin={"latitude": 60, "longitude": 121}),
        payload(("training", 1), candidates=[{"kind": "training", "site_id": 1, "destination": ORIGIN}]),
    ]
    for body in bodies:
        assert client.post(BASE, json=body).status_code == 422
    assert not access_routing.calls
    # The existing authenticated GET /recommendations/{audit_id} fallback captures this path.
    # Access comparison itself is POST-only and cannot consume coordinates through a GET query.
    assert client.get(BASE).status_code == 401
