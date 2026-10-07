"""Signing in, creating an account, and the signed-in account menu."""
import json

import streamlit as st

from api_client import ApiError
from portal import session

PRIVACY_NOTICE = ("TESDA Track keeps your name, email, goals, recommendations, readiness checks and certificates "
                  "so you can follow your progress. They are used only to run this pilot and are never sold. "
                  "You can download or permanently delete your data from your account menu at any time.")


def account_bar() -> None:
    """Top-right control on every page: a sign-in button, or the learner's account menu."""
    with st.container(horizontal=True, horizontal_alignment="right", key="account_bar"):
        signed_in = session.account()
        if signed_in:
            with st.popover(signed_in["name"], icon=":material/account_circle:", key="account_menu"):
                _account_menu(signed_in)
        else:
            st.button("Sign in", key="open_sign_in", icon=":material/login:", on_click=account_dialog)


@st.dialog("Your account")
def account_dialog() -> None:
    account_panel("dialog_")


def account_panel(prefix: str) -> None:
    """Sign-in and registration forms. `prefix` keeps widget keys unique where the panel appears twice."""
    st.session_state.setdefault(f"{prefix}account_mode", "Sign in")
    mode = st.segmented_control("Account", ["Sign in", "Create account"], key=f"{prefix}account_mode",
                                required=True, label_visibility="collapsed")
    if mode == "Sign in":
        _sign_in_form(prefix)
    else:
        _register_form(prefix)


def _sign_in_form(prefix: str) -> None:
    with st.form(f"{prefix}signin", border=False):
        email = st.text_input("Email", key=f"{prefix}signin_email", placeholder="you@example.com")
        password = st.text_input("Password", type="password", key=f"{prefix}signin_password")
        submitted = st.form_submit_button("Sign in", key=f"{prefix}signin_submit", type="primary", width="stretch",
                                          icon=":material/login:")
    if submitted:
        if "@" not in email or not password:
            st.error("Enter your email address and password to sign in.")
            return
        try:
            with st.spinner("Signing you in…"):
                session.sign_in(email.strip(), password)
        except ApiError as error:
            st.error(error.message)
            return
        st.rerun()


def _register_form(prefix: str) -> None:
    with st.form(f"{prefix}register", border=False):
        full_name = st.text_input("Full name", key=f"{prefix}register_name")
        email = st.text_input("Email", key=f"{prefix}register_email", placeholder="you@example.com")
        password = st.text_input("Password", type="password", key=f"{prefix}register_password",
                                 help="At least 10 characters.")
        st.caption(PRIVACY_NOTICE)
        consent = st.checkbox("I agree to the privacy notice", key=f"{prefix}register_consent")
        submitted = st.form_submit_button("Create account", key=f"{prefix}register_submit", type="primary",
                                          width="stretch", icon=":material/person_add:")
    if submitted:
        if not consent:
            st.error("Agree to the privacy notice to create your account.")
            return
        if not full_name.strip() or "@" not in email or len(password) < 10:
            st.error("Enter your name, a valid email address, and a password of at least 10 characters.")
            return
        try:
            with st.spinner("Creating your account…"):
                session.api().register(email.strip(), password, full_name.strip(), consent)
                session.sign_in(email.strip(), password)
        except ApiError as error:
            st.error(error.message)
            return
        st.rerun()


def _account_menu(signed_in: dict) -> None:
    st.markdown(f"**{signed_in['name']}**")
    st.caption(signed_in["email"])
    st.badge("Administrator" if signed_in["role"] == "admin" else "Learner", icon=":material/verified_user:",
             color="blue")
    st.button("Sign out", key="account_sign_out", icon=":material/logout:", width="stretch", on_click=session.sign_out)
    with st.expander("Your data and privacy", icon=":material/shield:"):
        st.caption("Download everything TESDA Track keeps about you, or delete your account.")
        if st.button("Prepare my data", key="account_prepare_export"):
            st.session_state["data_export"] = json.dumps(session.api().export_my_data(signed_in["token"]), indent=2)
        if "data_export" in st.session_state:
            st.download_button("Download my data (JSON)", st.session_state["data_export"],
                               file_name="tesda-track-my-data.json", mime="application/json",
                               key="account_download_export")
        confirmed = st.checkbox("I understand this permanently deletes my account and saved records.",
                                key="account_confirm_delete")
        if st.button("Delete my account", key="account_delete", disabled=not confirmed):
            session.api().delete_account(signed_in["token"])
            session.sign_out()
            st.session_state["notice"] = "Your account and saved records were deleted."
            st.rerun()
