"""TESDA Track learner portal (top navigation). Renamed to app.py when the redesign is complete."""
from pathlib import Path

import streamlit as st

from api_client import ApiError
from portal import session
from portal.account import account_bar
from portal.components import DISCLAIMER, service_unavailable

HERE = Path(__file__).resolve().parent

st.set_page_config(page_title="TESDA Track", page_icon=":material/route:", layout="centered")
st.logo(str(HERE / "assets" / "logo.svg"), icon_image=str(HERE / "assets" / "mark.svg"), size="large")
session.init_state()

PAGES = {
    "find": st.Page("app_pages/find.py", title="Find my path", icon=":material/route:", default=True),
}
page = st.navigation(list(PAGES.values()), position="top")

target = st.session_state.pop("go_to", None)
if target in PAGES:
    st.switch_page(PAGES[target])

account_bar()
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
