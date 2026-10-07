"""The learner portal's pages and guided finder, driven by AppTest against a fake API (no network, no database).

Run on its own with:
    .venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_portal.py
"""
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

import pytest
from streamlit.testing.v1 import AppTest

from api_client import ApiClient, ApiError, ApiUnavailableError, UNAVAILABLE_MESSAGE

APP_FILE = Path(__file__).resolve().parents[1] / "portal_app.py"
PAGE = {name: f"app_pages/{name}.py" for name in
        ("find", "qualifications", "training", "progress", "skills_bridge", "reports")}


def competency(id, name, category, position):
    return {"id": id, "position": position, "name": name, "category": category}


CATALOG = [
    {"code": "SMAW-NC-II", "name": "Shielded Metal Arc Welding (SMAW) NC II", "sector": "Metals and Engineering",
     "possible_jobs": ["Welder", "Fabricator"], "competencies": [
         competency(1, "Work in a team", "Basic", 1), competency(2, "Practice workplace safety", "Basic", 2),
         competency(3, "Use hand tools", "Common", 3),
         competency(4, "Set up welding equipment", "Core", 4), competency(5, "Weld carbon steel plates", "Core", 5)]},
    {"code": "CSS-NC-II", "name": "Computer Systems Servicing NC II", "sector": "Information and Communication Technology",
     "possible_jobs": ["Computer Technician"], "competencies": [competency(6, "Install computer systems", "Core", 1)]},
    {"code": "COOKERY-NC-II", "name": "Cookery NC II", "sector": "Tourism",
     "possible_jobs": ["Cook"], "competencies": [competency(7, "Prepare hot meals", "Core", 1)]},
]
SUMMARY = {item["code"]: {key: item[key] for key in ("code", "name", "sector")} for item in CATALOG}
WELDER_PROFILE = {"career_goal": "Welder", "possible_sector": "Metals and Engineering", "existing_skills": ["Welding"],
                  "experience_years": None, "has_certification": None, "intent": "unknown"}
SMAW_PATHWAY = {"id": 2, "qualification": SUMMARY["SMAW-NC-II"], "route": "ASSESSMENT_READINESS",
                "title": "Turn your experience into a certificate", "description": "Check your readiness first.",
                "steps": [{"id": 21, "position": 1, "kind": "self_check", "title": "Complete the readiness check",
                           "description": ""},
                          {"id": 22, "position": 2, "kind": "assessment", "title": "Apply for the competency assessment",
                           "description": ""}]}


def program(id, title, city, score):
    return {"program": {"id": id, "title": title, "description": None, "qualification": SUMMARY["SMAW-NC-II"],
                        "provider": {"id": id, "name": f"{city} Welding Institute", "region_code": "NCR", "city": city,
                                     "latitude": 14.6, "longitude": 121.0},
                        "delivery_mode": "institution_based", "duration_hours": 268, "cost": None,
                        "scholarship_available": True, "start_date": "2026-11-03", "end_date": None, "slots": 25},
            "score": score, "components": {"semantic": 1, "proximity": 1, "assessment": 1, "schedule": 1, "preference": 0},
            "explanation": ["It teaches the qualification you chose"]}


SCHEDULE = {"id": 31, "qualification": SUMMARY["SMAW-NC-II"],
            "center": {"id": 3, "name": "Manila Assessment Center", "region_code": "NCR", "city": "Manila",
                       "latitude": 14.6, "longitude": 121.0},
            "scheduled_at": "2026-12-01T01:00:00+00:00", "slots": 10, "seats_left": 4, "fee": "600.00",
            "status": "open", "distance_km": 3.2}


