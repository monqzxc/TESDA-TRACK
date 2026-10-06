import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import streamlit as st

from api_client import ApiClient, ApiError, ApiUnavailableError


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
DELIVERY_LABELS = {"institution_based": "Institution-based", "enterprise_based": "Enterprise-based",
                   "community_based": "Community-based", "online": "Online"}
RESULT_LABELS = {"competent": "Competent", "not_yet_competent": "Not yet competent"}
RANKING_LABELS = {"semantic": "fit with your goal", "proximity": "distance", "assessment": "assessment nearby",
                  "schedule": "start date", "preference": "your preferences"}
PHILIPPINE_TIME = timezone(timedelta(hours=8))
PRIVACY_NOTICE = ("TESDA-TRACK keeps your name, email, goals, recommendations, readiness checks and certifications "
                  "so you can follow your progress. They are used only to run this pilot and are never sold. "
                  "You can download or permanently delete your data at any time from this sidebar.")


def api_base_url() -> str:
    return os.environ.get("API_BASE_URL", "http://127.0.0.1:8000")


@st.cache_resource
def get_api(base_url: str) -> ApiClient:
    return ApiClient(base_url)


def api() -> ApiClient:
    return get_api(api_base_url())


@st.cache_data(ttl="5m")
def load_qualifications(base_url: str) -> list[dict]:
    return get_api(base_url).qualifications()


@st.cache_data(ttl="1h")
def load_regions(base_url: str) -> list[dict]:
    return get_api(base_url).regions()


def use_example(query: str) -> None:
    st.session_state["goal_query"] = query


def auth_token() -> str | None:
    account = st.session_state.get("auth")
    return account["token"] if account else None


def sign_in(email: str, password: str) -> None:
    token = api().sign_in(email, password)
    account = api().me(token)
    st.session_state["auth"] = {"token": token, "name": account["full_name"], "email": account["email"]}


def sign_out() -> None:
    for key in ("auth", "recommendation_session", "data_export"):
        st.session_state.pop(key, None)


def show_account() -> None:
    account = st.session_state.get("auth")
    if account:
        st.markdown(f"Signed in as **{account['name']}**")
        st.caption(account["email"])
        st.button("Sign out", on_click=sign_out, key="sign_out", width="stretch")
        with st.expander("Your data"):
            st.caption("Download everything TESDA-TRACK stores about you, or delete your account.")
            if st.button("Prepare my data export", key="prepare_export"):
                st.session_state["data_export"] = json.dumps(api().export_my_data(account["token"]), indent=2)
            if "data_export" in st.session_state:
                st.download_button("Download my data (JSON)", st.session_state["data_export"],
                                   file_name="tesda-track-my-data.json", mime="application/json")
            confirmed = st.checkbox("I understand this permanently deletes my account and saved records.",
                                    key="confirm_delete")
            if st.button("Delete my account", key="delete_account", disabled=not confirmed):
                api().delete_account(account["token"])
                sign_out()
                st.success("Your account and saved records were deleted.")
        return
    with st.form("sign_in"):
        st.markdown("**Sign in to save your progress**")
        email = st.text_input("Email", key="signin_email")
        password = st.text_input("Password", type="password", key="signin_password")
        if st.form_submit_button("Sign in", type="primary", width="stretch"):
            try:
                sign_in(email, password)
                st.rerun()
            except ApiError as error:
                st.error(error.message)
    with st.expander("New here? Create an account"):
        with st.form("register"):
            full_name = st.text_input("Full name", key="register_name")
            email = st.text_input("Email", key="register_email")
            password = st.text_input("Password", type="password", key="register_password",
                                     help="At least 10 characters.")
            st.caption(PRIVACY_NOTICE)
            consent = st.checkbox("I agree to the privacy notice", key="register_consent")
            if st.form_submit_button("Create account", width="stretch"):
                try:
                    api().register(email, password, full_name, consent)
                    sign_in(email, password)
                    st.rerun()
                except ApiError as error:
                    st.error(error.message)


