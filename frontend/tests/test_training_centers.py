"""The Training & assessment center finder, driven through the real app with a fake API (no network, no database).

Run with:
    .venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_training_centers.py
"""
import json
import re
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from streamlit.testing.v1 import AppTest

from api_client import ApiClient, ApiUnavailableError, UNAVAILABLE_MESSAGE
from directions import RouteClient, RouteError

APP_FILE = Path(__file__).resolve().parents[1] / "app.py"
PAGE = "Training & assessment"
TODAY = datetime.now(timezone(timedelta(hours=8))).date()
CATALOG = [
    {"code": "CSS-NC-II", "name": "Computer Systems Servicing NC II", "sector": "Information Technology",
     "possible_jobs": ["Computer technician"], "competencies": [{"id": 1, "name": "Repair computers", "category": "Core"}]},
    {"code": "SMAW-NC-II", "name": "Shielded Metal Arc Welding NC II", "sector": "Metals and Engineering",
     "possible_jobs": ["Welder"], "competencies": [{"id": 2, "name": "Weld safely", "category": "Core"}]},
]
NAMES = {item["code"]: item["name"] for item in CATALOG}
REGIONS = [
    {"code": "NCR", "name": "National Capital Region", "center_city": "Manila",
     "latitude": 14.5995, "longitude": 120.9842},
    {"code": "III", "name": "Central Luzon", "center_city": "San Fernando", "latitude": 15.0286, "longitude": 120.6898},
]


def site(site_id, name, region, city, lat, lon, province=None):
    return {"id": site_id, "name": name, "region_code": region, "province": province, "city": city, "address": None,
            "latitude": lat, "longitude": lon, "contact_email": None, "contact_phone": None, "is_active": True}


def summary_of(place):
    return {key: place[key] for key in ("id", "name", "region_code", "city", "latitude", "longitude")}


def program(program_id, provider, code, days, mode="institution_based", scholarship=False):
    return {"id": program_id, "title": f"{NAMES[code]} ({program_id})", "description": None,
            "qualification": {"code": code, "name": NAMES[code], "sector": "Test"}, "provider": summary_of(provider),
            "delivery_mode": mode, "duration_hours": 268, "cost": "0.00", "scholarship_available": scholarship,
            "start_date": (TODAY + timedelta(days=days)).isoformat(), "end_date": None, "slots": 25,
            "is_active": True, "distance_km": None}


def schedule(schedule_id, center, code, days):
    when = datetime.combine(TODAY + timedelta(days=days), datetime.min.time(), timezone.utc) + timedelta(hours=1)
    return {"id": schedule_id, "qualification": {"code": code, "name": NAMES[code], "sector": "Test"},
            "center": summary_of(center), "scheduled_at": when.isoformat().replace("+00:00", "Z"), "slots": 25,
            "seats_left": 9, "fee": "500.00", "status": "open", "distance_km": None}


TARLAC = {**site(1, "Tarlac Skills Institute", "III", "Tarlac City", 15.4755, 120.5963, "Tarlac"), "website": None}
MANILA = {**site(2, "Manila Welding Institute", "NCR", "Manila", 14.5995, 120.9842), "website": None}
MANILA_AC = site(7, "Manila Assessment Center", "NCR", "Manila", 14.6, 120.98)
PROGRAMS = [program(11, TARLAC, "CSS-NC-II", days=14, scholarship=True),
            program(12, MANILA, "SMAW-NC-II", days=30, mode="online"),
            program(13, MANILA, "SMAW-NC-II", days=-5)]
SCHEDULES = [schedule(21, MANILA_AC, "SMAW-NC-II", days=10)]


