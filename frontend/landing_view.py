"""The landing page, the app's Home: one component, so its styles and script stay out of the rest of the app.

Its links into the app come back as triggers: "open" names a page (a NAVIGATION key in app.py) or "account", and
"goal" carries the goal typed in its closing box. The page needs no API, so it shows even while the service is down.
"""
from pathlib import Path

import streamlit as st

HERE = Path(__file__).resolve().parent
KEY = "landing"

_LANDING = st.components.v2.component(
    "tesda_track_landing",
    html=(HERE / "landing.html").read_text(encoding="utf-8"),
    css=(HERE / "landing.css").read_text(encoding="utf-8"),
    js=(HERE / "landing.js").read_text(encoding="utf-8"),
)


def landing_event(name: str):
    """What the landing page sent with a trigger, read inside that trigger's callback."""
    return (st.session_state.get(KEY) or {}).get(name)


def show_landing(account_label: str, on_open, on_goal) -> None:
    _LANDING(data={"account": account_label}, key=KEY, on_open_change=on_open, on_goal_change=on_goal)
