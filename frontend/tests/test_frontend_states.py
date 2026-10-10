"""Frontend state checks that use no service, credentials, or database.

Run independently of the integration suite with:
    .venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_frontend_states.py
"""
from copy import deepcopy
from datetime import date
from pathlib import Path
from uuid import uuid4

import pytest
from streamlit.testing.v1 import AppTest

from api_client import ApiClient, ApiError, ApiUnavailableError, UNAVAILABLE_MESSAGE


APP_FILE = Path(__file__).resolve().parents[1] / "app.py"
CATALOG = [
    {"code": "SMAW-NC-II", "name": "Welding NC II", "sector": "Metals and Engineering",
     "possible_jobs": ["Welder", "Fabricator"], "competencies": [
         {"id": 1, "name": "Weld safely", "category": "Core"}]},
    {"code": "CSS-NC-II", "name": "Computer Systems Servicing NC II", "sector": "Information Technology",
     "possible_jobs": ["Computer Technician"], "competencies": [
         {"id": 2, "name": "Repair computers", "category": "Core"}]},
    {"code": "COOKERY-NC-II", "name": "Cookery NC II", "sector": "Tourism",
     "possible_jobs": ["Cook", "Kitchen Assistant"], "competencies": [
         {"id": 3, "name": "Prepare food safely", "category": "Core"}]},
]


@pytest.fixture
def offline_api(monkeypatch):
    """Give each test its own cache namespace and block all unmocked HTTP calls."""
    monkeypatch.setenv("API_BASE_URL", f"http://frontend-test-{uuid4().hex}.invalid")
    state = {"catalog": deepcopy(CATALOG), "calls": [], "reports": [], "report_params": []}

    def blocked_request(self, *args, **kwargs):
        raise AssertionError("Frontend state tests must never access the network")

    monkeypatch.setattr(ApiClient, "_request", blocked_request)
    monkeypatch.setattr(ApiClient, "qualifications", lambda self: deepcopy(state["catalog"]))
    monkeypatch.setattr(ApiClient, "regions", lambda self: [
        {"code": "NCR", "name": "National Capital Region", "latitude": 14.60, "longitude": 120.98}])
    for method in ("readiness_checks", "sessions", "my_pathways", "my_applications", "goals", "certifications"):
        state[method] = []
        monkeypatch.setattr(ApiClient, method, lambda self, token, _method=method: deepcopy(state[_method]))
    monkeypatch.setattr(ApiClient, "rank_training", lambda self, *args, **kwargs: {"results": [], "weights": {}})
    monkeypatch.setattr(ApiClient, "schedules", lambda self, **kwargs: [])
    monkeypatch.setattr(ApiClient, "training_programs", lambda self, **kwargs: [])
    monkeypatch.setattr(ApiClient, "training_providers", lambda self: [])
    monkeypatch.setattr(ApiClient, "assessment_centers", lambda self: [])
    state["pathways"], state["pathway_lookups"] = [], []

    def pathways(self, qualification_code, route):
        state["pathway_lookups"].append((qualification_code, route))
        return deepcopy(state["pathways"])

    monkeypatch.setattr(ApiClient, "pathways", pathways)

    def report(self, token, name, **params):
        state["reports"].append(name)
        state["report_params"].append((name, params))
        if name == "overview":
            return {"learners": 12, "recommendation_sessions": 8, "readiness_checks": 6,
                    "average_readiness": 75, "certifications": {"verified": 2}}
        if name == "funnel":
            return {"registered": 12, "saved_a_recommendation": 8, "checked_readiness": 6,
                    "applied_for_assessment": 3, "certified": 2}
        if name == "supply":
            return [{"region": "National Capital Region", "training_providers": 2,
                     "training_programs": 3, "upcoming_assessments": 1, "open_seats": 10}]
        return []

    monkeypatch.setattr(ApiClient, "report", report)
    return state


def run_page(app, tab=None):
    # Navigate through the actual sidebar once the app has been rendered.
    # Seed only the first view, so tests can isolate a page without hidden requests.
    # The app stores the open page on every run, so its absence means nothing has rendered yet.
    if tab and "main_tabs" not in app.session_state:
        app.session_state["main_tabs"] = tab
    elif tab and app.session_state["main_tabs"] != tab:
        next(button for button in app.sidebar.button if button.label == tab).click()
    app.run()
    assert not app.exception
    return app


def navigation_labels(app):
    return [button.label for button in app.sidebar.button]


