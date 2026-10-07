"""Find my path: a guided four-step finder (Goal, Matches, Pathway, Readiness)."""
import streamlit as st

from api_client import ApiError
from portal import session
from portal.account import account_dialog
from portal.components import stepper
from portal.journey import (ANSWERS, CATEGORY_HELP, CERTIFICATE, EXAMPLES, EXPERIENCE, ROUTE_TITLES,
                            group_competencies, plain)


def set_step(number: int) -> None:
    st.session_state["finder_step"] = number


def clear_answers() -> None:
    for key in list(st.session_state):
        if key in ("finder_experience", "finder_certification", "readiness_editing", "pathway_notice") \
                or str(key).startswith("answer_"):
            st.session_state.pop(key, None)
    st.session_state["readiness_results"] = {}
    st.session_state["readiness_group"] = {}


def begin_journey(query: str, picked: str | None = None) -> None:
    """Analyse a goal and open the Matches step. Raises ApiError when the API refuses."""
    token = session.token()
    if token:
        record = session.api().start_session(token, query)
        profile, session_id = record["profile"], record["id"]
    else:
        profile, session_id = session.api().analyze_goal(query)["profile"], None
    clear_answers()
    st.session_state["journey"] = {"query": query, "profile": profile, "session_id": session_id, "synced": None,
                                   "code": picked, "picked": picked, "matched_profile": None}
    set_step(2)


def submit_goal() -> None:
    query = (st.session_state.get("goal_query") or "").strip()
    if not query:
        st.session_state["finder_notice"] = "Describe the work you want to do, or pick an example."
        return
    try:
        begin_journey(query)
    except ApiError as error:
        st.session_state["finder_notice"] = error.message


def use_example() -> None:
    choice = st.session_state.get("goal_example")
    if choice:
        st.session_state["goal_query"] = EXAMPLES[choice]
    st.session_state["goal_example"] = None


def answered_profile(journey: dict) -> dict:
    profile = dict(journey["profile"])
    if profile["experience_years"] is None and st.session_state.get("finder_experience"):
        profile["experience_years"] = EXPERIENCE[st.session_state["finder_experience"]]
    if profile["has_certification"] is None and st.session_state.get("finder_certification"):
        profile["has_certification"] = CERTIFICATE[st.session_state["finder_certification"]]
    return profile


def details_missing(journey: dict) -> bool:
    profile = answered_profile(journey)
    return profile["experience_years"] is None or profile["has_certification"] is None


def choose(code: str) -> None:
    st.session_state["journey"]["code"] = code


def follow_pathway(pathway_id: int) -> None:
    try:
        session.api().follow_pathway(session.token(), pathway_id)
        st.session_state["pathway_notice"] = "Added to My progress. Tick off each step as you finish it."
    except ApiError as error:
        st.session_state["pathway_notice"] = ("You're already following this pathway. Find it in My progress."
                                              if error.status_code == 409 else error.message)


def move_group(code: str, change: int) -> None:
    groups = st.session_state["readiness_group"]
    groups[code] = max(0, groups.get(code, 0) + change)


def submit_readiness(code: str) -> None:
    qualification = session.qualification(code)
    answers = {item["id"]: ANSWERS[st.session_state[f"answer_{code}_{item['id']}"]]
               for item in qualification["competencies"]}
    token = session.token()
    try:
        if token:
            result = session.api().submit_readiness(token, code, answers, st.session_state["journey"]["session_id"])
        else:
            result = session.api().readiness(code, answers)
    except ApiError as error:
        st.session_state["finder_notice"] = error.message
        return
    st.session_state["readiness_results"][code] = result
    st.session_state["readiness_editing"] = False


def edit_answers(code: str) -> None:
    st.session_state["readiness_editing"] = True
    st.session_state["readiness_group"][code] = 0


def new_goal() -> None:
    clear_answers()
    st.session_state.pop("journey", None)
    st.session_state["goal_query"] = ""
    set_step(1)


def save_progress(journey: dict, profile: dict, code: str) -> None:
    """Keep a signed-in learner's saved recommendation in step with their answers and choice."""
    token = session.token()
    if not token or not journey["session_id"]:
        return
    state = {"experience_years": profile["experience_years"], "has_certification": profile["has_certification"],
             "qualification_code": code}
    if journey["synced"] != state:
        session.api().update_session(token, journey["session_id"], **state)
        journey["synced"] = state


def show_goal(journey: dict | None) -> None:
    stepper(1)
    if journey:
        st.subheader("Change your goal")
        st.caption("Finding new matches clears your earlier answers.")
    else:
        st.title("What work do you want to do?")
        st.markdown("Tell us in your own words, in English or Filipino. We'll match you with TESDA "
                    "qualifications and show you the next step.")
    st.pills("Try an example", list(EXAMPLES), key="goal_example", on_change=use_example)
    with st.form("goal_form", border=False):
        st.text_area("Your goal", key="goal_query", height=120, persist_state="session",
                     placeholder="For example: I've worked as a welder for 5 years, but I don't have a certificate.")
        st.form_submit_button("Find my matches", key="find_matches", type="primary", icon=":material/search:",
                              width="stretch", on_click=submit_goal)
    if journey:
        st.button("Back to my matches", key="back_to_matches_from_goal", type="tertiary",
                  icon=":material/arrow_forward:", on_click=set_step, args=(2,))
    else:
        st.caption(f"{len(session.catalog())} TESDA qualifications to explore. You don't need an account to start.")


