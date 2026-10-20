"""Optional questionnaire; inputs are submitted together and never put in URLs."""
import streamlit as st

from api_client import ApiError

DELIVERY = {"institution_based": "Training center", "enterprise_based": "Workplace",
            "community_based": "Community", "online": "Online"}
EDUCATION = {"primary": "Primary", "secondary": "Secondary", "technical_vocational": "Technical/vocational",
             "college": "College", "other": "Other"}
PURPOSE = {"employment": "Employment", "career_transition": "Career transition", "upskilling": "Upskilling",
           "exploration": "Exploration"}
PATHWAYS = {"training": "Training", "assessment": "Assessment", "training_and_assessment": "Training and assessment",
            "exploration": "Exploration"}


def terms(value: str) -> list[str]:
    return list(dict.fromkeys(term.strip() for term in value.split(",") if term.strip()))


def clear_personalization() -> None:
    invalidate_results()
    for key in list(st.session_state):
        if str(key).startswith("assessment_") and key != "assessment_panel":
            st.session_state.pop(key, None)
    st.session_state.pop("analysis_memo", None)
    st.session_state.pop("training_fit", None)


def invalidate_results() -> None:
    """A reassessment starts a new result; earlier saved sessions keep their original revision."""
    previous_goal = st.session_state.get("original_query")
    if previous_goal and not st.session_state.get("goal_query"):
        st.session_state["goal_query"] = previous_goal
    for name in ("analysis", "original_query", "recommendation_session", "readiness_results", "readiness_submissions", "analysis_memo", "training_fit", "journey_context", "journey_save_error"):
        st.session_state.pop(name, None)
    for name in list(st.session_state):
        if str(name).startswith(("follow_", "competency_", "qualification_")):
            st.session_state.pop(name, None)
    st.session_state["finder_step"] = 1


def activate(record: dict) -> None:
    answers = record["answers"]
    clear_personalization()
    st.session_state["assessment_answers"] = answers
    st.session_state["assessment_record"] = record
    fields = {"interests": ", ".join(answers["interests"]), "activities": ", ".join(answers["work_activities"]),
              "skills": ", ".join(answers["existing_skills"]), "sectors": answers["preferred_sectors"],
              "codes": answers["preferred_qualification_codes"], "career": answers.get("career_goal") or "",
              "experience": answers.get("experience_years"), "education": answers.get("education"),
              "purpose": answers.get("goal_kind"), "pathway": answers.get("preferred_pathway"),
              "certificate": answers.get("has_certification"),
              "environments": answers.get("work_environments", [])}
    pref = answers["preferences"]
    fields.update(region=pref.get("region_code"), radius=pref.get("maximum_distance_km"),
                  budget=float(pref["maximum_budget"]) if pref.get("maximum_budget") is not None else None,
                  delivery=pref.get("delivery_mode"), scholarship=bool(pref.get("needs_scholarship")),
                  start_after=pref.get("start_after"), start_before=pref.get("start_before"),
                  accessibility=", ".join(pref.get("accessibility_preferences", [])))
    from datetime import date
    for key in ("start_after", "start_before"):
        if fields[key]:
            fields[key] = date.fromisoformat(fields[key])
    for key in ("delivery_is_mandatory", "budget_is_mandatory", "schedule_is_mandatory", "scholarship_is_mandatory"):
        fields[key] = pref.get(key, False)
    for key, value in fields.items():
        st.session_state[f"assessment_input_{key}"] = value


