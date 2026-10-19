"""API access and per-learner session state shared by every page."""
import os

import streamlit as st

from api_client import ApiClient, ApiError

# Everything that belongs to one learner and must disappear when they sign out.
PERSONAL_KEYS = ("auth", "journey", "finder_step", "readiness_group", "readiness_editing", "data_export",
                 "pending_goal", "goal_query", "finder_experience", "finder_certification", "pathway_notice")
PERSONAL_PREFIXES = ("answer_",)
EXPIRED_MESSAGE = "Your session has expired. Please sign in again."


def api_base_url() -> str:
    return os.environ.get("API_BASE_URL", "http://127.0.0.1:8000")


@st.cache_resource
def _client(base_url: str) -> ApiClient:
    return ApiClient(base_url)


def api() -> ApiClient:
    return _client(api_base_url())


@st.cache_data(ttl="5m")
def _qualifications(base_url: str) -> list[dict]:
    return _client(base_url).qualifications()


@st.cache_data(ttl="1h")
def _regions(base_url: str) -> list[dict]:
    return _client(base_url).regions()


def catalog() -> list[dict]:
    return _qualifications(api_base_url())


def qualification(code: str) -> dict | None:
    return next((item for item in catalog() if item["code"] == code), None)


def regions() -> dict[str, dict]:
    return {region["code"]: region for region in _regions(api_base_url())}


def reload_reference_data() -> None:
    _qualifications.clear()
    _regions.clear()


def init_state() -> None:
    st.session_state.setdefault("readiness_results", {})
    st.session_state.setdefault("readiness_group", {})


def account() -> dict | None:
    return st.session_state.get("auth")


def token() -> str | None:
    signed_in = account()
    return signed_in["token"] if signed_in else None


def is_admin() -> bool:
    return (account() or {}).get("role") == "admin"


def go_to(page: str, **state) -> None:
    """Ask the entry script to open another page on the next run (callbacks can't switch pages themselves)."""
    st.session_state.update(state)
    st.session_state["go_to"] = page


def sign_in(email: str, password: str) -> None:
    access_token = api().sign_in(email, password)
    me = api().me(access_token)
    st.session_state["auth"] = {"token": access_token, "name": me["full_name"], "email": me["email"],
                                "role": me["role"]}


def sign_out() -> None:
    for key in list(st.session_state):
        if key in PERSONAL_KEYS or str(key).startswith(PERSONAL_PREFIXES):
            st.session_state.pop(key, None)
    st.session_state["readiness_results"] = {}
    st.session_state["readiness_group"] = {}


def handle_api_error(error: ApiError) -> None:
    """Show an API error; an expired sign-in signs the learner out and reloads the page."""
    if error.status_code == 401 and account():
        sign_out()
        st.session_state["notice"] = EXPIRED_MESSAGE
        st.rerun()
    st.error(error.message, icon=":material/error:")