def open_account(app):
    app.button(key="open_account_sidebar").click()
    return run_page(app)


def new_app(role=None):
    app = AppTest.from_file(str(APP_FILE), default_timeout=15)
    if role:
        app.session_state["auth"] = {
            "token": "frontend-test-token", "name": "Juan Dela Cruz", "email": "juan@example.test", "role": role}
    return app


def page_text(app):
    native = [element.value for kind in ("markdown", "caption", "info", "warning", "error", "subheader")
              for element in getattr(app, kind)]
    return "\n".join([*native, *(element.proto.body for element in app.get("html"))])


def library_names(app):
    # Restrict to the qualification cards; selectbox options include the full catalog.
    return {item["name"] for item in CATALOG
            if any(item["name"] in node.value for node in app.markdown)}


def mock_finder(monkeypatch, readiness_calls=None):
    """A welding goal with unknown experience, matched to Welding NC II on an Assessment Readiness path."""
    profile = {"career_goal": "Welder", "experience_years": None, "has_certification": None,
               "intent": "training", "existing_skills": []}
    monkeypatch.setattr(ApiClient, "analyze_goal", lambda self, query: {"profile": deepcopy(profile)})
    monkeypatch.setattr(ApiClient, "match", lambda self, query, updated: {"profile": updated, "matches": [
        {"qualification": CATALOG[0], "score": 90, "reason": "Matches your welding goal."}]})
    monkeypatch.setattr(ApiClient, "pathway", lambda self, updated, code: {
        "recommendation": "ASSESSMENT_READINESS", "reason": "Build on your experience.",
        "next_step": "Check your current skills."})

    def readiness(self, code, answers):
        if readiness_calls is not None:
            readiness_calls.append((code, answers))
        return {"score": 100, "level": "High readiness", "recommendation": "Explore an assessment.",
                "strengths": ["Weld safely"], "skill_gaps": []}

    monkeypatch.setattr(ApiClient, "readiness", readiness)


def submit_goal(app, goal="I want to be a welder."):
    app.text_area(key="goal_query").set_value(goal)
    next(button for button in app.button if button.label == "Get Recommendation").click()
    return run_page(app)


def open_step(app, number):
    app.button(key=f"finder_tab_{number}").click()
    return run_page(app)


def press(app, key):
    app.button(key=key).click()
    return run_page(app)


def shown_selectboxes(app):
    return {box.key for box in app.selectbox}


def test_service_outage_keeps_sign_in_and_retry_recovers(offline_api, monkeypatch):
    attempts = []

    def unavailable_then_ready(self):
        attempts.append(True)
        if len(attempts) == 1:
            raise ApiUnavailableError(UNAVAILABLE_MESSAGE)
        return deepcopy(CATALOG)

    monkeypatch.setattr(ApiClient, "qualifications", unavailable_then_ready)
    app = run_page(new_app())
    assert app.button(key="open_account_sidebar")
    assert "can't reach" in page_text(app)
    app.button(key="retry_service").click()
    run_page(app)
    assert len(attempts) == 2
    assert "Qualification library" in navigation_labels(app)
    assert "can't reach" not in page_text(app)
    open_account(app)
    assert app.text_input(key="dialog_signin_email")
    assert app.text_input(key="dialog_signin_password")


def test_library_search_and_sector_filter_combine(offline_api):
    tab = "Qualification library"
    app = run_page(new_app(), tab)
    assert library_names(app) == {item["name"] for item in CATALOG}
    app.text_input(key="library_search").set_value("  technician  ")
    run_page(app, tab)
    assert library_names(app) == {"Computer Systems Servicing NC II"}
    app.selectbox(key="library_sector").select("Tourism")
    run_page(app, tab)
    assert library_names(app) == set()
    assert any(word in page_text(app).lower() for word in ("no qualifications", "no matches", "nothing matched"))
    app.text_input(key="library_search").set_value("")
    run_page(app, tab)
    assert library_names(app) == {"Cookery NC II"}
    app.button(key="clear_library_filters").click()
    run_page(app, tab)
    assert library_names(app) == {item["name"] for item in CATALOG}


@pytest.mark.parametrize("email,password", [("", ""), ("invalid-address", "secret"), ("juan@example.test", "")])
def test_invalid_sign_in_stays_local(offline_api, email, password):
    app = open_account(run_page(new_app()))
    app.text_input(key="dialog_signin_email").set_value(email)
    app.text_input(key="dialog_signin_password").set_value(password)
    next(button for button in app.button
         if button.label == "Sign in" and "dialog_" in (button.key or "")).click()
    run_page(app)
    assert app.error or app.warning
    assert "auth" not in app.session_state