def match_card(journey: dict, code: str, matches: list[dict]) -> None:
    match = next((item for item in matches if item["qualification"]["code"] == code), None)
    qualification = session.qualification(code) or {**match["qualification"], "possible_jobs": []}
    chosen = journey["code"] == code
    with st.container(border=True, key=f"card_match_{code}"):
        if code == journey["picked"]:
            st.badge("You picked this", icon=":material/push_pin:", color="blue")
        elif matches and match is matches[0]:
            st.badge("Best match", icon=":material/star:", color="yellow")
        else:
            st.badge("Also a good fit", color="gray")
        st.markdown(f"**{qualification['name']}**")
        st.caption(qualification["sector"])
        if match:
            st.markdown(match["reason"])
        if qualification["possible_jobs"]:
            st.caption("Jobs: " + ", ".join(qualification["possible_jobs"][:4]))
        st.button("Chosen" if chosen else "Choose this", key=f"choose_{code}",
                  type="primary" if chosen else "secondary", icon=":material/check:" if chosen else None,
                  on_click=choose, args=(code,))


def show_matches(journey: dict) -> None:
    stepper(2)
    st.subheader("Qualifications that fit your goal")
    st.caption(f"Your goal: {plain(journey['query'])}")
    profile = journey["profile"]
    if profile["experience_years"] is None or profile["has_certification"] is None:
        with st.container(border=True, key="finder_details"):
            st.markdown("**Two quick questions**")
            if profile["experience_years"] is None:
                st.segmented_control("How much experience do you have in this work?", list(EXPERIENCE),
                                     key="finder_experience", persist_state="session")
            if profile["has_certification"] is None:
                st.segmented_control("Do you already have a TESDA certificate (NC) for it?", list(CERTIFICATE),
                                     key="finder_certification", persist_state="session")
    try:
        result = session.api().match(journey["query"], answered_profile(journey))
    except ApiError as error:
        session.handle_api_error(error)
        with st.container(horizontal=True, horizontal_alignment="distribute"):
            st.button("Back", key="back_to_goal", icon=":material/arrow_back:", on_click=set_step, args=(1,))
            st.button("Try again", key="retry_matches", type="primary", icon=":material/refresh:")
        return
    journey["matched_profile"] = result["profile"]
    matches = result["matches"][:3]
    codes = [match["qualification"]["code"] for match in matches]
    if journey["picked"] and journey["picked"] not in codes:
        codes.insert(0, journey["picked"])
    if journey["code"] is None and codes:
        journey["code"] = codes[0]
    if not codes:
        st.info("We couldn't find a TESDA qualification for that goal yet. Try describing the work another way, "
                "or browse all qualifications.", icon=":material/search_off:")
    for code in codes:
        match_card(journey, code, matches)
    st.button("Not listed? Browse all qualifications", key="browse_library", type="tertiary",
              icon=":material/school:", on_click=session.go_to, args=("qualifications",))
    with st.container(horizontal=True, horizontal_alignment="distribute"):
        st.button("Back", key="back_to_goal", icon=":material/arrow_back:", on_click=set_step, args=(1,))
        st.button("See my pathway", key="to_pathway", type="primary", icon=":material/arrow_forward:",
                  disabled=journey["code"] is None or details_missing(journey), on_click=set_step, args=(3,))
    if details_missing(journey):
        st.caption("Answer the two quick questions to see your pathway.")


def show_pathway(journey: dict) -> None:
    stepper(3)
    code = journey["code"]
    qualification = session.qualification(code)
    profile = journey["matched_profile"] or answered_profile(journey)
    try:
        recommendation = session.api().pathway(profile, code)
        save_progress(journey, profile, code)
    except ApiError as error:
        session.handle_api_error(error)
        with st.container(horizontal=True, horizontal_alignment="distribute"):
            st.button("Back", key="back_to_matches", icon=":material/arrow_back:", on_click=set_step, args=(2,))
            st.button("Try again", key="retry_pathway", type="primary", icon=":material/refresh:")
        return
    st.subheader(ROUTE_TITLES.get(recommendation["recommendation"], "Your recommended path"))
    st.markdown(f"For **{qualification['name']}**")
    st.write(recommendation["reason"])
    with st.container(border=True, key="card_next_step"):
        st.markdown("**Your next step**")
        st.write(recommendation["next_step"])
    curated = recommendation.get("pathway")
    if curated:
        st.markdown(f"**{curated['title']}**")
        if curated["description"]:
            st.caption(curated["description"])
        st.markdown("\n".join(f"{step['position']}. {step['title']}" for step in curated["steps"]))
        if session.token():
            st.button("Follow this pathway", key="follow_pathway", icon=":material/bookmark_add:",
                      on_click=follow_pathway, args=(curated["id"],))
        else:
            st.button("Sign in to follow this pathway", key="follow_pathway_sign_in", type="tertiary",
                      icon=":material/login:", on_click=account_dialog)
        notice = st.session_state.pop("pathway_notice", None)
        if notice:
            st.success(notice, icon=":material/bookmark_added:")
    if qualification["possible_jobs"]:
        st.caption("Jobs this can lead to: " + ", ".join(qualification["possible_jobs"]))
    with st.container(horizontal=True, horizontal_alignment="distribute"):
        st.button("Back", key="back_to_matches", icon=":material/arrow_back:", on_click=set_step, args=(2,))
        st.button("Check my readiness", key="to_readiness", type="primary", icon=":material/arrow_forward:",
                  on_click=set_step, args=(4,))


