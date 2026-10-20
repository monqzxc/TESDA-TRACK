"""Explicit, batched comparison of verified assessment schedules across centers."""
import hashlib
import json
from datetime import datetime, timedelta, timezone
from collections.abc import Callable

import streamlit as st

from api_client import ApiError
from service_evidence import can_apply, evidence_messages

PHILIPPINE_TIME = timezone(timedelta(hours=8))


def _context(goal, assessment, assessment_id, token, place):
    source = {"goal": goal, "assessment": assessment, "assessment_id": assessment_id, "place": place,
              "account": hashlib.sha256((token or "guest").encode()).hexdigest()}
    return hashlib.sha256(json.dumps(source, sort_keys=True).encode()).hexdigest()


def _page(offset):
    st.session_state["assessment_center_offset"] = offset


def show_assessment_comparison(api_client, token, names: dict, regions: dict, goal=None, assessment=None,
                               assessment_id=None, place=None, codes=(), on_apply: Callable | None = None,
                               on_center: Callable | None = None, on_sign_in: Callable | None = None):
    """Return fresh eligibility decisions for the ordinary schedule cards, too.

    Browser geolocation is deliberately not passed here. Submitted questionnaire
    locations and explicit place choices are approximate locations the user chose.
    """
    decisions = {}
    panel = st.expander("Compare assessment centers", key="assessment_center_panel", on_change="rerun")
    if not panel.open:
        return decisions
    context = _context(goal, assessment, assessment_id, token, place)
    with panel:
        st.caption("Compare verified schedules across centers. Assessment fees and dates are separate from training preferences. "
                   "Distances use an approximate location. Submitting an application does not reserve a seat; approval does.")
        choices = [c for c in codes if c in names] or list(names)
        current = st.session_state.get("assessment_center_code")
        if current not in choices:
            st.session_state["assessment_center_code"] = choices[0] if choices else None
        with st.form("assessment_center_form"):
            code = st.selectbox("Assessment qualification", choices, format_func=names.get,
                                key="assessment_center_code")
            region = st.selectbox("Assessment region", list(regions), index=None,
                                  format_func=lambda c: regions[c]["name"], key="assessment_center_region",
                                  placeholder="All regions; use my selected location if available")
            distance = st.number_input("Maximum assessment distance (km)", min_value=1.0, max_value=2000.0,
                                       value=None, key="assessment_center_distance")
            fee = st.number_input("Maximum assessment fee (₱)", min_value=0.0, max_value=99999999.99,
                                  value=None, step=100.0, key="assessment_center_fee")
            fee_required = st.checkbox("Fee limit is mandatory", key="assessment_center_fee_required")
            after = st.date_input("Assess on or after", value=None, key="assessment_center_after")
            before = st.date_input("Assess on or before", value=None, key="assessment_center_before")
            dates_required = st.checkbox("Assessment date window is mandatory", key="assessment_center_dates_required")
            submitted = st.form_submit_button("Compare assessments", disabled=not code,
                                              key="assessment_center_submit")
        request = st.session_state.get("assessment_center_request")
        if submitted:
            request = {"qualification_code": code, "goal": goal, "limit": 5,
                       "maximum_fee": str(fee) if fee is not None else None, "fee_is_mandatory": fee_required,
                       "scheduled_after": after.isoformat() if after else None,
                       "scheduled_before": before.isoformat() if before else None,
                       "schedule_is_mandatory": dates_required, "maximum_distance_km": distance,
                       "region_code": region}
            if assessment_id:
                request["assessment_id"] = assessment_id
            elif assessment is not None:
                request["assessment"] = assessment
            if place and not region:
                request.update(near_lat=round(place["latitude"], 1), near_lon=round(place["longitude"], 1))
            st.session_state["assessment_center_request"] = request
            st.session_state["assessment_center_context"] = context
            st.session_state["assessment_center_offset"] = 0
        valid_context = st.session_state.get("assessment_center_context") == context
        if not request or not valid_context:
            if request:
                st.info("Your learner profile or selected location changed. Compare again to update eligibility and fit.")
            return decisions
        offset = st.session_state.get("assessment_center_offset", 0)
        cached = st.session_state.get("assessment_center_result")
        fetch = submitted or not cached or cached.get("offset") != offset
        if fetch:
            st.session_state.pop("assessment_center_result", None)
            try:
                with st.spinner("Checking assessment centers…"):
                    result = api_client.rank_assessments(token, **request, offset=offset)
            except ApiError as error:
                if error.status_code == 401:
                    raise
                st.error(error.message)
                return decisions
            cached = {"data": result, "offset": offset, "fetched_at": datetime.now(timezone.utc)}
            st.session_state["assessment_center_result"] = cached
        if datetime.now(timezone.utc) - cached["fetched_at"] > timedelta(seconds=60):
            st.info("This comparison has expired. Compare again to refresh seats, prerequisites and service evidence.")
            return decisions
        result = cached["data"]
        st.markdown(f"**{names.get(request['qualification_code'], request['qualification_code'])}**")
        st.caption(f"{result['total']} confirmed schedules • {result['unconfirmed_total']} require verification. "
                   "Fit is a preference score out of 100, not a probability of passing. Seats are rechecked when applying.")
        if not result["results"]:
            st.info("No confirmed assessment schedules meet these constraints. Check options requiring verification or adjust your filters.")
        if not token and result["results"]:
            if on_sign_in:
                st.button("Sign in to apply", key="assessment_center_sign_in", on_click=on_sign_in)
            else:
                st.caption("Sign in to apply for an assessment.")
        for item in result["results"]:
            schedule = item["schedule"]
            if not can_apply(schedule, item.get("eligibility")):
                st.info("A schedule's evidence has expired or changed. Compare again before choosing it.")
                continue
            decisions[schedule["id"]] = item
            with st.container(border=True, key=f"assessment_center_result_{schedule['id']}"):
                st.markdown(f"**{schedule['center']['name']}**")
                st.badge(f"Fit {item['score']}/100", color="blue")
                when = datetime.fromisoformat(schedule["scheduled_at"].replace("Z", "+00:00")).astimezone(PHILIPPINE_TIME)
                fee_label = f"₱{float(schedule['fee']):,.2f}" if schedule.get("fee") is not None else "Fee unconfirmed"
                facts = f"{when:%b %d, %Y, %I:%M %p} • {fee_label} • {schedule['seats_left']} seats left"
                if schedule.get("distance_km") is not None:
                    facts += f" • about {schedule['distance_km']:,.0f} km"
                st.caption(facts)
                for message in evidence_messages(schedule):
                    st.caption(message)
                with st.expander("Why this assessment fits", key=f"assessment_center_why_{schedule['id']}"):
                    for reason in item["explanation"]:
                        st.caption(reason)
                    st.caption(f"Observed evidence coverage: {item['personalization']['evidence_coverage']:.0%}. "
                               "Self-reported skills do not establish readiness or formal eligibility.")
                if on_center:
                    st.button("Show center", key=f"assessment_center_open_{schedule['id']}",
                              on_click=on_center, args=(schedule,))
                status = item.get("application_status")
                if status and status != "withdrawn":
                    st.badge(f"Application: {status}", color="green")
                elif on_apply:
                    if st.button("Review application", key=f"assessment_center_apply_{schedule['id']}",
                                 disabled=not can_apply(schedule, item.get("eligibility"))):
                        on_apply(api_client, token, schedule)
        if result["requires_verification"]:
            with st.expander("Schedules requiring verification", key="assessment_center_unconfirmed"):
                st.caption("These are unconfirmed listings with no fit score or application button.")
                for item in result["requires_verification"]:
                    st.markdown(f"**{item['schedule']['center']['name']}**")
                    for reason in item["reasons"]:
                        st.caption(reason)
        with st.container(horizontal=True):
            st.button("Previous assessments", key="assessment_center_previous", disabled=offset == 0,
                      on_click=_page, args=(max(0, offset - request["limit"]),))
            st.button("Next assessments", key="assessment_center_next",
                      disabled=offset + request["limit"] >= max(result["total"], result["unconfirmed_total"]),
                      on_click=_page, args=(offset + request["limit"],))
    return decisions