def test_learner_progress_has_useful_empty_states(offline_api):
    app = run_page(new_app("learner"), "My progress")
    assert "Reports" not in navigation_labels(app)
    assert app.text_input(key="goal_title")
    assert app.text_input(key="certificate_title")
    assert "Follow a recommended pathway" in page_text(app)
    assert not offline_api["reports"]


def test_progress_renders_saved_records_and_completions(offline_api):
    qualification = deepcopy(CATALOG[0])
    offline_api["readiness_checks"] = [{"created_at": "2026-10-01T01:00:00+00:00",
                                        "qualification": qualification, "score": 75, "level": "Moderate readiness"}]
    offline_api["sessions"] = [{"created_at": "2026-10-01T01:00:00+00:00", "query": "Become a welder",
                               "selected_qualification": qualification, "matches": [],
                               "pathway": {"recommendation": "ASSESSMENT_READINESS"}}]
    offline_api["my_pathways"] = [{"id": "path-1", "status": "active", "completion_percent": 50,
                                   "pathway": {"title": "My welding pathway", "qualification": qualification},
                                   "steps": [{"id": 1, "position": 1, "title": "Learn welding", "status": "completed"},
                                             {"id": 2, "position": 2, "title": "Get assessed", "status": "not_started"}]}]
    offline_api["goals"] = [{"id": "goal-1", "title": "Become certified", "status": "achieved",
                             "target_qualification": qualification}]
    offline_api["certifications"] = [{"title": "My certificate", "issuing_body": "TESDA",
                                      "verified": False, "certificate_number": None}]
    app = run_page(new_app("learner"), "My progress")
    history = next(table.value for table in app.dataframe if "Score" in table.value.columns)
    assert list(history["Score"]) == [75]
    assert app.checkbox(key="step_path-1_1").value is True
    assert app.checkbox(key="step_path-1_2").value is False
    assert "Become certified" in page_text(app)
    assert "My certificate" in page_text(app)


def test_training_without_listings_has_empty_states(offline_api):
    app = run_page(new_app(), "Training & assessment")
    assert app.multiselect(key="training_qualifications")
    assert "No centers match your search" in page_text(app)
    assert not any(button.label == "Apply" for button in app.button)


def test_reports_render_only_for_admin_when_opened(offline_api):
    app = run_page(new_app("admin"))
    assert "Reports" in navigation_labels(app)
    assert not offline_api["reports"]
    run_page(app, "Reports")
    metrics = {metric.label: metric.value for metric in app.metric}
    assert metrics["Learners"] == "12"
    assert metrics["Open assessment seats"] == "10"
    assert set(offline_api["reports"]) == {"overview", "funnel", "supply", "qualification-demand", "skill-gaps"}


def test_expired_session_returns_to_sign_in(offline_api, monkeypatch):
    def expired(self, token):
        raise ApiError("Expired session", 401)

    monkeypatch.setattr(ApiClient, "readiness_checks", expired)
    app = run_page(new_app("learner"), "My progress")
    assert "auth" not in app.session_state
    assert app.button(key="open_account_sidebar")
    assert "session has expired" in page_text(app)
    open_account(app)
    assert app.text_input(key="dialog_signin_email")


def test_finder_answers_survive_tab_switch_without_hidden_requests(offline_api, monkeypatch):
    mock_finder(monkeypatch)
    calls = []
    for name in ("match", "pathway"):
        def counted(self, *args, _name=name, _call=getattr(ApiClient, name)):
            calls.append(_name)
            return _call(self, *args)
        monkeypatch.setattr(ApiClient, name, counted)
    app = submit_goal(run_page(new_app()))
    app.selectbox(key="follow_experience").select("More than 3 years")
    app.selectbox(key="follow_certification").select("No")
    run_page(app)
    open_step(app, 3)
    app.radio(key="competency_SMAW-NC-II_1").set_value("I can do this confidently")
    next(button for button in app.button if button.label == "Analyze My Skills").click()
    run_page(app)
    before_switch = len(calls)
    run_page(app, "Qualification library")
    assert len(calls) == before_switch, "hidden finder must not call analysis endpoints"
    run_page(app, "Find my pathway")
    assert [metric.value for metric in app.metric if metric.label == "Your readiness"] == ["100%"], \
        "the learner returns to their recommendation"
    open_step(app, 3)
    assert app.radio(key="competency_SMAW-NC-II_1").value == "I can do this confidently"
    open_step(app, 2)
    assert app.selectbox(key="follow_experience").value == "More than 3 years"
    assert app.selectbox(key="follow_certification").value == "No"
    open_step(app, 1)
    assert app.text_area(key="goal_query").value == "I want to be a welder."
    open_step(app, 2)
    app.button(key="open_account_finder").click()
    run_page(app)
    assert app.text_input(key="dialog_signin_email")
    assert app.text_input(key="dialog_signin_password")