@pytest.fixture
def api(monkeypatch):
    """A fake API with its own cache namespace; any unmocked HTTP call fails the test."""
    monkeypatch.setenv("API_BASE_URL", f"http://portal-test-{uuid4().hex}.invalid")
    state = {"catalog": deepcopy(CATALOG), "calls": [], "rank": [], "schedules": [],
             "readiness_checks": [], "sessions": [], "my_pathways": [], "my_applications": [], "goals": [],
             "certifications": []}

    def record(name, *args):
        state["calls"].append((name, *args))

    def blocked(self, *args, **kwargs):
        raise AssertionError("Portal tests must never reach the network")

    def match(self, query, profile):
        record("match", query, deepcopy(profile))
        intent = "assessment_recommendation" if profile["experience_years"] else "training_recommendation"
        return {"profile": {**profile, "intent": intent}, "matches": [
            {"qualification": SUMMARY["SMAW-NC-II"], "score": 34, "reason": "Matched your words: welder",
             "components": None},
            {"qualification": SUMMARY["CSS-NC-II"], "score": 12, "reason": "Related to your skills",
             "components": None}]}

    def pathway(self, profile, code):
        record("pathway", deepcopy(profile), code)
        return {"recommendation": "ASSESSMENT_READINESS", "reason": "Your experience may cover several competencies.",
                "next_step": "Complete the readiness check before deciding on training.",
                "pathway": SMAW_PATHWAY if code == "SMAW-NC-II" else None}

    def readiness(self, code, answers):
        record("readiness", code, dict(answers))
        return {"score": 80.0, "level": "Moderate readiness", "strengths": ["Work in a team"],
                "skill_gaps": ["Weld carbon steel plates"], "recommendation": "Review your gaps, then apply."}

    def analyze_goal(self, query):
        record("analyze_goal", query)
        return {"profile": deepcopy(WELDER_PROFILE), "source": "rules"}

    def start_session(self, token, query):
        record("start_session", query)
        return {"id": "session-1", "goal_id": None, "query": query, "analysis_source": "rules",
                "profile": deepcopy(WELDER_PROFILE), "matches": [], "selected_qualification": None, "pathway": None,
                "created_at": "2026-10-07T00:00:00Z", "updated_at": "2026-10-07T00:00:00Z"}

    def submit_readiness(self, token, code, answers, session_id=None):
        record("submit_readiness", code, dict(answers), session_id)
        return readiness(self, code, answers)

    monkeypatch.setattr(ApiClient, "_request", blocked)
    monkeypatch.setattr(ApiClient, "start_session", start_session)
    monkeypatch.setattr(ApiClient, "update_session", lambda self, token, session_id, **fields: (
        record("update_session", session_id, fields), {})[1])
    monkeypatch.setattr(ApiClient, "submit_readiness", submit_readiness)
    monkeypatch.setattr(ApiClient, "follow_pathway", lambda self, token, pathway_id: (
        record("follow_pathway", pathway_id), {})[1])
    monkeypatch.setattr(ApiClient, "qualifications", lambda self: deepcopy(state["catalog"]))
    monkeypatch.setattr(ApiClient, "regions", lambda self: [
        {"code": "NCR", "name": "National Capital Region", "center_city": "Manila",
         "latitude": 14.60, "longitude": 120.98}])
    monkeypatch.setattr(ApiClient, "analyze_goal", analyze_goal)
    monkeypatch.setattr(ApiClient, "match", match)
    monkeypatch.setattr(ApiClient, "pathway", pathway)
    monkeypatch.setattr(ApiClient, "readiness", readiness)
    monkeypatch.setattr(ApiClient, "rank_training", lambda self, token=None, **body: (
        record("rank_training", body), {"results": deepcopy(state["rank"]), "weights": {}, "semantic_used": False,
                                        "audit_id": 1})[1])
    monkeypatch.setattr(ApiClient, "schedules", lambda self, **params: (
        record("schedules", params), deepcopy(state["schedules"]))[1])
    for method in ("readiness_checks", "sessions", "my_pathways", "my_applications", "goals", "certifications"):
        monkeypatch.setattr(ApiClient, method, lambda self, token, _m=method, **kwargs: deepcopy(state[_m]))
    monkeypatch.setattr(ApiClient, "set_step_status", lambda self, token, enrollment_id, step_id, status: (
        record("set_step_status", enrollment_id, step_id, status), {})[1])
    monkeypatch.setattr(ApiClient, "report", lambda self, token, name, **params: (
        record("report", name, params), {
            "overview": {"learners": 12, "recommendation_sessions": 8, "readiness_checks": 6,
                         "average_readiness": 75, "certifications": {"verified": 2, "self_reported": 1}},
            "funnel": {"registered": 12, "saved_a_recommendation": 8, "checked_readiness": 6,
                       "applied_for_assessment": 3, "certified": 2},
            "supply": [{"region": "National Capital Region", "training_providers": 2, "training_programs": 3,
                        "upcoming_assessments": 1, "open_seats": 10}]}.get(name, []))[1])
    return state


