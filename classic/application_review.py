"""Review and receipt for both assessment schedule discovery surfaces."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import streamlit as st

from api_client import ApiError

PHILIPPINE_TIME = timezone(timedelta(hours=8))


def review_application(schedule):
    st.session_state["application_review"] = schedule
    st.session_state["application_request_id"] = str(uuid4())
    st.session_state.pop("application_receipt", None)


def open_progress():
    st.session_state["main_tabs"] = "My Progress"


def show_application_review(api, token, on_sign_in=None):
    receipt = st.session_state.get("application_receipt")
    if receipt:
        with st.container(border=True):
            st.success(f"Application reference: {receipt['id']}")
            st.write(f"Status: {receipt['status'].replace('_', ' ')}")
            st.caption("Pending applications await center review and do not reserve a seat.")
            st.button("View application in My Progress", key="application_progress", on_click=open_progress)
        return
    schedule = st.session_state.get("application_review")
    if not schedule:
        return
    with st.container(border=True, key="application_review_panel"):
        st.subheader("Review your assessment application")
        st.write(schedule["qualification"]["name"])
        st.write(schedule["center"]["name"])
        when = datetime.fromisoformat(schedule["scheduled_at"].replace("Z", "+00:00")).astimezone(PHILIPPINE_TIME)
        st.write(f"{when:%B %d, %Y at %I:%M %p} Philippine time")
        fee = schedule.get("fee")
        st.write("Fee: " + ("Not provided" if fee is None else "No fee" if float(fee) == 0 else f"₱{float(fee):,.2f}"))
        st.caption("Submitting sends an application for review. It does not reserve a seat or confirm admission. "
                   "Availability and prerequisites are checked again when you submit.")
        if not token:
            st.info("Sign in to continue. You will return to this review before submitting.")
            if on_sign_in:
                st.button("Sign in to continue application", key="application_sign_in", on_click=on_sign_in)
        else:
            if st.button("Confirm and submit application", key="application_confirm", type="primary"):
                try:
                    # Read first also reconciles requests made from another tab.
                    existing = next((a for a in api.my_applications(token)
                                     if a["schedule"]["id"] == schedule["id"] and a["status"] != "withdrawn"), None)
                    receipt = existing or api.apply_for_assessment(token, schedule["id"],
                        request_id=st.session_state["application_request_id"])
                except ApiError as error:
                    if error.status_code == 401:
                        raise
                    st.error("The application is not confirmed. Your review is retained; retry to check its status safely. " + error.message)
                else:
                    st.session_state["application_receipt"] = receipt
                    st.session_state.pop("application_review", None)
                    st.session_state.pop("assessment_center_result", None)
                    st.rerun()
        if st.button("Cancel application review", key="application_cancel"):
            st.session_state.pop("application_review", None)
            st.rerun()