def test_finder_shows_one_numbered_step_at_a_time(offline_api, monkeypatch):
    mock_finder(monkeypatch)
    app = run_page(new_app())
    assert [app.button(key=f"finder_tab_{number}").disabled for number in range(1, 5)] == [False, True, True, True]
    assert app.text_area(key="goal_query")

    submit_goal(app)
    assert not any(app.button(key=f"finder_tab_{number}").disabled for number in range(1, 5))
    assert "check_circle" in app.button(key="finder_tab_1").proto.icon, "a finished step is ticked"
    assert app.selectbox(key="qualification_selected").value == "SMAW-NC-II"
    assert not app.text_area, "the submitted goal shrinks to a summary"
    assert not app.radio

    press(app, "finder_next")
    assert app.radio(key="competency_SMAW-NC-II_1"), "step 3 is the readiness check"
    assert "Build on your experience." in page_text(app), "it opens with why we ask"
    assert "qualification_selected" not in shown_selectboxes(app)

    press(app, "finder_next")
    assert not app.radio
    assert "Finish your readiness check" in page_text(app), "the recommendation waits for the check"
    press(app, "finder_to_readiness")
    assert app.radio(key="competency_SMAW-NC-II_1")

    press(app, "finder_back")
    assert app.selectbox(key="qualification_selected"), "back from the readiness check is Your matches"


@pytest.mark.parametrize("score, level, verdict, action, kind, route", [
    (85, "High Readiness", "NC assessment", "See assessment schedules", "assessment", "ASSESSMENT_READINESS"),
    (65, "Moderate Readiness", "focused training", "Find training near you", "training", "SKILL_GAP_CHECK"),
    (30, "Low Readiness", "training first", "Find training near you", "training", "TRAINING_AND_ASSESSMENT"),
])
def test_the_readiness_result_decides_between_training_and_an_nc(offline_api, monkeypatch, score, level, verdict,
                                                                  action, kind, route):
    mock_finder(monkeypatch)
    monkeypatch.setattr(ApiClient, "readiness", lambda self, code, answers: {
        "score": score, "level": level, "recommendation": "The API's advice.", "strengths": [],
        "skill_gaps": ["Weld safely"]})
    offline_api["pathways"] = [{"id": 7, "title": "A pathway for this verdict", "description": "Steps to follow.",
                                "steps": [{"position": 1, "title": "First step"}]}]
    app = open_step(submit_goal(run_page(new_app())), 3)
    app.radio(key="competency_SMAW-NC-II_1").set_value("I have some experience")
    click_label(app, "Analyze My Skills")
    assert app.button(key="finder_tab_4").proto.type == "primary", "analyzing opens the recommendation"
    assert verdict in page_text(app)
    assert offline_api["pathway_lookups"][-1] == ("SMAW-NC-II", route), "the pathway shown agrees with the verdict"
    assert "A pathway for this verdict" in page_text(app)
    assert app.button(key="finder_next").label == action
    press(app, "finder_next")
    assert app.session_state["main_tabs"] == "Training & assessment"
    assert app.session_state["training_kinds"] == [kind], "the centers that fit the verdict"
    assert app.session_state["training_qualifications"] == ["SMAW-NC-II"]


def scroll_targets(app):
    """Where the page scrolls on this run: "top", or the key of the container brought to the top of the screen."""
    return [html.proto.body.split('data-scroll="')[1].split('"')[0]
            for html in app.get("html") if 'data-scroll="' in html.proto.body]


def motion(app, prefix):
    """The direction a step slides in from, and the key's run parity, read from its container."""
    for direction in ("forward", "back"):
        for parity in (0, 1):
            try:
                app.container(key=f"{prefix}_{direction}_{parity}")
            except KeyError:
                continue
            return direction, parity
    return None


