"""Small native building blocks shared by the pages."""
from datetime import date, datetime, timedelta, timezone

import streamlit as st

from api_client import ApiError
from portal import session

FINDER_STEPS = ("Goal", "Matches", "Pathway", "Readiness")
DISCLAIMER = ("TESDA Track is a pilot. Matches are guidance, and readiness checks are self-reported: "
              "they don't replace an official TESDA competency assessment.")
PHILIPPINE_TIME = timezone(timedelta(hours=8))
_ICONS = {"route": "route", "learn": "school", "award": "workspace_premium", "growth": "trending_up",
          "search": "search", "cloud": "cloud_off"}


def stepper(current: int) -> None:
    """The four finder steps: done ones are ticked, the current one stands out."""
    with st.container(horizontal=True, gap="small", key="finder_stepper"):
        for number, label in enumerate(FINDER_STEPS, start=1):
            if number < current:
                st.badge(label, icon=":material/check:", color="green")
            elif number == current:
                st.badge(f"{number}. {label}", color="primary")
            else:
                st.badge(f"{number}. {label}", color="gray")


def empty_state(title: str, description: str, symbol: str = "route") -> None:
    with st.container(border=True, horizontal_alignment="center"):
        st.markdown(f"### :material/{_ICONS.get(symbol, 'route')}:", text_alignment="center")
        st.markdown(f"**{title}**", text_alignment="center")
        st.caption(description, text_alignment="center")


def section_header(kicker: str, title: str, description: str, level: int = 1) -> None:
    """Page or section heading; the kicker is kept for callers but no longer shown."""
    (st.header if level == 1 else st.subheader)(title)
    st.caption(description)


def service_unavailable(error: ApiError) -> None:
    empty_state("We can't load TESDA Track right now", "Your saved progress is safe. Try again in a moment.", "cloud")
    st.error(error.message, icon=":material/cloud_off:")
    st.button("Try again", key="retry_service", type="primary", icon=":material/refresh:",
              on_click=session.reload_reference_data)


def friendly_date(value: str) -> str:
    """'2026-11-03' -> 'Nov 3, 2026'."""
    day = date.fromisoformat(value)
    return f"{day:%b} {day.day}, {day.year}"


def friendly_time(timestamp: str) -> str:
    """An ISO timestamp in Philippine time, e.g. 'Dec 1, 2026, 9:00 AM'."""
    moment = datetime.fromisoformat(timestamp).astimezone(PHILIPPINE_TIME)
    return f"{moment:%b} {moment.day}, {moment.year}, {moment:%I:%M %p}".replace(", 0", ", ")
