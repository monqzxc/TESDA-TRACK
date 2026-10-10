"""End-to-end UI flow: Streamlit's AppTest driving the app against the real API over HTTP."""
from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

APP_FILE = Path(__file__).resolve().parents[1] / "app.py"


@pytest.fixture
def ui(live_api):
    app = AppTest.from_file(str(APP_FILE), default_timeout=30).run()
    assert not app.exception
    return app


def rerun(app, tab=None):
    """Use the same sidebar navigation as a learner when changing views."""
    if tab and app.session_state["main_tabs"] != tab:
        next(button for button in app.sidebar.button if button.label == tab).click()
    app.run()
    assert not app.exception


def open_account(app):
    app.button(key="open_account_sidebar").click()
    rerun(app)


def click(app, label, tab=None):
    if label == "Sign out":
        open_account(app)
    next(button for button in app.button if button.label.startswith(label)
         and (label not in {"Sign in", "Create account"} or "dialog_" in (button.key or ""))).click()
    rerun(app, tab)


def readiness(app):
    return [metric.value for metric in app.metric if metric.label == "Your readiness"]


def open_step(app, number):
    """Use the finder's numbered step tabs, as a learner does."""
    app.button(key=f"finder_tab_{number}").click()
    rerun(app)


def asks_because(app, reason):
    """The readiness check opens with why we ask: the route the learner's experience suggests."""
    return any(reason in md.value for md in app.markdown)


def rate_welding_skills(app, confident=3):
    """The test catalog's SMAW NC II has one Basic competency, then five Core ones. The first `confident` are
    rated confident and the rest "some experience": three make 75%, all six make 100%."""
    open_step(app, 3)
    app.radio[0].set_value("I can do this confidently")
    click(app, "Next: Core skills")
    for index, radio in enumerate(app.radio, start=1):
        radio.set_value("I can do this confidently" if index < confident else "I have some experience")
    click(app, "Analyze My Skills")


def test_reruns_reuse_the_last_matches_and_pathway(ui, monkeypatch):
    from api_client import ApiClient

    calls = []
    for name in ("match", "pathway"):
        def counted(self, *args, _name=name, _call=getattr(ApiClient, name)):
            calls.append(_name)
            return _call(self, *args)
        monkeypatch.setattr(ApiClient, name, counted)
    app = ui
    click(app, "Become a welder")
    click(app, "Get Recommendation")
    assert calls == ["match"], "Your matches doesn't need the pathway yet"
    open_step(app, 3)
    assert calls == ["match", "pathway"]
    rerun(app)
    assert calls == ["match", "pathway"], "a rerun with nothing changed doesn't ask the API again"
    open_step(app, 2)
    app.selectbox(key="follow_experience").select("More than 3 years").run()
    open_step(app, 3)
    assert calls == ["match", "pathway", "match", "pathway"], "a changed answer does"

def test_pathway_finder_flow(ui):
    app = ui
    assert [button.label for button in app.sidebar.button][:2] == ["Find my pathway", "Qualification library"]
    click(app, "Get Recommendation")
    assert any("Describe your career goal" in warning.value for warning in app.warning)
    assert "analysis" not in app.session_state

    click(app, "Become a welder")
    assert app.text_area(key="goal_query").value == "I want to be a welder."
    click(app, "Get Recommendation")
    assert app.selectbox(key="qualification_selected").value == "SMAW-NC-II"
    app.selectbox(key="follow_experience").select("More than 3 years").run()
    app.selectbox(key="follow_certification").select("No").run()
    assert not app.exception
    open_step(app, 3)
    assert asks_because(app, "may cover several competencies"), "experience without a certificate"
    assert len(app.radio) == 1, "Basic skills come first, on their own"
    app.radio[0].set_value("I can do this confidently")
    click(app, "Next: Core skills")
    assert len(app.radio) == 5
    click(app, "Analyze My Skills")
    assert any("answer every competency" in warning.value for warning in app.warning)
    assert not readiness(app)
    for index, radio in enumerate(app.radio):
        radio.set_value("I can do this confidently" if index < 2 else "I have some experience")
    click(app, "Analyze My Skills")
    assert readiness(app) == ["75%"], "the Basic answer from the first part counts too"
    assert any(md.value == "**Moderate Readiness**" for md in app.markdown)
    assert any(title.value == "Take focused training, then the NC assessment" for title in app.subheader)
    assert any("Close your skill gaps" in md.value for md in app.markdown), "the moderate route's pathway"

    app.run()
    assert readiness(app) == ["75%"]
    open_step(app, 2)
    app.selectbox(key="follow_certification").select("Yes").run()
    open_step(app, 4)
    assert readiness(app) == ["75%"]
    open_step(app, 3)
    assert asks_because(app, "makes a competency check useful"), "a certificate holder"

    open_step(app, 2)
    app.selectbox(key="qualification_selected").select("CSS-NC-II").run()
    open_step(app, 4)
    assert not readiness(app)
    open_step(app, 3)
    assert app.radio and all(radio.value is None for radio in app.radio)
    open_step(app, 2)
    app.selectbox(key="qualification_selected").select("SMAW-NC-II").run()
    open_step(app, 4)
    assert readiness(app) == ["75%"]
    assert any("last submitted answers" in caption.value for caption in app.caption)

    click(app, "Change goal")
    app.text_area(key="goal_query").set_value(" ")
    click(app, "Get Recommendation")
    assert any("Describe your career goal" in warning.value for warning in app.warning)
    assert app.session_state["original_query"] == "I want to be a welder."
    open_step(app, 4)
    assert readiness(app) == ["75%"]

    open_step(app, 1)
    app.text_area(key="goal_query").set_value("I want to fix computers.")
    click(app, "Get Recommendation")
    assert app.selectbox(key="qualification_selected").value == "CSS-NC-II"
    assert app.selectbox(key="follow_experience").value == "Choose an answer"
    assert app.selectbox(key="follow_certification").value == "Choose an answer"
    open_step(app, 4)
    assert not readiness(app)
    open_step(app, 3)
    assert app.radio and all(radio.value is None for radio in app.radio)