def test_a_new_step_or_part_opens_at_the_top_of_the_screen(offline_api, monkeypatch):
    offline_api["catalog"][0]["competencies"] = [
        {"id": 11, "name": "Work in a team", "category": "Basic"},
        {"id": 13, "name": "Weld carbon steel plates", "category": "Core"}]
    mock_finder(monkeypatch)
    app = submit_goal(run_page(new_app()))
    assert scroll_targets(app) == ["top"], "a new step opens with the full banner and tabs"
    app.selectbox(key="follow_experience").select("More than 3 years")
    run_page(app)
    assert scroll_targets(app) == [], "answering a question leaves the page where it is"
    press(app, "finder_next")
    assert scroll_targets(app) == ["top"]
    open_step(app, 3)
    press(app, "readiness_next")
    assert scroll_targets(app) == ["readiness_questions"]


def test_the_banner_and_tabs_stay_together_in_one_sticky_header(offline_api, monkeypatch):
    mock_finder(monkeypatch)
    app = run_page(new_app())
    for number in (1, 2, 3, 4):
        if number == 2:
            submit_goal(app)
        elif number > 2:
            open_step(app, number)
        header = app.container(key="finder_header")
        assert [button.key for button in header.button] == [f"finder_tab_{n}" for n in range(1, 5)], f"step {number}"
        bodies = [html.proto.body for html in header.get("html")]
        assert any("YOUR JOURNEY, SIMPLIFIED" in body for body in bodies), f"step {number} keeps the journey in view"
        assert any("finder-compact" in body for body in bodies), f"step {number} compacts the header on scroll"


def test_each_step_slides_in_from_the_direction_the_learner_moved(offline_api, monkeypatch):
    mock_finder(monkeypatch)
    app = submit_goal(run_page(new_app()))
    entered = motion(app, "finder_body")
    assert entered[0] == "forward"
    press(app, "finder_next")
    after_next = motion(app, "finder_body")
    assert after_next[0] == "forward" and after_next != entered, "a new key each time restarts the animation"
    press(app, "finder_back")
    after_back = motion(app, "finder_body")
    assert after_back[0] == "back" and after_back[1] != after_next[1]
    open_step(app, 4)
    assert motion(app, "finder_body")[0] == "forward", "jumping ahead with a tab slides forward too"
    settled = motion(app, "finder_body")
    run_page(app)
    assert motion(app, "finder_body") == settled, "a rerun on the same step doesn't replay the animation"


def click_label(app, label):
    next(button for button in app.button if button.label == label).click()
    return run_page(app)


def test_example_and_sample_goals_fill_the_goal_box(offline_api):
    app = run_page(new_app())
    goal = app.text_area(key="goal_query")
    assert goal.proto.max_chars == 500, "the counter and limit stay well inside the API's 1,000 characters"
    click_label(app, "Improve my digital skills")
    assert app.text_area(key="goal_query").value == "I want to improve my digital skills and work with computers."
    click_label(app, "I want to become a chef")
    assert app.text_area(key="goal_query").value == "I want to become a chef."
    click_label(app, "Get my skills certified")
    assert app.text_area(key="goal_query").value == "I've worked as a welder for 5 years but I don't have an NC."


def test_use_again_puts_the_last_goal_back_in_the_box(offline_api, monkeypatch):
    mock_finder(monkeypatch)
    app = run_page(new_app())
    assert not any(button.key == "finder_use_again" for button in app.button), "nothing to reuse before a first goal"
    submit_goal(app)
    press(app, "finder_change_goal")
    app.text_area(key="goal_query").set_value("I want to bake bread.")
    run_page(app)
    press(app, "finder_use_again")
    assert app.text_area(key="goal_query").value == "I want to be a welder."


def test_change_goal_reopens_the_last_goal_and_keeps_the_results(offline_api, monkeypatch):
    mock_finder(monkeypatch)
    app = submit_goal(run_page(new_app()))
    open_step(app, 3)
    press(app, "finder_change_goal")
    assert app.text_area(key="goal_query").value == "I want to be a welder."
    press(app, "finder_next")
    assert app.selectbox(key="qualification_selected").value == "SMAW-NC-II"


