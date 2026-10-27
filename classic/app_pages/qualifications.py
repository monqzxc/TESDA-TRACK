"""Qualifications: the whole TESDA catalog, searchable, twelve at a time."""
import streamlit as st

from portal import session
from portal.components import empty_state
from portal.journey import filter_qualifications, group_competencies, page_count, page_items

PER_PAGE = 12
LEVELS = ["NC I", "NC II", "NC III", "NC IV"]


def first_page() -> None:
    st.session_state["library_page"] = 1


def clear_filters() -> None:
    st.session_state.update(library_search="", library_sector=None, library_level=None, library_page=1)


def start_with(code: str, name: str) -> None:
    goal = f"I want to work toward {name}."
    session.go_to("find", pending_goal={"query": goal, "code": code}, goal_query=goal)


def card(item: dict) -> None:
    with st.container(border=True, key=f"card_{item['code']}"):
        st.caption(item["sector"])
        st.markdown(f"**{item['name']}**")
        if item["possible_jobs"]:
            st.markdown("Jobs: " + ", ".join(item["possible_jobs"][:4]))
        with st.expander(f"What you'll learn ({len(item['competencies'])} skills)", icon=":material/checklist:"):
            for category, skills in group_competencies(item["competencies"]):
                st.markdown(f"**{category}**")
                st.markdown("\n".join(f"- {skill['name']}" for skill in skills))
        st.button("Start with this", key=f"start_{item['code']}", icon=":material/arrow_forward:", width="stretch",
                  on_click=start_with, args=(item["code"], item["name"]))


qualifications = session.catalog()
st.header("Qualifications")
st.caption(f"All {len(qualifications)} TESDA qualifications. Pick one to see how you can get there.")
st.session_state.setdefault("library_sector", None)
with st.container(border=True, key="library_filters"):
    query = st.text_input("Search", key="library_search", placeholder="Try welder, cook or computer",
                          icon=":material/search:", on_change=first_page, persist_state="session")
    sector = st.selectbox("Sector", sorted({item["sector"] for item in qualifications}), key="library_sector",
                          placeholder="All sectors", on_change=first_page, persist_state="session")
    level = st.segmented_control("Level", LEVELS, key="library_level", on_change=first_page,
                                 persist_state="session")
found = filter_qualifications(qualifications, query or "", sector, level)
if not found:
    empty_state("No qualifications match", "Try another word, or clear the filters to see everything.", "search")
    st.button("Clear filters", key="clear_library_filters", icon=":material/filter_alt_off:", on_click=clear_filters)
else:
    pages = page_count(len(found), PER_PAGE)
    if st.session_state.get("library_page", 1) > pages:
        st.session_state["library_page"] = 1
    st.caption(f"{len(found)} qualifications")
    cards = st.container()
    current = st.pagination(pages, key="library_page", persist_state="session") if pages > 1 else 1
    with cards:
        visible = page_items(found, current, PER_PAGE)
        for start in range(0, len(visible), 2):
            for column, item in zip(st.columns(2), visible[start:start + 2]):
                with column:
                    card(item)
