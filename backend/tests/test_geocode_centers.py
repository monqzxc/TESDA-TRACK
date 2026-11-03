import argparse
import io
import json

import httpx
import pytest

from tesda_track.geocode_centers import (GeocodeStop, GoogleGeocoder, Site, decide, in_site_town, precision_of,
                                         query_for, run)
from tesda_track.models import AssessmentCenter, TrainingProvider

CEBU = (10.3157, 123.8854)
# A point in the Bohol Sea, the kind of typo the command exists to fix.
AT_SEA = (9.9, 123.2)


def site(**changes):
    values = {"kind": "training", "id": 1, "name": "Cebu Skills Institute", "address": "12 Osmena Blvd, Cebu City",
              "city": "Cebu City", "province": "Cebu", "region_code": "VII", "latitude": AT_SEA[0],
              "longitude": AT_SEA[1], "location_source": None}
    return Site(**{**values, **changes})


def answer(point=CEBU, types=("street_address",), location_type="ROOFTOP", town="Cebu City", province="Cebu"):
    return {"latitude": point[0], "longitude": point[1], "location_type": location_type, "types": list(types),
            "formatted_address": f"12 Osmeña Blvd, {town}, {province}, Philippines", "partial_match": False,
            "components": [{"name": town, "types": ["locality", "political"]},
                           {"name": province, "types": ["administrative_area_level_2", "political"]},
                           {"name": "Philippines", "types": ["country", "political"]}]}


def decided(s, google):
    return decide(s, {query_for(s): google})


def test_query_names_the_town_and_province_once_and_skips_ncr_district_groupings():
    assert query_for(site()) == "12 Osmena Blvd, Cebu City, Philippines"
    assert query_for(site(address="12 Osmena Blvd", city="Talisay City")) == \
        "12 Osmena Blvd, Talisay City, Cebu, Philippines"
    assert query_for(site(address="Poblacion, Tadian, Mt. Province", city="Tadian",
                          province="Mountain Province")) == "Poblacion, Tadian, Mt. Province, Philippines"
    assert query_for(site(address="712 JP Rizal, Marikina City", city="Marikina City", province="PAMAMARISAN",
                          region_code="NCR")) == "712 JP Rizal, Marikina City, Philippines"
    assert query_for(site(address=None, city="Talisay City")) == "Talisay City, Cebu, Philippines"
    assert query_for(site(address=None, city=None, province=None)) is None


def test_a_sea_point_moves_to_an_exact_match_in_its_own_town():
    decision = decided(site(), answer())
    assert decision.outcome == "replace" and (decision.latitude, decision.longitude) == CEBU
    assert decision.moved_km > 50


@pytest.mark.parametrize("types,location_type,offset,outcome", [
    (("neighborhood", "political"), "APPROXIMATE", 0.005, "kept_close"),   # about 0.6 km from the barangay
    (("neighborhood", "political"), "APPROXIMATE", 0.02, "replace"),       # about 2.2 km
    (("route",), "GEOMETRIC_CENTER", 0.02, "kept_close"),                  # a road's middle isn't the site
    (("locality", "political"), "APPROXIMATE", 0.04, "kept_close"),        # about 4.4 km from the town center
    (("locality", "political"), "APPROXIMATE", 0.06, "replace"),           # about 6.7 km
    (("premise",), "ROOFTOP", 0.00005, "unchanged"),                       # about 6 m
    (("premise",), "ROOFTOP", 0.0005, "replace"),                          # about 56 m
])
def test_vaguer_answers_only_move_points_that_are_far_off(types, location_type, offset, outcome):
    current = (CEBU[0] + offset, CEBU[1])
    decision = decided(site(latitude=current[0], longitude=current[1]), answer(types=types, location_type=location_type))
    assert decision.outcome == outcome


def test_a_site_without_a_point_gets_even_a_town_level_one():
    decision = decided(site(latitude=None, longitude=None), answer(types=("locality", "political"),
                                                                  location_type="APPROXIMATE"))
    assert decision.outcome == "replace" and decision.moved_km is None


@pytest.mark.parametrize("s,google,outcome", [
    (site(), answer(town="Mandaue City"), "other_town"),  # "Cebu City" mustn't match via the province, Cebu
    (site(city="Batangas City", province="Batangas"), answer(town="Lipa", province="Batangas"), "other_town"),
    (site(), answer(types=("administrative_area_level_2", "political"), location_type="APPROXIMATE"), "too_vague"),
    (site(), answer(point=(35.68, 139.69)), "outside_philippines"),
    (site(), None, "not_found"),
    (site(location_source="manual"), answer(), "kept_manual"),
    (site(address=None, city=None, province=None), answer(), "no_address"),
])
def test_doubtful_answers_and_hand_corrected_points_are_left_alone(s, google, outcome):
    assert decided(s, google).outcome == outcome