def test_readiness_questions_come_in_parts_and_keep_earlier_answers(offline_api, monkeypatch):
    offline_api["catalog"][0]["competencies"] = [
        {"id": 11, "name": "Work in a team", "category": "Basic"},
        {"id": 12, "name": "Apply safety practices", "category": "Common"},
        {"id": 13, "name": "Weld carbon steel plates", "category": "Core"},
        {"id": 14, "name": "Read welding symbols", "category": "Common"}]
    calls = []
    mock_finder(monkeypatch, calls)
    app = open_step(submit_goal(run_page(new_app())), 3)

    def shown():
        return [radio.key.removeprefix("competency_SMAW-NC-II_") for radio in app.radio]

    assert shown() == ["11"]
    assert not any(button.label == "Analyze My Skills" for button in app.button)
    app.radio(key="competency_SMAW-NC-II_11").set_value("I can do this confidently")
    press(app, "readiness_next")
    assert shown() == ["12", "14"], "Common skills come together, after Basic"
    assert app.container(key="readiness_part_forward"), "the next part slides in from the right"
    app.radio(key="competency_SMAW-NC-II_12").set_value("I have some experience")
    app.radio(key="competency_SMAW-NC-II_14").set_value("I am not familiar with this")
    press(app, "readiness_next")
    assert shown() == ["13"]
    press(app, "readiness_previous")
    assert app.container(key="readiness_part_back"), "the previous part slides in from the left"
    assert app.radio(key="competency_SMAW-NC-II_12").value == "I have some experience"
    press(app, "readiness_next")
    assert app.button(key="finder_next").proto.type == "secondary", "finishing the check leads, not leaving it"
    app.radio(key="competency_SMAW-NC-II_13").set_value("I can do this confidently")
    next(button for button in app.button if button.label == "Analyze My Skills").click()
    run_page(app)
    assert calls == [("SMAW-NC-II", {11: "confident", 12: "some_experience", 13: "confident", 14: "not_familiar"})]
    assert [metric.value for metric in app.metric if metric.label == "Your readiness"] == ["100%"]
    assert app.button(key="finder_next").proto.type == "primary", "with results, training is the next step"


def test_sign_out_clears_saved_personal_results(offline_api):
    app = new_app("learner")
    app.session_state["analysis"] = {"career_goal": "Welder"}
    app.session_state["original_query"] = "My private goal"
    app.session_state["readiness_results"] = {"SMAW-NC-II": {"score": 100}}
    app.session_state["competency_SMAW-NC-II_1"] = "I can do this confidently"
    app.session_state["data_export"] = "{}"
    run_page(app, "My progress")
    open_account(app)
    app.button(key="dialog_sign_out").click()
    run_page(app, "My progress")
    assert all(key not in app.session_state for key in (
        "auth", "analysis", "original_query", "readiness_results", "data_export", "competency_SMAW-NC-II_1"))
    open_account(app)
    assert app.text_input(key="dialog_signin_email")


def test_library_explore_opens_finder_with_the_chosen_goal(offline_api):
    app = run_page(new_app(), "Qualification library")
    app.button(key="explore_CSS-NC-II").click()
    run_page(app)
    assert app.session_state["main_tabs"] == "Find my pathway"
    assert app.text_area(key="goal_query").value == "I want to pursue Computer Systems Servicing NC II."
    assert "analysis" not in app.session_state, "exploring should let the learner review their goal before submitting"


def test_library_explore_shows_the_goal_step_over_earlier_results(offline_api, monkeypatch):
    mock_finder(monkeypatch)
    app = open_step(submit_goal(run_page(new_app())), 3)
    run_page(app, "Qualification library")
    app.button(key="explore_CSS-NC-II").click()
    run_page(app)
    assert app.text_area(key="goal_query").value == "I want to pursue Computer Systems Servicing NC II."


def test_empty_catalog_can_be_refreshed_when_qualifications_arrive(offline_api):
    offline_api["catalog"] = []
    app = run_page(new_app())
    assert "no qualifications in the catalog" in page_text(app).lower()
    assert app.button(key="open_account_sidebar")
    offline_api["catalog"] = deepcopy(CATALOG)
    next(button for button in app.button if button.label == "Refresh catalog").click()
    run_page(app)
    assert "no qualifications in the catalog" not in page_text(app).lower()
    run_page(app, "Qualification library")
    assert library_names(app) == {item["name"] for item in CATALOG}