@pytest.fixture
def api(monkeypatch):
    """A fake API that pages and filters listings the way the real one does."""
    monkeypatch.setenv("API_BASE_URL", f"http://training-test-{uuid4().hex}.invalid")
    state = {"applied": [], "ranked": [], "pages": []}

    def blocked_request(self, *args, **kwargs):
        raise AssertionError("These tests must never reach the network")

    def listings(rows, kind):
        def fetch(self, qualification_code=None, limit=20, offset=0, **params):
            state["pages"].append((kind, qualification_code, offset))
            matching = [row for row in rows if qualification_code in (None, row["qualification"]["code"])]
            return deepcopy(matching[offset:offset + limit])
        return fetch

    def rank(self, token=None, **body):
        state["ranked"].append(body)
        return {"weights": {}, "semantic_used": False, "audit_id": 1, "results": [
            {"program": deepcopy(item), "score": 87, "explanation": ["Starts within the next month"],
             "components": {"semantic": 0, "proximity": 0, "assessment": 0, "schedule": 1, "preference": 0}}
            for item in PROGRAMS if item["qualification"]["code"] == body["qualification_code"]]}

    def apply(self, token, schedule_id):
        state["applied"].append((token, schedule_id))
        return {"id": "application-1", "status": "pending"}

    monkeypatch.setattr(ApiClient, "_request", blocked_request)
    monkeypatch.setattr(RouteClient, "route", blocked_request)
    monkeypatch.setattr(ApiClient, "qualifications", lambda self: deepcopy(CATALOG))
    monkeypatch.setattr(ApiClient, "regions", lambda self: deepcopy(REGIONS))
    monkeypatch.setattr(ApiClient, "training_providers", lambda self: deepcopy([TARLAC, MANILA]))
    monkeypatch.setattr(ApiClient, "assessment_centers", lambda self: deepcopy([MANILA_AC]))
    monkeypatch.setattr(ApiClient, "training_programs", listings(PROGRAMS, "programs"))
    monkeypatch.setattr(ApiClient, "schedules", listings(SCHEDULES, "schedules"))
    monkeypatch.setattr(ApiClient, "rank_training", rank)
    monkeypatch.setattr(ApiClient, "apply_for_assessment", apply)
    return state


def open_page(signed_in=False, **state):
    app = AppTest.from_file(str(APP_FILE), default_timeout=15)
    app.session_state["main_tabs"] = PAGE
    if signed_in:
        app.session_state["auth"] = {"token": "frontend-test-token", "name": "Juan Dela Cruz",
                                     "email": "juan@example.test", "role": "learner"}
    for key, value in state.items():
        app.session_state[key] = value
    return run(app)


def run(target):
    """Run the app, or the app a changed widget belongs to, and require a clean run."""
    app = target.run()
    assert not app.exception
    return app


def search(app):
    """Filters apply as they change; this runs the app with the changes made so far."""
    return run(app)


def open_center(app, center_id):
    return run(app.button(key=f"center_open_{center_id}").click())


def row_ids(app):
    """Every listed center in order: the featured one first, then the others."""
    return [button.key.removeprefix("center_open_") for button in app.button
            if (button.key or "").startswith("center_open_")]


def featured(app):
    """The center shown in full above the others."""
    return row_ids(app)[0]


def text(block):
    """What a learner reads in a block: Markdown escapes removed."""
    source = "\n".join(element.value for kind in ("markdown", "caption", "info", "warning", "success", "error")
                       for element in getattr(block, kind))
    return re.sub(r"\\(.)", r"\1", source)


def map_data(app):
    [element] = app.get("bidi_component")
    return json.loads(element.proto.json)


def test_every_center_is_listed_and_pinned_when_nothing_is_filtered(api):
    app = open_page()
    assert row_ids(app) == ["assessment-7", "training-2", "training-1"], "by name until there's a place to measure from"
    assert "All results (3)" in [heading.value for heading in app.container(key="center_results").subheader]
    assert {point["id"] for point in map_data(app)["centers"]} == {"assessment-7", "training-2", "training-1"}


def test_type_filter_applies_when_searching(api):
    app = open_page()
    app.segmented_control(key="training_kinds").set_value(["assessment"])
    search(app)
    assert row_ids(app) == ["assessment-7"]
    assert [point["id"] for point in map_data(app)["centers"]] == ["assessment-7"]


def test_provinces_follow_the_chosen_region_before_searching(api):
    app = open_page()
    run(app.selectbox(key="training_region").set_value("III"))
    assert app.selectbox(key="training_province").options == ["Tarlac"]
    run(app.selectbox(key="training_province").set_value("Tarlac"))
    run(app.selectbox(key="training_region").set_value("NCR"))
    province = app.selectbox(key="training_province")
    assert province.options == [] and province.disabled, "Tarlac isn't in the National Capital Region"
    assert province.value is None, "a province from another region is dropped"
    assert row_ids(app) == ["assessment-7", "training-2"], "filters apply as soon as they change"


def test_a_qualification_keeps_only_centers_that_offer_it(api):
    app = open_page()
    app.multiselect(key="training_qualifications").select("CSS-NC-II")
    search(app)
    assert row_ids(app) == ["training-1"]
    assert ("programs", "CSS-NC-II", 0) in api["pages"], "listings are fetched for the chosen qualification"


