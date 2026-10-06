"""Run with python ui_check.py; uses Streamlit's built-in app testing."""
from pathlib import Path

from streamlit.testing.v1 import AppTest


def main():
    app = AppTest.from_file(str(Path(__file__).with_name("app.py"))).run()
    assert not app.exception

    def click(label):
        next(button for button in app.button if button.label.startswith(label)).click().run()
        assert not app.exception

    def readiness():
        return [metric.value for metric in app.metric if metric.label == "Your readiness"]

    assert [tab.label for tab in app.tabs] == ["Find my pathway", "Qualification library"]
    click("Get Recommendation")
    assert any("Describe your career goal" in warning.value for warning in app.warning)
    assert "analysis" not in app.session_state

    click("Become a welder")
    assert app.text_area(key="goal_query").value == "I want to be a welder."
    click("Get Recommendation")
    assert app.selectbox(key="qualification_selected").value == "SMAW-NC-II"
    app.selectbox(key="follow_experience").select("More than 3 years").run()
    app.selectbox(key="follow_certification").select("No").run()
    assert not app.exception
    assert any(title.value == "Assessment Readiness Check" for title in app.subheader)

    click("Analyze My Skills")
    assert any("answer every competency" in warning.value for warning in app.warning)
    assert not readiness()
    assert len(app.radio) == 6
    for index, radio in enumerate(app.radio):
        radio.set_value("I can do this confidently" if index < 3 else "I have some experience")
    click("Analyze My Skills")
    assert readiness() == ["75%"]
    assert any(title.value == "Moderate Readiness" for title in app.subheader)

    app.run()
    assert readiness() == ["75%"]
    app.selectbox(key="follow_certification").select("Yes").run()
    assert readiness() == ["75%"]
    assert any(title.value == "Skill Gap Check" for title in app.subheader)

    app.selectbox(key="qualification_selected").select("CSS-NC-II").run()
    assert not readiness()
    assert all(radio.value is None for radio in app.radio)
    app.selectbox(key="qualification_selected").select("SMAW-NC-II").run()
    assert readiness() == ["75%"]
    assert any("last submitted answers" in caption.value for caption in app.caption)

    app.text_area(key="goal_query").set_value(" ")
    click("Get Recommendation")
    assert any("Describe your career goal" in warning.value for warning in app.warning)
    assert app.session_state["original_query"] == "I want to be a welder."
    assert readiness() == ["75%"]

    app.text_area(key="goal_query").set_value("I want to fix computers.")
    click("Get Recommendation")
    assert app.selectbox(key="qualification_selected").value == "CSS-NC-II"
    assert app.selectbox(key="follow_experience").value == "Choose an answer"
    assert app.selectbox(key="follow_certification").value == "Choose an answer"
    assert not app.session_state["readiness_results"]
    assert not readiness()
    assert all(radio.value is None for radio in app.radio)
    assert not app.exception
    print("All web UI workflow checks passed.")


if __name__ == "__main__":
    main()
