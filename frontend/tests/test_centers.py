"""Rules of the center finder: joining sites with listings, filtering, measuring and sorting them."""
from datetime import date

import pytest

from centers import (Filters, build_centers, filter_centers, find_place, map_points, place_label, provinces,
                     sort_centers, summary, with_distances)

TODAY = date(2026, 10, 7)
REGIONS = {
    "NCR": {"code": "NCR", "name": "National Capital Region", "center_city": "Manila",
            "latitude": 14.5995, "longitude": 120.9842},
    "III": {"code": "III", "name": "Central Luzon", "center_city": "San Fernando",
            "latitude": 15.0286, "longitude": 120.6898},
    "VII": {"code": "VII", "name": "Central Visayas", "center_city": "Cebu City",
            "latitude": 10.3157, "longitude": 123.8854},
}
NAMES = {"CSS-NC-II": "Computer Systems Servicing NC II", "SMAW-NC-II": "Shielded Metal Arc Welding NC II"}
MANILA = {"latitude": 14.5995, "longitude": 120.9842}


def site(site_id, name, region, city, lat, lon, province=None, website=None):
    return {"id": site_id, "name": name, "region_code": region, "province": province, "city": city, "address": None,
            "latitude": lat, "longitude": lon, "contact_email": None, "contact_phone": None, "website": website,
            "is_active": True}


def summary_of(place):
    return {key: place[key] for key in ("id", "name", "region_code", "city", "latitude", "longitude")}


def program(program_id, provider, code, start=None, mode="institution_based", scholarship=False):
    return {"id": program_id, "title": f"{NAMES[code]} batch {program_id}", "description": None,
            "qualification": {"code": code, "name": NAMES[code], "sector": "Test"}, "provider": summary_of(provider),
            "delivery_mode": mode, "duration_hours": 268, "cost": "0.00", "scholarship_available": scholarship,
            "start_date": start, "end_date": None, "slots": 25, "is_active": True, "distance_km": None}


def schedule(schedule_id, center, code, when):
    return {"id": schedule_id, "qualification": {"code": code, "name": NAMES[code], "sector": "Test"},
            "center": summary_of(center), "scheduled_at": when, "slots": 25, "seats_left": 10, "fee": "500.00",
            "status": "open", "distance_km": None}


TARLAC_TC = site(1, "Tarlac Skills Institute", "III", "Tarlac City", 15.4755, 120.5963, province="Tarlac")
MANILA_TC = site(2, "Manila Welding Institute", "NCR", "Manila", 14.5995, 120.9842)
CEBU_TC = site(3, "Cebu Skills Center", "VII", "Cebu City", 10.3157, 123.8854, province="Cebu")
MOBILE_TC = site(4, "Mobile Training Unit", "NCR", None, None, None)
TARLAC_AC = site(1, "Tarlac Assessment Center", "III", "Tarlac City", 15.48, 120.59, province="Tarlac")
MANILA_AC = site(2, "Manila Assessment Center", "NCR", "Manila", 14.6, 120.98)

PROGRAMS = [
    program(1, TARLAC_TC, "CSS-NC-II", start="2026-10-21", scholarship=True),
    program(2, TARLAC_TC, "SMAW-NC-II", start="2027-01-10"),
    program(3, MANILA_TC, "SMAW-NC-II", start="2026-10-15", mode="online"),
    program(4, CEBU_TC, "CSS-NC-II", mode="community_based"),
]
SCHEDULES = [
    schedule(1, TARLAC_AC, "CSS-NC-II", "2026-10-15T01:00:00Z"),
    schedule(2, MANILA_AC, "SMAW-NC-II", "2026-12-20T02:00:00Z"),
    # 00:30 on Oct 7 in the Philippines, which is still Oct 6 in UTC.
    schedule(3, TARLAC_AC, "SMAW-NC-II", "2026-10-06T16:30:00Z"),
]


def world():
    centers = build_centers([TARLAC_TC, MANILA_TC, CEBU_TC, MOBILE_TC], [TARLAC_AC, MANILA_AC], PROGRAMS, SCHEDULES,
                            REGIONS)
    return {center["id"]: center for center in centers}


def ids(centers):
    return [center["id"] for center in centers]


def test_listings_join_the_site_of_their_own_kind():
    centers = world()
    assert set(centers) == {"training-1", "training-2", "training-3", "training-4", "assessment-1", "assessment-2"}
    # Provider 1 and assessment center 1 share a numeric id; their listings must not mix.
    assert [item["id"] for item in centers["training-1"]["programs"]] == [1, 2]
    assert centers["training-1"]["schedules"] == []
    assert [item["id"] for item in centers["assessment-1"]["schedules"]] == [1, 3]
    assert centers["assessment-1"]["programs"] == []
    assert centers["assessment-1"]["kind"] == "assessment" and centers["training-1"]["kind"] == "training"


