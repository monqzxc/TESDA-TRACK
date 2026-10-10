import json
import os
from html import escape
from datetime import datetime, timedelta, timezone
from pathlib import Path

import streamlit as st

from api_client import ApiClient, ApiError, ApiUnavailableError
from directions import DEFAULT_ROUTING_URL, RouteClient
from presentation import FAVICON, brand, empty_state, footer, journey, section_header
from skills_bridge_view import show_skills_bridge
from training_view import show_training as show_center_finder


EXAMPLES = {
    "Become a welder": "I want to be a welder.",
    "Get my skills certified": "I've worked as a welder for 5 years but I don't have an NC.",
    "Explore hotel careers": "I want to work in a hotel but I don't know which qualification is suitable for me.",
}
PATH_LABELS = {
    "ADDITIONAL_QUESTIONS": "Let's fill in a few details",
    "TRAINING_AND_ASSESSMENT": "Training + Assessment",
    "ASSESSMENT_READINESS": "Assessment Readiness Check",
    "SKILL_GAP_CHECK": "Skill Gap Check",
}
ANSWER_OPTIONS = {"I can do this confidently": "confident", "I have some experience": "some_experience",
                  "I am not familiar with this": "not_familiar"}
RESULT_LABELS = {"competent": "Competent", "not_yet_competent": "Not yet competent"}
# Find my pathway shows one of these at a time; the step bar numbers them.
FINDER_STEPS = ["Your goal", "Your matches", "Your pathway", "Readiness check"]
EXPERIENCE_OPTIONS = {"No experience": 0, "Less than 1 year": 0.5, "1–3 years": 2, "More than 3 years": 4}
CERTIFICATION_OPTIONS = {"Yes": True, "No": False}
CATEGORY_HELP = {
    "Basic": "Workplace skills every qualification shares, like teamwork and safety.",
    "Common": "Skills shared by the trades in this sector.",
    "Core": "The technical skills of this qualification.",
}
PHILIPPINE_TIME = timezone(timedelta(hours=8))
PRIVACY_NOTICE = ("TESDA-TRACK keeps your name, email, goals, recommendations, readiness checks and certifications "
                  "so you can follow your progress. They are used only to run this pilot and are never sold. "
                  "You can download or permanently delete your data from Your data & privacy in your account panel.")


def api_base_url() -> str:
    return os.environ.get("API_BASE_URL", "http://127.0.0.1:8000")


@st.cache_resource
def get_api(base_url: str) -> ApiClient:
    return ApiClient(base_url)


def api() -> ApiClient:
    return get_api(api_base_url())


# Local development reads the repository-root .env, as the API does; containers get real environment variables.
ROOT_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


@st.cache_resource
def basemap_key() -> str:
    """The CARTO basemaps key for the center map. Empty keeps the map on OpenStreetMap tiles."""
    key = os.environ.get("CARTO_API")
    if key is None and ROOT_ENV_FILE.is_file():
        for line in ROOT_ENV_FILE.read_text(encoding="utf-8").splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "CARTO_API":
                key = value.strip().strip("'\"")
    return (key or "").strip()


def routing_url() -> str:
    """Where Directions get road routes. Empty turns them off, leaving links to Google Maps."""
    return os.environ.get("ROUTING_URL", DEFAULT_ROUTING_URL).strip()


@st.cache_resource
def get_router(url: str) -> RouteClient:
    # One client for every learner, so the routing service's request limit holds across sessions.
    return RouteClient(url)


@st.cache_data(ttl="5m")
def load_qualifications(base_url: str) -> list[dict]:
    return get_api(base_url).qualifications()


@st.cache_data(ttl="1h")
def load_regions(base_url: str) -> list[dict]:
    return get_api(base_url).regions()


def remembered(name: str, request: dict, fetch) -> dict:
    """The answer to the last identical request, so a rerun from any widget doesn't ask the API again.

    Only the latest request per name is kept. The analysis endpoints are stateless: the same request gets the same
    answer.
    """
    memo = st.session_state.setdefault("analysis_memo", {})
    key = json.dumps(request, sort_keys=True)
    if memo.get(name, {}).get("key") != key:
        memo[name] = {"key": key, "response": fetch()}
    return memo[name]["response"]


def use_example(query: str) -> None:
    st.session_state["goal_query"] = query


def auth_token() -> str | None:
    account = st.session_state.get("auth")
    return account["token"] if account else None


def sign_in(email: str, password: str) -> None:
    token = api().sign_in(email, password)
    account = api().me(token)
    st.session_state["auth"] = {"token": token, "name": account["full_name"], "email": account["email"],
                                "role": account["role"]}
    st.session_state["account_dialog_open"] = False


def sign_out() -> None:
    st.session_state["account_dialog_open"] = False
    for key in list(st.session_state):
        if key in {"auth", "recommendation_session", "data_export", "analysis", "original_query", "readiness_results", "goal_query", "analysis_memo"} or key.startswith(("follow_", "competency_", "qualification_", "step_", "bridge_")):
            st.session_state.pop(key, None)