def test_report_date_range_is_validated_before_request_and_can_be_corrected(offline_api):
    app = run_page(new_app("admin"), "Reports")
    offline_api["reports"].clear()
    offline_api["report_params"].clear()
    app.date_input(key="report_from").set_value(date(2026, 10, 7))
    app.date_input(key="report_to").set_value(date(2026, 10, 1))
    run_page(app, "Reports")
    assert any("end date" in warning.value for warning in app.warning)
    assert not offline_api["reports"], "invalid date ranges should not be sent to the API"
    app.date_input(key="report_to").set_value(date(2026, 10, 7))
    run_page(app, "Reports")
    assert not app.warning
    dated_calls = [(name, params) for name, params in offline_api["report_params"] if name != "supply"]
    assert len(dated_calls) == 4
    assert all(params["date_from"] == "2026-10-07" and params["date_to"] == "2026-10-07"
               for name, params in dated_calls)


def test_reports_handle_no_activity_without_fabricating_scores(offline_api, monkeypatch):
    def empty_report(self, token, name, **params):
        if name == "overview":
            return {"learners": 0, "recommendation_sessions": 0, "readiness_checks": 0,
                    "average_readiness": None, "certifications": {"verified": 0}}
        if name == "funnel":
            return {"registered": 0, "saved_a_recommendation": 0, "checked_readiness": 0,
                    "applied_for_assessment": 0, "certified": 0}
        return []

    monkeypatch.setattr(ApiClient, "report", empty_report)
    app = run_page(new_app("admin"), "Reports")
    metrics = {metric.label: metric.value for metric in app.metric}
    assert metrics["Learners"] == "0"
    assert metrics["Readiness checks"] == "0"
    assert metrics["Open assessment seats"] == "0"
    assert not app.error


def test_sign_in_can_retry_after_temporary_service_failure(offline_api, monkeypatch):
    attempts = []

    def sign_in(self, email, password):
        attempts.append((email, password))
        if len(attempts) == 1:
            raise ApiUnavailableError(UNAVAILABLE_MESSAGE)
        return "frontend-test-token"

    monkeypatch.setattr(ApiClient, "sign_in", sign_in)
    monkeypatch.setattr(ApiClient, "me", lambda self, token: {
        "full_name": "Juan Dela Cruz", "email": "juan@example.test", "role": "learner"})
    app = open_account(run_page(new_app()))
    app.text_input(key="dialog_signin_email").set_value("  juan@example.test  ")
    app.text_input(key="dialog_signin_password").set_value("correct horse battery")
    next(button for button in app.button
         if button.label == "Sign in" and "dialog_" in (button.key or "")).click()
    run_page(app)
    assert any("can't reach" in error.value for error in app.error)
    assert "auth" not in app.session_state
    assert app.text_input(key="dialog_signin_password").value == "correct horse battery"
    next(button for button in app.button
         if button.label == "Sign in" and "dialog_" in (button.key or "")).click()
    run_page(app)
    assert app.session_state["auth"]["email"] == "juan@example.test"
    assert attempts == [("juan@example.test", "correct horse battery")] * 2
    assert not app.error


def test_new_recommendation_resets_readiness_and_rejected_answers_can_recover(offline_api, monkeypatch):
    readiness_calls = []

    def analyze(self, query):
        return {"profile": {"career_goal": "Technician" if "computer" in query else "Welder",
                            "experience_years": None, "has_certification": None,
                            "intent": "training", "existing_skills": []}}

    def match(self, query, profile):
        qualification = CATALOG[1] if "computer" in query else CATALOG[0]
        return {"profile": profile, "matches": [
            {"qualification": qualification, "score": 90, "reason": "Fits your stated career goal."}]}

    def readiness(self, code, answers):
        readiness_calls.append((code, answers))
        if not answers:
            raise ApiError("Please answer every competency before submitting.", 422)
        return {"score": 50, "level": "Building readiness", "recommendation": "Keep practicing.",
                "strengths": [], "skill_gaps": ["Weld safely"]}

    monkeypatch.setattr(ApiClient, "analyze_goal", analyze)
    monkeypatch.setattr(ApiClient, "match", match)
    monkeypatch.setattr(ApiClient, "readiness", readiness)
    monkeypatch.setattr(ApiClient, "pathway", lambda self, profile, code: {
        "recommendation": "TRAINING_AND_ASSESSMENT", "reason": "Start with training.",
        "next_step": "Explore a program."})
    app = submit_goal(run_page(new_app()))
    assert app.selectbox(key="qualification_selected").value == "SMAW-NC-II"
    open_step(app, 3)
    next(button for button in app.button if button.label == "Analyze My Skills").click()
    run_page(app)
    assert any("answer every competency" in warning.value for warning in app.warning)
    assert not any(metric.label == "Your readiness" for metric in app.metric)
    app.radio(key="competency_SMAW-NC-II_1").set_value("I have some experience")
    next(button for button in app.button if button.label == "Analyze My Skills").click()
    run_page(app)
    assert readiness_calls[-1] == ("SMAW-NC-II", {1: "some_experience"})
    assert [metric.value for metric in app.metric if metric.label == "Your readiness"] == ["50%"]
    assert not app.warning
    press(app, "finder_change_goal")
    submit_goal(app, "I want to repair computers.")
    assert app.selectbox(key="qualification_selected").value == "CSS-NC-II", "a new goal opens its matches"
    assert app.selectbox(key="follow_experience").value == "Choose an answer"
    open_step(app, 3)
    assert app.radio(key="competency_CSS-NC-II_2").value is None
    open_step(app, 4)
    assert not any(metric.label == "Your readiness" for metric in app.metric), "no result carried over to the new goal"


