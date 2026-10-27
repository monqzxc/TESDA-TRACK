"""The personalized pathway report under the recommendation (POST /recommendations/report).

The API writes every sentence from the learner's answers, the catalog and the rankings; this view lays the sections
out as the React app does (frontend/src/features/finder/PathwayReport.tsx) and leaves out a section with nothing in
it. API text is shown as written, never as Markdown.
"""
from datetime import date

import streamlit as st

from training_view import plain

PRIORITY = {"high": "High priority", "medium": "Medium priority", "low": "Lower priority"}
STATUS = {"confident": "Confident", "some_experience": "Some experience", "not_familiar": "Not familiar",
          "not_answered": "Not rated"}
ACTIONS = {"learn": "Must learn", "practice": "Practice", "demonstrate": "Be ready to show"}
BASIS = {"required_unit": "A listed unit you reported not knowing", "reported_gap": "A gap you reported",
         "general_recommendation": "General recommendation"}
TOPICS = {"strengths": "Your strengths", "skill_gaps": "Your skill gaps", "career_goal": "Your career goal",
          "assessment_readiness": "Your assessment readiness", "employment": "Your employment prospects"}
KINDS = {"training": "Training", "assessment": "Assessment"}
SERVICE_STATUS = {"confirmed": "Verified", "needs_verification": "Needs verification",
                  "demonstration": "Demonstration"}
DELIVERY = {"institution_based": "In a training center", "enterprise_based": "At a workplace",
            "community_based": "In the community", "online": "Online"}
FIRST_SKILLS = 4  # skills shown before the rest fold away


def bullets(lines: list[str]) -> str:
    return "\n".join(f"- {plain(line)}" for line in lines)


def day(value: str) -> str:
    when = date.fromisoformat(value)
    return f"{when:%b} {when.day}, {when.year}"


def place_fields(regions: list[dict]) -> tuple[str | None, bool]:
    """Where to look for options: a region sorts them by distance. Neither is saved."""
    names = {region["code"]: region["name"] for region in regions}
    region_column, scholarship_column = st.columns([2, 1], vertical_alignment="bottom")
    region = region_column.selectbox("Your region", [None, *names], key="report_region",
                                     format_func=lambda code: names.get(code, "Choose your region"))
    scholarship = scholarship_column.checkbox("I need a scholarship", key="report_scholarship")
    st.caption("These only sort and explain the options. They aren't saved.")
    return region, scholarship


def show_recommendations(report: dict) -> None:
    """A. Training to consider, the skills to improve, and the competencies to learn or practice."""
    if report["training_to_consider"]:
        st.markdown("**Training to consider**")
        for option in report["training_to_consider"]:
            with st.container(border=True):
                if option["recommended"]:
                    st.badge("Recommended for you", icon=":material/thumb_up:", color="blue")
                st.markdown(f"**{plain(option['title'])}**")
                st.markdown(bullets(option["reasons"]))
    st.markdown("**Skills you should improve**")
    improve = report["skills_to_improve"]
    if not improve:
        st.caption("You didn't report any skill gaps.")
    for item in improve[:FIRST_SKILLS]:
        skill(item)
    if improve[FIRST_SKILLS:]:
        rest = improve[FIRST_SKILLS:]
        with st.expander(f"{len(rest)} more {'skill' if len(rest) == 1 else 'skills'}"):
            for item in rest:
                skill(item)
    learn = report["competencies_to_learn_or_practice"]
    if learn:
        st.markdown("**Competencies to learn or practice**")
        for action, label in ACTIONS.items():
            group = [item for item in learn if item["action"] == action]
            if group:
                st.markdown(f"*{label} ({len(group)})*")
                st.markdown("\n".join(f"- {plain(item['what_to_do'])} ({BASIS[item['basis']]})" for item in group))


def skill(item: dict) -> None:
    with st.container(border=True):
        st.markdown(f"**{plain(item['name'])}** · {PRIORITY[item['priority']]} · {STATUS[item['status']]}")
        st.markdown(plain(item["why_it_matters"]))
        st.caption(plain(item["relevance"]))
        st.markdown("How to work on it:\n\n" + bullets(item["activities"]))


def show_reasons(report: dict) -> None:
    """B. Why we recommend these."""
    with st.container(border=True, key="card_report_why"):
        st.subheader("Why we recommend these")
        columns = st.columns(2)
        for index, reason in enumerate(report["reasoning"]):
            with columns[index % 2]:
                st.markdown(f"**{TOPICS[reason['topic']]}**")
                st.markdown(plain(reason["summary"]))
                if reason["points"]:
                    st.markdown(bullets(reason["points"]))


def provider_facts(provider: dict) -> list[str]:
    facts = []
    if provider["distance_km"] is not None:
        facts.append(f"About {provider['distance_km']:,} km from your region's center")
    if provider["starts_on"]:
        facts.append(("Starts " if provider["kind"] == "training" else "Assessment on ") + day(provider["starts_on"]))
    else:
        facts.append("Date not listed")
    if provider["cost"] is not None:
        label = "Training cost" if provider["kind"] == "training" else "Assessment fee"
        facts.append(f"{label} ₱{float(provider['cost']):,.2f}")
    if provider.get("duration_hours"):
        facts.append(f"{provider['duration_hours']:,} hours")
    if provider.get("seats_left") is not None:
        facts.append(f"{provider['seats_left']} {'seat' if provider['seats_left'] == 1 else 'seats'} left")
    if provider.get("delivery_mode") in DELIVERY:
        facts.append(DELIVERY[provider["delivery_mode"]])
    if provider.get("scholarship_available"):
        facts.append("Scholarship listed")
    return facts


def show_considerations(report: dict) -> None:
    """C. Other things to consider, with the options the rankings found."""
    with st.container(border=True, key="card_report_consider"):
        st.subheader("Other things to consider")
        for item in report["considerations"]:
            st.markdown(plain(item["text"]) + ("\n\n" + bullets(item["items"]) if item.get("items") else ""))
        st.markdown("**Training and assessment options**")
        if not report["providers"]:
            st.caption("No training programs or assessment schedules are listed for this qualification yet.")
        for provider in report["providers"]:
            with st.container(border=True):
                st.markdown(f"**{plain(provider['name'])}** · {KINDS[provider['kind']]} · "
                            f"{SERVICE_STATUS[provider['status']]}")
                if provider.get("title"):
                    st.markdown(plain(provider["title"]))
                st.caption(" · ".join(provider_facts(provider)))
                if provider["notes"]:
                    st.markdown(bullets(provider["notes"]))


def show_next_steps(report: dict) -> None:
    """D. The next steps, in order."""
    with st.container(border=True, key="card_report_steps"):
        st.subheader("Your next steps")
        st.markdown("\n".join(f"{step['position']}. **{plain(step['title'])}**: {plain(step['detail'])}"
                              for step in report["next_steps"]))


def show_final(report: dict) -> None:
    """E. The summary, the next action, and what the report can't promise."""
    with st.container(border=True, key="card_report_final"):
        st.subheader("Final recommendation")
        st.markdown(plain(report["final"]["summary"]))
        if report["final"]["next_action"]:
            st.markdown(f"**Your next action:** {plain(report['final']['next_action'])}")
        st.caption(plain(report["disclaimer"]))


def show_report_sections(report: dict) -> None:
    """B to E, each in its own card under the recommendations."""
    show_reasons(report)
    show_considerations(report)
    show_next_steps(report)
    show_final(report)
