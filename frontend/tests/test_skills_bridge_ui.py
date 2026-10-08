"""Skills Bridge UI and API-client tests; no network, accounts, or database writes."""
from copy import deepcopy

import httpx
import pytest

from api_client import ApiClient, ApiError, ApiUnavailableError
from frontend.tests.test_frontend_states import offline_api, new_app, open_account, page_text, run_page
from skills_bridge_view import (_classify_terms, _delivery_query_params, _delivery_sites, _extract_skill_terms,
                                _location_from_state)


TAB = "Skills Bridge"
MATCH = {"source": "Skills Bridge", "retrieved_at": "2026-10-07T01:00:00+00:00", "data": {
    "input": {"skills": ["JavaScript", "Cooking"]}, "unmatched": ["Cooking"],
    "resolution": [{"term": "JavaScript", "matched_skills": 5, "strength": "strong"}],
    "occupations": [{"occupation_id": 133, "title": "Front-end Web Developer", "score": .5,
                     "terms_matched": ["JavaScript"], "open_posts": 2}],
    "qualifications": [{"title": "Programming NC III", "code": "TEST-NC3", "level_label": "NC III",
                        "status": "promulgated", "skill_share": .1, "terms_matched": ["JavaScript"]}]}}
OCCUPATION_MATCH = {"source": "Skills Bridge", "retrieved_at": "2026-10-07T01:00:00+00:00", "data": {
    "input": {"occupations": ["welder", "programmer"]}, "unmatched": [],
    "resolution": [{"term": "welder", "matched_occupations": 1, "strength": "strong"}],
    "occupations": [{"occupation_id": 14, "title": "Welder", "score": 1.0,
                      "terms_matched": ["welder"], "open_posts": 0}]}}
DETAIL = {"source": "Skills Bridge", "retrieved_at": "2026-10-07T01:00:00+00:00", "data": {
    "profile": {"occupation": {"occupation_id": 133, "title": "Front-end Web Developer"}, "standards": []},
    "skills": [{"skill_id": 10, "name": "DOM manipulation", "type": "technical"},
               {"skill_id": 11, "name": "Web accessibility", "type": "technical"}],
    "benchmarks": [{"title": "webmaster", "source": "ESCO", "standard": "ESCO v1.2.1",
                    "status": "confirmed", "sample_skills": ["web design"]}], "warnings": []}}


@pytest.fixture
def bridge(offline_api, monkeypatch):
    state = {"calls": [], "match": deepcopy(MATCH), "details": deepcopy(DETAIL), "fail": False}

    def matches(self, skills):
        state["calls"].append(("matches", skills))
        if state["fail"]:
            raise ApiError("Skills Bridge is unavailable right now.", 503)
        return deepcopy(state["match"])

    def occupations(self, terms):
        state["calls"].append(("occupations", terms))
        return deepcopy(OCCUPATION_MATCH)

    def details(self, occupation_id):
        state["calls"].append(("occupation", occupation_id))
        return deepcopy(state["details"])

    monkeypatch.setattr(ApiClient, "bridge_matches", matches)
    monkeypatch.setattr(ApiClient, "bridge_occupations", occupations)
    monkeypatch.setattr(ApiClient, "bridge_occupation", details)
    return state


def submit(app, label):
    next(button for button in app.button if button.label == label).click()
    return run_page(app, TAB)


def search(app, terms="JavaScript, Cooking"):
    app.text_area(key="bridge_terms").set_value(terms)
    return submit(app, "Find career matches")


@pytest.mark.parametrize("text,expected", [
    ("I want to be a welder and programmer", ["welder", "programmer"]),
    ("I want to become a front-end web developer", ["front-end web developer"]),
    ("I have programming, cooking, and JavaScript", ["programming", "cooking", "JavaScript"]),
    ("network configuration; Python", ["network configuration", "Python"]),
])
def test_natural_language_skill_terms_are_extracted(text, expected):
    assert _extract_skill_terms(text) == expected


def test_job_titles_use_occupation_lookup_and_capabilities_use_skill_lookup():
    assert _classify_terms(["welder", "programmer", "welding", "JavaScript"]) == (
        ["welder", "programmer"], ["welding", "JavaScript"])


def test_delivery_map_contract_sorts_and_deduplicates_sites():
    programs = [{"title": "Welding cohort", "provider": {"id": 1, "name": "Provider", "city": "Manila",
                 "region_code": "NCR", "latitude": 14.5995, "longitude": 120.9842}, "distance_km": None}]
    schedules = [{"scheduled_at": "2026-11-01T01:00:00Z", "seats_left": 5,
                  "center": {"id": 2, "name": "Center", "city": "Manila", "region_code": "NCR",
                              "latitude": 14.6008, "longitude": 120.9831}, "distance_km": None}]
    location = _location_from_state({"latitude": 14.60, "longitude": 120.98, "accuracy": 12})
    sites = _delivery_sites(programs, schedules, location)
    assert [site["kind"] for site in sites] == ["training", "assessment"]
    assert all(site["distance_km"] is not None for site in sites)
    assert sites[0]["id"] == "training-1"
    assert _location_from_state({"latitude": 140, "longitude": 120}) is None