def test_a_query_google_could_not_answer_is_reported_not_guessed():
    assert decide(site(), {}).outcome == "lookup_failed"


def test_town_names_are_compared_without_accents_abbreviations_or_city_of():
    assert in_site_town(site(city="Las Piñas City", province="Metro Manila", region_code="NCR"),
                        answer(town="Las Pinas", province="Metro Manila"))
    assert in_site_town(site(city="Sto. Tomas", province="Batangas"), answer(town="Santo Tomas", province="Batangas"))
    assert in_site_town(site(city="City of San Fernando (Capital)", province="Pampanga"),
                        answer(town="San Fernando", province="Pampanga"))
    # A looser match needs the province too, so one San Jose never passes for another.
    assert in_site_town(site(city="Island Garden City of Samal", province="Davao del Norte"),
                        answer(town="Samal", province="Davao del Norte"))
    assert not in_site_town(site(city="San Jose", province="Batangas"),
                            answer(town="San Jose del Monte", province="Bulacan"))


def test_precision_reads_google_location_types():
    assert precision_of(answer(types=("establishment", "point_of_interest"), location_type="GEOMETRIC_CENTER")) == "exact"
    assert precision_of(answer(types=("route",), location_type="GEOMETRIC_CENTER")) == "road"
    assert precision_of(answer(types=("plus_code",), location_type="GEOMETRIC_CENTER")) == "exact"


def google(responses, calls=None):
    """A GoogleGeocoder answering from a list of (status code, JSON) pairs, recording each request."""
    responses = iter(responses)

    def handler(request):
        if calls is not None:
            calls.append(request)
        status, payload = next(responses)
        return httpx.Response(status, json=payload)

    return GoogleGeocoder("secret-key", client=httpx.Client(transport=httpx.MockTransport(handler)),
                          sleep=lambda seconds: None)


GOOGLE_OK = {"status": "OK", "results": [{
    "formatted_address": "12 Osmeña Blvd, Cebu City, 6000 Cebu, Philippines", "partial_match": True,
    "types": ["street_address"],
    "geometry": {"location": {"lat": CEBU[0], "lng": CEBU[1]}, "location_type": "ROOFTOP"},
    "address_components": [{"long_name": "Cebu City", "short_name": "Cebu City", "types": ["locality", "political"]}],
}]}


def test_google_answers_are_kept_short_and_asked_for_in_the_philippines():
    calls = []
    found = google([(200, GOOGLE_OK)], calls).lookup("12 Osmena Blvd, Cebu City, Cebu, Philippines")
    assert found == {"latitude": CEBU[0], "longitude": CEBU[1], "location_type": "ROOFTOP",
                     "types": ["street_address"], "formatted_address": "12 Osmeña Blvd, Cebu City, 6000 Cebu, Philippines",
                     "partial_match": True, "components": [{"name": "Cebu City", "types": ["locality", "political"]}]}
    assert calls[0].url.params["components"] == "country:PH" and calls[0].url.params["region"] == "ph"


def test_google_retries_busy_answers_and_reports_what_it_cannot_answer():
    assert google([(200, {"status": "ZERO_RESULTS", "results": []})]).lookup("x") is None
    busy = (200, {"status": "OVER_QUERY_LIMIT"})
    assert google([busy, (503, {}), busy, (200, GOOGLE_OK)]).lookup("x")["latitude"] == CEBU[0]
    with pytest.raises(LookupError):
        google([busy] * 4).lookup("x")
    with pytest.raises(LookupError):
        google([(200, {"status": "INVALID_REQUEST"})]).lookup("x")


def test_a_refused_key_stops_the_run_without_printing_the_key():
    refused = (200, {"status": "REQUEST_DENIED", "error_message": "This API project is not authorized."})
    with pytest.raises(GeocodeStop) as stopped:
        google([refused]).lookup("x")
    assert "not authorized" in str(stopped.value) and "secret-key" not in str(stopped.value)


@pytest.fixture
def sites(session):
    """Committed (to the test's savepoint) because the command ends its read transaction while Google answers."""
    at_sea = TrainingProvider(name="Cebu Skills Institute", region_code="VII", city="Cebu City", province="Cebu",
                              address="12 Osmena Blvd", latitude=AT_SEA[0], longitude=AT_SEA[1])
    missing = AssessmentCenter(name="Cebu Assessment Center", region_code="VII", city="Cebu City", province="Cebu",
                               address="12 Osmena Blvd")
    example = TrainingProvider(name="[Demo] Cebu", region_code="VII", city="Cebu City", data_status="example",
                               latitude=AT_SEA[0], longitude=AT_SEA[1])
    session.add_all([at_sea, missing, example])
    session.commit()
    return at_sea, missing, example


