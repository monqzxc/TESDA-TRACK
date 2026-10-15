from copy import deepcopy

import pytest

from api_client import ApiUnavailableError
from journey_state import clear_journey, request_key, restore_journey, save_journey


class SavingAPI:
    def __init__(self):
        self.sessions = {}
        self.checks = {}
        self.fail_update = False
        self.lose_readiness_response = False

    def start_session(self, token, query, **kwargs):
        self.sessions.setdefault(kwargs["request_id"], {"id": "session", "query": query})
        return self.sessions[kwargs["request_id"]]

    def update_session(self, token, record_id, **kwargs):
        if self.fail_update:
            raise ApiUnavailableError("Connection lost")

    def submit_readiness(self, token, code, answers, session_id, **kwargs):
        self.checks.setdefault(kwargs["request_id"], {"id": "check", "answers": deepcopy(answers)})
        if self.lose_readiness_response:
            self.lose_readiness_response = False
            raise ApiUnavailableError("Response lost after commit")
        return self.checks[kwargs["request_id"]]


def guest():
    return {"original_query": "Welder", "analysis": {"experience_years": 4, "has_certification": False},
            "qualification_selected": "WELD", "readiness_submissions": {"WELD": {"answers": {1: "confident"}}}}


def test_guest_save_recovers_each_stage_without_duplicate_records():
    state, api = guest(), SavingAPI()
    api.fail_update = True
    with pytest.raises(ApiUnavailableError):
        save_journey(state, api, "token")
    assert state["recommendation_session"]["id"] == "session"
    assert "journey_saved" not in state
    api.fail_update, api.lose_readiness_response = False, True
    with pytest.raises(ApiUnavailableError):
        save_journey(state, api, "token")
    save_journey(state, api, "token")
    save_journey(state, api, "token")
    assert state["journey_saved"]
    assert len(api.sessions) == len(api.checks) == 1


def test_draft_answers_are_not_saved_as_submitted_readiness():
    state, api = guest(), SavingAPI()
    state.pop("readiness_submissions")
    state["competency_WELD_1"] = "I can do this confidently"
    save_journey(state, api, "token")
    assert not api.checks


def test_resume_links_readiness_to_both_session_and_qualification():
    state = {"competency_OTHER_2": "confident", "assessment_answers": {"interests": ["old"]}}
    record = {"id": "s1", "query": "Weld", "profile": {}, "selected_qualification": {"code": "WELD"}}
    checks = [
        {"id": "wrong-session", "qualification": {"code": "WELD"}, "recommendation_session_id": "s2"},
        {"id": "wrong-qualification", "qualification": {"code": "OTHER"}, "recommendation_session_id": "s1"},
        {"id": "right", "qualification": {"code": "WELD"}, "recommendation_session_id": "s1",
         "created_at": "2026-10-15", "answers": {"1": "confident"}},
    ]
    restore_journey(state, record, checks)
    assert state["readiness_results"]["WELD"]["id"] == "right"
    assert state["readiness_submissions"]["WELD"]["answers"] == {1: "confident"}
    assert "assessment_answers" not in state and "competency_OTHER_2" not in state


def test_request_keys_change_only_with_payload_and_clear_with_journey():
    state = {}
    first = request_key(state, "readiness", {"answer": "confident"})
    assert request_key(state, "readiness", {"answer": "confident"}) == first
    assert request_key(state, "readiness", {"answer": "not_familiar"}) != first
    clear_journey(state)
    assert "journey_writes" not in state