def show_account(key_prefix: str = "") -> None:
    account = st.session_state.get("auth")
    if account:
        initial = escape(account["name"][:1].upper())
        st.html(f'<div class="account-avatar">{initial}</div>')
        st.markdown(f"Signed in as **{account['name']}**")
        st.caption(account["email"])
        st.badge("Administrator" if account["role"] == "admin" else "Learner account", icon=":material/verified_user:", color="blue")
        st.button("Sign out", on_click=sign_out, key=f"{key_prefix}sign_out", width="stretch", icon=":material/logout:")
        with st.expander("Your data & privacy", icon=":material/shield:"):
            st.caption("Download everything TESDA-TRACK stores about you, or delete your account.")
            if st.button("Prepare my data export", key=f"{key_prefix}prepare_export"):
                st.session_state["data_export"] = json.dumps(api().export_my_data(account["token"]), indent=2)
            if "data_export" in st.session_state:
                st.download_button("Download my data (JSON)", st.session_state["data_export"],
                                   file_name="tesda-track-my-data.json", mime="application/json", key=f"{key_prefix}download_export")
            confirmed = st.checkbox("I understand this permanently deletes my account and saved records.",
                                    key=f"{key_prefix}confirm_delete")
            if st.button("Delete my account", key=f"{key_prefix}delete_account", disabled=not confirmed):
                api().delete_account(account["token"])
                sign_out()
                st.session_state["flash"] = "Your account and saved records were deleted."
                st.rerun()
        return
    with st.form(f"{key_prefix}sign_in", border=False):
        st.subheader("Welcome back")
        st.caption("Sign in to save your progress and pick up where you left off.")
        email = st.text_input("Email", key=f"{key_prefix}signin_email", placeholder="you@example.com")
        password = st.text_input("Password", type="password", key=f"{key_prefix}signin_password", placeholder="Enter your password")
        if st.form_submit_button("Sign in", type="primary", width="stretch", icon=":material/login:"):
            try:
                if not email.strip() or "@" not in email or not password:
                    st.error("Enter your email address and password to sign in.")
                else:
                    with st.spinner("Signing you in…"):
                        sign_in(email.strip(), password)
                    st.rerun()
            except ApiError as error:
                st.error(error.message)
    with st.expander("New here? Create an account", icon=":material/person_add:"):
        with st.form(f"{key_prefix}register", border=False):
            full_name = st.text_input("Full name", key=f"{key_prefix}register_name")
            email = st.text_input("Email", key=f"{key_prefix}register_email")
            password = st.text_input("Password", type="password", key=f"{key_prefix}register_password",
                                     help="At least 10 characters.")
            st.caption(PRIVACY_NOTICE)
            consent = st.checkbox("I agree to the privacy notice", key=f"{key_prefix}register_consent")
            if st.form_submit_button("Create account", width="stretch"):
                try:
                    if not consent:
                        st.error("Please agree to the privacy notice to create your account.")
                    elif not full_name.strip() or "@" not in email or len(password) < 10:
                        st.error("Enter your name, a valid email address, and a password with at least 10 characters.")
                    else:
                        with st.spinner("Creating your account…"):
                            api().register(email.strip(), password, full_name.strip(), consent)
                            sign_in(email.strip(), password)
                        st.rerun()
                except ApiError as error:
                    st.error(error.message)
    st.html('<div class="sidebar-note"><strong>Just exploring?</strong><p>You can find a pathway and browse qualifications without an account.</p></div>')


def open_account() -> None:
    st.session_state["account_dialog_open"] = True


def close_account() -> None:
    st.session_state["account_dialog_open"] = False


@st.dialog("Your account", on_dismiss=close_account)
def show_account_dialog() -> None:
    try:
        show_account("dialog_")
    except ApiError as error:
        handle_api_error(error)


def competency_parts(competencies: list[dict]) -> list[tuple[str, list[dict]]]:
    """Basic, then Common, then Core competencies (then any other category), each in catalog order."""
    groups: dict[str, list[dict]] = {}
    for competency in competencies:
        groups.setdefault(competency["category"], []).append(competency)
    order = [category for category in CATEGORY_HELP if category in groups]
    return [(category, groups[category]) for category in order + [c for c in groups if c not in CATEGORY_HELP]]


def set_readiness_part(code: str, part: int) -> None:
    st.session_state.setdefault("readiness_part", {})[code] = part
    st.session_state["finder_scroll_to"] = "readiness_questions"


def scroll_to(container_key: str) -> None:
    """Bring a keyed container to the top of the screen. Streamlit keeps the scroll position when content changes,
    so a step opened from the buttons at the bottom of the last one would otherwise open halfway down."""
    # A new attribute each time makes Streamlit insert, and so run, the script again.
    run = st.session_state["finder_scroll_runs"] = st.session_state.get("finder_scroll_runs", 0) + 1
    st.html(f'<script data-run="{run}">document.querySelector(".st-key-{container_key}")'
            '?.scrollIntoView({block: "start"});</script>', unsafe_allow_javascript=True)