def counting_lookup(calls):
    def lookup(query):
        calls.append(query)
        return answer()
    return lookup


def test_preview_writes_nothing_and_apply_reuses_its_answers(session, sites, tmp_path):
    at_sea, missing, example = sites
    report, calls = tmp_path / "geocode.json", []
    preview = run(session, report=report, lookup=counting_lookup(calls), kinds=["training", "assessment"])
    assert preview["outcomes"] == {"replace": 2} and preview["points_written"] == 0
    # Both sites share one address, and the demo fixture isn't looked up.
    assert calls == ["12 Osmena Blvd, Cebu City, Philippines"]
    session.refresh(at_sea)
    assert (at_sea.latitude, at_sea.longitude, at_sea.location_source) == (*AT_SEA, None)
    saved = json.loads(report.read_text(encoding="utf-8"))
    assert saved["mode"] == "dry-run" and not saved["database_modified"]
    assert saved["sites"][0]["outcome"] == "replace" and saved["sites"][0]["from"] == list(AT_SEA)

    applied = run(session, report=report, lookup=counting_lookup(calls), kinds=["training", "assessment"],
                  apply=True)
    assert applied["points_written"] == 2 and len(calls) == 1
    for row in (at_sea, missing, example):
        session.refresh(row)
    assert (at_sea.latitude, at_sea.longitude, at_sea.location_source) == (*CEBU, "google_geocoding")
    assert (missing.latitude, missing.longitude, missing.location_source) == (*CEBU, "google_geocoding")
    assert (example.latitude, example.longitude) == AT_SEA

    again = run(session, report=report, lookup=counting_lookup(calls), kinds=["training"], apply=True)
    assert again["outcomes"] == {"unchanged": 1} and again["points_written"] == 0 and len(calls) == 1


def test_failed_lookups_are_left_for_the_next_run(session, sites, tmp_path):
    def unreachable(query):
        raise LookupError(query)

    result = run(session, report=tmp_path / "geocode.json", lookup=unreachable, kinds=["training"], apply=True)
    assert result["lookups_failed"] == 1 and result["outcomes"] == {"lookup_failed": 1}
    assert json.loads((tmp_path / "geocode.json").read_text(encoding="utf-8"))["answers"] == {}


def test_cli_refuses_to_overwrite_a_file_it_did_not_write(session, sites, tmp_path):
    from tesda_track.cli import build_parser, run_geocode_command

    other = tmp_path / "registry-report.json"
    other.write_text('{"mode": "dry-run", "sources": []}', encoding="utf-8")
    args = build_parser().parse_args(["geocode-centers", "--report", str(other)])
    with pytest.raises(ValueError, match="isn't a report from this command"):
        run_geocode_command(session, args, io.StringIO(), lookup=counting_lookup([]))
    with pytest.raises(ValueError, match=".json"):
        run_geocode_command(session, argparse.Namespace(report=tmp_path / "x.csv"), io.StringIO())


def test_cli_previews_then_applies(session, sites, tmp_path):
    from tesda_track.cli import build_parser, run_geocode_command

    report, out = tmp_path / "geocode.json", io.StringIO()
    run_geocode_command(session, build_parser().parse_args(["geocode-centers", "--report", str(report),
                                                            "--kind", "training"]), out, lookup=counting_lookup([]))
    assert "1 sites: replace=1" in out.getvalue() and "Preview only" in out.getvalue()
    run_geocode_command(session, build_parser().parse_args(["geocode-centers", "--report", str(report),
                                                            "--kind", "training", "--apply"]), out,
                        lookup=counting_lookup([]))
    assert "Moved 1 map points" in out.getvalue()


def test_an_administrators_correction_is_marked_and_kept_from_geocoding(client, admin, make_provider, session):
    provider = make_provider()
    response = client.patch(f"/api/v1/admin/training-providers/{provider['id']}", headers=admin,
                            json={"latitude": 14.6, "longitude": 121.0})
    assert response.status_code == 200
    assert session.get(TrainingProvider, provider["id"]).location_source == "manual"
    renamed = make_provider(name="Untouched Institute")
    client.patch(f"/api/v1/admin/training-providers/{renamed['id']}", headers=admin, json={"name": "Renamed"})
    assert session.get(TrainingProvider, renamed["id"]).location_source is None