def test_delivery_api_can_switch_between_all_and_nearby_queries():
    location = {"latitude": 14.60, "longitude": 120.98}
    assert _delivery_query_params("SMAW-NC-II", "Show all", 50, None) == {
        "qualification_code": "SMAW-NC-II", "limit": 20}
    assert _delivery_query_params("SMAW-NC-II", "Show all", 50, location) == {
        "qualification_code": "SMAW-NC-II", "limit": 20, "near_lat": 14.60, "near_lon": 120.98}
    assert _delivery_query_params("SMAW-NC-II", "Near me", 25, location)["radius_km"] == 25


def test_natural_language_search_sends_meaningful_terms(bridge):
    app = search(run_page(new_app(), TAB), "I want to be a welder and programmer")
    assert bridge["calls"] == [("occupations", ["welder", "programmer"])]


def test_bridge_is_opt_in_and_invalid_terms_stay_local(bridge):
    app = run_page(new_app(), TAB)
    assert "extract the meaningful terms" in page_text(app)
    assert bridge["calls"] == []
    for terms in (" ", ",".join(f"skill{i}" for i in range(26)), "x" * 81):
        search(app, terms)
        assert app.warning
        assert bridge["calls"] == []


def test_matches_details_gap_review_and_tab_switch_preserve_state(bridge):
    app = search(run_page(new_app("learner"), TAB))
    assert bridge["calls"] == [("matches", ["JavaScript", "Cooking"])]
    assert "Cooking" in app.info[0].value
    assert "not a readiness score" in page_text(app)
    assert "Programming NC III" in page_text(app)
    submit(app, "Explore skills & qualifications")
    assert bridge["calls"][-1] == ("occupation", 133)
    assert "partial taxonomy" in page_text(app)
    assert "certification equivalency" in page_text(app)
    app.multiselect(key="bridge_known_skills").set_value([10])
    run_page(app, TAB)
    assert list(app.dataframe[0].value["Skill to explore"]) == ["Web accessibility"]
    run_page(app, "Qualification library")
    run_page(app, TAB)
    assert app.multiselect(key="bridge_known_skills").value == [10]
    assert len(bridge["calls"]) == 2, "ordinary widget reruns must not repeat remote requests"
    app.multiselect(key="bridge_known_skills").set_value([10, 11])
    run_page(app, TAB)
    assert "additional skills beyond this preview" in page_text(app)
    open_account(app)
    app.button(key="dialog_sign_out").click()
    run_page(app, TAB)
    assert "bridge_matches" not in app.session_state
    assert "bridge_details" not in app.session_state


def test_new_lookup_clears_previous_results_when_service_fails_and_can_retry(bridge):
    app = search(run_page(new_app(), TAB))
    submit(app, "Explore skills & qualifications")
    bridge["fail"] = True
    search(app, "Networking")
    assert "Skills Bridge is unavailable" in page_text(app)
    assert "bridge_matches" not in app.session_state
    assert "bridge_details" not in app.session_state
    assert not app.metric
    bridge["fail"] = False
    search(app, "JavaScript")
    assert app.metric and not app.error


def test_empty_matches_and_partial_details_remain_usable(bridge):
    bridge["match"]["data"]["occupations"] = []
    bridge["match"]["data"]["qualifications"] = []
    app = search(run_page(new_app(), TAB))
    assert "No occupation matches" in page_text(app)
    assert "No promulgated qualifications" in page_text(app)
    bridge["match"] = deepcopy(MATCH)
    bridge["details"]["data"].update(skills=[], benchmarks=[], warnings=["The skills details could not be loaded."])
    search(app)
    submit(app, "Explore skills & qualifications")
    assert app.warning
    assert "No international mapping" in page_text(app)
    assert not app.exception


def test_bridge_available_without_local_catalog(bridge, offline_api):
    offline_api["catalog"] = []
    app = search(run_page(new_app(), TAB))
    assert app.metric


@pytest.mark.parametrize("open_posts,caption", [(2, "2 open posts recorded in Skills Bridge"),
                                                (1, "1 open post recorded in Skills Bridge"),
                                                (0, None), (None, None)])
def test_open_posts_show_only_when_skills_bridge_counted_some(offline_api, monkeypatch, open_posts, caption):
    # Title matches carry no count at all, and a count of 0 says nothing useful about a career.
    match = deepcopy(MATCH)
    occupation = match["data"]["occupations"][0]
    if open_posts is None:
        del occupation["open_posts"]
    else:
        occupation["open_posts"] = open_posts
    monkeypatch.setattr(ApiClient, "bridge_matches", lambda self, skills, client_ip=None: deepcopy(match))
    text = page_text(search(run_page(new_app(), TAB)))
    if caption:
        assert caption in text
    else:
        assert "open post" not in text


def test_bridge_api_preserves_provider_errors_and_uses_sufficient_timeout():
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(503, json={"detail": "Skills Bridge is currently disabled."})

    api = ApiClient("https://local.example.test")
    api._http.close()
    api._http = httpx.Client(base_url="https://local.example.test", transport=httpx.MockTransport(handler))
    try:
        for call in (lambda: api.bridge_matches(["JavaScript"]), lambda: api.bridge_occupations(["welder"]),
                     lambda: api.bridge_occupation(133)):
            with pytest.raises(ApiError, match="Skills Bridge is currently disabled"):
                call()
        assert all(request.extensions["timeout"]["read"] == 60 for request in requests)
        assert all("authorization" not in request.headers for request in requests)
        with pytest.raises(ApiUnavailableError, match="TESDA-TRACK"):
            api.qualifications()
    finally:
        api._http.close()