def calls(api, name):
    return [call[1:] for call in api["calls"] if call[0] == name]


def portal(role=None, page=None):
    app = AppTest.from_file(str(APP_FILE), default_timeout=15)
    if role:
        app.session_state["auth"] = {"token": "portal-test-token", "name": "Juan Dela Cruz",
                                     "email": "juan@example.test", "role": role}
    app.run()
    if page:
        app.switch_page(PAGE[page]).run()
    assert not app.exception
    return app


def press(app, key):
    app.button(key=key).click().run()
    assert not app.exception
    return app


def text(app):
    return "\n".join(element.value for kind in ("markdown", "caption", "info", "warning", "error", "success",
                                                "subheader", "header", "title")
                     for element in getattr(app, kind))


def ask(app, goal="I've worked as a welder for 5 years but I don't have an NC."):
    app.text_area(key="goal_query").set_value(goal)
    return press(app, "find_matches")


def answer_details(app, experience="More than 3 years", certificate="No"):
    app.button_group(key="finder_experience").set_value(experience).run()
    app.button_group(key="finder_certification").set_value(certificate).run()
    assert not app.exception
    return app


# --- Navigation -----------------------------------------------------------------------------------------------------

def test_reports_page_is_registered_only_for_administrators(api):
    with pytest.raises(ValueError):
        portal("learner").switch_page(PAGE["reports"])
    admin = portal("admin", "reports")
    metrics = {metric.label: metric.value for metric in admin.metric}
    assert metrics["Learners"] == "12"


@pytest.mark.parametrize("page", ["find", "qualifications", "training", "progress", "skills_bridge"])
def test_every_learner_page_opens_signed_out(api, page):
    assert portal(page=page).button(key="open_sign_in"), "a sign-in button is always within reach"


# --- Step 1: goal ---------------------------------------------------------------------------------------------------

def test_empty_goal_is_not_sent_for_matching(api):
    app = ask(portal(), "   ")
    assert any("Describe" in warning.value for warning in app.warning)
    assert not calls(api, "analyze_goal")
    assert app.button(key="find_matches"), "the learner stays on the goal step"


def test_example_fills_the_goal_box(api):
    app = portal()
    app.button_group(key="goal_example").set_value("Become a welder").run()
    assert app.text_area(key="goal_query").value == "I want to be a welder."


# --- Step 2: matches ------------------------------------------------------------------------------------------------

def test_matches_use_plain_labels_and_ask_only_the_missing_details(api):
    app = ask(portal())
    assert calls(api, "analyze_goal") == [("I've worked as a welder for 5 years but I don't have an NC.",)]
    page = text(app)
    assert "Best match" in page and "Shielded Metal Arc Welding (SMAW) NC II" in page
    assert "34%" not in page, "raw match percentages confused learners"
    assert app.button(key="to_pathway").disabled, "the pathway needs experience and certificate answers first"
    answer_details(app)
    assert not app.button(key="to_pathway").disabled
    assert calls(api, "match")[-1][1]["experience_years"] == 4 and calls(api, "match")[-1][1]["has_certification"] is False