def show_readiness(qualification: dict) -> None:
    code = qualification["code"]
    st.subheader("Assessment Readiness")
    st.write("What can you already do? Rate each sample competency to find your strengths and next steps.")
    with st.form(f"skills_{code}"):
        answers = {}
        for index, competency in enumerate(qualification["competencies"], start=1):
            answers[competency["id"]] = st.radio(
                f"{index}. {competency['name']}", list(ANSWER_OPTIONS), index=None,
                key=f"competency_{code}_{competency['id']}", horizontal=True,
                help=f"Sample {competency['category'].lower()} competency",
            )
        analyze = st.form_submit_button("Analyze My Skills", type="primary")

    results = st.session_state.setdefault("readiness_results", {})
    if analyze:
        answer_codes = {competency_id: ANSWER_OPTIONS[label] for competency_id, label in answers.items() if label}
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
        with st.container(border=True):
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
    if token and st.button("Follow this pathway", key=f"follow_{curated['id']}"):
        try:
            api().follow_pathway(token, curated["id"])
            st.success("Added to My progress. Tick off each step as you complete it.")
        except ApiError as error:
            if error.status_code != 409:
                raise
            st.info("You're already following this pathway. Find it under My progress.")


def show_recommendations(qualifications: list[dict]) -> None:
    profile = st.session_state["analysis"].copy()
    experience_description = None
    st.divider()
    if profile["experience_years"] is None or profile["has_certification"] is None:
        with st.container(border=True):
            st.subheader("A little more about you")
            st.caption("These details help us suggest a suitable starting point.")
            experience_column, certification_column = st.columns(2)
            if profile["experience_years"] is None:
                label = "Do you already have welding experience?" if profile["career_goal"] == "Welder" else "How much experience do you have in your intended field?"
                experience = experience_column.selectbox(
                    label, ["Choose an answer", "No experience", "Less than 1 year", "1–3 years", "More than 3 years"],
                    key="follow_experience",
                )
                profile["experience_years"] = {"No experience": 0, "Less than 1 year": 0.5, "1–3 years": 2, "More than 3 years": 4}.get(experience)
                if experience != "Choose an answer":
                    experience_description = experience
            if profile["has_certification"] is None:
                certification = certification_column.selectbox(
                    "Do you currently hold a related certification?",
                    ["Choose an answer", "Yes", "No", "I'm not sure"], key="follow_certification",
                )
                profile["has_certification"] = {"Yes": True, "No": False}.get(certification)
    # The API re-derives the intent from the follow-up answers and ranks the qualifications.
    result = api().match(st.session_state["original_query"], profile)
    profile, matches = result["profile"], result["matches"]

    with st.container(border=True):
        st.subheader("AI Understanding")
        st.caption("Here's what the prototype understood from your submitted goal and follow-up answers.")
        columns = st.columns(4)
        years = profile["experience_years"]
        columns[0].markdown(f"**Career goal**\n\n{profile['career_goal'] or 'Still exploring'}")
        columns[1].markdown(f"**Experience**\n\n{experience_description or (f'{years:g} years' if years is not None else 'Not specified')}")
        columns[2].markdown("**Certification**\n\n" + {True: "Reported certification", False: "None", None: "Not specified"}[profile["has_certification"]])
        columns[3].markdown("**Detected intent**\n\n" + profile["intent"].replace("_", " ").title())
        st.caption("Reported skills: " + (", ".join(profile["existing_skills"]) or "Not yet established"))

    st.subheader("Recommended Qualifications")
    if matches:
        for column, match in zip(st.columns(len(matches)), matches):
            with column, st.container(border=True):
                st.caption(match["qualification"]["sector"].upper())
                st.markdown(f"**{match['qualification']['name']}**")
                st.metric("Prototype Match Score", f"{match['score']}%")
                st.progress(match["score"] / 100)
                st.caption(match["reason"])
    else:
        st.info("We couldn't find a clear match. Choose a sample qualification below, or describe a more specific career goal.")
    codes = [item["qualification"]["code"] for item in matches]
    options = sorted(qualifications, key=lambda item: codes.index(item["code"]) if item["code"] in codes else len(codes))
    selected_code = st.selectbox(
        "Select a qualification to explore", [q["code"] for q in options],
        format_func=lambda code: next(q["name"] for q in options if q["code"] == code),
        key="qualification_selected",
    )
    qualification = next(q for q in qualifications if q["code"] == selected_code)
    st.caption("Sample career options: " + ", ".join(qualification["possible_jobs"]))
    pathway = api().pathway(profile, selected_code)
    save_session_progress(profile, selected_code)
    with st.container(border=True):
        st.caption("YOUR RECOMMENDED PATH")
        st.subheader(PATH_LABELS[pathway["recommendation"]])
        st.write(pathway["reason"])
        st.info(pathway["next_step"])
        if pathway.get("pathway"):
            show_curated_pathway(pathway["pathway"])
        st.caption("Your experience should be relevant to the selected qualification. Update your goal when exploring a different field.")

    show_readiness(qualification)
    with st.expander("Developer View"):
        st.json({"profile": profile, "pathway": pathway})


