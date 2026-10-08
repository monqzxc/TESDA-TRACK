"""TESDA Track learner portal (top navigation). Renamed to app.py when the redesign is complete."""
from pathlib import Path

import streamlit as st

from api_client import ApiError
from portal import session
from portal.components import DISCLAIMER, service_unavailable

HERE = Path(__file__).resolve().parent

st.set_page_config(page_title="TESDA Track", page_icon=":material/route:", layout="centered")
st.logo(str(HERE / "assets" / "logo.svg"), icon_image=str(HERE / "assets" / "mark.svg"), size="large")
session.init_state()

PAGES = {
    "find": st.Page("app_pages/find.py", title="Find my path", icon=":material/route:", default=True),
    "qualifications": st.Page("app_pages/qualifications.py", title="Qualifications", icon=":material/school:"),
    "training": st.Page("app_pages/training.py", title="Training & assessment", icon=":material/location_on:"),
    "progress": st.Page("app_pages/progress.py", title="My progress", icon=":material/trending_up:"),
}
signed_in = session.account()
account_page = st.Page("app_pages/account.py", url_path="account",
                       title=(signed_in["name"].split() or ["Account"])[0] if signed_in else "Sign in",
                       icon=":material/account_circle:" if signed_in else ":material/login:")
page = st.navigation([*PAGES.values(), account_page], position="top")

targets = {**PAGES, "account": account_page}
target = st.session_state.pop("go_to", None)
if target in targets:
    st.switch_page(targets[target])

notice = st.session_state.pop("notice", None)
if notice:
    st.warning(notice, icon=":material/info:")
try:
    session.catalog()
except ApiError as error:
    service_unavailable(error)
else:
    page.run()
st.space("medium")
st.caption(DISCLAIMER)