def fail_match_once(monkeypatch):
    real, attempts = ApiClient.match, []

    def flaky(self, query, profile):
        attempts.append(1)
        if len(attempts) == 1:
            raise ApiUnavailableError(UNAVAILABLE_MESSAGE, 503)
        return real(self, query, profile)

    monkeypatch.setattr(ApiClient, "match", flaky)


def test_matching_outage_shows_an_error_instead_of_crashing(api, monkeypatch):
    fail_match_once(monkeypatch)
    app = ask(portal())
    assert any(error.value == UNAVAILABLE_MESSAGE for error in app.error)
    press(app, "retry_matches")
    assert [button for button in app.button if button.key == "choose_SMAW-NC-II"]


def test_matching_outage_lets_the_learner_go_back(api, monkeypatch):
    fail_match_once(monkeypatch)
    app = ask(portal())
    assert any(error.value == UNAVAILABLE_MESSAGE for error in app.error)
    press(app, "back_to_goal")
    assert [button for button in app.button if button.key == "find_matches"]


def test_goal_with_markdown_characters_is_kept_as_typed(api):
    app = ask(portal(), "# Welder *now* :material/home:")
    assert app.session_state["journey"]["query"] == "# Welder *now* :material/home:"
    assert any(r"\# Welder \*now\*" in caption.value for caption in app.caption)


def test_choosing_a_match_carries_into_the_pathway(api):
    app = answer_details(ask(portal()))
    press(app, "choose_CSS-NC-II")
    press(app, "to_pathway")
    assert calls(api, "pathway")[-1][1] == "CSS-NC-II"
    assert calls(api, "pathway")[-1][0]["experience_years"] == 4
    assert "Computer Systems Servicing NC II" in text(app)


def test_curated_pathway_steps_are_listed_and_following_needs_an_account(api):
    app = press(answer_details(ask(portal())), "to_pathway")
    page = text(app)
    assert "Turn your experience into a certificate" in page and "Apply for the competency assessment" in page
    assert not [button for button in app.button if button.key == "follow_pathway"]
    assert app.button(key="follow_pathway_sign_in")


# --- Step 4: readiness ----------------------------------------------------------------------------------------------

def readiness_step(app):
    return press(press(answer_details(ask(app)), "to_pathway"), "to_readiness")


def rated(app):
    return [group.key for group in app.button_group if str(group.key).startswith("answer_")]


def test_readiness_is_rated_one_group_at_a_time(api):
    app = readiness_step(portal())
    assert rated(app) == ["answer_SMAW-NC-II_1", "answer_SMAW-NC-II_2"], "Basic skills first"
    press(app, "readiness_next")
    assert rated(app) == ["answer_SMAW-NC-II_3"], "then Common"
    press(app, "readiness_next")
    assert rated(app) == ["answer_SMAW-NC-II_4", "answer_SMAW-NC-II_5"], "then Core"
    press(app, "readiness_previous")
    assert rated(app) == ["answer_SMAW-NC-II_3"]


def test_results_need_every_skill_rated_and_send_answer_codes(api):
    app = readiness_step(portal())
    for answer, keys in (("Confident", [1, 2]), ("Some experience", [3]), ("New to me", [4])):
        for key in keys:
            app.button_group(key=f"answer_SMAW-NC-II_{key}").set_value(answer).run()
        if key != 4:
            press(app, "readiness_next")
    assert app.button(key="see_results").disabled, "skill 5 is still unrated"
    app.button_group(key="answer_SMAW-NC-II_5").set_value("New to me").run()
    press(app, "see_results")
    assert calls(api, "readiness") == [("SMAW-NC-II", {1: "confident", 2: "confident", 3: "some_experience",
                                                       4: "not_familiar", 5: "not_familiar"})]
    assert [(metric.label, metric.value) for metric in app.metric] == [("Your readiness", "80%")]