def show_readiness(qualification: dict) -> None:
    code = qualification["code"]
    section_header("KNOW YOUR STARTING POINT", "Assessment readiness",
                   f"{qualification['name']}: recognize your strengths and discover what to build on.", level=2)
    parts = competency_parts(qualification["competencies"])
    if not parts:
        st.caption("No sample competencies are listed for this qualification yet.")
        return
    # One category at a time; answers live in session state, so every part's answers are sent together.
    keys = {competency["id"]: f"competency_{code}_{competency['id']}" for competency in qualification["competencies"]}
    rated = sum(1 for key in keys.values() if st.session_state.get(key))
    st.progress(rated / len(keys), text=f"{rated} of {len(keys)} skills rated")
    part = min(st.session_state.get("readiness_part", {}).get(code, 0), len(parts) - 1)
    category, competencies = parts[part]
    first_number = 1 + sum(len(items) for _, items in parts[:part])
    with st.container(key="readiness_questions"), st.form(f"skills_{code}"):
        st.markdown(f"**Part {part + 1} of {len(parts)} · {category} skills**" if len(parts) > 1 else f"**{category} skills**")
        st.caption(CATEGORY_HELP.get(category, "What can you already do? Rate each sample competency."))
        for number, competency in enumerate(competencies, start=first_number):
            st.radio(f"{number}. {competency['name']}", list(ANSWER_OPTIONS), index=None,
                     key=keys[competency["id"]], horizontal=True)
        analyze = False
        with st.container(horizontal=True, horizontal_alignment="distribute"):
            if part > 0:
                st.form_submit_button("Previous part", key="readiness_previous", icon=":material/arrow_back:",
                                      on_click=set_readiness_part, args=(code, part - 1))
            if part < len(parts) - 1:
                st.form_submit_button(f"Next: {parts[part + 1][0]} skills", key="readiness_next", type="primary",
                                      icon=":material/arrow_forward:", icon_position="right",
                                      on_click=set_readiness_part, args=(code, part + 1))
            else:
                analyze = st.form_submit_button("Analyze My Skills", type="primary")

    results = st.session_state.setdefault("readiness_results", {})
    if analyze:
        answer_codes = {competency_id: ANSWER_OPTIONS[st.session_state[key]]
                        for competency_id, key in keys.items() if st.session_state.get(key)}
        token = auth_token()
        try:
            if token:
                saved = st.session_state.get("recommendation_session")
                results[code] = api().submit_readiness(token, code, answer_codes, saved["id"] if saved else None)
            else:
                results[code] = api().readiness(code, answer_codes)
        except ApiUnavailableError as error:
            results.pop(code, None)
            st.error(error.message)
        except ApiError as error:
            if error.status_code == 401:
                raise
            results.pop(code, None)
            st.warning(error.message)
    result = results.get(code)
    if result:
        with st.container(border=True, key=f"card_readiness_{code}"):
            score, guidance = st.columns([1, 3])
            score.metric("Your readiness", f"{result['score']:g}%")
            guidance.subheader(result["level"])
            guidance.write(result["recommendation"])
            st.progress(result["score"] / 100)
            st.caption("Based on your last submitted answers for this qualification. After editing answers, select Analyze My Skills to update.")
            strengths, gaps = st.columns(2)
            strengths.markdown("**Strengths**")
            for name in result["strengths"]:
                strengths.write(f"✓ {name}")
            if not result["strengths"]:
                strengths.caption("No competencies marked confident yet.")
            gaps.markdown("**Skills to improve**")
            for name in result["skill_gaps"]:
                gaps.write(f"• {name}")
            if not result["skill_gaps"]:
                gaps.caption("No self-reported gaps.")
        st.caption("This self-reported score is NOT an official competency assessment result. Formal assessment is subject to official eligibility and requirements.")


def save_session_progress(profile: dict, qualification_code: str) -> None:
    """Keep a signed-in learner's saved session in step with their follow-up answers and chosen qualification."""
    saved = st.session_state.get("recommendation_session")
    token = auth_token()
    if not saved or not token:
        return
    state = {"experience_years": profile["experience_years"], "has_certification": profile["has_certification"],
             "qualification_code": qualification_code}
    if saved.get("synced") != state:
        api().update_session(token, saved["id"], **state)
        saved["synced"] = state


def show_curated_pathway(curated: dict) -> None:
    st.markdown(f"**{curated['title']}**")
    st.caption(curated["description"])
    for step in curated["steps"]:
        st.markdown(f"{step['position']}. {step['title']}")
    token = auth_token()
    # Not "follow_...": main() re-assigns those keys to keep follow-up answers, and button state can't be assigned.
    if token and st.button("Follow this pathway", key=f"pathway_follow_{curated['id']}"):
        try:
            api().follow_pathway(token, curated["id"])
            st.success("Added to My progress. Tick off each step as you complete it.")
        except ApiError as error:
            if error.status_code != 409:
                raise
            st.info("You're already following this pathway. Find it under My progress.")


def go_to_step(step: int) -> None:
    st.session_state["finder_step"] = step
    st.session_state["finder_scroll_to"] = "finder_steps"


def finder_context(qualifications: list[dict]) -> dict:
    """The learner's profile with their follow-up answers, the ranked matches and the chosen qualification.

    Steps 2-4 all need these, but only Your matches shows the widgets, so the answers are read from session state.
    """
    profile = st.session_state["analysis"].copy()
    experience = st.session_state.get("follow_experience")
    asked_experience = profile["experience_years"] is None
    if asked_experience:
        profile["experience_years"] = EXPERIENCE_OPTIONS.get(experience)
    if profile["has_certification"] is None:
        profile["has_certification"] = CERTIFICATION_OPTIONS.get(st.session_state.get("follow_certification"))
    # The API re-derives the intent from the follow-up answers and ranks the qualifications.
    query = st.session_state["original_query"]
    result = remembered("match", {"query": query, "profile": profile}, lambda: api().match(query, profile))
    codes = [item["qualification"]["code"] for item in result["matches"]]
    options = sorted(qualifications, key=lambda item: codes.index(item["code"]) if item["code"] in codes else len(codes))
    # Before Your matches first shows the picker, its choice is the top match, as the picker itself defaults to.
    selected_code = st.session_state.get("qualification_selected")
    qualification = next((q for q in options if q["code"] == selected_code), options[0])
    save_session_progress(result["profile"], qualification["code"])
    return {"profile": result["profile"], "matches": result["matches"], "options": options,
            "qualification": qualification,
            "experience_description": experience if asked_experience and experience in EXPERIENCE_OPTIONS else None}