def show_finder(qualifications: list[dict]) -> None:
    goal, guide = st.columns([2, 1], gap="large")
    with goal:
        st.subheader("Tell us where you want to go")
        st.write("Share a career goal, a skill you'd like to learn, or experience you want to turn into a qualification.")
        st.caption("NEED AN IDEA? START WITH AN EXAMPLE")
        for column, (label, example) in zip(st.columns(3), EXAMPLES.items()):
            column.button(label, on_click=use_example, args=(example,), width="stretch")
        with st.form("career_query"):
            query = st.text_area(
                "What would you like to learn or achieve?", height=140, key="goal_query",
                placeholder="For example: I've worked as a welder for 5 years, but I don't have a certification.",
            )
            submitted = st.form_submit_button("Get Recommendation →", type="primary", width="stretch")
        if submitted:
            if not query.strip():
                st.warning("Describe your career goal or skills to get started.")
            else:
                token = auth_token()
                if token:
                    record = api().start_session(token, query)
                    profile, saved = record["profile"], {"id": record["id"], "synced": None}
                else:
                    profile, saved = api().analyze_goal(query)["profile"], None
                # A new goal starts a new questionnaire, including all saved results.
                for key in list(st.session_state):
                    if key.startswith(("follow_", "competency_", "qualification_")) or key == "readiness_results":
                        del st.session_state[key]
                st.session_state["analysis"] = profile
                st.session_state["original_query"] = query.strip()
                st.session_state["recommendation_session"] = saved
        st.caption("Your results are saved to My progress." if auth_token()
                   else "Sign in from the sidebar to save your results and track your progress.")
        if "analysis" in st.session_state:
            st.caption("Showing results for your last submitted goal:")
            st.write(st.session_state["original_query"])
    with guide:
        st.markdown("""<aside class="journey-card">
        <div class="eyebrow">A CLEARER WAY FORWARD</div>
        <h3>One goal. Your next step.</h3>
        <div class="journey-step"><span>01</span><div><strong>Share your goal</strong><p>Tell us what you want to achieve.</p></div></div>
        <div class="journey-step"><span>02</span><div><strong>Discover your pathway</strong><p>Explore training and assessment options.</p></div></div>
        <div class="journey-step"><span>03</span><div><strong>Check your skills</strong><p>See your strengths and what to learn next.</p></div></div>
        <div class="journey-note">5 sample qualifications · Start at your own pace</div>
        </aside>""", unsafe_allow_html=True)
    if "analysis" in st.session_state:
        show_recommendations(qualifications)
    else:
        st.markdown("""<div class="empty-state"><span class="empty-icon">↗</span>
        <h3>A starting point that fits you</h3><p>Share your goal above to discover a qualification, a suggested pathway, and a personal skills check.</p></div>""", unsafe_allow_html=True)