def finish_readiness(app):
    app = readiness_step(app)
    for key, more in ((1, False), (2, True), (3, True), (4, False), (5, False)):
        app.button_group(key=f"answer_SMAW-NC-II_{key}").set_value("Confident").run()
        if more:
            press(app, "readiness_next")
    return press(app, "see_results")


def test_results_open_training_with_the_chosen_qualification(api):
    app = press(finish_readiness(portal()), "find_training")
    assert app.selectbox(key="training_qualification").value == "SMAW-NC-II"
    assert calls(api, "rank_training")[-1]["qualification_code"] == "SMAW-NC-II"
    assert calls(api, "rank_training")[-1]["goal"] == "I've worked as a welder for 5 years but I don't have an NC."


def test_results_open_assessment_schedules_view(api):
    app = press(finish_readiness(portal()), "see_assessments")
    assert app.button_group(key="training_view").value == "Assessment schedules"
    assert calls(api, "schedules")[-1]["qualification_code"] == "SMAW-NC-II"


def test_a_new_goal_starts_over_without_old_answers(api):
    app = press(finish_readiness(portal()), "new_goal")
    assert app.text_area(key="goal_query").value == ""
    ask(app, "I want to fix computers.")
    assert app.button_group(key="finder_experience").value is None
    assert app.button(key="to_pathway").disabled


# --- Qualifications library -----------------------------------------------------------------------------------------

def library_cards(app):
    return [node.key for node in app.get("flex_container") if str(node.key).startswith("card_")]


def test_library_shows_twelve_qualifications_per_page(api):
    api["catalog"] = [{**CATALOG[2], "code": f"Q-{index:02}", "name": f"Trade {index:02} NC II"} for index in range(30)]
    app = portal(page="qualifications")
    assert library_cards(app) == [f"card_Q-{index:02}" for index in range(12)]
    app.get("pagination")[0]  # the pager is shown when there is more than one page
    app.session_state["library_page"] = 3
    app.run()
    assert library_cards(app) == [f"card_Q-{index:02}" for index in range(24, 30)]


def test_library_filters_by_search_and_level(api):
    app = portal(page="qualifications")
    app.text_input(key="library_search").set_value("weld").run()
    assert library_cards(app) == ["card_SMAW-NC-II"]
    app.text_input(key="library_search").set_value("").run()
    app.button_group(key="library_level").set_value("NC III").run()
    assert library_cards(app) == []
    assert "No qualifications match" in text(app)


def test_starting_from_the_library_opens_matches_for_that_qualification(api):
    app = press(portal(page="qualifications"), "start_COOKERY-NC-II")
    assert calls(api, "analyze_goal") == [("I want to work toward Cookery NC II.",)]
    assert app.button(key="choose_COOKERY-NC-II").label == "Chosen", "the picked qualification is preselected"
    assert "You picked this" in text(app)


# --- Training and assessment ----------------------------------------------------------------------------------------

def test_training_lists_programs_with_start_dates_and_needs_sign_in_to_apply(api):
    api["rank"] = [program(1, "SMAW NC II Manila batch", "Manila", 82)]
    api["schedules"] = [SCHEDULE]
    app = portal(page="training")
    app.selectbox(key="training_qualification").select("SMAW-NC-II").run()
    programs = "\n".join(node.value for node in app.container(key="program_results").markdown)
    assert "SMAW NC II Manila batch" in programs and "Nov 3, 2026" in programs
    app.button_group(key="training_view").set_value("Assessment schedules").run()
    schedules = "\n".join(node.value for node in app.container(key="schedule_results").markdown)
    assert "Manila Assessment Center" in schedules and "4 of 10 seats left" in schedules
    assert not [button for button in app.button if button.key == "apply_31"]
    assert app.button(key="apply_sign_in")