def show_matches(context: dict) -> None:
    asked = st.session_state["analysis"]
    needs_answers = asked["experience_years"] is None or asked["has_certification"] is None
    # Side by side when there are questions, so the matches below stay close to the top.
    questions, summary = st.columns(2, gap="medium") if needs_answers else (None, st.container())
    if needs_answers:
        with questions, st.container(border=True, height="stretch", key="card_followup"):
            st.subheader("A little more about you")
            st.caption("These details help us suggest a suitable starting point.")
            if asked["experience_years"] is None:
                label = "Do you already have welding experience?" if asked["career_goal"] == "Welder" else "How much experience do you have in your intended field?"
                st.selectbox(label, ["Choose an answer", *EXPERIENCE_OPTIONS], key="follow_experience")
            if asked["has_certification"] is None:
                st.selectbox("Do you currently hold a related certification?",
                             ["Choose an answer", "Yes", "No", "I'm not sure"], key="follow_certification")

    profile = context["profile"]
    years = profile["experience_years"]
    facts = [("Career goal", profile["career_goal"] or "Still exploring"),
             ("Experience", context["experience_description"] or (f"{years:g} years" if years is not None else "Not specified")),
             ("Certification", {True: "Reported certification", False: "None", None: "Not specified"}[profile["has_certification"]]),
             ("Detected intent", profile["intent"].replace("_", " ").title())]
    with summary, st.container(border=True, height="stretch", key="card_understanding"):
        st.subheader("Your starting point")
        st.caption("Based on your submitted goal and the details you've shared.")
        for row in (facts[:2], facts[2:]) if needs_answers else (facts,):
            for column, (label, value) in zip(st.columns(len(row)), row):
                column.markdown(f"**{label}**\n\n{value}")
        st.caption("Reported skills: " + (", ".join(profile["existing_skills"]) or "Not yet established"))

    st.subheader("Qualifications for you")
    matches = context["matches"]
    if matches:
        for column, match in zip(st.columns(len(matches)), matches):
            with column, st.container(border=True, key=f"card_match_{match['qualification']['code']}"):
                st.caption(match["qualification"]["sector"].upper())
                st.markdown(f"**{match['qualification']['name']}**")
                st.metric("Goal match", f"{match['score']}%")
                st.progress(match["score"] / 100)
                st.caption(match["reason"])
    else:
        st.info("We couldn't find a clear match. Choose a sample qualification below, or describe a more specific career goal.")
    options = context["options"]
    st.selectbox(
        "Select a qualification to explore", [q["code"] for q in options],
        format_func=lambda code: next(q["name"] for q in options if q["code"] == code),
        key="qualification_selected",
    )
    st.caption("Sample career options: " + ", ".join(context["qualification"]["possible_jobs"]))


def show_pathway(context: dict) -> None:
    profile, qualification = context["profile"], context["qualification"]
    code = qualification["code"]
    pathway = remembered("pathway", {"profile": profile, "code": code}, lambda: api().pathway(profile, code))
    with st.container(border=True, key="card_recommended_path"):
        st.caption("YOUR RECOMMENDED PATH")
        st.subheader(PATH_LABELS[pathway["recommendation"]])
        st.caption(f"For {qualification['name']}")
        st.write(pathway["reason"])
        st.info(pathway["next_step"])
        if pathway.get("pathway"):
            show_curated_pathway(pathway["pathway"])
        st.caption("Your experience should be relevant to the selected qualification. Update your goal when exploring a different field.")
    if (st.session_state.get("auth") or {}).get("role") == "admin":
        with st.expander("Recommendation diagnostics", icon=":material/code:"):
            st.json({"profile": profile, "pathway": pathway})


def show_step_bar(current: int, unlocked: bool) -> None:
    """Numbered tabs, one per step: finished ones are ticked, later ones open once there's a goal."""
    with st.container(horizontal=True, gap="small", key="finder_steps"):
        for number, label in enumerate(FINDER_STEPS, start=1):
            done = number < current
            # The button type carries the state to styles.css: primary is current, tertiary is finished.
            st.button(label, key=f"finder_tab_{number}", on_click=go_to_step, args=(number,), width="stretch",
                      icon=":material/check_circle:" if done else f":material/counter_{number}:",
                      type="primary" if number == current else "tertiary" if done else "secondary",
                      disabled=number > 1 and not unlocked)


def show_step_nav(step: int, checked_readiness: bool = False) -> None:
    with st.container(horizontal=True, horizontal_alignment="distribute" if step > 1 else "right", key="finder_nav"):
        if step > 1:
            st.button("Back", key="finder_back", icon=":material/arrow_back:", on_click=go_to_step, args=(step - 1,))
        if step < len(FINDER_STEPS):
            st.button(f"Next: {FINDER_STEPS[step]}", key="finder_next", type="primary", icon=":material/arrow_forward:",
                      icon_position="right", on_click=go_to_step, args=(step + 1,))
        else:
            # Until the check has results, its own buttons are the next action; leaving for training stays quieter.
            st.button("Next: Find training near you", key="finder_next", type="primary" if checked_readiness else "secondary",
                      icon=":material/arrow_forward:", icon_position="right",
                      on_click=navigate, args=("Training & assessment",))