def show_goals(token: str, names: dict[str, str]) -> None:
    st.subheader("My goals")
    for goal in api().goals(token):
        with st.container(border=True):
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
    for certification in api().certifications(token):
        with st.container(border=True):
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
    st.subheader("Find training and assessment near you")
    st.write("Pick a qualification and your region. Programs are ranked by how well they fit your goal, distance, "
             "nearby assessments, start dates and your preferences.")
    names = {q["code"]: q["name"] for q in qualifications}
    regions = {region["code"]: region for region in load_regions(api_base_url())}
    left, right = st.columns(2)
    code = left.selectbox("Qualification", list(names), format_func=names.get, key="training_qualification")
    region_code = right.selectbox("Your region (optional)", [None, *regions], key="training_region",
                                  format_func=lambda c: "Any region" if c is None else regions[c]["name"],
                                  help="Only used to sort results by distance. Only a rounded location is kept.")
    preferred_mode = left.selectbox("Preferred way to train (optional)", [None, *DELIVERY_LABELS],
                                    key="training_mode",
                                    format_func=lambda m: "No preference" if m is None else DELIVERY_LABELS[m])
    needs_scholarship = right.checkbox("I need a scholarship", key="training_scholarship")
    params = {"qualification_code": code}
    if region_code:
        params.update(near_lat=regions[region_code]["latitude"], near_lon=regions[region_code]["longitude"])
    token = auth_token()
    programs_column, schedules_column = st.columns(2, gap="large")
    with programs_column:
        st.markdown("#### Training programs")
        with st.container(key="program_results"):
            ranking = api().rank_training(token, **params, goal=st.session_state.get("original_query"),
                                          preferred_delivery_mode=preferred_mode, needs_scholarship=needs_scholarship)
            for item in ranking["results"]:
                program, provider = item["program"], item["program"]["provider"]
                with st.container(border=True):
                    st.markdown(f"**{program['title']}**")
                    details = [f"{item['score']}% fit", provider["name"],
                               provider["city"] or regions[provider["region_code"]]["name"],
                               DELIVERY_LABELS[program["delivery_mode"]]]
                    if program["duration_hours"]:
                        details.append(f"{program['duration_hours']} hours")
                    st.caption(" · ".join(details))
                    if program["scholarship_available"]:
                        st.caption("Scholarship available")
                    with st.expander("Why this program?"):
                        for reason in item["explanation"]:
                            st.markdown(f"- {reason}")
                        st.caption("Score parts: " + ", ".join(
                            f"{RANKING_LABELS[name]} {value:.0%} × {ranking['weights'][name]:.0%}"
                            for name, value in item["components"].items()))
            if not ranking["results"]:
                st.caption("No programs are listed for this qualification yet.")
    with schedules_column:
        st.markdown("#### Upcoming assessments")
        with st.container(key="schedule_results"):
            schedules = api().schedules(**params)
            for schedule in schedules:
                with st.container(border=True):
                    st.markdown(f"**{format_when(schedule['scheduled_at'])}** · {schedule['center']['name']}")
                    details = [f"{schedule['seats_left']} of {schedule['slots']} seats left"]
                    if schedule["fee"] is not None:
                        details.append(f"₱{float(schedule['fee']):,.2f} fee")
                    if schedule["distance_km"] is not None:
                        details.append(f"about {schedule['distance_km']:,.0f} km away")
                    st.caption(" · ".join(details))
                    if token and schedule["seats_left"] > 0 and st.button("Apply", key=f"apply_{schedule['id']}"):
                        try:
                            api().apply_for_assessment(token, schedule["id"])
                            st.success("Application sent. Track it under My progress.")
                        except ApiError as error:
                            if error.status_code not in (409, 422):
                                raise
                            st.warning(error.message)
            if not schedules:
                st.caption("No upcoming assessments are open for this qualification yet.")
            elif not token:
                st.caption("Sign in to apply for an assessment.")


def show_my_pathways(token: str) -> None:
    st.subheader("My pathways")
    enrollments = [e for e in api().my_pathways(token) if e["status"] != "withdrawn"]
    for enrollment in enrollments:
        with st.container(border=True):
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
            with st.container(border=True):
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
            st.caption("Apply for an assessment from the Training & assessment tab.")


