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


def click(app, label):
    next(button for button in app.button if button.label.startswith(label)).click().run()
    assert not app.exception


def readiness(app):
    return [metric.value for metric in app.metric if metric.label == "Your readiness"]


def test_pathway_finder_flow(ui):
    app = ui
    assert [tab.label for tab in app.tabs][:2] == ["Find my pathway", "Qualification library"]
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
    assert any(title.value == "Assessment Readiness Check" for title in app.subheader)

    click(app, "Analyze My Skills")
    assert any("answer every competency" in warning.value for warning in app.warning)
    assert not readiness(app)
    assert len(app.radio) == 6
    for index, radio in enumerate(app.radio):
        radio.set_value("I can do this confidently" if index < 3 else "I have some experience")
    click(app, "Analyze My Skills")
    assert readiness(app) == ["75%"]
    assert any(title.value == "Moderate Readiness" for title in app.subheader)

    app.run()
    assert readiness(app) == ["75%"]
    app.selectbox(key="follow_certification").select("Yes").run()
    assert readiness(app) == ["75%"]
    assert any(title.value == "Skill Gap Check" for title in app.subheader)

    app.selectbox(key="qualification_selected").select("CSS-NC-II").run()
    assert not readiness(app)
    assert all(radio.value is None for radio in app.radio)
    app.selectbox(key="qualification_selected").select("SMAW-NC-II").run()
    assert readiness(app) == ["75%"]
    assert any("last submitted answers" in caption.value for caption in app.caption)

    app.text_area(key="goal_query").set_value(" ")
    click(app, "Get Recommendation")
    assert any("Describe your career goal" in warning.value for warning in app.warning)
    assert app.session_state["original_query"] == "I want to be a welder."
    assert readiness(app) == ["75%"]

    app.text_area(key="goal_query").set_value("I want to fix computers.")
    click(app, "Get Recommendation")
    assert app.selectbox(key="qualification_selected").value == "CSS-NC-II"
    assert app.selectbox(key="follow_experience").value == "Choose an answer"
    assert app.selectbox(key="follow_certification").value == "Choose an answer"
    assert not app.session_state["readiness_results"]
    assert not readiness(app)
    assert all(radio.value is None for radio in app.radio)


def test_library_lists_catalog_from_the_api(ui):
    headings = [m.value for m in ui.markdown if m.value.startswith("### ")]
    assert "### Cookery NC II" in headings and len(headings) == 5


def test_unreachable_api_shows_an_error_instead_of_crashing(monkeypatch):
    monkeypatch.setenv("API_BASE_URL", "http://127.0.0.1:1")
    app = AppTest.from_file(str(APP_FILE), default_timeout=30).run()
    assert not app.exception
    assert any("can't reach" in error.value for error in app.error)