def create_account(app, email="juan@example.com", password="correct horse battery"):
    open_account(app)
    app.text_input(key="dialog_register_name").set_value("Juan Dela Cruz")
    app.text_input(key="dialog_register_email").set_value(email)
    app.text_input(key="dialog_register_password").set_value(password)
    app.checkbox(key="dialog_register_consent").check()
    click(app, "Create account")


def test_signed_in_learner_results_are_saved_to_progress(ui):
    app = ui
    app.session_state["main_tabs"] = "My progress"
    app.run()
    assert any("Sign in to save" in info.value for info in app.info)

    create_account(app)
    assert "Juan Dela Cruz" in app.button(key="open_account_sidebar").label
    rerun(app, "Find my pathway")
    click(app, "Become a welder")
    click(app, "Get Recommendation")
    app.selectbox(key="follow_experience").select("More than 3 years").run()
    app.selectbox(key="follow_certification").select("No").run()
    rate_welding_skills(app)
    assert readiness(app) == ["75%"]

    app.session_state["main_tabs"] = "My progress"
    app.run()
    assert not app.exception
    checks = app.dataframe[0].value
    assert list(checks["Score"]) == [75] and list(checks["Qualification"]) == ["Shielded Metal Arc Welding (SMAW) NC II"]
    history = [md.value for md in app.container(key="recommendation_history").markdown]
    assert any("I want to be a welder." in value for value in history)
    assert any("Assessment Readiness Check" in value for value in history), "the saved session keeps its pathway"

    click(app, "Sign out")
    open_account(app)
    assert app.text_input(key="dialog_signin_email")


def test_sign_in_with_wrong_password_shows_an_error(ui):
    app = ui
    create_account(app)
    click(app, "Sign out")
    open_account(app)
    app.text_input(key="dialog_signin_email").set_value("juan@example.com")
    app.text_input(key="dialog_signin_password").set_value("not the password")
    click(app, "Sign in")
    assert any(error.value == "Incorrect email or password." for error in app.error)


def test_registration_requires_consent(ui):
    app = ui
    open_account(app)
    app.text_input(key="dialog_register_name").set_value("Juan Dela Cruz")
    app.text_input(key="dialog_register_email").set_value("juan@example.com")
    app.text_input(key="dialog_register_password").set_value("correct horse battery")
    click(app, "Create account")
    assert any("privacy notice" in error.value for error in app.error)
    assert "auth" not in app.session_state


def recommend_welding_readiness_path(app):
    click(app, "Become a welder")
    click(app, "Get Recommendation")
    app.selectbox(key="follow_experience").select("More than 3 years").run()
    app.selectbox(key="follow_certification").select("No").run()


def test_learner_follows_the_curated_pathway_and_ticks_off_steps(ui):
    app = ui
    recommend_welding_readiness_path(app)
    rate_welding_skills(app, confident=6)
    assert readiness(app) == ["100%"]
    assert any("Turn your experience into a certificate" in md.value for md in app.markdown), \
        "high readiness: the pathway straight to assessment"
    assert not any(button.label == "Follow this pathway" for button in app.button), "signed-out learners can't follow"

    create_account(app)
    rerun(app, "Find my pathway")
    click(app, "Follow this pathway")
    assert any("My progress" in success.value for success in app.success)

    rerun(app, "My progress")
    steps = [box for box in app.checkbox if box.key and box.key.startswith("step_")]
    assert len(steps) == 4 and not any(box.value for box in steps)
    steps[0].check()
    rerun(app, "My progress")
    assert any("25% complete" in caption.value for caption in app.caption)