def test_the_first_result_is_shown_in_full_until_a_center_is_selected(api):
    app = open_page()
    assert featured(app) == "assessment-7" and "Manila Assessment Center" in text(app.container(key="center_detail"))
    assert map_data(app)["selected"] is None, "no pin is opened for the learner"


def test_selecting_a_center_shows_it_in_full_above_the_others(api):
    app = open_page()
    open_center(app, "training-1")
    detail = text(app.container(key="center_detail"))
    assert "Tarlac Skills Institute" in detail and "Computer Systems Servicing NC II (11)" in detail
    assert map_data(app)["selected"] == "training-1"
    assert row_ids(app) == ["training-1", "assessment-7", "training-2"], "the others keep their order below"


def test_view_on_map_opens_the_center_again_even_when_it_is_already_selected(api):
    app = open_page()
    focus = map_data(app)["focus"]
    run(app.button(key="training_button_focus").click())
    assert map_data(app)["selected"] == "assessment-7", "the featured first result becomes the selected one"
    run(app.button(key="training_button_focus").click())
    assert map_data(app)["focus"] == focus + 2, "each click asks the map to show the center"


def test_a_center_can_be_found_by_a_program_it_offers(api):
    app = open_page()
    run(app.text_input(key="training_search").input("computer systems"))
    assert row_ids(app) == ["training-1"]


def test_more_than_two_programs_wait_behind_view_all(api, monkeypatch):
    extra = [program(14 + number, MANILA, "SMAW-NC-II", days=40 + number) for number in range(2)]
    monkeypatch.setattr(ApiClient, "training_programs", lambda self, qualification_code=None, limit=20, offset=0,
                        **params: deepcopy([*PROGRAMS, *extra][offset:offset + limit]))
    app = open_page()
    open_center(app, "training-2")
    assert "Training programs (4)" in [heading.value for heading in app.container(key="center_detail").subheader]
    assert len([button for button in app.button if (button.key or "").startswith("program_open_")]) == 2
    run(app.button(key="training_button_all").click())
    assert len([button for button in app.button if (button.key or "").startswith("program_open_")]) == 4


def test_a_programs_chevron_opens_its_details(api):
    app = open_page()
    open_center(app, "training-1")
    run(app.button(key="program_open_11").click())
    assert app.session_state["training_program"] == 11
    details = "\n".join(block.value for block in app.markdown)
    assert "**Where:** Tarlac Skills Institute" in details and "**Slots:** 25 learners" in details


def test_saving_a_center_from_its_popup_marks_it_in_the_results(api):
    app = map_event(open_page(), "saved", "training-2")
    assert map_data(app)["saved"] == ["training-2"]
    assert "Saved" in text(app.container(key="center_badges_training-2"))
    app = map_event(app, "saved", "training-2")
    assert map_data(app)["saved"] == [], "a second press takes it back"


def test_filter_sections_count_what_they_filter(api):
    app = open_page()
    app.segmented_control(key="training_kinds").set_value(["assessment"])
    app.selectbox(key="training_region").set_value("NCR")
    app = run(app)
    head = text(app.container(key="training_filters_head"))
    assert ":blue-badge[2]" in head, "one center type and one region"


def test_the_filter_panel_folds_away_and_back(api):
    app = open_page()
    run(app.button(key="training_button_fold").click())
    assert not [element for element in app.segmented_control if element.key == "training_kinds"]
    run(app.button(key="training_button_fold").click())
    assert app.segmented_control(key="training_kinds")


def test_a_batch_already_under_way_says_it_started(api):
    app = open_page()
    open_center(app, "training-2")
    detail = text(app.container(key="center_detail"))
    started = (TODAY - timedelta(days=5)).strftime("%b ") + str((TODAY - timedelta(days=5)).day)
    assert f"Started {started}" in detail
    assert "Starts " in detail, "the batch that hasn't begun still says when it starts"


def test_signed_out_learners_are_asked_to_sign_in_before_applying(api):
    app = open_page()
    open_center(app, "assessment-7")
    assert "apply_21" not in [button.key for button in app.button]
    run(app.button(key="apply_sign_in").click())
    assert app.session_state["account_dialog_open"] is True


def test_a_signed_in_learner_applies_for_the_chosen_assessment(api):
    app = open_page(signed_in=True)
    open_center(app, "assessment-7")
    run(app.button(key="apply_21").click())
    assert api["applied"] == [("frontend-test-token", 21)]
    assert any("Application sent" in message.value for message in app.success)