def show_progress(qualifications: list[dict]) -> None:
    token = auth_token()
    if not token:
        st.info("Sign in to save your recommendations and readiness checks and see your progress here.")
        return
    names = {q["code"]: q["name"] for q in qualifications}
    st.subheader("Readiness over time")
    checks = api().readiness_checks(token)
    if checks:
        st.dataframe([{"Date": check["created_at"][:10], "Qualification": check["qualification"]["name"],
                       "Score": check["score"], "Level": check["level"]} for check in checks],
                     hide_index=True, key="readiness_history")
    else:
        st.caption("Complete an Assessment Readiness check while signed in to start your history.")
    st.subheader("Recommendation history")
    with st.container(key="recommendation_history"):
        sessions = api().sessions(token)
        for record in sessions:
            with st.container(border=True):
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
    pathways_column, applications_column = st.columns(2, gap="large")
    with pathways_column:
        show_my_pathways(token)
    with applications_column:
        show_my_applications(token)
    goals_column, certifications_column = st.columns(2, gap="large")
    with goals_column:
        show_goals(token, names)
    with certifications_column:
        show_certifications(token, names)


def handle_api_error(error: ApiError) -> None:
    if error.status_code == 401 and st.session_state.get("auth"):
        sign_out()
        st.session_state["flash"] = "Your session has expired. Please sign in again."
        st.rerun()
    st.error(error.message)


def main() -> None:
    st.set_page_config(page_title="TESDA-TRACK | Find your pathway", page_icon="🌱", layout="wide")
    styles = Path(__file__).with_name("styles.css").read_text(encoding="utf-8")
    st.markdown(f"<style>{styles}</style>", unsafe_allow_html=True)
    st.markdown("""<header class="brand-bar"><div class="brand"><span class="brand-icon">↗</span> TESDA<span class="brand-light">TRACK</span></div><span class="prototype-badge">CAREER PATHWAY PROTOTYPE</span></header>
    <section class="hero"><div class="hero-copy"><div class="eyebrow">BUILD SKILLS. OPEN POSSIBILITIES.</div>
    <h1>Your next step<br>starts here.</h1><p>Turn your career goals and experience into a clearer training or assessment pathway.</p>
    <div class="hero-label">AI-Based Training and Assessment Recommendation</div></div>
    <div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="growth-arrow">↗</div><div class="art-label">YOUR POTENTIAL, IN PROGRESS</div></div></section>""", unsafe_allow_html=True)
    with st.sidebar:
        if "flash" in st.session_state:
            st.warning(st.session_state.pop("flash"))
        try:
            show_account()
        except ApiError as error:
            handle_api_error(error)
    try:
        qualifications = load_qualifications(api_base_url())
    except ApiError as error:
        st.error(error.message)
        return
    # Dynamic tabs: only the selected tab's .open is True, so My progress loads only when viewed.
    finder, library, training, progress = st.tabs(
        ["Find my pathway", "Qualification library", "Training & assessment", "My progress"],
        key="main_tabs", on_change="rerun")
    with finder:
        try:
            show_finder(qualifications)
        except ApiError as error:
            handle_api_error(error)
    if training.open:
        with training:
            try:
                show_training(qualifications)
            except ApiError as error:
                handle_api_error(error)
    if progress.open:
        with progress:
            try:
                show_progress(qualifications)
            except ApiError as error:
                handle_api_error(error)
    with library:
        st.subheader("Explore your possibilities")
        st.write("A quick look at the five qualifications available in this prototype.")
        for start in range(0, len(qualifications), 3):
            for column, qualification in zip(st.columns(3), qualifications[start:start + 3]):
                with column, st.container(border=True):
                    st.caption(qualification["sector"].upper())
                    st.markdown(f"### {qualification['name']}")
                    st.write(", ".join(qualification["possible_jobs"]))
                    with st.expander(f"View {len(qualification['competencies'])} sample competencies"):
                        for competency in qualification["competencies"]:
                            st.write(f"• {competency['name']}")
        st.caption("To explore a pathway, describe one of these careers in the Find my pathway tab.")
    st.divider()
    st.caption("PROTOTYPE · Uses Python rules and sample data. Match scores are illustrative. Readiness is self-reported and is not an official competency assessment result.")


if __name__ == "__main__":
    main()
