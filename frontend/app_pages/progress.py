"""My progress: where you left off, then pathways, applications, checks, goals, certificates and history."""
import streamlit as st

from api_client import ApiError
from portal import session
from portal.account import sign_in_prompt
from portal.components import friendly_date, friendly_time
from portal.journey import ROUTE_TITLES, plain

SECTIONS = ["Pathways", "Applications", "Readiness checks", "Goals", "Certificates", "History"]
STATUS_COLORS = {"approved": "green", "pending": "orange", "withdrawn": "gray", "rejected": "red",
                 "completed": "blue"}
RESULTS = {"competent": "Competent", "not_yet_competent": "Not yet competent"}
GAP = "\u2003"


def set_step_status(enrollment_id: str, step_id: int, status: str) -> None:
    try:
        session.api().set_step_status(session.token(), enrollment_id, step_id, status)
    except ApiError as error:
        st.session_state["progress_notice"] = error.message


def withdraw(application_id: str) -> None:
    try:
        session.api().withdraw_application(session.token(), application_id)
    except ApiError as error:
        st.session_state["progress_notice"] = error.message


def achieve(goal_id: str) -> None:
    try:
        session.api().update_goal(session.token(), goal_id, status="achieved")
    except ApiError as error:
        st.session_state["progress_notice"] = error.message


def resume_goal(record: dict) -> None:
    selected = record["selected_qualification"]
    session.go_to("find", goal_query=record["query"], finder_step=2, journey={
        "query": record["query"], "profile": record["profile"], "session_id": record["id"], "synced": None,
        "code": selected["code"] if selected else None, "picked": None, "matched_profile": None})


def show_continue(enrollments: list[dict], sessions: list[dict]) -> None:
    with st.container(border=True, key="card_continue"):
        st.subheader("Continue where you left off")
        next_up = next(((enrollment, step) for enrollment in enrollments if enrollment["status"] == "active"
                        for step in enrollment["steps"] if step["status"] != "completed"), None)
        if next_up:
            enrollment, step = next_up
            st.markdown(f"**{enrollment['pathway']['title']}**")
            st.caption(enrollment["pathway"]["qualification"]["name"])
            st.progress(enrollment["completion_percent"] / 100, text=f"{enrollment['completion_percent']}% done")
            st.markdown(f"Next: **{step['title']}**")
            st.button("Mark as done", key="continue_mark_done", type="primary", icon=":material/check:",
                      on_click=set_step_status, args=(enrollment["id"], step["id"], "completed"))
        elif sessions:
            st.markdown(f"Your last goal: {plain(sessions[0]['query'])}")
            st.button("Pick up this goal", key="continue_goal", type="primary", icon=":material/route:",
                      on_click=resume_goal, args=(sessions[0],))
        else:
            st.markdown("You haven't set a goal yet. Start with the work you want to do.")
            st.button("Find my path", key="continue_start", type="primary", icon=":material/route:",
                      on_click=session.go_to, args=("find",))


def show_pathways(enrollments: list[dict]) -> None:
    if not enrollments:
        st.caption("Follow a pathway from Find my path to track it here.")
        return
    for enrollment in enrollments:
        with st.container(border=True, key=f"card_enrollment_{enrollment['id']}"):
            st.markdown(f"**{enrollment['pathway']['title']}**")
            st.caption(enrollment["pathway"]["qualification"]["name"])
            st.progress(enrollment["completion_percent"] / 100, text=f"{enrollment['completion_percent']}% done")
            for step in enrollment["steps"]:
                done = step["status"] == "completed"
                st.checkbox(f"{step['position']}. {step['title']}", value=done,
                            key=f"step_{enrollment['id']}_{step['id']}", on_change=set_step_status,
                            args=(enrollment["id"], step["id"], "not_started" if done else "completed"))


def show_applications(token: str) -> None:
    applications = session.api().my_applications(token)
    with st.container(key="my_applications"):
        if not applications:
            st.caption("Apply for an assessment from Training & assessment to see it here.")
            return
        for application in applications:
            schedule, status = application["schedule"], application["status"]
            with st.container(border=True, key=f"card_application_{application['id']}"):
                st.badge(status.replace("_", " ").capitalize(), color=STATUS_COLORS.get(status, "blue"))
                st.markdown(f"**{schedule['qualification']['name']}**")
                st.markdown(f":material/event: {friendly_time(schedule['scheduled_at'])}{GAP}"
                            f":material/location_on: {schedule['center']['name']}")
                if application["result"]:
                    st.markdown(f"Result: **{RESULTS[application['result']]}**")
                if application["reviewer_note"]:
                    st.caption(application["reviewer_note"])
                if status in ("pending", "approved"):
                    st.button("Withdraw", key=f"withdraw_{application['id']}", icon=":material/undo:",
                              on_click=withdraw, args=(application["id"],))


def show_checks(checks: list[dict]) -> None:
    if not checks:
        st.caption("Rate your skills in Find my path while signed in to start your history.")
        return
    st.dataframe([{"Date": check["created_at"][:10], "Qualification": check["qualification"]["name"],
                   "Score": check["score"], "Level": check["level"]} for check in checks],
                 hide_index=True, width="stretch", key="readiness_history", alt="Your readiness checks",
                 column_config={"Score": st.column_config.ProgressColumn("Readiness", min_value=0, max_value=100,
                                                                          format="%d%%")})