def show_results(qualification: dict, result: dict) -> None:
    code = qualification["code"]
    with st.container(border=True, key="card_readiness"):
        st.metric("Your readiness", f"{result['score']:g}%")
        st.subheader(result["level"])
        st.write(result["recommendation"])
        st.progress(min(max(result["score"] / 100, 0.0), 1.0))
        strengths, gaps = st.columns(2)
        with strengths:
            st.markdown("**Your strengths**")
            st.markdown("\n".join(f"- {name}" for name in result["strengths"]) or "None marked confident yet.")
        with gaps:
            st.markdown("**Skills to build**")
            st.markdown("\n".join(f"- {name}" for name in result["skill_gaps"]) or "No gaps reported.")
    st.caption("This is a self-check to help you plan. It doesn't replace an official TESDA assessment.")
    with st.container(horizontal=True):
        st.button("Find training near me", key="find_training", type="primary", icon=":material/location_on:",
                  on_click=session.go_to, args=("training",),
                  kwargs={"training_qualification": code, "training_view": "Training programs"})
        st.button("See assessment schedules", key="see_assessments", icon=":material/event_available:",
                  on_click=session.go_to, args=("training",),
                  kwargs={"training_qualification": code, "training_view": "Assessment schedules"})
    with st.container(horizontal=True):
        st.button("Edit my answers", key="edit_answers", type="tertiary", icon=":material/edit:",
                  on_click=edit_answers, args=(code,))
        st.button("Start with a new goal", key="new_goal", type="tertiary", icon=":material/restart_alt:",
                  on_click=new_goal)


def show_readiness(journey: dict) -> None:
    stepper(4)
    code = journey["code"]
    qualification = session.qualification(code)
    result = st.session_state["readiness_results"].get(code)
    if result and not st.session_state.get("readiness_editing"):
        show_results(qualification, result)
        return
    groups = group_competencies(qualification["competencies"])
    if not groups:
        st.info("This qualification has no skills to rate yet.", icon=":material/info:")
        st.button("Back", key="back_to_pathway", icon=":material/arrow_back:", on_click=set_step, args=(3,))
        return
    index = min(st.session_state["readiness_group"].get(code, 0), len(groups) - 1)
    category, skills = groups[index]
    total = len(qualification["competencies"])
    rated = sum(1 for item in qualification["competencies"] if st.session_state.get(f"answer_{code}_{item['id']}"))
    st.subheader(f"How ready are you for {qualification['name']}?")
    st.caption("Rate each skill. This self-check helps you plan; it isn't an official TESDA assessment.")
    st.progress(rated / total, text=f"{rated} of {total} skills rated")
    st.markdown(f"**{category} skills** ({index + 1} of {len(groups)})")
    st.caption(CATEGORY_HELP.get(category, "Skills for this qualification."))
    for item in skills:
        st.segmented_control(item["name"], list(ANSWERS), key=f"answer_{code}_{item['id']}", persist_state="session")
    with st.container(horizontal=True, horizontal_alignment="distribute"):
        if index > 0:
            st.button("Previous", key="readiness_previous", icon=":material/arrow_back:",
                      on_click=move_group, args=(code, -1))
        else:
            st.button("Back", key="back_to_pathway", icon=":material/arrow_back:", on_click=set_step, args=(3,))
        if index < len(groups) - 1:
            st.button(f"Next: {groups[index + 1][0]} skills", key="readiness_next", type="primary",
                      icon=":material/arrow_forward:", on_click=move_group, args=(code, 1))
        else:
            st.button("See my results", key="see_results", type="primary", icon=":material/insights:",
                      disabled=rated < total, on_click=submit_readiness, args=(code,))
    if index == len(groups) - 1 and rated < total:
        st.caption(f"Rate all {total} skills to see your results.")


notice = st.session_state.pop("finder_notice", None)
pending = st.session_state.pop("pending_goal", None)
if pending:
    try:
        begin_journey(pending["query"], pending["code"])
    except ApiError as error:
        notice = error.message
journey = st.session_state.get("journey")
step = st.session_state.get("finder_step", 1) if journey else 1
if notice:
    st.warning(notice, icon=":material/info:")
if step == 1:
    show_goal(journey)
elif step == 2 or not journey["code"]:
    show_matches(journey)
elif step == 3:
    show_pathway(journey)
else:
    show_readiness(journey)