def show_assessment(qualifications: list[dict], regions, api, token: str | None) -> None:
    panel = st.expander("Personalize with an assessment (optional)", key="assessment_panel", on_change="rerun")
    if not panel.open:
        return
    with panel:
        notice = st.session_state.pop("assessment_notice", None)
        if notice:
            st.success(notice)
        st.caption("Tell us what matters to you. These are self-reported preferences, not a psychological assessment or verified competencies.")
        region_list = regions()
        places = {r["code"]: r["name"] for r in region_list}
        names = {q["code"]: q["name"] for q in qualifications}
        sectors = sorted({q["sector"] for q in qualifications})
        if token and st.button("Browse saved assessments", key="assessment_browse"):
            st.session_state["assessment_history"] = api.learner_assessments(token)
        history = st.session_state.get("assessment_history", [])
        if token and history:
            records = {record["id"]: record for record in history}
            selected = st.selectbox("Saved assessment revision", list(records), key="assessment_selected",
                format_func=lambda key: f"Revision {records[key]['revision']} — {records[key]['created_at'][:10]}")
            st.button("Use saved answers", key="assessment_load", on_click=activate, args=(records[selected],))
            if st.button("Delete saved assessment and its revisions", key="assessment_delete"):
                try:
                    api.delete_learner_assessment(token, selected)
                    clear_personalization()
                    st.session_state.pop("recommendation_session", None)
                    st.session_state["assessment_notice"] = "Assessment revisions and linked recommendation history deleted."
                except ApiError as error:
                    st.warning(error.message)
                else:
                    st.rerun()
        record = st.session_state.get("assessment_record")
        if record:
            st.caption(f"Using saved revision {record['revision']}. Reassessment creates a new revision.")
        with st.form("assessment_form", border=False):
            key = lambda name: f"assessment_input_{name}"
            interests = st.text_input("Interests, separated by commas", key=key("interests"), max_chars=2000, persist_state="session")
            preferred_sectors = st.multiselect("Preferred occupational fields", sectors, key=key("sectors"), persist_state="session")
            activities = st.text_input("Preferred work activities, separated by commas", key=key("activities"), max_chars=1000, persist_state="session")
            environments = st.multiselect("Preferred work environments", ["indoors", "outdoors", "workshop", "remote", "customer_facing"],
                                         format_func=lambda value: value.replace("_", " ").capitalize(),
                                         key=key("environments"), persist_state="session")
            skills = st.text_input("Existing skills, separated by commas", key=key("skills"), max_chars=2000, persist_state="session")
            experience = st.number_input("Relevant experience in years (optional)", min_value=0.0, max_value=80.0, value=None,
                                         key=key("experience"), persist_state="session")
            certificate = st.selectbox("Related certification (self-reported, optional)", [True, False], index=None,
                                       format_func=lambda value: "Yes" if value else "No", key=key("certificate"), persist_state="session")
            education = st.selectbox("Education (optional)", list(EDUCATION), index=None, format_func=EDUCATION.get,
                                    key=key("education"), persist_state="session")
            career = st.text_area("Career goal (optional)", key=key("career"), max_chars=1000, persist_state="session")
            purpose = st.selectbox("Career purpose (optional)", list(PURPOSE), index=None, format_func=PURPOSE.get,
                                  key=key("purpose"), persist_state="session")
            codes = st.multiselect("Preferred qualifications (optional)", list(names), format_func=names.get,
                                   key=key("codes"), persist_state="session")
            pathway = st.selectbox("Preferred pathway (optional)", list(PATHWAYS), index=None, format_func=PATHWAYS.get,
                                  key=key("pathway"), persist_state="session")
            st.markdown("**Practical preferences**")
            region = st.selectbox("Preferred region (optional)", list(places), index=None, format_func=places.get,
                                 key=key("region"), persist_state="session")
            radius = st.number_input("Maximum straight-line distance in km (optional)", min_value=1.0, max_value=2000.0,
                                     value=None, key=key("radius"), persist_state="session",
                                     help="Measured from the approximate center of your selected region.")
            delivery = st.selectbox("Delivery mode (optional)", list(DELIVERY), index=None, format_func=DELIVERY.get,
                                   key=key("delivery"), persist_state="session")
            budget = st.number_input("Maximum training budget in pesos (optional)", min_value=0.0, max_value=99999999.99,
                                     value=None, key=key("budget"), persist_state="session")
            scholarship = st.checkbox("I need a scholarship", key=key("scholarship"), persist_state="session")
            start_after = st.date_input("Preferred start on or after (optional)", value=None, key=key("start_after"), persist_state="session")
            start_before = st.date_input("Preferred start on or before (optional)", value=None, key=key("start_before"), persist_state="session")
            accessibility = st.text_input("Accessibility preferences (optional, separated by commas)", key=key("accessibility"),
                                          max_chars=1000, persist_state="session", help="Describe practical needs; you do not need to disclose a diagnosis.")
            st.caption("Mark a preference mandatory only if results must meet it. Unknown mandatory details require verification.")
            mandatory = {name: st.checkbox(label, key=key(name), persist_state="session") for name, label in (
                ("delivery_is_mandatory", "Delivery mode is mandatory"), ("budget_is_mandatory", "Budget limit is mandatory"),
                ("schedule_is_mandatory", "Start window is mandatory"), ("scholarship_is_mandatory", "Scholarship is mandatory"))}
            save = st.checkbox("Save this assessment to my account", value=bool(token), disabled=not token, key="assessment_save")
            confidence = {"I can do this confidently": "confident", "I have some experience": "some_experience",
                          "I am not familiar with this": "not_familiar"}
            current_competencies = [{"competency_id": int(name.rsplit("_", 1)[1]), "answer": confidence[value]}
                for name, value in st.session_state.items() if str(name).startswith("competency_") and value in confidence]
            use_current = st.checkbox("Use my current readiness answers as self-reported skill evidence",
                                       disabled=not current_competencies, key="assessment_use_readiness")
            keep_existing = st.checkbox("Keep recorded competency answers", value=True, key="assessment_keep_competencies") \
                if record and record["answers"].get("competencies") else False
            submitted = st.form_submit_button("Apply assessment", type="primary")
        if submitted:
            answers = {"questionnaire_version": 1, "interests": terms(interests), "preferred_sectors": preferred_sectors,
                "work_activities": terms(activities), "work_environments": environments, "existing_skills": terms(skills),
                "experience_years": experience, "has_certification": certificate, "education": education, "career_goal": career.strip() or None,
                "competencies": current_competencies if use_current else record["answers"]["competencies"] if keep_existing else [],
                "goal_kind": purpose, "preferred_qualification_codes": codes, "preferred_pathway": pathway,
                "preferences": {"region_code": region, "maximum_distance_km": radius, "delivery_mode": delivery,
                    "maximum_budget": budget, "needs_scholarship": True if scholarship else None,
                    "start_after": start_after.isoformat() if start_after else None,
                    "start_before": start_before.isoformat() if start_before else None,
                    "accessibility_preferences": terms(accessibility), **mandatory}}
            try:
                # Validate transient answers through the same backend contract without persisting them.
                if save and token:
                    from journey_state import request_key
                    retry_id = request_key(st.session_state, "structured_assessment", {"record": record["id"] if record else None, "answers": answers})
                    saved = api.revise_learner_assessment(token, record["id"], answers, request_id=retry_id) if record else api.create_learner_assessment(token, answers, request_id=retry_id)
                    answers = saved["answers"]
                    st.session_state["assessment_record"] = saved
                else:
                    api.assessment_qualifications(answers, token)
                    st.session_state.pop("assessment_record", None)
                st.session_state["assessment_answers"] = answers
                invalidate_results()
                st.session_state.pop("assessment_history", None)
                st.session_state["assessment_notice"] = "Assessment applied. Recommendations will use these answers."
                st.rerun()
            except ApiError as error:
                st.warning(error.message)
        if st.session_state.get("assessment_answers") is not None:
            st.button("Use the goal-only workflow", key="assessment_clear", on_click=clear_personalization)