def show_goal_summary() -> None:
    with st.container(horizontal=True, vertical_alignment="center", key="finder_goal_summary"):
        st.html(f'<div class="goal-summary"><span>YOUR GOAL</span><p>{escape(st.session_state["original_query"])}</p></div>',
                width="stretch")
        st.button("Change goal", key="finder_change_goal", type="tertiary", icon=":material/edit:",
                  on_click=go_to_step, args=(1,))
        if auth_token():
            st.caption("Saved to My progress")
        else:
            st.button("Sign in to save", key="open_account_finder", type="tertiary",
                      icon=":material/bookmark_border:", on_click=open_account)


def show_finder(qualifications: list[dict]) -> None:
    has_goal = "analysis" in st.session_state
    step = st.session_state.get("finder_step", 1) if has_goal else 1
    scroll_target = st.session_state.pop("finder_scroll_to", None)
    show_step_bar(step, has_goal)
    if step == 1:
        show_goal(qualifications)
        if has_goal:
            show_step_nav(step)
    else:
        show_goal_summary()
        context = finder_context(qualifications)
        if step == 2:
            show_matches(context)
        elif step == 3:
            show_pathway(context)
        else:
            show_readiness(context["qualification"])
        show_step_nav(step, context["qualification"]["code"] in st.session_state.get("readiness_results", {}))
    if scroll_target:
        scroll_to(scroll_target)


def show_goal(qualifications: list[dict]) -> None:
    goal, guide = st.columns([1.6, 1], gap="large")
    with goal, st.container(key="finder_panel"):
        section_header("", "What would you like to achieve?",
                       "Tell us about a career, a skill, or experience you'd like to turn into a qualification.")
        st.html('<p class="example-label">NEED AN IDEA? START WITH AN EXAMPLE</p>')
        with st.container(horizontal=True, gap="small", key="goal_examples"):
            for label, example in EXAMPLES.items():
                st.button(label, on_click=use_example, args=(example,), width="content")
        with st.form("career_query", border=False):
            query = st.text_area(
                "What would you like to learn or achieve?", height=155, key="goal_query",
                placeholder="For example: I've worked as a welder for 5 years, but I don't have a certification.",
            )
            submitted = st.form_submit_button("Get Recommendation", type="primary", width="stretch", icon=":material/arrow_forward:")
        if submitted:
            if not query.strip():
                st.warning("Describe your career goal or skills to get started.")
            else:
                token = auth_token()
                with st.spinner("Finding a starting point for you…"):
                    if token:
                        record = api().start_session(token, query)
                        profile, saved = record["profile"], {"id": record["id"], "synced": None}
                    else:
                        profile, saved = api().analyze_goal(query)["profile"], None
                # A new goal starts a new questionnaire, including all saved results.
                for key in list(st.session_state):
                    if key.startswith(("follow_", "competency_", "qualification_")) or key in ("readiness_results", "readiness_part"):
                        del st.session_state[key]
                st.session_state["analysis"] = profile
                st.session_state["original_query"] = query.strip()
                st.session_state["recommendation_session"] = saved
                go_to_step(2)
                st.rerun()
        if auth_token():
            st.caption("Your results are saved to My progress.")
        elif "analysis" in st.session_state:
            st.button("Sign in to save your progress", key="open_account_finder", type="tertiary",
                      icon=":material/bookmark_border:", on_click=open_account)
        if "analysis" in st.session_state:
            st.caption("Showing results for your last submitted goal:")
            st.write(st.session_state["original_query"])
    with guide:
        journey(len(qualifications))


def show_goals(token: str, names: dict[str, str]) -> None:
    st.subheader("My goals")
    goals = api().goals(token)
    if not goals:
        st.caption("A small goal is a good place to start. Add your first one below.")
    for goal in goals:
        with st.container(border=True, key=f"card_goal_{goal['id']}"):
            st.markdown(f"**{goal['title']}**")
            target = goal["target_qualification"]
            st.caption(goal["status"].title() + (f" · {target['name']}" if target else ""))
            if goal["status"] == "active" and st.button("Mark achieved", key=f"achieve_{goal['id']}"):
                api().update_goal(token, goal["id"], status="achieved")
                st.rerun()
    with st.form("add_goal", clear_on_submit=True):
        title = st.text_input("New goal", key="goal_title", placeholder="For example: Earn my SMAW NC II this year")
        target = st.selectbox("Target qualification (optional)", [None, *names], key="goal_target",
                              format_func=lambda code: "None" if code is None else names[code])
        if st.form_submit_button("Add goal"):
            if title.strip():
                api().add_goal(token, title, target)
                st.rerun()
            st.warning("Describe your goal first.")


def show_certifications(token: str, names: dict[str, str]) -> None:
    st.subheader("My certifications")
    certifications = api().certifications(token)
    if not certifications:
        st.caption("Keep the qualifications you've earned in one place.")
    for index, certification in enumerate(certifications):
        with st.container(border=True, key=f"card_certificate_{index}"):
            st.markdown(f"**{certification['title']}**")
            details = [certification["issuing_body"], "Verified" if certification["verified"] else "Self-reported"]
            if certification["certificate_number"]:
                details.append(f"No. {certification['certificate_number']}")
            st.caption(" · ".join(details))
    with st.form("add_certification", clear_on_submit=True):
        title = st.text_input("Certificate title", key="certificate_title", placeholder="For example: SMAW NC I")
        qualification = st.selectbox("Related qualification (optional)", [None, *names], key="certificate_qualification",
                                     format_func=lambda code: "None" if code is None else names[code])
        number = st.text_input("Certificate number (optional)", key="certificate_number")
        issued_on = st.date_input("Issued on (optional)", value=None, key="certificate_issued_on")
        if st.form_submit_button("Add certification"):
            if title.strip():
                api().add_certification(token, title=title, qualification_code=qualification,
                                        certificate_number=number or None,
                                        issued_on=issued_on.isoformat() if issued_on else None)
                st.rerun()
            st.warning("Enter the certificate title first.")


