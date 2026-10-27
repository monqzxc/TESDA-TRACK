"""Signing in, creating an account, and the signed-in account details."""
import json

import streamlit as st

from api_client import ApiError
from portal import session

PRIVACY_NOTICE = ("TESDA Track keeps your name, email, goals, recommendations, readiness checks and certificates "
                  "so you can follow your progress. They are used only to run this pilot and are never sold. "
                  "You can download or permanently delete your data from your account page at any time.")


def sign_in_prompt(label: str, key: str, return_to: str, primary: bool = False) -> None:
    """A button that opens the Sign in page and brings the learner back here afterwards."""
    st.button(label, key=key, type="primary" if primary else "tertiary", icon=":material/login:",
              on_click=session.go_to, args=("account",), kwargs={"return_to": return_to})


def _continue_after_sign_in() -> None:
    session.go_to(st.session_state.pop("return_to", "progress"))
    st.rerun()


def account_panel() -> None:
    """Sign-in and registration forms."""
    st.session_state.setdefault("account_mode", "Sign in")
    mode = st.segmented_control("Account", ["Sign in", "Create account"], key="account_mode", required=True,
                                label_visibility="collapsed")
    if mode == "Sign in":
        _sign_in_form()
    else:
        _register_form()


def _sign_in_form() -> None:
    with st.form("signin", border=False):
        email = st.text_input("Email", key="signin_email", placeholder="you@example.com")
        password = st.text_input("Password", type="password", key="signin_password")
        submitted = st.form_submit_button("Sign in", key="signin_submit", type="primary", width="stretch",
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
        _continue_after_sign_in()


def _register_form() -> None:
    with st.form("register", border=False):
        full_name = st.text_input("Full name", key="register_name")
        email = st.text_input("Email", key="register_email", placeholder="you@example.com")
        password = st.text_input("Password", type="password", key="register_password",
                                 help="At least 10 characters.")
        st.caption(PRIVACY_NOTICE)
        consent = st.checkbox("I agree to the privacy notice", key="register_consent")
        submitted = st.form_submit_button("Create account", key="register_submit", type="primary",
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
        _continue_after_sign_in()


def account_details(signed_in: dict) -> None:
    with st.container(border=True, key="account_summary"):
        st.markdown(f"**{signed_in['name']}**")
        st.caption(signed_in["email"])
        st.badge("Administrator" if signed_in["role"] == "admin" else "Learner", icon=":material/verified_user:",
                 color="blue")
        st.button("Sign out", key="account_sign_out", icon=":material/logout:", on_click=session.sign_out)
    st.subheader("Your data and privacy")
    st.caption("Download everything TESDA Track keeps about you, or delete your account.")
    if st.button("Prepare my data", key="account_prepare_export", icon=":material/download:"):
        st.session_state["data_export"] = json.dumps(session.api().export_my_data(signed_in["token"]), indent=2)
    if "data_export" in st.session_state:
        st.download_button("Download my data (JSON)", st.session_state["data_export"],
                           file_name="tesda-track-my-data.json", mime="application/json",
                           key="account_download_export")
    confirmed = st.checkbox("I understand this permanently deletes my account and saved records.",
                            key="account_confirm_delete")
    if st.button("Delete my account", key="account_delete", icon=":material/delete:", disabled=not confirmed):
        session.api().delete_account(signed_in["token"])
        session.sign_out()
        st.session_state["notice"] = "Your account and saved records were deleted."
        st.rerun()