@pytest.mark.parametrize("tab,trigger", [
    ("Find my pathway", "open_account_sidebar"),
    ("My progress", "open_account_progress")])
def test_account_dialog_opens_from_each_learner_entry_point(offline_api, tab, trigger):
    app = run_page(new_app(), tab)
    app.button(key=trigger).click()
    run_page(app, tab)
    assert app.text_input(key="dialog_signin_email")
    assert app.text_input(key="dialog_signin_password")
    assert app.text_input(key="dialog_register_name")
    assert app.checkbox(key="dialog_register_consent")
    assert not app.sidebar.text_input, "the sidebar stays focused on navigation"


def test_account_dialog_validates_then_signs_in(offline_api, monkeypatch):
    app = open_account(run_page(new_app(), "My progress"))
    next(button for button in app.button
         if button.label == "Sign in" and "dialog_" in (button.key or "")).click()
    run_page(app)
    assert any("email address and password" in error.value for error in app.error)
    assert "auth" not in app.session_state
    monkeypatch.setattr(ApiClient, "sign_in", lambda self, email, password: "frontend-dialog-token")
    monkeypatch.setattr(ApiClient, "me", lambda self, token: {
        "full_name": "Juan Dela Cruz", "email": "juan@example.test", "role": "learner"})
    app.text_input(key="dialog_signin_email").set_value("juan@example.test")
    app.text_input(key="dialog_signin_password").set_value("correct horse battery")
    next(button for button in app.button
         if button.label == "Sign in" and "dialog_" in (button.key or "")).click()
    run_page(app)
    assert app.session_state["auth"]["token"] == "frontend-dialog-token"
    assert app.session_state["main_tabs"] == "My progress"
    assert app.text_input(key="goal_title"), "signing in returns to the current page"
    assert "Juan Dela Cruz" in app.button(key="open_account_sidebar").label
    assert not app.session_state["account_dialog_open"]
    assert not app.error


@pytest.mark.parametrize("role,tab", [("learner", "My progress"), ("admin", "Reports")])
def test_empty_catalog_preserves_account_history_and_reporting(offline_api, role, tab):
    offline_api["catalog"] = []
    app = run_page(new_app(role), tab)
    assert tab in navigation_labels(app)
    assert app.metric
    if role == "learner":
        assert app.text_input(key="goal_title")
        assert app.text_input(key="certificate_title")
        assert "Recommendation history" in page_text(app)
    else:
        assert "overview" in offline_api["reports"]
        assert "skill-gaps" not in offline_api["reports"]
        assert "when qualifications are added" in page_text(app)
    assert not app.error


def test_account_deletion_returns_immediately_to_signed_out_controls(offline_api, monkeypatch):
    deleted_tokens = []
    monkeypatch.setattr(ApiClient, "delete_account", lambda self, token: deleted_tokens.append(token))
    app = open_account(run_page(new_app("learner"), "My progress"))
    assert app.button(key="dialog_delete_account").disabled
    app.checkbox(key="dialog_confirm_delete").check()
    run_page(app, "My progress")
    app.button(key="dialog_delete_account").click()
    run_page(app, "My progress")
    assert deleted_tokens == ["frontend-test-token"]
    assert "auth" not in app.session_state
    assert app.button(key="open_account_sidebar")
    assert not any(button.key == "dialog_delete_account" for button in app.button)
    assert "account and saved records were deleted" in page_text(app)
    open_account(app)
    assert app.text_input(key="dialog_signin_email")