def test_a_searched_place_orders_centers_by_distance_from_it(api):
    app = open_page()
    app.text_input(key="training_place").input("Tarlac")
    search(app)
    assert row_ids(app)[0] == "training-1"
    assert "from Tarlac" in text(app.container(key="center_results"))
    assert map_data(app)["reference"]["label"] == "Tarlac"


def test_enter_in_the_place_box_searches(api):
    app = open_page()
    run(app.text_input(key="training_place").input("Tarlac"))
    assert row_ids(app)[0] == "training-1"


def test_an_unknown_place_is_reported_and_filters_nothing(api):
    app = open_page()
    app.text_input(key="training_place").input("Atlantis")
    search(app)
    assert len(row_ids(app)) == 3
    assert "Atlantis" in text(app.container(key="training_filters_panel"))


def test_my_location_measures_distances_from_me(api):
    app = open_page(training_use_location=True, training_use_location_top=True,
                    training_location={"latitude": 15.47, "longitude": 120.59})
    assert row_ids(app)[0] == "training-1"
    reference = map_data(app)["reference"]
    assert reference["mine"] is True and (reference["latitude"], reference["longitude"]) == (15.47, 120.59)


def test_turning_my_location_off_forgets_it(api):
    app = open_page(training_use_location=True, training_use_location_top=True,
                    training_location={"latitude": 15.47, "longitude": 120.59})
    run(app.toggle(key="training_use_location_top").set_value(False))
    assert "training_location" not in app.session_state
    assert map_data(app)["reference"] is None


def test_clear_all_restores_every_center(api):
    app = open_page()
    app.segmented_control(key="training_kinds").set_value(["assessment"])
    search(app)
    run(app.button(key="training_button_clear").click())
    assert len(row_ids(app)) == 3


def test_filters_survive_a_trip_to_another_page(api):
    app = open_page()
    app.segmented_control(key="training_kinds").set_value(["assessment"])
    search(app)
    run(next(button for button in app.sidebar.button if button.label == "Qualification library").click())
    run(next(button for button in app.sidebar.button if button.label == PAGE).click())
    assert row_ids(app) == ["assessment-7"]


def test_the_qualification_chosen_in_the_finder_is_preselected(api):
    app = open_page(qualification_selected="SMAW-NC-II")
    assert app.multiselect(key="training_qualifications").value == ["SMAW-NC-II"]
    assert set(row_ids(app)) == {"training-2", "assessment-7"}


def test_training_details_show_how_well_each_program_fits(api):
    app = open_page(original_query="I want to fix computers")
    app.multiselect(key="training_qualifications").select("CSS-NC-II")
    search(app)
    open_center(app, "training-1")
    assert "87% fit" in text(app.container(key="center_detail"))
    assert api["ranked"][-1]["qualification_code"] == "CSS-NC-II"
    assert api["ranked"][-1]["goal"] == "I want to fix computers"
    calls = len(api["ranked"])
    run(app)
    assert len(api["ranked"]) == calls, "a rerun reuses the ranking instead of logging another one"


def test_my_own_location_is_never_sent_to_the_ranking_api(api):
    app = open_page(training_use_location=True, training_use_location_top=True,
                    training_location={"latitude": 15.47, "longitude": 120.59})
    app.multiselect(key="training_qualifications").select("CSS-NC-II")
    search(app)
    open_center(app, "training-1")
    assert api["ranked"] and not any("near_lat" in body or "near_lon" in body for body in api["ranked"]), \
        "the API keeps an audit of every ranking, and the help text promises the location is never saved"


def test_a_searched_place_is_used_for_ranking(api):
    app = open_page()
    app.multiselect(key="training_qualifications").select("CSS-NC-II")
    app.text_input(key="training_place").input("Tarlac")
    search(app)
    open_center(app, "training-1")
    assert (api["ranked"][-1]["near_lat"], api["ranked"][-1]["near_lon"]) == (15.5, 120.6)


def test_a_site_outage_shows_a_message_instead_of_crashing(api, monkeypatch):
    def unavailable(self):
        raise ApiUnavailableError(UNAVAILABLE_MESSAGE, 503)

    monkeypatch.setattr(ApiClient, "training_providers", unavailable)
    app = open_page()
    assert any(UNAVAILABLE_MESSAGE in message.value for message in [*app.error, *app.warning])


# Directions: the road route from the learner's own location, drawn on the map.

ROUTE = {"path": [[15.47003, 120.59001], [15.47288, 120.59348], [15.47551, 120.59629]], "distance_km": 1.2401,
         "duration_min": 3.405, "start": [15.47003, 120.59001], "end": [15.47551, 120.59629]}