def format_when(iso_timestamp: str) -> str:
    return datetime.fromisoformat(iso_timestamp).astimezone(PHILIPPINE_TIME).strftime("%b %d, %Y, %I:%M %p")


def show_training(qualifications: list[dict]) -> None:
    chosen = st.session_state.get("qualification_selected")
    routing = routing_url()
    show_center_finder(qualifications, api(), load_regions(api_base_url()), auth_token(),
                       goal=st.session_state.get("original_query"), on_sign_in=open_account,
                       default_qualifications=[chosen] if chosen else [],
                       router=get_router(routing) if routing else None, basemap_key=basemap_key())


def show_my_pathways(token: str) -> None:
    st.subheader("My pathways")
    enrollments = [e for e in api().my_pathways(token) if e["status"] != "withdrawn"]
    for enrollment in enrollments:
        with st.container(border=True, key=f"card_enrollment_{enrollment['id']}"):
            st.markdown(f"**{enrollment['pathway']['title']}**")
            st.caption(f"{enrollment['pathway']['qualification']['name']} · {enrollment['completion_percent']}% complete")
            st.progress(enrollment["completion_percent"] / 100)
            for step in enrollment["steps"]:
                done = step["status"] == "completed"
                checked = st.checkbox(f"{step['position']}. {step['title']}", value=done,
                                      key=f"step_{enrollment['id']}_{step['id']}")
                if checked != done:
                    api().set_step_status(token, enrollment["id"], step["id"], "completed" if checked else "not_started")
                    st.rerun()
    if not enrollments:
        st.caption("Follow a recommended pathway from Find my pathway to track it here.")


def show_my_applications(token: str) -> None:
    st.subheader("My assessment applications")
    with st.container(key="my_applications"):
        applications = api().my_applications(token)
        for application in applications:
            schedule = application["schedule"]
            with st.container(border=True, key=f"card_application_{application['id']}"):
                status = application["status"]
                st.badge(status.replace("_", " ").title(), color={"approved": "green", "pending": "orange", "withdrawn": "gray", "rejected": "red"}.get(status, "blue"))
                st.markdown(f"**{schedule['qualification']['name']}** · {format_when(schedule['scheduled_at'])}")
                details = [schedule["center"]["name"], application["status"].title()]
                if application["result"]:
                    details.append(RESULT_LABELS[application["result"]])
                st.markdown(" · ".join(details))
                if application["reviewer_note"]:
                    st.caption(application["reviewer_note"])
                if application["status"] in ("pending", "approved") and st.button(
                        "Withdraw", key=f"withdraw_{application['id']}"):
                    api().withdraw_application(token, application["id"])
                    st.rerun()
        if not applications:
            st.caption("Apply for an assessment from Training & assessment.")


def show_progress(qualifications: list[dict]) -> None:
    section_header("MY PROGRESS", "Every step counts.", "Your recommendations, readiness checks, and achievements, together in one place.")
    token = auth_token()
    if not token:
        empty_state("Your journey deserves a place to grow", "Create an account or sign in using the account panel to keep your goals and progress together.", "growth")
        st.info("Sign in to save your recommendations and readiness checks and see your progress here.")
        st.button("Sign in or create an account", type="primary", icon=":material/login:",
                  key="open_account_progress", on_click=open_account)
        return
    names = {q["code"]: q["name"] for q in qualifications}
    checks = api().readiness_checks(token)
    sessions = api().sessions(token)
    with st.container(horizontal=True, key="progress_summary"):
        st.metric("Saved recommendations", len(sessions), border=True, help="Your recent recommendation history.")
        st.metric("Readiness checks", len(checks), border=True)
        st.metric("Latest readiness", f"{checks[0]['score']:g}%" if checks else "—", border=True,
                  help="Your most recent self-reported skills check, not an official assessment.")
    st.subheader("Readiness over time")
    if checks:
        st.dataframe([{"Date": check["created_at"][:10], "Qualification": check["qualification"]["name"],
                       "Score": check["score"], "Level": check["level"]} for check in checks],
                     hide_index=True, key="readiness_history", width="stretch",
                     column_config={"Score": st.column_config.ProgressColumn("Readiness", min_value=0, max_value=100, format="%d%%")})
    else:
        st.caption("Complete an Assessment Readiness check while signed in to start your history.")
    st.subheader("Recommendation history")
    with st.container(key="recommendation_history"):
        for index, record in enumerate(sessions):
            with st.container(border=True, key=f"card_history_{index}"):
                st.caption(record["created_at"][:10])
                st.markdown(f"**{record['query']}**")
                qualification = record["selected_qualification"] or (
                    record["matches"][0]["qualification"] if record["matches"] else None)
                details = [qualification["name"]] if qualification else []
                if record["pathway"]:
                    details.append(PATH_LABELS[record["pathway"]["recommendation"]])
                st.markdown(" · ".join(details) or "No matching qualification yet")
        if not sessions:
            st.caption("Goals you submit while signed in appear here.")
    pathways_column, applications_column = st.columns(2, gap="medium")
    with pathways_column:
        show_my_pathways(token)
    with applications_column:
        show_my_applications(token)
    goals_column, certifications_column = st.columns(2, gap="medium")
    with goals_column:
        show_goals(token, names)
    with certifications_column:
        show_certifications(token, names)


