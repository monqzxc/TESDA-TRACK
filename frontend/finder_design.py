"""Learner-facing prompts and presentation for the career finder."""
from html import escape

import streamlit as st

from centers import TRAINING, ASSESSMENT
from presentation import html_with_vectors, icon


STARTING_POINTS = {
    "learn": {
        "title": "Learn a new skill", "icon": "school",
        "description": "Start fresh or take your career in a new direction.",
        "prompt": "What would you like to learn or do?",
        "hint": "Name a job, a skill, or the kind of work you enjoy. No experience is needed to start.",
        "placeholder": "For example: I want to learn welding and find work as a welder.",
        "examples": {"Become a welder": "I want to be a welder.",
                     "Learn cookery": "I want to learn to cook and work in a restaurant.",
                     "Repair computers": "Gusto kong matutong mag-ayos ng computer."},
    },
    "certify": {
        "title": "Get my skills recognized", "icon": "workspace_premium",
        "description": "Build on your experience with a TESDA qualification.",
        "prompt": "What work do you already know how to do?",
        "hint": "Tell us what you do, how long you've done it, and whether you already have a certificate.",
        "placeholder": "For example: I've worked as a welder for 5 years, but I don't have an NC.",
        "examples": {"Experienced welder": "I've worked as a welder for 5 years but I don't have an NC.",
                     "Computer repair skills": "Marunong akong mag-ayos ng computer pero wala pa akong NC.",
                     "Kitchen experience": "I've worked as a cook for 3 years but I don't have a certificate."},
    },
    "explore": {
        "title": "Explore my options", "icon": "explore",
        "description": "Find a direction that connects with your interests.",
        "prompt": "What kind of work interests you?",
        "hint": "It's okay not to know a job title. Describe an activity or a workplace you can imagine yourself in.",
        "placeholder": "For example: I enjoy helping people and would like to work in a hotel.",
        "examples": {"Explore hotel careers": "I want to work in a hotel but I don't know which qualification is suitable for me.",
                     "Care for others": "I want to learn how to care for elderly people.",
                     "Work with cars": "I enjoy fixing cars and want to explore related careers."},
    },
}


def choose_starting_point(point: str) -> None:
    # Changing the writing prompt must never overwrite a learner's draft or results.
    st.session_state["finder_starting_point"] = point


def go_to_training(code: str, view: str) -> None:
    st.session_state["training_qualifications"] = [code]
    st.session_state["training_kinds"] = [TRAINING if view == "Training programs" else ASSESSMENT]
    st.session_state["training_selected"] = None
    st.session_state["training_program"] = None
    st.session_state["training_section_qualification"] = True
    st.session_state["main_tabs"] = "Training & assessment"


def finder_header(has_results: bool) -> None:
    st.html('<header class="finder-heading"><span class="finder-eyebrow">YOUR NEXT CHAPTER</span>'
            '<h1>A pathway that starts with you.</h1>'
            '<p>Turn what you enjoy and what you know into a next step you can take.</p></header>')
    labels = ("Share your goal", "Explore your pathway", "Check your skills")
    checked = st.session_state.get("qualification_selected") in st.session_state.get("readiness_results", {})
    current = 3 if has_results and checked else 2 if has_results else 1
    st.html('<ol class="finder-roadmap" aria-label="How the pathway finder works">' + ''.join(
        f'<li class="{"is-current" if i == current else "is-done" if i < current else ""}"'
        + (' aria-current="step"' if i == current else '')
        + f'><span>{"&#10003;" if i < current else f"0{i}"}</span>{label}</li>'
        for i, label in enumerate(labels, 1)) + '</ol>')


def starting_points() -> dict | None:
    st.markdown("**Where would you like to start?**")
    selected = st.session_state.get("finder_starting_point")
    with st.container(key="finder_stories"):
        for column, (key, story) in zip(st.columns(3, gap="small"), STARTING_POINTS.items()):
            active = selected == key
            with column, st.container(border=True, key=f"story_{key}_{'active' if active else 'idle'}"):
                st.button(story["title"], key=f"starting_point_{key}", width="stretch",
                          icon=":material/check_circle:" if active else f":material/{story['icon']}:",
                          on_click=choose_starting_point, args=(key,))
                st.caption(story["description"])
    return STARTING_POINTS.get(selected)


def finder_guide(count: int) -> None:
    html_with_vectors('<aside class="finder-guide">'
                      f'<span class="finder-guide-icon">{icon("route")}</span>'
                      '<span class="finder-eyebrow">A LITTLE CLARITY, A NEXT STEP</span>'
                      '<h2>You bring the goal.<br>We help with the direction.</h2>'
                      '<ul><li><strong>Discover a qualification</strong><span>See options related to the work you want.</span></li>'
                      '<li><strong>Understand your starting point</strong><span>Explore training or assessment based on your experience.</span></li>'
                      '<li><strong>Know what to work on</strong><span>A self-check helps you identify skills to build.</span></li></ul>'
                      f'<p class="finder-guide-note">{count} qualifications to explore<br>English, Filipino, or Taglish welcome</p></aside>')


def pathway_steps(steps: list[dict]) -> None:
    st.html('<ol class="finder-path-steps">' + ''.join(
        f'<li><span>{escape(str(step["position"]))}</span><div>{escape(step["title"])}</div></li>'
        for step in steps) + '</ol>')