def listed_centers(app):
    """The name of every listed center, by its id: the one shown in full first, then the others."""
    ids = [button.key.removeprefix("center_open_") for button in app.button
           if (button.key or "").startswith("center_open_")]
    blocks = [app.container(key="center_feature_body"), *(app.container(key=f"center_row_{id_}") for id_ in ids[1:])]
    return {id_: next(md.value for md in block.markdown if md.value.startswith("**")).strip("*")
            for id_, block in zip(ids, blocks)}


def open_center(app, name, tab):
    """Open a listed center by the name it shows."""
    centers = listed_centers(app)
    app.button(key=f"center_open_{next(id_ for id_, shown in centers.items() if shown == name)}").click()
    rerun(app, tab)


def test_training_tab_finds_nearby_centers_and_learner_applies(ui, training_data):
    app = ui
    tab = "Training & assessment"
    rerun(app, tab)
    app.multiselect(key="training_qualifications").select("SMAW-NC-II")
    app.text_input(key="training_place").input("Manila")
    rerun(app, tab)
    assert list(listed_centers(app).values()) == ["Manila Assessment Center", "Manila Welding Institute",
                                                  "Cebu Skills Center"], "nearest to Manila first, not creation order"

    open_center(app, "Manila Welding Institute", tab)
    detail = app.container(key="center_detail")
    assert any("SMAW NC II Manila batch" in md.value for md in detail.markdown)
    assert any("% fit" in md.value for md in detail.markdown), "the ranked program shows its score"

    open_center(app, "Manila Assessment Center", tab)
    assert not any(button.label == "Apply" for button in app.button), "applying needs an account"
    assert app.button(key="apply_sign_in")

    create_account(app)
    rerun(app, tab)
    click(app, "Apply", tab)
    assert any("application" in success.value.lower() for success in app.success)

    rerun(app, "My progress")
    applications = [md.value for md in app.container(key="my_applications").markdown]
    assert any("Pending" in value for value in applications)
    click(app, "Withdraw", "My progress")
    applications = [md.value for md in app.container(key="my_applications").markdown]
    assert any("Withdrawn" in value for value in applications)


def test_library_lists_catalog_from_the_api(ui):
    rerun(ui, "Qualification library")
    headings = [m.value for m in ui.markdown if m.value.startswith("### ")]
    assert "### Cookery NC II" in headings and len(headings) == 5


def test_unreachable_api_shows_an_error_instead_of_crashing(monkeypatch):
    monkeypatch.setenv("API_BASE_URL", "http://127.0.0.1:1")
    app = AppTest.from_file(str(APP_FILE), default_timeout=30).run()
    assert not app.exception
    assert any("can't reach" in error.value for error in app.error)


def test_reports_tab_is_only_for_administrators(ui, training_data):
    app = ui
    assert "Reports" not in [button.label for button in app.sidebar.button]
    create_account(app)
    assert "Reports" not in [button.label for button in app.sidebar.button], "learners don't see reports"
    click(app, "Sign out")

    open_account(app)
    app.text_input(key="dialog_signin_email").set_value("admin@example.com")
    app.text_input(key="dialog_signin_password").set_value("correct horse battery")
    click(app, "Sign in")
    assert "Reports" in [button.label for button in app.sidebar.button]
    rerun(app, "Reports")
    metrics = {metric.label: metric.value for metric in app.metric}
    assert metrics["Learners"] == "2", "the administrator and the learner who signed up"
    assert metrics["Open assessment seats"] == "10"
    supply = app.dataframe[-1].value
    assert list(supply.loc[supply["Region"] == "National Capital Region", "Programs"]) == [1]


def test_report_date_range_is_checked_before_asking_the_api(ui, training_data, monkeypatch):
    from datetime import date

    from api_client import ApiClient

    app = ui
    open_account(app)
    app.text_input(key="dialog_signin_email").set_value("admin@example.com")
    app.text_input(key="dialog_signin_password").set_value("correct horse battery")
    click(app, "Sign in")
    rerun(app, "Reports")
    asked = []
    original = ApiClient.report
    monkeypatch.setattr(ApiClient, "report", lambda self, *args, **params: (
        asked.append(params), original(self, *args, **params))[1])
    app.date_input(key="report_from").set_value(date(2026, 10, 7))
    app.date_input(key="report_to").set_value(date(2026, 10, 1)).run()
    assert not app.exception
    assert any("on or after" in warning.value for warning in app.warning)
    assert asked == []
