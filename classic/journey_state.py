"""State and retry contracts shared by the active learner journey."""
import json
from copy import deepcopy
from uuid import uuid4


def request_key(state, slot, payload):
    signature = json.dumps(payload, sort_keys=True, default=str)
    writes = state.setdefault("journey_writes", {})
    if writes.get(slot, {}).get("signature") != signature:
        writes[slot] = {"signature": signature, "id": str(uuid4())}
    return writes[slot]["id"]


def clear_journey(state):
    for key in list(state):
        if key.startswith(("follow_", "competency_", "qualification_", "journey_")) or key in {
            "analysis", "analysis_memo", "original_query", "recommendation_session", "readiness_results",
            "readiness_submissions", "readiness_part", "save_journey_intent", "training_fit",
        }:
            state.pop(key, None)


def save_journey(state, api, token):
    """Resume each confirmed stage; preserve identical request IDs after an uncertain write."""
    query = state.get("original_query")
    if not query or not state.get("analysis"):
        return
    saved = state.get("recommendation_session")
    if not saved:
        extra = {}
        assessment = state.get("assessment_record")
        if assessment:
            extra["assessment_id"] = assessment["id"]
        elif state.get("assessment_answers") is not None:
            extra["assessment"] = state["assessment_answers"]
        payload = {"query": query, **extra}
        record = api.start_session(token, query, **extra, request_id=request_key(state, "save_journey", payload))
        saved = state["recommendation_session"] = {"id": record["id"], "synced": None}
        if record.get("assessment_id") and not assessment:
            # Retry this read independently if it fails after the committed save.
            state["journey_assessment_id"] = record["assessment_id"]
    if state.get("journey_assessment_id"):
        state["assessment_record"] = api.get_learner_assessment(token, state["journey_assessment_id"])
        state.pop("journey_assessment_id", None)
    context = state.get("journey_context", {})
    code = state.get("qualification_selected") or context.get("code")
    profile = context.get("profile", state["analysis"])
    if code:
        fields = {"qualification_code": code, "experience_years": profile.get("experience_years"),
                  "has_certification": profile.get("has_certification")}
        if state.get("assessment_record"):
            fields["assessment_id"] = state["assessment_record"]["id"]
        if saved.get("synced") != fields:
            api.update_session(token, saved["id"], **fields)
            saved["synced"] = fields
        submitted = state.get("readiness_submissions", {}).get(code)
        if submitted and not submitted.get("saved_id"):
            payload = {"code": code, "answers": submitted["answers"], "session_id": saved["id"]}
            result = api.submit_readiness(token, code, submitted["answers"], saved["id"],
                                         request_id=request_key(state, "guest_readiness", payload))
            submitted["saved_id"] = result["id"]
            state.setdefault("readiness_results", {})[code] = result
    state.pop("journey_save_error", None)
    state.pop("save_journey_intent", None)
    state["journey_saved"] = True


def restore_journey(state, record, checks, assessment=None):
    """Restore exact identifiers, never another session's readiness or current draft."""
    clear_journey(state)
    for key in list(state):
        if key.startswith("assessment_"):
            state.pop(key, None)
    state.update(analysis=deepcopy(record["profile"]), original_query=record["query"], goal_query=record["query"],
                 recommendation_session={"id": record["id"], "synced": None}, journey_saved=True,
                 main_tabs="Find my pathway", finder_step=2)
    if assessment:
        state.update(assessment_record=assessment, assessment_answers=assessment["answers"])
    qualification = record.get("selected_qualification")
    if not qualification:
        return
    code = qualification["code"]
    state["qualification_selected"] = code
    linked = [c for c in checks if c.get("recommendation_session_id") == record["id"]
              and c["qualification"]["code"] == code]
    if linked:
        check = max(linked, key=lambda c: c["created_at"])
        state["readiness_results"] = {code: check}
        state["readiness_submissions"] = {code: {"answers": {int(k): v for k, v in check["answers"].items()},
                                                "saved_id": check["id"]}}
        state["finder_step"] = 4
    else:
        state["finder_step"] = 3
