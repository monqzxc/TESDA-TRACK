from copy import deepcopy
from datetime import datetime, timezone

import pytest
from streamlit.testing.v1 import AppTest

from api_client import ApiClient

SCRIPT = """
import streamlit as st
from assessment_view import show_assessment
from api_client import ApiClient

def regions():
    st.session_state['region_calls'] = st.session_state.get('region_calls', 0) + 1
    return [{'code': 'NCR', 'name': 'National Capital Region'}]

show_assessment([{'code': 'SMAW-NC-II', 'name': 'Welding NC II', 'sector': 'Metals and Engineering'}],
                regions, ApiClient('http://assessment-test.invalid'), st.session_state.get('token'))
"""


@pytest.fixture
def api(monkeypatch):
    calls, records = [], []

    def save(self, token, answers, previous=None, **kwargs):
        record = {"id": str(len(records) + 1), "series_id": "series-1", "revision": len(records) + 1,
                  "previous_revision_id": previous, "created_at": datetime.now(timezone.utc).isoformat(),
                  "answers": deepcopy(answers)}
        records.append(record)
        calls.append(("revise" if previous else "create", token, deepcopy(answers)))
        return record

    monkeypatch.setattr(ApiClient, "create_learner_assessment", save)
    monkeypatch.setattr(ApiClient, "revise_learner_assessment", lambda self, token, previous, answers, **kwargs: save(self, token, answers, previous, **kwargs))
    monkeypatch.setattr(ApiClient, "assessment_qualifications", lambda self, answers, token=None: calls.append(("transient", deepcopy(answers))))
    monkeypatch.setattr(ApiClient, "learner_assessments", lambda self, token: deepcopy(records))
    monkeypatch.setattr(ApiClient, "_request", lambda *args, **kwargs: pytest.fail("Unexpected HTTP request"))
    return calls, records


def app(open_panel=False, token=None):
    instance = AppTest.from_string(SCRIPT, default_timeout=30)
    instance.session_state["assessment_panel"] = open_panel
    if token:
        instance.session_state["token"] = token
    return run(instance)


def run(instance):
    instance = instance.run()
    assert not instance.exception
    return instance


def submit(instance):
    return run(next(button for button in instance.button if button.label == "Apply assessment").click())


def test_closed_panel_makes_no_requests_or_region_loads(api):
    instance = app()
    assert api[0] == []
    assert "region_calls" not in instance.session_state


def test_guest_answers_are_transient_and_inputs_do_not_trigger_requests(api):
    instance = app(open_panel=True)
    instance.text_input(key="assessment_input_interests").input("welding, welding")
    assert not api[0]
    submit(instance)
    assert api[0][0][0] == "transient"
    assert instance.session_state["assessment_answers"]["interests"] == ["welding"]
    assert "assessment_record" not in instance.session_state
    run(instance.button(key="assessment_clear").click())
    assert "assessment_answers" not in instance.session_state


def test_saved_reassessment_creates_a_revision_and_can_be_loaded(api):
    instance = app(open_panel=True, token="learner-token")
    instance.text_input(key="assessment_input_interests").input("welding")
    submit(instance)
    assert instance.session_state["assessment_record"]["revision"] == 1
    instance.text_input(key="assessment_input_interests").input("cooking")
    submit(instance)
    assert instance.session_state["assessment_record"]["revision"] == 2
    assert api[1][0]["answers"]["interests"] == ["welding"]
    run(instance.button(key="assessment_browse").click())
    instance.selectbox(key="assessment_selected").select("1")
    run(instance.button(key="assessment_load").click())
    assert instance.session_state["assessment_answers"]["interests"] == ["welding"]
    assert instance.text_input(key="assessment_input_interests").value == "welding"


def test_signed_in_learner_can_choose_not_to_save(api):
    instance = app(open_panel=True, token="learner-token")
    instance.checkbox(key="assessment_save").uncheck()
    instance.text_input(key="assessment_input_skills").input("welding")
    submit(instance)
    assert api[0][0][0] == "transient"
    assert not api[1]