# The walking route is longer; every mode shares the car's path so the tests can read it.
WALK = {**ROUTE, "distance_km": 1.1, "duration_min": 14.2}


@pytest.fixture
def routes(api, monkeypatch):
    """A fake router for each travel mode. The list records the origin, destination and mode of every route."""
    monkeypatch.delenv("ROUTING_URL", raising=False)
    asked = []

    def route(self, origin, destination, mode="car"):
        asked.append((origin, destination, mode))
        return deepcopy(WALK if mode == "foot" else ROUTE)

    monkeypatch.setattr(RouteClient, "route", route)
    return asked


def open_located():
    """The page once the browser has shared the learner's location (rounded, as the map sends it)."""
    return open_page(training_use_location=True, training_use_location_top=True,
                     training_location={"latitude": 15.47, "longitude": 120.59})


def map_event(app, event, value):
    """Act on the map as its JavaScript does: one trigger event, sent with the next run.

    The browser sends the component's own (empty) state too; without it the event never reaches the callbacks.
    """
    [element] = app.get("bidi_component")
    states = app._tree.get_widget_states()
    states.widgets.add(id=element.proto.id, json_value="{}")
    states.widgets.add(id=f"$$STREAMLIT_INTERNAL_KEY_{element.proto.id}__events",
                       json_trigger_value=json.dumps([{"event": event, "value": value}]))
    app = app._run(states)
    assert not app.exception
    return app


def links(block):
    return {element.proto.label: element.proto.url for element in block.get("link_button")}


def button_keys(app):
    return [button.key for button in app.button]


def show_route(app, center_id):
    open_center(app, center_id)
    return run(app.button(key="training_button_route").click())


def test_directions_draw_a_route_for_each_travel_mode_from_my_location(api, routes):
    app = open_located()
    open_center(app, "training-1")
    assert map_data(app)["route"] is None, "only once asked for"
    run(app.button(key="training_button_route").click())
    trip = ({"latitude": 15.47, "longitude": 120.59}, {"latitude": 15.4755, "longitude": 120.5963})
    assert sorted(routes, key=str) == sorted([(*trip, "car"), (*trip, "bike"), (*trip, "foot")], key=str), \
        "one route per mode, asked side by side"
    route = map_data(app)["route"]
    assert (route["center_id"], route["selected"]) == ("training-1", "car")
    assert (route["origin"], route["destination"]) == ([15.47, 120.59], [15.4755, 120.5963])
    car, bike, walk = route["options"]
    assert (car["mode"], car["path"]) == ("car", ROUTE["path"])
    assert "3 min" in car["label"] and "1.2 km" in car["label"]
    assert (walk["mode"], walk["label"]) == ("foot", "14 min · 1.1 km")
    detail = text(app.container(key="center_detail"))
    assert "1.2 km" in detail and "about 3 min by car" in detail


def test_choosing_another_travel_mode_keeps_the_routes(api, routes):
    app = show_route(open_located(), "training-1")
    run(app.segmented_control(key="training_travel_mode").set_value("foot"))
    assert map_data(app)["route"]["selected"] == "foot"
    assert "about 14 min on foot" in text(app.container(key="center_detail"))
    app = map_event(app, "travel_mode", "bike")
    assert map_data(app)["route"]["selected"] == "bike", "a route's label on the map picks it too"
    assert len(routes) == 3, "switching modes asks the router nothing more"


def test_a_long_trip_adds_an_estimated_flight(api, routes):
    davao = {"latitude": 7.07, "longitude": 125.61}
    app = open_page(training_use_location=True, training_use_location_top=True, training_location=davao)
    show_route(app, "training-1")
    options = {option["mode"]: option for option in map_data(app)["route"]["options"]}
    assert list(options) == ["car", "bike", "foot", "plane"]
    assert options["plane"]["label"].startswith("~"), "the flight time is marked as an estimate"
    run(app.segmented_control(key="training_travel_mode").set_value("plane"))
    detail = text(app.container(key="center_detail"))
    assert "Francisco Bangoy International Airport (DVO)" in detail and "Clark International Airport (CRK)" in detail
    assert "not an airline schedule" in detail


def test_a_short_trip_has_no_flight(api, routes):
    app = show_route(open_located(), "training-1")
    assert "plane" not in [option["mode"] for option in map_data(app)["route"]["options"]]