def test_a_listing_whose_site_is_missing_from_the_site_list_still_shows_its_center():
    stray = site(9, "New Provider", "NCR", "Quezon City", 14.676, 121.0437)
    centers = build_centers([], [], [program(5, stray, "CSS-NC-II")], [], REGIONS)
    assert ids(centers) == ["training-9"]
    assert centers[0]["name"] == "New Provider" and centers[0]["region"] == "National Capital Region"


@pytest.mark.parametrize("place, expected", [
    (site(1, "A", "III", "Tarlac City", 15.4, 120.5, province="Tarlac"), "Tarlac City, Tarlac"),
    (site(2, "B", "NCR", "Manila", 14.6, 120.9), "Manila, National Capital Region"),
    (site(3, "C", "NCR", None, None, None), "National Capital Region"),
    (site(4, "D", "III", "San Fernando, Pampanga", 15.0, 120.6, province="Pampanga"), "San Fernando, Pampanga"),
])
def test_place_label_reads_city_then_province_or_region(place, expected):
    center = build_centers([place], [], [], [], REGIONS)[0]
    assert place_label(center) == expected


def test_out_of_range_coordinates_are_treated_as_unmapped():
    broken = site(5, "Broken Pin", "NCR", "Manila", 999, 120.9)
    center = build_centers([broken], [], [], [], REGIONS)[0]
    assert center["latitude"] is None and center["longitude"] is None
    assert map_points([center], TODAY) == []


def test_distances_are_measured_from_the_reference_point():
    centers = with_distances(list(world().values()), MANILA)
    distance = {center["id"]: center["distance_km"] for center in centers}
    assert distance["training-2"] == 0.0
    assert distance["assessment-2"] == pytest.approx(0.5, abs=0.05)
    assert distance["training-1"] == pytest.approx(105.9, abs=0.1)
    assert distance["training-3"] == pytest.approx(571.0, abs=0.1)
    assert distance["training-4"] is None, "a center without coordinates has no distance"


def test_without_a_reference_point_no_distance_is_shown():
    centers = with_distances(list(world().values()), None)
    assert all(center["distance_km"] is None for center in centers)


@pytest.mark.parametrize("text, label, point", [
    ("manila", "Manila", (14.5998, 120.9821)),
    ("Tarlac", "Tarlac", (15.4778, 120.5932)),
    ("tarlac city", "Tarlac City", (15.4778, 120.5932)),
    ("Cebu", "Cebu", (10.3157, 123.8854)),
    ("central visayas", "Central Visayas", (10.3157, 123.8854)),
    ("NCR", "National Capital Region", (14.5995, 120.9842)),
    ("Region III", "Central Luzon", (15.0286, 120.6898)),
    ("tarl", "Tarlac", (15.4778, 120.5932)),
])
def test_a_typed_place_resolves_to_known_coordinates(text, label, point):
    place = find_place(text, list(world().values()), REGIONS)
    assert place["label"] == label
    assert (place["latitude"], place["longitude"]) == pytest.approx(point, abs=0.0001)


@pytest.mark.parametrize("text", ["", "   ", "Atlantis", "ab"])
def test_unknown_or_too_short_places_resolve_to_nothing(text):
    assert find_place(text, list(world().values()), REGIONS) is None


@pytest.mark.parametrize("filters, expected", [
    (Filters(kinds=("assessment",)), {"assessment-1", "assessment-2"}),
    (Filters(region_code="III"), {"training-1", "assessment-1"}),
    (Filters(province="Cebu"), {"training-3"}),
    (Filters(text="welding manila"), {"training-2"}),
    (Filters(text="TARLAC"), {"training-1", "assessment-1"}),
    (Filters(), {"training-1", "training-2", "training-3", "training-4", "assessment-1", "assessment-2"}),
])
def test_site_filters_pick_matching_centers(filters, expected):
    assert set(ids(filter_centers(list(world().values()), filters, TODAY))) == expected


def test_a_qualification_keeps_only_centers_that_offer_it_and_only_its_listings():
    centers = {center["id"]: center for center in
               filter_centers(list(world().values()), Filters(qualification_codes=("CSS-NC-II",)), TODAY)}
    assert set(centers) == {"training-1", "training-3", "assessment-1"}
    assert [item["id"] for item in centers["training-1"]["programs"]] == [1]
    assert [item["id"] for item in centers["assessment-1"]["schedules"]] == [1]


