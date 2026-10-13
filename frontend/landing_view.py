"""The landing page, the app's Home: one component, so its styles and script stay out of the rest of the app.

Its links into the app come back as triggers: "open" names a page (a NAVIGATION key in app.py) or "account", and
"goal" carries the goal typed in its closing box. The page needs no API, so it shows even while the service is down.
"""
from pathlib import Path

import streamlit as st

HERE = Path(__file__).resolve().parent

_LANDING = st.components.v2.component(
    "tesda_track_landing",
    html=(HERE / "landing.html").read_text(encoding="utf-8"),
    css=(HERE / "landing.css").read_text(encoding="utf-8"),
    js=(HERE / "landing.js").read_text(encoding="utf-8"),
)


def _reported() -> None:
    """A trigger is only reported when it has a callback. The page keeps no state of its own, so its triggers never
    reach st.session_state, where a real callback would look; app.py reads them from show_landing's result."""


def show_landing(account_label: str):
    """The landing page. The result's `open` and `goal` hold what was clicked this run, or None."""
    return _LANDING(data={"account": account_label}, key="landing", on_open_change=_reported,
                    on_goal_change=_reported)