def test_a_mode_without_a_route_is_left_out(api, monkeypatch):
    monkeypatch.delenv("ROUTING_URL", raising=False)
    asked = []

    def route(self, origin, destination, mode="car"):
        asked.append(mode)
        if mode == "bike":
            raise RouteError("No road route was found to this center.")
        return deepcopy(ROUTE)

    monkeypatch.setattr(RouteClient, "route", route)
    app = show_route(open_located(), "training-1")
    assert [option["mode"] for option in map_data(app)["route"]["options"]] == ["car", "foot"]
    run(app)
    assert sorted(asked) == ["bike", "car", "foot"], "the missing route isn't asked for again on every rerun"
    assert "No bike route could be loaded" in text(app.container(key="center_detail"))
    run(app.button(key="training_button_retry_routes").click())
    assert sorted(asked) == ["bike", "bike", "car", "foot"], "Try again asks only for the missing route"


def test_a_route_is_asked_for_once_per_trip(api, routes):
    app = open_located()
    show_route(app, "training-1")
    run(app)
    run(app.button(key="training_button_hide_route").click())
    run(app.button(key="training_button_route").click())
    assert len(routes) == 3, "reruns and showing it again reuse the routes instead of asking the public router again"
    assert map_data(app)["route"]["center_id"] == "training-1"


def test_without_my_location_directions_open_google_maps(api, routes):
    app = open_page()
    open_center(app, "training-1")
    assert "training_button_route" not in button_keys(app)
    assert links(app.container(key="center_detail"))["Get directions"] == \
        "https://www.google.com/maps/dir/?api=1&destination=15.4755,120.5963"
    assert map_data(app)["can_route"] is False


def test_hiding_the_route_takes_it_off_the_map(api, routes):
    app = open_located()
    show_route(app, "training-1")
    run(app.button(key="training_button_hide_route").click())
    assert map_data(app)["route"] is None
    assert "training_button_route" in button_keys(app)


def test_leaving_a_center_drops_its_route(api, routes):
    app = open_located()
    show_route(app, "training-1")
    open_center(app, "training-2")
    assert map_data(app)["route"] is None
    open_center(app, "training-1")
    assert map_data(app)["route"] is None, "coming back shows the center, not the old route"


def test_turning_my_location_off_drops_the_route_and_forgets_it(api, routes):
    app = open_located()
    show_route(app, "training-1")
    run(app.toggle(key="training_use_location_top").set_value(False))
    assert map_data(app)["route"] is None
    app = map_event(run(app.toggle(key="training_use_location_top").set_value(True)), "located",
                    {"latitude": 15.47, "longitude": 120.59})
    run(app.button(key="training_button_route").click())
    assert len(routes) == 6, "routes start at the learner's location, so they're forgotten with it"


def test_directions_in_a_map_popup_open_that_center_with_its_route(api, routes):
    app = open_located()
    assert map_data(app)["can_route"] is True, "the popups offer Directions"
    app = map_event(app, "route", "training-2")
    assert map_data(app)["selected"] == "training-2"
    assert map_data(app)["route"]["destination"] == [14.5995, 120.9842]
    assert featured(app) == "training-2"
    assert "Manila Welding Institute" in text(app.container(key="center_detail"))


def test_a_routing_failure_is_explained_and_google_maps_stays_a_click_away(api, monkeypatch):
    monkeypatch.delenv("ROUTING_URL", raising=False)
    attempts = []

    def unavailable(self, origin, destination, mode="car"):
        attempts.append(mode)
        raise RouteError("Directions can't be loaded right now.")

    monkeypatch.setattr(RouteClient, "route", unavailable)
    app = open_located()
    show_route(app, "training-1")
    assert "Directions can't be loaded right now." in text(app.container(key="center_results"))
    assert map_data(app)["route"] is None
    assert links(app.container(key="center_detail"))["Google Maps"].startswith("https://www.google.com/maps/dir/")
    run(app)
    assert len(attempts) == 3, "failed routes aren't retried on every rerun; each try can wait out the timeout"
    assert "training_button_route" in button_keys(app), "the learner can try again"
    run(app.button(key="training_button_route").click())
    assert len(attempts) == 6, "and asking again tries every mode again"


def test_directions_stay_with_google_maps_when_routing_is_switched_off(api, monkeypatch):
    monkeypatch.setenv("ROUTING_URL", "")
    app = open_located()
    open_center(app, "training-1")
    assert "training_button_route" not in button_keys(app)
    assert "Get directions" in links(app.container(key="center_detail"))
    assert map_data(app)["can_route"] is False