def show_reports(token: str, qualifications: list[dict]) -> None:
    section_header("ADMINISTRATOR WORKSPACE", "A clearer view of learner progress.",
                   "Explore pilot activity, qualification demand, and training opportunities. Counts and averages only.")
    start, end = st.columns(2)
    date_from = start.date_input("From (optional)", value=None, key="report_from")
    date_to = end.date_input("To (optional)", value=None, key="report_to")
    if date_from and date_to and date_from > date_to:
        st.warning("Choose an end date on or after the start date.")
        return
    period = {name: value.isoformat() for name, value in (("date_from", date_from), ("date_to", date_to)) if value}
    overview = api().report(token, "overview", **period)
    funnel = api().report(token, "funnel", **period)
    supply = api().report(token, "supply")
    average = overview["average_readiness"]
    first_row = st.columns(3)
    first_row[0].metric("Learners", overview["learners"], border=True)
    first_row[1].metric("Saved recommendations", overview["recommendation_sessions"], border=True)
    first_row[2].metric("Readiness checks", overview["readiness_checks"], border=True)
    second_row = st.columns(3)
    second_row[0].metric("Average readiness", f"{average:g}%" if average is not None else "—", border=True,
                         help="Average self-reported readiness in the selected period.")
    second_row[1].metric("Verified certifications", overview["certifications"]["verified"], border=True)
    second_row[2].metric("Open assessment seats", sum(region["open_seats"] for region in supply), border=True,
                         help="Current availability across all listed regions, independent of the date filter.")

    with st.container(border=True, key="card_report_journey"):
        st.subheader("Learner journey")
        st.caption("Learners who reached each stage in the selected period.")
        journey_data = {"Stage": ["Registered", "Saved a recommendation", "Checked readiness", "Applied for assessment", "Certified"],
                        "Learners": [funnel["registered"], funnel["saved_a_recommendation"], funnel["checked_readiness"],
                                     funnel["applied_for_assessment"], funnel["certified"]]}
        if any(journey_data["Learners"]):
            st.bar_chart(journey_data, x="Stage", y="Learners", horizontal=True, sort=False, height=260,
                         alt="Number of learners at each stage, from registration to certification.")
            with st.expander("View journey counts", icon=":material/table_chart:"):
                st.table(journey_data, alt="Learner counts by journey stage")
        else:
            st.caption("No learner activity in this period. Try a wider date range.")

    st.markdown("#### Demand by qualification")
    demand = api().report(token, "qualification-demand", **period)
    if demand:
        st.dataframe([{"Qualification": row["qualification"]["name"], "Top match": row["top_match"],
                   "Chosen": row["chosen"], "Readiness checks": row["readiness_checks"],
                   "Average readiness": row["average_readiness"], "Applications": row["assessment_applications"],
                   "Competent": row["competent"], "Certified": row["certified"]} for row in demand], hide_index=True,
                     alt="Qualification demand and outcomes", column_config={
                         "Average readiness": st.column_config.ProgressColumn(min_value=0, max_value=100, format="%d%%")})
    else:
        st.caption("No qualification activity in this period. Demand will appear as learners explore pathways.")

    st.markdown("#### Skill gaps")
    names = {q["code"]: q["name"] for q in qualifications}
    if names:
        code = st.selectbox("Qualification", list(names), format_func=names.get, key="report_qualification")
        gaps = api().report(token, "skill-gaps", qualification_code=code, **period)
        st.caption("Share of answers that weren't \"I can do this confidently\". High rates suggest where training is needed.")
        if gaps:
            st.dataframe([{"Competency": f"{gap['position']}. {gap['name']}", "Answers": gap["answers"],
                           "Gap rate": None if gap["gap_rate"] is None else f"{gap['gap_rate']:.0%}"} for gap in gaps],
                         hide_index=True, alt="Self-reported skill gaps by competency")
        else:
            st.caption("No readiness responses for this qualification in the selected period.")
    else:
        st.caption("Skill gap details will be available when qualifications are added to the catalog.")

    st.markdown("#### Training and assessment supply by region")
    if supply:
        st.dataframe([{"Region": row["region"], "Providers": row["training_providers"], "Programs": row["training_programs"],
                   "Upcoming assessments": row["upcoming_assessments"], "Open seats": row["open_seats"]}
                      for row in supply], hide_index=True, alt="Training providers, programs, and assessment seats by region")
    else:
        st.caption("No training or assessment supply is listed yet.")


def handle_api_error(error: ApiError) -> None:
    if error.status_code == 401 and st.session_state.get("auth"):
        sign_out()
        st.session_state["flash"] = "Your session has expired. Please sign in again."
        st.rerun()
    st.error(error.message, icon=":material/error:")


def reset_library_filters() -> None:
    st.session_state["library_search"] = ""
    st.session_state["library_sector"] = "All sectors"


def explore_qualification(name: str) -> None:
    use_example(f"I want to pursue {name}.")
    go_to_step(1)
    st.session_state["main_tabs"] = "Find my pathway"