def show_goals(token: str, names: dict[str, str]) -> None:
    goals = session.api().goals(token)
    if not goals:
        st.caption("A small goal is a good place to start. Add your first one below.")
    for goal in goals:
        with st.container(border=True, key=f"card_goal_{goal['id']}"):
            st.markdown(f"**{plain(goal['title'])}**")
            target = goal["target_qualification"]
            st.caption(goal["status"].capitalize() + (f", for {target['name']}" if target else ""))
            if goal["status"] == "active":
                st.button("Mark achieved", key=f"achieve_{goal['id']}", icon=":material/flag:",
                          on_click=achieve, args=(goal["id"],))
    with st.form("add_goal", clear_on_submit=True):
        title = st.text_input("New goal", key="goal_title", placeholder="For example: Earn my SMAW NC II this year")
        target = st.selectbox("For a qualification (optional)", list(names), format_func=names.get, index=None,
                              key="goal_target", placeholder="Any qualification")
        if st.form_submit_button("Add goal", icon=":material/add:"):
            if not title.strip():
                st.warning("Describe your goal first.")
            else:
                session.api().add_goal(token, title.strip(), target)
                st.rerun()


def show_certificates(token: str, names: dict[str, str]) -> None:
    certificates = session.api().certifications(token)
    if not certificates:
        st.caption("Keep the certificates you've earned in one place.")
    for index, certificate in enumerate(certificates):
        with st.container(border=True, key=f"card_certificate_{index}"):
            st.markdown(f"**{plain(certificate['title'])}**")
            st.badge("Verified" if certificate["verified"] else "Self-reported",
                     color="green" if certificate["verified"] else "gray")
            details = [certificate["issuing_body"]]
            if certificate["certificate_number"]:
                details.append(f"No. {certificate['certificate_number']}")
            if certificate.get("issued_on"):
                details.append(f"Issued {friendly_date(certificate['issued_on'])}")
            st.caption(GAP.join(details))
    with st.form("add_certification", clear_on_submit=True):
        title = st.text_input("Certificate title", key="certificate_title", placeholder="For example: SMAW NC I")
        qualification = st.selectbox("Related qualification (optional)", list(names), format_func=names.get,
                                     index=None, key="certificate_qualification", placeholder="None")
        number = st.text_input("Certificate number (optional)", key="certificate_number")
        issued_on = st.date_input("Issued on (optional)", value=None, key="certificate_issued_on")
        if st.form_submit_button("Add certificate", icon=":material/add:"):
            if not title.strip():
                st.warning("Enter the certificate title first.")
            else:
                session.api().add_certification(token, title=title.strip(), qualification_code=qualification,
                                                certificate_number=number or None,
                                                issued_on=issued_on.isoformat() if issued_on else None)
                st.rerun()


def show_history(sessions: list[dict]) -> None:
    if not sessions:
        st.caption("Goals you look up while signed in appear here.")
        return
    for index, record in enumerate(sessions):
        with st.container(border=True, key=f"card_history_{index}"):
            st.caption(friendly_date(record["created_at"][:10]))
            st.markdown(f"**{plain(record['query'])}**")
            qualification = record["selected_qualification"] or (
                record["matches"][0]["qualification"] if record["matches"] else None)
            details = [qualification["name"]] if qualification else []
            if record["pathway"]:
                details.append(ROUTE_TITLES.get(record["pathway"]["recommendation"], ""))
            st.markdown(GAP.join(filter(None, details)) or "No matching qualification yet")


st.header("My progress")
token = session.token()
if not token:
    st.markdown("Sign in to keep your goals, readiness checks and assessment applications in one place.")
    sign_in_prompt("Sign in or create an account", "progress_sign_in", "progress", primary=True)
else:
    notice = st.session_state.pop("progress_notice", None)
    if notice:
        st.warning(notice, icon=":material/info:")
    try:
        enrollments = [item for item in session.api().my_pathways(token) if item["status"] != "withdrawn"]
        sessions = session.api().sessions(token)
        checks = session.api().readiness_checks(token)
    except ApiError as error:
        session.handle_api_error(error)
    else:
        show_continue(enrollments, sessions)
        with st.container(horizontal=True, key="progress_summary"):
            st.metric("Pathways followed", len(enrollments), border=True)
            st.metric("Readiness checks", len(checks), border=True)
            st.metric("Latest readiness", f"{checks[0]['score']:g}%" if checks else "None yet", border=True)
        st.session_state.setdefault("progress_section", SECTIONS[0])
        section = st.segmented_control("Show", SECTIONS, key="progress_section", required=True,
                                       label_visibility="collapsed", persist_state="session")
        names = {item["code"]: item["name"] for item in session.catalog()}
        try:
            if section == "Pathways":
                show_pathways(enrollments)
            elif section == "Applications":
                show_applications(token)
            elif section == "Readiness checks":
                show_checks(checks)
            elif section == "Goals":
                show_goals(token, names)
            elif section == "Certificates":
                show_certificates(token, names)
            else:
                show_history(sessions)
        except ApiError as error:
            session.handle_api_error(error)