def test_training_remembers_region_across_pages(api):
    app = portal(page="training")
    app.selectbox(key="training_qualification").select("SMAW-NC-II").run()
    app.selectbox(key="training_region").select("NCR").run()
    app.switch_page(PAGE["find"]).run()
    app.switch_page(PAGE["training"]).run()
    assert app.selectbox(key="training_region").value == "NCR"
    assert calls(api, "rank_training")[-1]["near_lat"] == 14.60


# --- My progress and accounts ---------------------------------------------------------------------------------------

def test_progress_signed_out_offers_sign_in_that_validates_locally(api, monkeypatch):
    monkeypatch.setattr(ApiClient, "sign_in", lambda *args: pytest.fail("invalid input must not reach the API"))
    app = portal(page="progress")
    app.text_input(key="progress_signin_email").set_value("not-an-email")
    press(app, "progress_signin_submit")
    assert any("email address" in error.value for error in app.error)


def test_signing_in_from_progress_shows_saved_records(api, monkeypatch):
    monkeypatch.setattr(ApiClient, "sign_in", lambda self, email, password: "fresh-token")
    monkeypatch.setattr(ApiClient, "me", lambda self, token: {"full_name": "Juan Dela Cruz", "email": "juan@example.test",
                                                              "role": "learner"})
    app = portal(page="progress")
    app.text_input(key="progress_signin_email").set_value("juan@example.test")
    app.text_input(key="progress_signin_password").set_value("correct horse battery")
    press(app, "progress_signin_submit")
    assert app.session_state["auth"]["token"] == "fresh-token"
    assert "Continue where you left off" in text(app)


def test_continue_card_ticks_off_the_next_pathway_step(api):
    api["my_pathways"] = [{"id": "e1", "pathway": SMAW_PATHWAY, "status": "active", "completion_percent": 0,
                           "steps": [{**step, "status": "not_started"} for step in SMAW_PATHWAY["steps"]],
                           "completed_at": None, "created_at": "2026-10-01T00:00:00Z",
                           "updated_at": "2026-10-01T00:00:00Z"}]
    app = portal("learner", "progress")
    assert "Complete the readiness check" in text(app)
    press(app, "continue_mark_done")
    assert calls(api, "set_step_status") == [("e1", 21, "completed")]


def test_signing_out_clears_the_learners_results(api):
    app = finish_readiness(portal("learner"))
    press(app, "account_sign_out")
    assert "auth" not in app.session_state
    assert "journey" not in app.session_state and not app.session_state["readiness_results"]
    assert app.button(key="open_sign_in")


def test_expired_session_returns_to_sign_in(api, monkeypatch):
    def expired(self, token):
        raise ApiError("Your session has expired. Please sign in again.", 401)

    monkeypatch.setattr(ApiClient, "my_pathways", expired)
    app = portal("learner", "progress")
    assert "auth" not in app.session_state
    assert "session has expired" in text(app)


# --- Failures -------------------------------------------------------------------------------------------------------

def test_service_outage_offers_a_retry_that_recovers(api, monkeypatch):
    attempts = []

    def unavailable_then_ready(self):
        attempts.append(1)
        if len(attempts) == 1:
            raise ApiUnavailableError(UNAVAILABLE_MESSAGE, 503)
        return deepcopy(CATALOG)

    monkeypatch.setattr(ApiClient, "qualifications", unavailable_then_ready)
    app = portal()
    assert any(error.value == UNAVAILABLE_MESSAGE for error in app.error)
    press(app, "retry_service")
    assert not app.error and app.text_area(key="goal_query")


def test_report_date_range_is_checked_before_asking_the_api(api):
    from datetime import date

    app = portal("admin", "reports")
    before = len(calls(api, "report"))
    app.date_input(key="report_from").set_value(date(2026, 10, 7))
    app.date_input(key="report_to").set_value(date(2026, 10, 1)).run()
    assert any("on or after" in warning.value for warning in app.warning)
    assert len(calls(api, "report")) == before