def show_library(qualifications: list[dict]) -> None:
    section_header("QUALIFICATION LIBRARY", "Find what sparks your interest.",
                   "Explore qualifications, possible careers, and the skills you'll build along the way.")
    with st.container(border=True, key="library_filters"):
        search, sector = st.columns([2, 1])
        query = search.text_input("Search qualifications or careers", key="library_search", placeholder="Try welding, cookery, or computers", icon=":material/search:")
        selected_sector = sector.selectbox("Sector", ["All sectors", *sorted({q["sector"] for q in qualifications})], key="library_sector")
    filtered = [q for q in qualifications if (selected_sector == "All sectors" or q["sector"] == selected_sector)
                and query.casefold().strip() in " ".join([q["name"], q["code"], q["sector"], *q["possible_jobs"]]).casefold()]
    st.caption(f"{len(filtered)} of {len(qualifications)} qualifications" + (" · Filtered results" if query or selected_sector != "All sectors" else " · Find your next possibility"))
    if query or selected_sector != "All sectors":
        st.button("Clear filters", key="clear_library_filters", on_click=reset_library_filters, icon=":material/filter_alt_off:")
    if not filtered:
        empty_state("No qualifications found", "Try a different career or keyword, or clear your filters to explore all qualifications.", "search")
    for start in range(0, len(filtered), 2):
        for column, qualification in zip(st.columns(2, gap="medium"), filtered[start:start + 2]):
            with column, st.container(border=True, key=f"card_library_{qualification['code']}"):
                st.badge(qualification["sector"], color="blue")
                st.markdown(f"### {qualification['name']}")
                st.caption("POSSIBLE CAREERS")
                st.write(", ".join(qualification["possible_jobs"]))
                with st.expander(f"View {len(qualification['competencies'])} sample competencies", icon=":material/checklist:"):
                    for competency in qualification["competencies"]:
                        st.write(f"• {competency['name']}")
                st.button("Explore this pathway", key=f"explore_{qualification['code']}", width="stretch",
                          icon=":material/arrow_forward:", on_click=explore_qualification, args=(qualification["name"],))


def show_service_unavailable(error: ApiError) -> None:
    with st.container(border=True, key="service_unavailable"):
        empty_state("Let's get you reconnected", "Your next step is still here. We need to reconnect to load qualifications and recommendations.", "cloud")
        st.error(error.message, icon=":material/cloud_off:")
        if st.button("Try again", key="retry_service", type="primary", icon=":material/refresh:"):
            load_qualifications.clear()
            load_regions.clear()
            st.rerun()
        st.caption("If this continues, please return a little later.")


NAVIGATION = [
    ("Find my pathway", "home", "finder"),
    ("Qualification library", "school", "library"),
    ("Training & assessment", "menu_book", "training"),
    ("My progress", "bar_chart", "progress"),
    ("Skills Bridge", "hub", "bridge"),
]


def navigate(page: str) -> None:
    st.session_state["main_tabs"] = page


def show_sidebar(selected: str, is_admin: bool) -> None:
    with st.sidebar:
        brand(sidebar=True)
        with st.container(key="primary_navigation"):
            for label, symbol, key in NAVIGATION + ([("Reports", "analytics", "reports")] if is_admin else []):
                st.button(label, key=f"nav_{key}", icon=f":material/{symbol}:",
                          type="primary" if label == selected else "secondary", width="stretch",
                          on_click=navigate, args=(label,))
        with st.container(key="sidebar_account"):
            account = st.session_state.get("auth")
            label = account["name"] if account else "Sign in"
            st.button(label, key="open_account_sidebar", icon=":material/account_circle:",
                      width="stretch", on_click=open_account)
            st.caption("Manage your account" if account else "Access your account")


def main() -> None:
    st.set_page_config(page_title="TESDA Track | Your next step", page_icon=str(FAVICON), layout="wide")
    st.html(Path(__file__).with_name("styles.css"))
    # Retain drafts and filters when a page is not rendered. Button keys are
    # deliberately excluded: Streamlit owns trigger-widget state.
    for key in list(st.session_state):
        if (key == "goal_query" or key.startswith(("follow_", "competency_", "qualification_", "training_", "library_", "report_", "bridge_"))) and "_button_" not in key:
            st.session_state[key] = st.session_state[key]
    is_admin = (st.session_state.get("auth") or {}).get("role") == "admin"
    selected = st.session_state.get("main_tabs", "Find my pathway")
    allowed = [item[0] for item in NAVIGATION] + (["Reports"] if is_admin else [])
    if selected not in allowed:
        selected = "Find my pathway"
    st.session_state["main_tabs"] = selected
    show_sidebar(selected, is_admin)
    if "flash" in st.session_state:
        st.warning(st.session_state.pop("flash"))
    # A full rerun must also restore an open account dialog (including validation
    # errors); dismissing or completing sign-in clears this flag.
    if st.session_state.get("account_dialog_open"):
        show_account_dialog()
    try:
        qualifications = load_qualifications(api_base_url())
    except ApiError as error:
        show_service_unavailable(error)
        return
    renderers = {
        "Find my pathway": lambda: show_finder(qualifications),
        "Qualification library": lambda: show_library(qualifications),
        "Training & assessment": lambda: show_training(qualifications),
        "My progress": lambda: show_progress(qualifications),
        "Skills Bridge": lambda: show_skills_bridge(api(), qualifications),
        "Reports": lambda: show_reports(auth_token(), qualifications),
    }
    page_key = next((key for label, _, key in NAVIGATION if label == selected), "reports")
    with st.container(key=f"page_{page_key}"):
        try:
            if not qualifications and selected in allowed[:3]:
                empty_state("New possibilities are on the way", "There are no qualifications in the catalog yet. Please check back later.", "learn")
                if st.button("Refresh catalog", icon=":material/refresh:"):
                    load_qualifications.clear()
                    st.rerun()
            else:
                renderers[selected]()
        except ApiError as error:
            handle_api_error(error)
    if selected != "Find my pathway" or "analysis" in st.session_state:
        footer()


if __name__ == "__main__":
    main()