def test_listing_filters_do_not_change_the_unfiltered_centers():
    original = world()
    filter_centers(list(original.values()), Filters(qualification_codes=("CSS-NC-II",)), TODAY)
    assert [item["id"] for item in original["training-1"]["programs"]] == [1, 2]


@pytest.mark.parametrize("filters, training", [
    (Filters(delivery_mode="online"), {"training-2": [3]}),
    (Filters(scholarship=True), {"training-1": [1]}),
])
def test_delivery_mode_and_scholarship_narrow_only_training_centers(filters, training):
    centers = {center["id"]: center for center in filter_centers(list(world().values()), filters, TODAY)}
    assert {key: [item["id"] for item in value["programs"]] for key, value in centers.items()
            if value["kind"] == "training"} == training
    assert {"assessment-1", "assessment-2"} <= set(centers), "assessment centers are not narrowed by these"


def test_availability_window_uses_philippine_dates_and_counts_flexible_starts():
    centers = {center["id"]: center for center in
               filter_centers(list(world().values()), Filters(within_days=30), TODAY)}
    listings = {key: [item["id"] for item in value["programs"] or value["schedules"]] for key, value in centers.items()}
    assert listings == {"training-1": [1], "training-2": [3], "training-3": [4], "assessment-1": [1, 3]}


def test_a_listing_earlier_today_in_utc_but_yesterday_here_is_excluded():
    late = schedule(4, MANILA_AC, "CSS-NC-II", "2026-10-06T15:00:00Z")  # 23:00 on Oct 6, Philippine time
    centers = build_centers([], [MANILA_AC], [], [late], REGIONS)
    assert filter_centers(centers, Filters(within_days=30), TODAY) == []


def test_nearest_first_puts_centers_without_a_distance_last():
    centers = sort_centers(with_distances(list(world().values()), MANILA), "nearest", TODAY)
    assert ids(centers) == ["training-2", "assessment-2", "training-1", "assessment-1", "training-3", "training-4"]


def test_soonest_first_orders_by_next_start_or_assessment_date():
    centers = sort_centers(list(world().values()), "soonest", TODAY)
    assert ids(centers) == ["assessment-1", "training-2", "training-1", "assessment-2", "training-3", "training-4"]


def test_name_order_ignores_case():
    lower = site(7, "abra skills center", "NCR", "Manila", 14.6, 120.98)
    centers = sort_centers(build_centers([MANILA_TC, lower, CEBU_TC], [], [], [], REGIONS), "name", TODAY)
    assert [center["name"] for center in centers] == [
        "abra skills center", "Cebu Skills Center", "Manila Welding Institute"]


def test_summary_counts_listings_and_names_the_next_date():
    centers = world()
    tarlac = summary(centers["training-1"], TODAY)
    assert "2 programs" in tarlac and "Oct 21" in tarlac and "2027" not in tarlac
    cebu = summary(centers["training-3"], TODAY)
    assert "1 program" in cebu and "programs" not in cebu and "Flexible start" in cebu
    assessments = summary(centers["assessment-1"], TODAY)
    assert "2 upcoming assessments" in assessments and "Oct 7" in assessments
    assert "No programs" in summary(centers["training-4"], TODAY)
    assert "No upcoming assessments" in summary(build_centers([], [MANILA_AC], [], [], REGIONS)[0], TODAY)


def test_summary_shows_the_year_of_a_date_in_another_year():
    only_next_year = build_centers([TARLAC_TC], [], [PROGRAMS[1]], [], REGIONS)[0]
    assert "Jan 10, 2027" in summary(only_next_year, TODAY)


def test_map_points_carry_only_what_the_map_shows():
    points = {point["id"]: point for point in map_points(with_distances(list(world().values()), MANILA), TODAY)}
    assert "training-4" not in points, "a center without coordinates can't be pinned"
    tarlac = dict(points["training-1"])
    assert tarlac.pop("summary").startswith("2 programs")
    assert tarlac == {
        "id": "training-1", "kind": "training", "name": "Tarlac Skills Institute", "place": "Tarlac City, Tarlac",
        "region": "Central Luzon", "latitude": 15.4755, "longitude": 120.5963,
        "distance_km": pytest.approx(105.9, abs=0.1)}


def test_provinces_lists_each_known_province_once():
    centers = list(world().values())
    assert provinces(centers) == ["Cebu", "Tarlac"]
    assert provinces(centers, "III") == ["Tarlac"]
    assert provinces(centers, "NCR") == []
