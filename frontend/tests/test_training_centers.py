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
    return run(app.button(key="training_button_search").click())


def open_center(app, center_id):
    return run(app.button(key=f"center_open_{center_id}").click())


def row_ids(app):
    return [button.key.removeprefix("center_open_") for button in app.button
            if (button.key or "").startswith("center_open_")]


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
    assert "Showing 3 results" in text(app.container(key="center_results"))
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
    assert len(row_ids(app)) == 3, "results wait for Search"
    search(app)
    assert row_ids(app) == ["assessment-7", "training-2"]


def test_a_qualification_keeps_only_centers_that_offer_it(api):
    app = open_page()
    app.multiselect(key="training_qualifications").select("CSS-NC-II")
    search(app)
    assert row_ids(app) == ["training-1"]
    assert ("programs", "CSS-NC-II", 0) in api["pages"], "listings are fetched for the chosen qualification"


def test_selecting_a_center_shows_its_details_and_back_returns_to_the_list(api):
    app = open_page()
    open_center(app, "training-1")
    detail = text(app.container(key="center_detail"))
    assert "Tarlac Skills Institute" in detail and "Computer Systems Servicing NC II (11)" in detail
    assert map_data(app)["selected"] == "training-1"
    run(app.button(key="training_button_back").click())
    assert row_ids(app) == ["assessment-7", "training-2", "training-1"]
    assert map_data(app)["selected"] is None


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
