from pathlib import Path

import streamlit as st

from services.intent_service import analyze_user_query
from services.recommendation_service import match_qualifications, recommend_pathway
from services.skill_gap_service import ANSWER_VALUES, calculate_skill_gap
from utils.helpers import load_qualifications


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


def use_example(query: str) -> None:
    st.session_state["goal_query"] = query


def show_readiness(qualification: dict) -> None:
    code = qualification["code"]
    st.subheader("Assessment Readiness")
    st.write("What can you already do? Rate each sample competency to find your strengths and next steps.")
    with st.form(f"skills_{code}"):
        answers = {}
        for index, competency in enumerate(qualification["competencies"], start=1):
            answers[str(competency["id"])] = st.radio(
                f"{index}. {competency['name']}", list(ANSWER_VALUES), index=None,
                key=f"competency_{code}_{competency['id']}", horizontal=True,
                help=f"Sample {competency['category'].lower()} competency",
            )
        analyze = st.form_submit_button("Analyze My Skills", type="primary")

    results = st.session_state.setdefault("readiness_results", {})
    if analyze:
        try:
            results[code] = calculate_skill_gap(qualification, answers)
        except ValueError as error:
            results.pop(code, None)
            st.warning(str(error))
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


def show_recommendations(qualifications: list[dict]) -> None:
    profile = st.session_state["analysis"].copy()
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
                    profile["experience_description"] = experience
            if profile["has_certification"] is None:
                certification = certification_column.selectbox(
                    "Do you currently hold a related certification?",
                    ["Choose an answer", "Yes", "No", "I'm not sure"], key="follow_certification",
                )
                profile["has_certification"] = {"Yes": True, "No": False}.get(certification)
    if profile["experience_years"] == 0:
        profile["intent"] = "training_and_assessment"
    elif profile["experience_years"] is not None and profile["experience_years"] >= 3 and profile["has_certification"] is False:
        profile["intent"] = "assessment_recommendation"

    with st.container(border=True):
        st.subheader("AI Understanding")
        st.caption("Here's what the prototype understood from your submitted goal and follow-up answers.")
        columns = st.columns(4)
        years = profile["experience_years"]
        columns[0].markdown(f"**Career goal**\n\n{profile['career_goal'] or 'Still exploring'}")
        columns[1].markdown(f"**Experience**\n\n{profile.get('experience_description') or (f'{years:g} years' if years is not None else 'Not specified')}")
        columns[2].markdown("**Certification**\n\n" + {True: "Reported certification", False: "None", None: "Not specified"}[profile["has_certification"]])
        columns[3].markdown("**Detected intent**\n\n" + profile["intent"].replace("_", " ").title())
        st.caption("Reported skills: " + (", ".join(profile["existing_skills"]) or "Not yet established"))

    matches = match_qualifications(st.session_state["original_query"], profile, qualifications)
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
    pathway = recommend_pathway(profile, qualification)
    with st.container(border=True):
        st.caption("YOUR RECOMMENDED PATH")
        st.subheader(PATH_LABELS[pathway["recommendation"]])
        st.write(pathway["reason"])
        st.info(pathway["next_step"])
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
            column.button(label, on_click=use_example, args=(example,), use_container_width=True)
        with st.form("career_query"):
            query = st.text_area(
                "What would you like to learn or achieve?", height=140, key="goal_query",
                placeholder="For example: I've worked as a welder for 5 years, but I don't have a certification.",
            )
            submitted = st.form_submit_button("Get Recommendation →", type="primary", use_container_width=True)
        if submitted:
            if not query.strip():
                st.warning("Describe your career goal or skills to get started.")
            else:
                # A new goal starts a new questionnaire, including all saved results.
                for key in list(st.session_state):
                    if key.startswith(("follow_", "competency_", "qualification_")) or key == "readiness_results":
                        del st.session_state[key]
                st.session_state["analysis"] = analyze_user_query(query)
                st.session_state["original_query"] = query.strip()
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


def main() -> None:
    st.set_page_config(page_title="TESDA-TRACK | Find your pathway", page_icon="🌱", layout="wide")
    styles = Path(__file__).with_name("styles.css").read_text(encoding="utf-8")
    st.markdown(f"<style>{styles}</style>", unsafe_allow_html=True)
    st.markdown("""<header class="brand-bar"><div class="brand"><span class="brand-icon">↗</span> TESDA<span class="brand-light">TRACK</span></div><span class="prototype-badge">CAREER PATHWAY PROTOTYPE</span></header>
    <section class="hero"><div class="hero-copy"><div class="eyebrow">BUILD SKILLS. OPEN POSSIBILITIES.</div>
    <h1>Your next step<br>starts here.</h1><p>Turn your career goals and experience into a clearer training or assessment pathway.</p>
    <div class="hero-label">AI-Based Training and Assessment Recommendation</div></div>
    <div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="growth-arrow">↗</div><div class="art-label">YOUR POTENTIAL, IN PROGRESS</div></div></section>""", unsafe_allow_html=True)
    try:
        qualifications = load_qualifications()
    except (OSError, ValueError) as error:
        st.error(f"Could not load sample qualification data: {error}")
        return
    finder, library = st.tabs(["Find my pathway", "Qualification library"])
    with finder:
        show_finder(qualifications)
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
