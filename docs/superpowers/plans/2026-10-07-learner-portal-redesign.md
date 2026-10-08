# Learner Portal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the long single-page Streamlit app with a top-navigation learner portal whose "Find my path" page guides learners through four steps (Goal, Matches, Pathway, Readiness) and carries their choice into Training, a paged qualification library and My progress.

**Architecture:** A new entry script (`frontend/portal_app.py`, renamed to `app.py` in Task 7) builds `st.navigation(position="top")` from page scripts in `frontend/app_pages/`. Shared logic lives in `frontend/portal/` (`session.py` API access and per-learner state, `account.py` sign-in, `components.py` small native widgets, `journey.py` pure helpers and copy). Buttons that change page call `session.go_to(page, **state)` from a callback; the entry script then calls `st.switch_page` (callbacks can't switch pages themselves in Streamlit 1.65).

**Tech Stack:** Python 3.13, Streamlit 1.65 (native elements only), httpx API client, pytest + `streamlit.testing.v1.AppTest`.

**Spec:** No separate spec file. The design was approved in chat on 2026-10-07 and is summarised in "Design" below. That section is the binding authority.

## Design (approved 2026-10-07)

- Top navigation: Find my path, Qualifications, Training & assessment, My progress, Skills Bridge, plus Reports for administrators only. Signing in has its own page: the last navigation item reads "Sign in", or the learner's first name once signed in, and that page holds the account details (sign out, download or delete data). Prompts such as "Sign in to apply" open it and bring the learner back afterwards. Pages carry no sign-in form or account control, there's no sidebar, and Streamlit's toolbar is hidden. (Changed at the user's request on 2026-10-07: "I don't like the sign in in the landing page; make a sign in page, and put the login button in the navigation.")
- Find my path is four screens with a step indicator and Back/Next buttons:
  1. Goal: one text box and example chips. A big headline shows only before the first goal.
  2. Matches: up to three qualification cards labelled "Best match", "Also a good fit" or "You picked this" with the reason. There are no raw match percentages. If experience or certificate is unknown, two quick tap questions appear, and "See my pathway" stays disabled until they're answered. A "Not listed? Browse all qualifications" link is shown.
  3. Pathway: route title in plain words, the reason, the next step, the curated steps, and "Follow this pathway" (signed in) or "Sign in to follow this pathway".
  4. Readiness: skills rated one group at a time (Basic, then Common, then Core) with a progress bar. "See my results" is enabled only when every skill is rated. Results end with "Find training near me" and "See assessment schedules", which open Training with the qualification (and view) already chosen.
- Training: keeps the chosen qualification and region across pages. Clean cards show the fit badge once, provider and city, mode, hours and start date, with Apply (signed in) or "Sign in to apply".
- Qualifications: search, sector and NC-level filters, 12 cards per page. "Start with this" opens the Matches step for that qualification.
- My progress: "Continue where you left off" first, then sections.
- Look: TESDA navy with a "safety amber" accent, self-hosted Figtree (body) and Bricolage Grotesque (headings), pill buttons, phone-friendly.
- Existing features stay: accounts, data export/delete, goals, certificates, applications, Skills Bridge, admin reports.

## Global Constraints

- Work in `D:\Projects\Laragon\TESDA-TRACK` on branch `feature/postgresql-backend`. Do not create branches or worktrees, and never push.
- Until Task 7, never modify `frontend/app.py`, `frontend/styles.css`, `frontend/presentation.py` or `frontend/.streamlit/config.toml`: the user's running app uses them. The new UI's entry file is `frontend/portal_app.py`.
- Never edit `backend/`, `README.md`, `.env.example`, `docker-compose.yml` or `deploy/`. Another session owns them.
- Shared checkout: stage only the exact paths your task lists (`git add <path> ...`), never `git add -A` or `git add .`. Check `git status` before committing; other sessions' uncommitted files must stay unstaged.
- End every commit message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: run only database-free tests, from the repo root, with `.venv/Scripts/python -m pytest --confcutdir=frontend/tests <files> -q`. Never run `frontend/tests/test_ui.py`, `frontend/tests/test_frontend_states.py` or the whole suite: they rebuild a test database another session shares. Task 7 is the one exception, and only when its dispatch says the database is free.
- Streamlit: native elements only. No `st.html`, no `unsafe_allow_html`, no CSS. (`skills_bridge_view.py` keeps its existing `st.components.v2` map component.) Use `width="stretch"`/`"content"`, never `use_container_width`. Use Material Symbols icons (`:material/name:`).
- Copy: sentence case, plain words, no ALL CAPS labels, no raw match percentages on Find my path. Learner-typed text is shown through `plain()` from `portal/journey.py`.
- Widget keys and session keys listed in each task's Interfaces are a contract with `frontend/tests/test_portal.py`. Use them exactly.
- Never assign to a button's key in session state. Buttons are read-only in session state; that bug crashed the previous redesign.

## Review Focus

1. Going Back and forward between finder steps, and switching pages, must keep answers (`persist_state="session"`) and must never raise a session-state error.
2. A new goal, or signing out, must clear earlier answers and results, so no stale readiness score shows for a new goal.
3. Learner text containing Markdown characters (`#`, `*`, `:material/...:`, `$`) must show as typed and never format the page. `plain()` handles this; its unit test is in Task 1.
4. An API failure in the middle of the flow (`ApiUnavailableError` from match/pathway/readiness) must show a message instead of a stack trace. Task 1 adds the test for matching.
5. At phone width (390 px), rows use horizontal containers that wrap. No row has more than 3 columns.
6. Signing in from a prompt (follow a pathway, apply) must bring the learner back to the same page with their finder progress intact. Task 2's prompt test pins this.

---

### Task 1: Guided finder (Find my path) and the portal entry

**Files:**
- Modify: `frontend/portal/journey.py` (add copy constants and `plain`)
- Create: `frontend/app_pages/find.py`
- Modify: `frontend/portal_app.py` (whole file, below)
- Modify: `frontend/tests/test_journey.py` (add the `plain` test)
- Modify: `frontend/tests/test_portal.py` (add two tests)

**Interfaces:**
- Consumes (already in the repo, do not rewrite): `portal.session` (`api()`, `catalog()`, `qualification(code)`, `token()`, `go_to(page, **state)`, `handle_api_error(error)`, `init_state()`, `is_admin()`), `portal.account` (`account_bar()`, `account_dialog`, `account_panel(prefix)`), `portal.components` (`stepper(current)`, `empty_state(title, description, symbol)`, `service_unavailable(error)`, `DISCLAIMER`, `friendly_date`, `friendly_time`), `portal.journey` (`group_competencies`, `qualification_level`, `filter_qualifications`, `page_count`, `page_items`).
- Produces:
  - `portal.journey`: `EXAMPLES: dict[str, str]`, `EXPERIENCE: dict[str, float]`, `CERTIFICATE: dict[str, bool]`, `ANSWERS: dict[str, str]`, `ROUTE_TITLES: dict[str, str]`, `CATEGORY_HELP: dict[str, str]`, `plain(text: str) -> str`.
  - Session keys: `journey` = `{"query": str, "profile": dict, "session_id": str | None, "synced": dict | None, "code": str | None, "picked": str | None, "matched_profile": dict | None}`, `finder_step` (1-4), `readiness_results` (`{code: result}`), `readiness_group` (`{code: index}`), `readiness_editing`, `pending_goal` (`{"query", "code"}`, set by the library in Task 4), `finder_notice`, `pathway_notice`.
  - Widget keys: `goal_example` (pills), `goal_query` (text area), `find_matches` (form submit), `finder_experience`, `finder_certification` (segmented controls), `choose_<code>`, `browse_library`, `back_to_goal`, `to_pathway`, `follow_pathway`, `follow_pathway_sign_in`, `back_to_matches`, `to_readiness`, `answer_<code>_<competency id>` (segmented controls), `readiness_previous`, `back_to_pathway`, `readiness_next`, `see_results`, `find_training`, `see_assessments`, `edit_answers`, `new_goal`, `back_to_matches_from_goal`.
  - `find_training` / `see_assessments` call `session.go_to("training", training_qualification=<code>, training_view="Training programs" | "Assessment schedules")`.
  - `portal_app.py` keeps a `PAGES` dict. Later tasks add entries to it.

- [ ] **Step 1: Add the failing tests**

Append to `frontend/tests/test_journey.py`:

```python
from portal.journey import plain


def test_plain_shows_learner_text_without_markdown_formatting():
    assert plain("# Welder *now* :material/home: $5") == r"\# Welder \*now\* \:material/home\: \$5"
    assert plain("I want to be a welder.") == r"I want to be a welder\."
```

Append to `frontend/tests/test_portal.py` (after `test_matches_use_plain_labels_and_ask_only_the_missing_details`):

```python
def test_matching_outage_shows_an_error_instead_of_crashing(api, monkeypatch):
    def unavailable(self, query, profile):
        raise ApiUnavailableError(UNAVAILABLE_MESSAGE, 503)

    monkeypatch.setattr(ApiClient, "match", unavailable)
    app = ask(portal())
    assert any(error.value == UNAVAILABLE_MESSAGE for error in app.error)


def test_goal_with_markdown_characters_is_kept_as_typed(api):
    app = ask(portal(), "# Welder *now* :material/home:")
    assert app.session_state["journey"]["query"] == "# Welder *now* :material/home:"
    assert any(r"\# Welder \*now\*" in caption.value for caption in app.caption)
```

- [ ] **Step 2: Run them to watch them fail**

Run: `.venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_journey.py frontend/tests/test_portal.py -q -k "plain or goal or matches or matching or choosing or curated or readiness_is or results_need or new_goal or signing_out or outage"`
Expected: FAIL. `plain` doesn't exist (ImportError in test_journey), and the portal tests fail because `app_pages/find.py` is missing.

- [ ] **Step 3: Add the copy constants and `plain` to `frontend/portal/journey.py`**

Add below the existing imports and `_LEVEL` line (keep every existing function):

```python
EXAMPLES = {
    "Become a welder": "I want to be a welder.",
    "Get my skills certified": "I've worked as a welder for 5 years but I don't have an NC.",
    "Work in a hotel": "I want to work in a hotel but I don't know which qualification fits me.",
    "Marunong akong mag-ayos ng computer": "Marunong akong mag-ayos ng computer.",
}
EXPERIENCE = {"No experience": 0, "Less than 1 year": 0.5, "1–3 years": 2, "More than 3 years": 4}
# "Not sure" counts as no certificate, so the pathway still includes getting assessed.
CERTIFICATE = {"Yes": True, "No": False, "I'm not sure": False}
ANSWERS = {"Confident": "confident", "Some experience": "some_experience", "New to me": "not_familiar"}
ROUTE_TITLES = {
    "TRAINING_AND_ASSESSMENT": "Train first, then get certified",
    "ASSESSMENT_READINESS": "Check your readiness, then get assessed",
    "SKILL_GAP_CHECK": "Close your skill gaps, then get assessed",
    "ADDITIONAL_QUESTIONS": "Tell us a little more",
}
CATEGORY_HELP = {
    "Basic": "Workplace skills every TESDA qualification shares, like teamwork and safety.",
    "Common": "Skills shared by the trades in this sector.",
    "Core": "The technical skills of this qualification.",
}
_MARKDOWN = re.compile(r"([\\`*_{}\[\]()#+\-.!|>~:$])")


def plain(text: str) -> str:
    """Escape Markdown so learner-typed text shows exactly as typed."""
    return _MARKDOWN.sub(r"\\\1", text)
```

- [ ] **Step 4: Create `frontend/app_pages/find.py`**

```python
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
```

- [ ] **Step 5: Replace `frontend/portal_app.py` with**

```python
"""TESDA Track learner portal (top navigation). Renamed to app.py when the redesign is complete."""
from pathlib import Path

import streamlit as st

from api_client import ApiError
from portal import session
from portal.account import account_bar
from portal.components import DISCLAIMER, service_unavailable

HERE = Path(__file__).resolve().parent

st.set_page_config(page_title="TESDA Track", page_icon=":material/route:", layout="centered")
st.logo(str(HERE / "assets" / "logo.svg"), icon_image=str(HERE / "assets" / "mark.svg"), size="large")
session.init_state()

PAGES = {
    "find": st.Page("app_pages/find.py", title="Find my path", icon=":material/route:", default=True),
}
page = st.navigation(list(PAGES.values()), position="top")

target = st.session_state.pop("go_to", None)
if target in PAGES:
    st.switch_page(PAGES[target])

account_bar()
notice = st.session_state.pop("notice", None)
if notice:
    st.warning(notice, icon=":material/info:")
try:
    session.catalog()
except ApiError as error:
    service_unavailable(error)
else:
    page.run()
st.space("medium")
st.caption(DISCLAIMER)
```

- [ ] **Step 6: Run the tests until they pass**

Run: `.venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_journey.py frontend/tests/test_api_client.py frontend/tests/test_portal.py -q -k "not training and not library and not qualifications and not reports and not learner_pages_have and not progress and not continue and not expired and not report_date and not results_open"`
Expected: PASS. Fix the code (not the tests) until it passes. If an AppTest behaviour forces a test change, report it as a concern and explain why.

- [ ] **Step 7: Commit**

```bash
git add frontend/portal frontend/app_pages/find.py frontend/portal_app.py frontend/assets frontend/static frontend/tests/test_journey.py frontend/tests/test_portal.py frontend/tests/test_api_client.py frontend/api_client.py
git commit -m "Add the guided Find my path finder to the new learner portal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`api_client.py` and `test_api_client.py` already hold the finished X-Forwarded-For change for Skills Bridge lookups. Commit them here unchanged. Do not stage `skills_bridge_view.py`: it still imports the old `presentation` module until Task 6.)

---

### Task 2: Sign in page in the navigation

**Files:**
- Modify: `frontend/portal/account.py` (whole file, below)
- Create: `frontend/app_pages/account.py`
- Modify: `frontend/portal_app.py` (whole file, below)
- Modify: `frontend/app_pages/find.py` (sign-in prompt)
- Modify: `frontend/tests/test_portal.py` (tests below)

**Interfaces:**
- Consumes: `session.account()`, `token()`, `sign_in()`, `sign_out()`, `go_to()`, `api()`; Task 1's `follow_pathway_sign_in` button in `find.py`.
- Produces:
  - `portal.account.account_panel()`: sign-in and registration forms with keys `account_mode` (segmented "Sign in" | "Create account"), `signin_email`, `signin_password`, `signin_submit`, `register_name`, `register_email`, `register_password`, `register_consent`, `register_submit`. After a successful sign-in or registration it sends the learner to `st.session_state["return_to"]` (default `"progress"`).
  - `portal.account.account_details(signed_in: dict)`: name, email, role badge, `account_sign_out`, and "Your data and privacy" (`account_prepare_export`, `account_download_export`, `account_confirm_delete`, `account_delete`).
  - `portal.account.sign_in_prompt(label: str, key: str, return_to: str, primary: bool = False)`: a button that opens the Sign in page and returns to `return_to` afterwards. Later tasks use it for "Sign in to apply" (`apply_sign_in`, `"training"`) and "Sign in or create an account" (`progress_sign_in`, `"progress"`).
  - Navigation: the account page is always the last item, with key `"account"` for `session.go_to`. Its title is "Sign in" with `:material/login:` when signed out, and the learner's first name with `:material/account_circle:` when signed in. `url_path="account"`.
  - Removed: `account_bar` and `account_dialog`. There's no dialog and nothing above the page content.

- [ ] **Step 1: Change the tests**

In `frontend/tests/test_portal.py`:

1. Add `"account"` to the `PAGE` names tuple: `("find", "qualifications", "training", "progress", "skills_bridge", "reports", "account")`.
2. Replace `test_every_learner_page_opens_signed_out` with:

```python
@pytest.mark.parametrize("page", ["find", "qualifications", "training", "progress", "skills_bridge"])
def test_learner_pages_have_no_sign_in_form(api, page):
    app = portal(page=page)
    assert not [box for box in app.text_input if box.key == "signin_email"], "signing in has its own page"
```

3. Delete `test_progress_signed_out_offers_sign_in_that_validates_locally`, and replace `test_signing_in_from_progress_shows_saved_records` with:

```python
def sign_in_as_juan(app, monkeypatch):
    monkeypatch.setattr(ApiClient, "sign_in", lambda self, email, password: "fresh-token")
    monkeypatch.setattr(ApiClient, "me", lambda self, token: {"full_name": "Juan Dela Cruz",
                                                              "email": "juan@example.test", "role": "learner"})
    app.text_input(key="signin_email").set_value("juan@example.test")
    app.text_input(key="signin_password").set_value("correct horse battery")
    return press(app, "signin_submit")


def test_sign_in_page_validates_before_asking_the_api(api, monkeypatch):
    monkeypatch.setattr(ApiClient, "sign_in", lambda *args: pytest.fail("invalid input must not reach the API"))
    app = portal(page="account")
    app.text_input(key="signin_email").set_value("not-an-email")
    press(app, "signin_submit")
    assert any("email address" in error.value for error in app.error)


def test_sign_in_prompt_brings_the_learner_back_to_their_pathway(api, monkeypatch):
    app = press(answer_details(ask(portal())), "to_pathway")
    press(app, "follow_pathway_sign_in")
    assert app.text_input(key="signin_email"), "the prompt opens the Sign in page"
    sign_in_as_juan(app, monkeypatch)
    assert app.session_state["auth"]["token"] == "fresh-token"
    assert app.button(key="follow_pathway"), "back on the pathway, now able to follow it"


def test_signing_in_from_progress_shows_saved_records(api, monkeypatch):
    app = press(portal(page="progress"), "progress_sign_in")
    sign_in_as_juan(app, monkeypatch)
    assert "Continue where you left off" in text(app)


def test_deleting_the_account_signs_out_and_says_so(api, monkeypatch):
    deleted = []
    monkeypatch.setattr(ApiClient, "delete_account", lambda self, token: deleted.append(token))
    app = portal("learner", "account")
    app.checkbox(key="account_confirm_delete").check()
    press(app, "account_delete")
    assert deleted == ["portal-test-token"] and "auth" not in app.session_state
    assert "deleted" in text(app)
```

4. In `test_signing_out_clears_the_learners_results`, sign out from the account page and expect the sign-in form afterwards:

```python
def test_signing_out_clears_the_learners_results(api):
    app = finish_readiness(portal("learner"))
    app.switch_page(PAGE["account"]).run()
    press(app, "account_sign_out")
    assert "auth" not in app.session_state
    assert "journey" not in app.session_state and not app.session_state["readiness_results"]
    assert app.text_input(key="signin_email")
```

- [ ] **Step 2: Run them to watch them fail**

Run: `.venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_portal.py -q -k "sign or deleting"`
Expected: FAIL (`app_pages/account.py` is missing and `signin_email` doesn't exist).

- [ ] **Step 3: Replace `frontend/portal/account.py`**

```python
"""Signing in, creating an account, and the signed-in account details."""
import json

import streamlit as st

from api_client import ApiError
from portal import session

PRIVACY_NOTICE = ("TESDA Track keeps your name, email, goals, recommendations, readiness checks and certificates "
                  "so you can follow your progress. They are used only to run this pilot and are never sold. "
                  "You can download or permanently delete your data from your account page at any time.")


def sign_in_prompt(label: str, key: str, return_to: str, primary: bool = False) -> None:
    """A button that opens the Sign in page and brings the learner back here afterwards."""
    st.button(label, key=key, type="primary" if primary else "tertiary", icon=":material/login:",
              on_click=session.go_to, args=("account",), kwargs={"return_to": return_to})


def _continue_after_sign_in() -> None:
    session.go_to(st.session_state.pop("return_to", "progress"))
    st.rerun()


def account_panel() -> None:
    """Sign-in and registration forms."""
    st.session_state.setdefault("account_mode", "Sign in")
    mode = st.segmented_control("Account", ["Sign in", "Create account"], key="account_mode", required=True,
                                label_visibility="collapsed")
    if mode == "Sign in":
        _sign_in_form()
    else:
        _register_form()


def _sign_in_form() -> None:
    with st.form("signin", border=False):
        email = st.text_input("Email", key="signin_email", placeholder="you@example.com")
        password = st.text_input("Password", type="password", key="signin_password")
        submitted = st.form_submit_button("Sign in", key="signin_submit", type="primary", width="stretch",
                                          icon=":material/login:")
    if submitted:
        if "@" not in email or not password:
            st.error("Enter your email address and password to sign in.")
            return
        try:
            with st.spinner("Signing you in…"):
                session.sign_in(email.strip(), password)
        except ApiError as error:
            st.error(error.message)
            return
        _continue_after_sign_in()


def _register_form() -> None:
    with st.form("register", border=False):
        full_name = st.text_input("Full name", key="register_name")
        email = st.text_input("Email", key="register_email", placeholder="you@example.com")
        password = st.text_input("Password", type="password", key="register_password",
                                 help="At least 10 characters.")
        st.caption(PRIVACY_NOTICE)
        consent = st.checkbox("I agree to the privacy notice", key="register_consent")
        submitted = st.form_submit_button("Create account", key="register_submit", type="primary",
                                          width="stretch", icon=":material/person_add:")
    if submitted:
        if not consent:
            st.error("Agree to the privacy notice to create your account.")
            return
        if not full_name.strip() or "@" not in email or len(password) < 10:
            st.error("Enter your name, a valid email address, and a password of at least 10 characters.")
            return
        try:
            with st.spinner("Creating your account…"):
                session.api().register(email.strip(), password, full_name.strip(), consent)
                session.sign_in(email.strip(), password)
        except ApiError as error:
            st.error(error.message)
            return
        _continue_after_sign_in()


def account_details(signed_in: dict) -> None:
    with st.container(border=True, key="account_summary"):
        st.markdown(f"**{signed_in['name']}**")
        st.caption(signed_in["email"])
        st.badge("Administrator" if signed_in["role"] == "admin" else "Learner", icon=":material/verified_user:",
                 color="blue")
        st.button("Sign out", key="account_sign_out", icon=":material/logout:", on_click=session.sign_out)
    st.subheader("Your data and privacy")
    st.caption("Download everything TESDA Track keeps about you, or delete your account.")
    if st.button("Prepare my data", key="account_prepare_export", icon=":material/download:"):
        st.session_state["data_export"] = json.dumps(session.api().export_my_data(signed_in["token"]), indent=2)
    if "data_export" in st.session_state:
        st.download_button("Download my data (JSON)", st.session_state["data_export"],
                           file_name="tesda-track-my-data.json", mime="application/json",
                           key="account_download_export")
    confirmed = st.checkbox("I understand this permanently deletes my account and saved records.",
                            key="account_confirm_delete")
    if st.button("Delete my account", key="account_delete", icon=":material/delete:", disabled=not confirmed):
        session.api().delete_account(signed_in["token"])
        session.sign_out()
        st.session_state["notice"] = "Your account and saved records were deleted."
        st.rerun()
```

- [ ] **Step 4: Create `frontend/app_pages/account.py`**

```python
"""Sign in or create an account; once signed in, the learner's account details."""
import streamlit as st

from portal import session
from portal.account import account_details, account_panel

signed_in = session.account()
if signed_in:
    st.header("Your account")
    account_details(signed_in)
else:
    st.header("Sign in to TESDA Track")
    st.caption("Save your goals, readiness checks and applications. You can use Find my path without an account.")
    with st.container(border=True, key="account_forms"):
        account_panel()
```

- [ ] **Step 5: Replace `frontend/portal_app.py`**

```python
"""TESDA Track learner portal (top navigation). Renamed to app.py when the redesign is complete."""
from pathlib import Path

import streamlit as st

from api_client import ApiError
from portal import session
from portal.components import DISCLAIMER, service_unavailable

HERE = Path(__file__).resolve().parent

st.set_page_config(page_title="TESDA Track", page_icon=":material/route:", layout="centered")
st.logo(str(HERE / "assets" / "logo.svg"), icon_image=str(HERE / "assets" / "mark.svg"), size="large")
session.init_state()

PAGES = {
    "find": st.Page("app_pages/find.py", title="Find my path", icon=":material/route:", default=True),
}
signed_in = session.account()
account_page = st.Page("app_pages/account.py", url_path="account",
                       title=(signed_in["name"].split() or ["Account"])[0] if signed_in else "Sign in",
                       icon=":material/account_circle:" if signed_in else ":material/login:")
page = st.navigation([*PAGES.values(), account_page], position="top")

targets = {**PAGES, "account": account_page}
target = st.session_state.pop("go_to", None)
if target in targets:
    st.switch_page(targets[target])

notice = st.session_state.pop("notice", None)
if notice:
    st.warning(notice, icon=":material/info:")
try:
    session.catalog()
except ApiError as error:
    service_unavailable(error)
else:
    page.run()
st.space("medium")
st.caption(DISCLAIMER)
```

- [ ] **Step 6: Use the prompt in `frontend/app_pages/find.py`**

Change the import `from portal.account import account_dialog` to `from portal.account import sign_in_prompt`, and replace the `follow_pathway_sign_in` button with:

```python
            sign_in_prompt("Sign in to follow this pathway", "follow_pathway_sign_in", "find")
```

- [ ] **Step 7: Run the tests until they pass**

Run: `.venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_journey.py frontend/tests/test_api_client.py frontend/tests/test_portal.py -q -k "not training and not library and not qualifications and not reports and not learner_pages_have and not progress and not continue and not expired and not report_date and not results_open"`
Expected: PASS (every Task 1 test plus the new sign-in tests).

- [ ] **Step 8: Commit**

```bash
git add frontend/portal/account.py frontend/app_pages/account.py frontend/portal_app.py frontend/app_pages/find.py frontend/tests/test_portal.py
git commit -m "Move signing in to its own page at the end of the navigation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Training and assessment page

**Files:**
- Create: `frontend/app_pages/training.py`
- Modify: `frontend/portal_app.py` (register the page)
- Test: `frontend/tests/test_portal.py` (existing tests: `test_training_*`, `test_results_open_*`)

**Interfaces:**
- Consumes: `session.go_to("training", training_qualification=..., training_view=...)` from Task 1; the `journey` session key (`code`, `query`); `components.empty_state`, `friendly_date`, `friendly_time`; `account.sign_in_prompt` (Task 2); `ApiClient.rank_training(token, **body)`, `schedules(**params)`, `apply_for_assessment(token, schedule_id)`.
- Produces: widget keys `training_qualification`, `training_region` (selectboxes), `training_mode` (segmented), `training_scholarship` (toggle), `training_preferences` (popover), `training_view` (segmented: "Training programs" | "Assessment schedules"), containers `program_results`, `schedule_results`, buttons `apply_<schedule id>`, `apply_sign_in`. Session key `training_notice` = `(kind, message)`.

- [ ] **Step 1: Run the training tests to watch them fail**

Run: `.venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_portal.py -q -k "training or results_open"`
Expected: FAIL (`app_pages/training.py` is not registered).

- [ ] **Step 2: Create `frontend/app_pages/training.py`**

```python
"""Training and assessment: programs and schedules for one qualification, nearest first."""
import streamlit as st

from api_client import ApiError
from portal import session
from portal.account import sign_in_prompt
from portal.components import empty_state, friendly_date, friendly_time

DELIVERY = {"institution_based": "In a training center", "enterprise_based": "At a workplace",
            "community_based": "In the community", "online": "Online"}
VIEWS = ["Training programs", "Assessment schedules"]
GAP = "\u2003"  # an em space keeps facts apart without separator characters


def apply(schedule_id: int) -> None:
    try:
        session.api().apply_for_assessment(session.token(), schedule_id)
        st.session_state["training_notice"] = ("success", "Application sent. Track it in My progress.")
    except ApiError as error:
        st.session_state["training_notice"] = ("warning", error.message)


def place_name(site: dict, places: dict) -> str:
    region = places.get(site["region_code"], {}).get("name", site["region_code"])
    return f"{site['city']}, {region}" if site.get("city") else region


def show_programs(code: str, goal: str | None, near: dict, mode: str | None, needs_scholarship: bool,
                  places: dict) -> None:
    ranking = session.api().rank_training(session.token(), qualification_code=code, goal=goal,
                                          preferred_delivery_mode=mode, needs_scholarship=needs_scholarship, **near)
    results = ranking["results"]
    with st.container(key="program_results"):
        if not results:
            empty_state("No programs listed yet", "No training programs are listed for this qualification yet. "
                        "Check the assessment schedules, or try another qualification.", "learn")
            return
        st.caption(f"{len(results)} programs, best fit first")
        for index, item in enumerate(results):
            program = item["program"]
            with st.container(border=True, key=f"card_program_{program['id']}"):
                if index == 0:
                    st.badge("Best fit for you", icon=":material/star:", color="yellow")
                st.markdown(f"**{program['title']}**")
                st.markdown(f":material/apartment: {program['provider']['name']}, "
                            f"{place_name(program['provider'], places)}")
                facts = [f":material/school: {DELIVERY[program['delivery_mode']]}"]
                if program["duration_hours"]:
                    facts.append(f":material/schedule: {program['duration_hours']} hours")
                if program["start_date"]:
                    facts.append(f":material/event: Starts {friendly_date(program['start_date'])}")
                st.markdown(GAP.join(facts))
                if program["scholarship_available"]:
                    st.badge("Scholarship available", icon=":material/volunteer_activism:", color="green")
                with st.expander("Why it fits", icon=":material/info:"):
                    st.markdown("\n".join(f"- {reason}" for reason in item["explanation"]))
                    st.caption(f"Fit score {item['score']} of 100, from your goal, location, start date and "
                               "preferences.")


def show_schedules(code: str, near: dict, places: dict) -> None:
    schedules = session.api().schedules(qualification_code=code, **near)
    token = session.token()
    with st.container(key="schedule_results"):
        if not schedules:
            empty_state("No upcoming assessments yet", "Check back soon, or look at training programs for this "
                        "qualification.", "award")
            return
        st.caption(f"{len(schedules)} upcoming assessments, in Philippine time")
        if not token:
            sign_in_prompt("Sign in to apply", "apply_sign_in", "training")
        for schedule in schedules:
            open_seats = schedule["seats_left"] > 0
            with st.container(border=True, key=f"card_schedule_{schedule['id']}"):
                st.badge("Seats available" if open_seats else "Fully booked", icon=":material/event_seat:",
                         color="green" if open_seats else "orange")
                st.markdown(f"**{friendly_time(schedule['scheduled_at'])}**")
                st.markdown(f":material/location_on: {schedule['center']['name']}, "
                            f"{place_name(schedule['center'], places)}")
                facts = [f"{schedule['seats_left']} of {schedule['slots']} seats left"]
                if schedule["fee"] is not None:
                    facts.append(f"₱{float(schedule['fee']):,.2f} fee")
                if schedule.get("distance_km") is not None:
                    facts.append(f"about {schedule['distance_km']:,.0f} km away")
                st.markdown(GAP.join(facts))
                if token and open_seats:
                    st.button("Apply", key=f"apply_{schedule['id']}", type="primary", icon=":material/send:",
                              on_click=apply, args=(schedule["id"],))


st.header("Training and assessment")
st.caption("Find programs and assessment schedules for a qualification, nearest to you first.")
names = {item["code"]: item["name"] for item in session.catalog()}
places = session.regions()
journey = st.session_state.get("journey")
st.session_state.setdefault("training_qualification",
                            journey["code"] if journey and journey.get("code") in names else None)
st.session_state.setdefault("training_region", None)
st.session_state.setdefault("training_view", VIEWS[0])
notice = st.session_state.pop("training_notice", None)
if notice:
    (st.success if notice[0] == "success" else st.warning)(notice[1])
with st.container(border=True, key="training_filters"):
    code = st.selectbox("Qualification", list(names), format_func=names.get, key="training_qualification",
                        placeholder="Choose a qualification", persist_state="session")
    region = st.selectbox("Where are you?", list(places), format_func=lambda item: places[item]["name"],
                          key="training_region", placeholder="Anywhere in the Philippines", persist_state="session",
                          help="Used only to sort results by distance. We keep a rounded location, never your "
                               "address.")
    with st.popover("Preferences", icon=":material/tune:", key="training_preferences"):
        mode = st.segmented_control("How do you want to train?", list(DELIVERY), format_func=DELIVERY.get,
                                    key="training_mode", persist_state="session")
        needs_scholarship = st.toggle("I need a scholarship", key="training_scholarship", persist_state="session")
view = st.segmented_control("Show", VIEWS, key="training_view", required=True, label_visibility="collapsed",
                            persist_state="session")
if not code:
    empty_state("Choose a qualification", "Pick the qualification you're working toward to see programs and "
                "assessments.", "learn")
else:
    near = {"near_lat": places[region]["latitude"], "near_lon": places[region]["longitude"]} if region else {}
    goal = journey["query"] if journey and journey.get("code") == code else None
    try:
        if view == VIEWS[1]:
            show_schedules(code, near, places)
        else:
            show_programs(code, goal, near, mode, needs_scholarship, places)
    except ApiError as error:
        session.handle_api_error(error)
```

- [ ] **Step 3: Register the page in `frontend/portal_app.py`**

Add to the `PAGES` dict, after `"find"`:

```python
    "training": st.Page("app_pages/training.py", title="Training & assessment", icon=":material/location_on:"),
```

- [ ] **Step 4: Run the tests until they pass**

Run: `.venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_portal.py frontend/tests/test_journey.py -q -k "not library and not qualifications and not reports and not learner_pages_have and not progress and not continue and not expired and not report_date"`
Expected: PASS (includes every Task 1 test).

- [ ] **Step 5: Commit**

```bash
git add frontend/app_pages/training.py frontend/portal_app.py
git commit -m "Add the Training and assessment page that keeps the learner's qualification and region

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Qualifications library, twelve per page

**Files:**
- Create: `frontend/app_pages/qualifications.py`
- Modify: `frontend/portal_app.py` (register the page)
- Test: `frontend/tests/test_portal.py` (existing tests: `test_library_*`, `test_starting_from_the_library_*`)

**Interfaces:**
- Consumes: `journey.filter_qualifications`, `group_competencies`, `page_count`, `page_items`; `session.go_to`; `components.empty_state`; the `pending_goal` session key read by Task 1's find page (`{"query": str, "code": str}`).
- Produces: widget keys `library_search` (text input), `library_sector` (selectbox), `library_level` (segmented: "NC I".."NC IV"), `library_page` (pagination), `clear_library_filters`, `start_<code>`; cards are bordered containers keyed `card_<code>`.

- [ ] **Step 1: Run the library tests to watch them fail**

Run: `.venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_portal.py -q -k "library"`
Expected: FAIL (page not registered).

- [ ] **Step 2: Create `frontend/app_pages/qualifications.py`**

```python
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
```

- [ ] **Step 3: Register the page in `frontend/portal_app.py`**

Add to the `PAGES` dict, between `"find"` and `"training"`:

```python
    "qualifications": st.Page("app_pages/qualifications.py", title="Qualifications", icon=":material/school:"),
```

- [ ] **Step 4: Run the tests until they pass**

Run: `.venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_portal.py frontend/tests/test_journey.py -q -k "not reports and not learner_pages_have and not progress and not continue and not expired and not report_date"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/app_pages/qualifications.py frontend/portal_app.py
git commit -m "Add the paged Qualifications library that starts the finder for a chosen qualification

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: My progress

**Files:**
- Create: `frontend/app_pages/progress.py`
- Modify: `frontend/portal_app.py` (register the page)
- Test: `frontend/tests/test_portal.py` (existing tests: `test_signing_in_from_progress_*`, `test_continue_card_*`, `test_expired_session_*`)

**Interfaces:**
- Consumes: `account.sign_in_prompt(label, key, return_to, primary)` from Task 2 (this page's prompt key is `progress_sign_in`, returning to `"progress"`); `session.handle_api_error`; `journey.ROUTE_TITLES`, `plain`; the `journey`/`finder_step`/`goal_query` keys of Task 1 (resuming a goal writes them through `session.go_to`). API methods: `my_pathways`, `sessions`, `readiness_checks`, `my_applications`, `goals`, `certifications`, `set_step_status(token, enrollment_id, step_id, status)`, `withdraw_application(token, application_id)`, `update_goal(token, goal_id, **fields)`, `add_goal(token, title, target_qualification_code)`, `add_certification(token, **fields)`.
- Produces: keys `card_continue`, `continue_mark_done`, `continue_goal`, `continue_start`, `progress_summary`, `progress_section` (segmented: Pathways, Applications, Readiness checks, Goals, Certificates, History), `step_<enrollment id>_<step id>` (checkboxes), `my_applications` (container), `withdraw_<application id>`, `achieve_<goal id>`, forms `add_goal` (keys `goal_title`, `goal_target`) and `add_certification` (keys `certificate_title`, `certificate_qualification`, `certificate_number`, `certificate_issued_on`). Session key `progress_notice`.

- [ ] **Step 1: Run the progress tests to watch them fail**

Run: `.venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_portal.py -q -k "progress or continue or expired"`
Expected: FAIL (page not registered).

- [ ] **Step 2: Create `frontend/app_pages/progress.py`**

```python
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
```

- [ ] **Step 3: Register the page in `frontend/portal_app.py`**

Add to the `PAGES` dict, after `"training"`:

```python
    "progress": st.Page("app_pages/progress.py", title="My progress", icon=":material/trending_up:"),
```

- [ ] **Step 4: Run the tests until they pass**

Run: `.venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_portal.py frontend/tests/test_journey.py -q -k "not reports and not learner_pages_have and not report_date"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/app_pages/progress.py frontend/portal_app.py
git commit -m "Add My progress with a continue-where-you-left-off card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Skills Bridge and Reports pages

**Files:**
- Create: `frontend/app_pages/skills_bridge.py`, `frontend/app_pages/reports.py`
- Modify: `frontend/skills_bridge_view.py` (import shared components from `portal.components`; show HTTP 429 as a warning)
- Modify: `frontend/portal_app.py` (register both pages; Reports only for administrators)
- Modify: `frontend/tests/test_skills_bridge_ui.py` (run against the portal page; fix the delivery-map expectation; add a 429 test)
- Test: `frontend/tests/test_portal.py` (existing: `test_reports_*`, `test_learner_pages_have_no_sign_in_form`, `test_report_date_*`)

**Interfaces:**
- Consumes: `show_skills_bridge(api, qualifications)` in `skills_bridge_view.py`; `portal.components.section_header`, `empty_state`; `session.is_admin()`, `token()`; `ApiClient.report(token, name, **params)`. The bridge API methods take `client_ip` as their last argument (`bridge_matches(skills, client_ip=None)`, `bridge_occupations(occupations, client_ip=None)`, `bridge_occupation(occupation_id, client_ip=None)`).
- Produces: report widget keys `report_from`, `report_to`, `report_qualification`; metrics labelled "Learners", "Saved recommendations", "Readiness checks", "Average readiness", "Verified certifications", "Open assessment seats".

Ruling recorded for this task: `test_delivery_map_contract_sorts_and_deduplicates_sites` expects the training site first, but `_delivery_sites` sorts nearest first and the assessment center is nearer (about 0.3 km against 0.5 km). The nearest-first sort is the contract, so the test expectation is wrong. Change it to `["assessment", "training"]` and `sites[1]["id"] == "training-1"`.

- [ ] **Step 1: Add the 429 test and port the Skills Bridge tests to the portal**

In `frontend/tests/test_skills_bridge_ui.py`:
- Replace `from frontend.tests.test_frontend_states import offline_api, new_app, page_text, run_page` with `from frontend.tests.test_portal import api, portal, text`.
- Change the `bridge` fixture's first parameter from `offline_api` to `api`. Give its fakes a `client_ip=None` last parameter: `def matches(self, skills, client_ip=None)`, `def occupations(self, terms, client_ip=None)`, `def details(self, occupation_id, client_ip=None)`.
- Delete `TAB`. Rewrite `submit` as:

```python
def submit(app, label):
    next(button for button in app.button if button.label == label).click()
    app.run()
    assert not app.exception
    return app
```

- Every test that built the app with `new_app(...)` + `run_page(app, TAB)` now uses `portal(page="skills_bridge")`; for a signed-in role use `portal("learner", "skills_bridge")`. Replace `page_text(app)` with `text(app)`. A test that took `offline_api` takes `api`; the catalog-free test sets `api["catalog"] = []` before `portal(...)`.
- Fix the delivery-map expectation per the ruling above.
- Add:

```python
def test_rate_limited_lookup_shows_a_wait_message(bridge, monkeypatch):
    message = "You've made many Skills Bridge lookups in the last minute. Please wait a moment and try again."

    def limited(self, skills, client_ip=None):
        raise ApiError(message, 429)

    monkeypatch.setattr(ApiClient, "bridge_matches", limited)
    app = search(portal(page="skills_bridge"), "JavaScript")
    assert any(warning.value == message for warning in app.warning)
    assert not app.error
```

- [ ] **Step 2: Run them to watch them fail**

Run: `.venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_skills_bridge_ui.py frontend/tests/test_portal.py -q -k "bridge or reports or learner_pages_have or report_date or delivery or extracted or occupation_lookup or rate_limited"`
Expected: FAIL (pages not registered, and 429 is shown as an error).

- [ ] **Step 3: Update `frontend/skills_bridge_view.py`**

- Replace `from presentation import empty_state, section_header` with `from portal.components import empty_state, section_header`.
- Add this helper below the imports' constants:

```python
def _show_lookup_error(error: ApiError) -> None:
    """Too many lookups is a wait, not a failure."""
    if error.status_code == 429:
        st.warning(error.message, icon=":material/hourglass_top:")
    else:
        st.error(error.message)
```

- In every `except ApiError as error:` block that calls `st.error(error.message)`, call `_show_lookup_error(error)` instead. Leave the other lines in those blocks as they are.

- [ ] **Step 4: Create `frontend/app_pages/skills_bridge.py`**

```python
"""Skills Bridge: occupations and skills connected to TESDA qualifications, from skills-bridge.ph."""
from portal import session
from skills_bridge_view import show_skills_bridge

show_skills_bridge(session.api(), session.catalog())
```

- [ ] **Step 5: Create `frontend/app_pages/reports.py`**

```python
"""Reports for administrators: counts and averages only, never individual learners."""
import streamlit as st

from api_client import ApiError
from portal import session

st.header("Reports")
st.caption("Pilot activity, qualification demand and training supply. Counts and averages only.")
token = session.token()
if not session.is_admin():
    st.info("Reports are for administrators.", icon=":material/lock:")
    st.stop()

start, end = st.columns(2)
date_from = start.date_input("From (optional)", value=None, key="report_from")
date_to = end.date_input("To (optional)", value=None, key="report_to")
if date_from and date_to and date_from > date_to:
    st.warning("Choose an end date on or after the start date.")
    st.stop()
period = {name: value.isoformat() for name, value in (("date_from", date_from), ("date_to", date_to)) if value}
try:
    overview = session.api().report(token, "overview", **period)
    funnel = session.api().report(token, "funnel", **period)
    supply = session.api().report(token, "supply")
    demand = session.api().report(token, "qualification-demand", **period)
except ApiError as error:
    session.handle_api_error(error)
    st.stop()

average = overview["average_readiness"]
with st.container(horizontal=True):
    st.metric("Learners", overview["learners"], border=True)
    st.metric("Saved recommendations", overview["recommendation_sessions"], border=True)
    st.metric("Readiness checks", overview["readiness_checks"], border=True)
with st.container(horizontal=True):
    st.metric("Average readiness", f"{average:g}%" if average is not None else "None yet", border=True,
              help="Average self-reported readiness in the selected period.")
    st.metric("Verified certifications", overview["certifications"]["verified"], border=True)
    st.metric("Open assessment seats", sum(region["open_seats"] for region in supply), border=True,
              help="Seats open now across all regions, whatever the date range.")

with st.container(border=True, key="card_report_journey"):
    st.subheader("Learner journey")
    st.caption("Learners who reached each stage in the selected period.")
    journey = {"Stage": ["Registered", "Saved a recommendation", "Checked readiness", "Applied for assessment",
                         "Certified"],
               "Learners": [funnel["registered"], funnel["saved_a_recommendation"], funnel["checked_readiness"],
                            funnel["applied_for_assessment"], funnel["certified"]]}
    if any(journey["Learners"]):
        st.bar_chart(journey, x="Stage", y="Learners", horizontal=True, sort=False, height=260,
                     alt="Learners at each stage, from registration to certification.")
    else:
        st.caption("No learner activity in this period. Try a wider date range.")

st.subheader("Demand by qualification")
if demand:
    st.dataframe([{"Qualification": row["qualification"]["name"], "Top match": row["top_match"],
                   "Chosen": row["chosen"], "Readiness checks": row["readiness_checks"],
                   "Average readiness": row["average_readiness"], "Applications": row["assessment_applications"],
                   "Competent": row["competent"], "Certified": row["certified"]} for row in demand],
                 hide_index=True, alt="Qualification demand and outcomes",
                 column_config={"Average readiness": st.column_config.ProgressColumn(min_value=0, max_value=100,
                                                                                     format="%d%%")})
else:
    st.caption("No qualification activity in this period yet.")

st.subheader("Skill gaps")
names = {item["code"]: item["name"] for item in session.catalog()}
if names:
    code = st.selectbox("Qualification", list(names), format_func=names.get, key="report_qualification")
    try:
        gaps = session.api().report(token, "skill-gaps", qualification_code=code, **period)
    except ApiError as error:
        session.handle_api_error(error)
        gaps = []
    st.caption("Share of answers that weren't \"Confident\". High rates show where training is needed.")
    if gaps:
        st.dataframe([{"Skill": f"{gap['position']}. {gap['name']}", "Answers": gap["answers"],
                       "Gap rate": None if gap["gap_rate"] is None else f"{gap['gap_rate']:.0%}"} for gap in gaps],
                     hide_index=True, alt="Self-reported skill gaps by competency")
    else:
        st.caption("No readiness answers for this qualification in the selected period.")

st.subheader("Training and assessment supply by region")
if supply:
    st.dataframe([{"Region": row["region"], "Providers": row["training_providers"],
                   "Programs": row["training_programs"], "Upcoming assessments": row["upcoming_assessments"],
                   "Open seats": row["open_seats"]} for row in supply],
                 hide_index=True, alt="Training providers, programs and assessment seats by region")
else:
    st.caption("No training or assessment supply is listed yet.")
```

- [ ] **Step 6: Register both pages in `frontend/portal_app.py`**

The `PAGES` block becomes:

```python
PAGES = {
    "find": st.Page("app_pages/find.py", title="Find my path", icon=":material/route:", default=True),
    "qualifications": st.Page("app_pages/qualifications.py", title="Qualifications", icon=":material/school:"),
    "training": st.Page("app_pages/training.py", title="Training & assessment", icon=":material/location_on:"),
    "progress": st.Page("app_pages/progress.py", title="My progress", icon=":material/trending_up:"),
    "skills_bridge": st.Page("app_pages/skills_bridge.py", title="Skills Bridge", icon=":material/hub:"),
}
if session.is_admin():
    PAGES["reports"] = st.Page("app_pages/reports.py", title="Reports", icon=":material/insights:")
```

- [ ] **Step 7: Run every database-free frontend test until all pass**

Run: `.venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_portal.py frontend/tests/test_journey.py frontend/tests/test_api_client.py frontend/tests/test_skills_bridge_ui.py -q`
Expected: PASS, with no test deselected.

- [ ] **Step 8: Commit**

```bash
git add frontend/app_pages/skills_bridge.py frontend/app_pages/reports.py frontend/skills_bridge_view.py frontend/portal_app.py frontend/tests/test_skills_bridge_ui.py
git commit -m "Add Skills Bridge and administrator Reports pages to the portal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Switch the app to the portal and rewrite the end-to-end tests

**Files:**
- Replace: `frontend/app.py` with the contents of `frontend/portal_app.py`, then delete `frontend/portal_app.py` (`git rm`)
- Replace: `frontend/.streamlit/config.toml` (whole file, below)
- Modify: `frontend/Dockerfile`
- Delete: `frontend/presentation.py` (untracked: plain delete), `frontend/styles.css` (`git rm`), `frontend/tests/test_frontend_states.py` (untracked), `frontend/tests/fixtures/` (untracked)
- Modify: `frontend/tests/test_portal.py` (`APP_FILE` → `app.py`; the old docstring path stays valid)
- Replace: `frontend/tests/test_ui.py` (whole file, below)

**Interfaces:**
- Consumes: everything from Tasks 1-6. Fixtures `live_api` and `training_data` from `frontend/tests/conftest.py` (`training_data` returns `{"schedule": {...}}` with a 10-seat SMAW-NC-II assessment in Manila, plus programs "SMAW NC II Manila batch" and "SMAW NC II Cebu batch", and creates admin `admin@example.com` / `correct horse battery`). The test catalog in `backend/tests/seed/qualifications.json` has five qualifications. SMAW-NC-II has competency 1 (Basic) and 2-6 (Core).
- Produces: `frontend/app.py` is the portal's entry file.

The database-backed run in Step 5 rebuilds the shared `tesda_track_test` schema. Run it only if your dispatch message says the database is reserved for you. Otherwise skip Step 5 and report "live tests not run".

- [ ] **Step 1: Swap the entry file**

```bash
cp frontend/portal_app.py frontend/app.py
git rm -q frontend/portal_app.py
sed -i 's|"portal_app.py"|"app.py"|' frontend/tests/test_portal.py
```

In the new `frontend/app.py`, change the docstring to `"""TESDA Track learner portal: entry script with top navigation. Each page lives in app_pages/."""`.

- [ ] **Step 2: Replace `frontend/.streamlit/config.toml`**

```toml
# TESDA Track learner portal theme.
# Navy from TESDA's identity, with "safety amber" (the color of trade workwear) as the one accent.
# Fonts are served from frontend/static so learners' browsers never contact a font CDN.

[server]
enableStaticServing = true

[client]
toolbarMode = "minimal"

[[theme.fontFaces]]
family = "Figtree"
url = "app/static/fonts/Figtree-latin.woff2"
weight = "400 800"

[[theme.fontFaces]]
family = "Bricolage Grotesque"
url = "app/static/fonts/BricolageGrotesque-latin.woff2"
weight = "400 800"

[theme]
base = "light"
primaryColor = "#1B3D8F"
backgroundColor = "#FFFFFF"
secondaryBackgroundColor = "#F2F5FA"
textColor = "#16213A"
linkColor = "#1B3D8F"
linkUnderline = false
borderColor = "#DCE3EE"
showWidgetBorder = true
showSidebarBorder = false
baseRadius = "12px"
buttonRadius = "full"
font = "Figtree, 'Segoe UI', system-ui, sans-serif"
headingFont = "'Bricolage Grotesque', Figtree, 'Segoe UI', sans-serif"
codeFont = "Consolas, 'Courier New', monospace"
baseFontSize = 16
baseFontWeight = 400
headingFontSizes = ["2.4rem", "1.6rem", "1.25rem", "1.1rem", "1rem", "0.9rem"]
headingFontWeights = [700, 700, 650, 600, 600, 600]
codeFontSize = "0.875rem"
codeBackgroundColor = "#F2F5FA"
blueColor = "#1B3D8F"
blueBackgroundColor = "#E6ECF8"
blueTextColor = "#1B3D8F"
yellowColor = "#E8A800"
yellowBackgroundColor = "#FFF3C4"
yellowTextColor = "#6E4E00"
orangeColor = "#C2610C"
greenColor = "#127A55"
greenBackgroundColor = "#DFF4EA"
greenTextColor = "#0C5E41"
redColor = "#C23048"
redBackgroundColor = "#FCE9EC"
redTextColor = "#96202F"
violetColor = "#6448B8"
grayColor = "#5E6B82"
grayBackgroundColor = "#EEF1F6"
grayTextColor = "#4A5568"
dataframeBorderColor = "#E3E8F1"
dataframeHeaderBackgroundColor = "#F2F5FA"
dataframeHeaderTextColor = "#16213A"
chartCategoricalColors = ["#1B3D8F", "#E8A800", "#127A55", "#6448B8", "#C23048", "#5E6B82"]
```

- [ ] **Step 3: Update `frontend/Dockerfile`**

Replace the line `COPY app.py api_client.py styles.css ./` with:

```dockerfile
COPY app.py api_client.py skills_bridge_view.py ./
COPY app_pages ./app_pages
COPY portal ./portal
COPY assets ./assets
COPY static ./static
```

- [ ] **Step 4: Delete the old UI files and replace `frontend/tests/test_ui.py`**

```bash
rm -f frontend/presentation.py frontend/tests/test_frontend_states.py
rm -rf frontend/tests/fixtures
git rm -q frontend/styles.css
```

New `frontend/tests/test_ui.py`:

```python
"""End-to-end: the portal driven by AppTest against the real API over HTTP. Uses the test database."""
from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

APP_FILE = Path(__file__).resolve().parents[1] / "app.py"
PAGE = {name: f"app_pages/{name}.py" for name in ("find", "qualifications", "training", "progress", "reports",
                                                   "account")}
PASSWORD = "correct horse battery"


@pytest.fixture
def ui(live_api):
    app = AppTest.from_file(str(APP_FILE), default_timeout=30).run()
    assert not app.exception
    return app


def press(app, key):
    app.button(key=key).click().run()
    assert not app.exception
    return app


def open_page(app, name):
    app.switch_page(PAGE[name]).run()
    assert not app.exception
    return app


def text(app):
    return "\n".join(element.value for kind in ("markdown", "caption", "info", "warning", "error", "success",
                                                "subheader", "header", "title")
                     for element in getattr(app, kind))


def create_account(app, email="juan@example.com"):
    open_page(app, "account")
    app.button_group(key="account_mode").set_value("Create account").run()
    app.text_input(key="register_name").set_value("Juan Dela Cruz")
    app.text_input(key="register_email").set_value(email)
    app.text_input(key="register_password").set_value(PASSWORD)
    app.checkbox(key="register_consent").check()
    press(app, "register_submit")
    assert app.session_state["auth"]["email"] == email


def sign_out(app):
    open_page(app, "account")
    return press(app, "account_sign_out")


def sign_in(app, email, password=PASSWORD):
    open_page(app, "account")
    app.text_input(key="signin_email").set_value(email)
    app.text_input(key="signin_password").set_value(password)
    return press(app, "signin_submit")


def welder_pathway(app):
    open_page(app, "find")
    app.button_group(key="goal_example").set_value("Become a welder").run()
    press(app, "find_matches")
    assert app.button(key="choose_SMAW-NC-II").label == "Chosen"
    app.button_group(key="finder_experience").set_value("More than 3 years").run()
    app.button_group(key="finder_certification").set_value("No").run()
    press(app, "to_pathway")
    assert "Check your readiness, then get assessed" in text(app)
    assert "Turn your experience into a certificate" in text(app)
    return app


def rate_welding(app):
    press(app, "to_readiness")
    app.button_group(key="answer_SMAW-NC-II_1").set_value("Confident").run()
    press(app, "readiness_next")
    for competency, answer in ((2, "Confident"), (3, "Confident"), (4, "Some experience"),
                               (5, "Some experience"), (6, "Some experience")):
        app.button_group(key=f"answer_SMAW-NC-II_{competency}").set_value(answer).run()
    return press(app, "see_results")


def test_guided_finder_scores_readiness_with_the_real_api(ui):
    rate_welding(welder_pathway(ui))
    assert [(metric.label, metric.value) for metric in ui.metric] == [("Your readiness", "75%")]
    assert "Moderate Readiness" in text(ui)


def test_signed_in_results_are_saved_to_progress(ui):
    create_account(ui)
    rate_welding(welder_pathway(ui))
    open_page(ui, "progress")
    ui.button_group(key="progress_section").set_value("Readiness checks").run()
    checks = ui.dataframe[0].value
    assert list(checks["Score"]) == [75]
    assert list(checks["Qualification"]) == ["Shielded Metal Arc Welding (SMAW) NC II"]
    ui.button_group(key="progress_section").set_value("History").run()
    assert "I want to be a welder" in text(ui)
    sign_out(ui)
    assert "auth" not in ui.session_state


def test_wrong_password_shows_the_apis_message(ui):
    create_account(ui)
    sign_out(ui)
    sign_in(ui, "juan@example.com", "not the password")
    assert any(error.value == "Incorrect email or password." for error in ui.error)


def test_registration_requires_consent(ui):
    open_page(ui, "account")
    ui.button_group(key="account_mode").set_value("Create account").run()
    ui.text_input(key="register_name").set_value("Juan Dela Cruz")
    ui.text_input(key="register_email").set_value("juan@example.com")
    ui.text_input(key="register_password").set_value(PASSWORD)
    press(ui, "register_submit")
    assert any("privacy notice" in error.value for error in ui.error)
    assert "auth" not in ui.session_state


def test_learner_follows_the_pathway_and_ticks_off_a_step(ui):
    create_account(ui)
    welder_pathway(ui)
    press(ui, "follow_pathway")
    assert any("My progress" in success.value for success in ui.success)
    open_page(ui, "progress")
    assert "Complete the readiness check" in text(ui) or "Next:" in text(ui)
    press(ui, "continue_mark_done")
    assert "25% done" in text(ui)


def test_training_ranks_nearest_first_and_learner_applies(ui, training_data):
    create_account(ui)
    open_page(ui, "training")
    ui.selectbox(key="training_qualification").select("SMAW-NC-II").run()
    ui.selectbox(key="training_region").select("NCR").run()
    titles = [node.value for node in ui.container(key="program_results").markdown if node.value.startswith("**")]
    assert titles == ["**SMAW NC II Manila batch**", "**SMAW NC II Cebu batch**"], "nearest first"
    ui.button_group(key="training_view").set_value("Assessment schedules").run()
    press(ui, f"apply_{training_data['schedule']['id']}")
    assert any("Application sent" in success.value for success in ui.success)
    open_page(ui, "progress")
    ui.button_group(key="progress_section").set_value("Applications").run()
    applications = "\n".join(node.value for node in ui.container(key="my_applications").markdown)
    assert "Pending" in applications
    withdraw = next(button.key for button in ui.button if str(button.key).startswith("withdraw_"))
    press(ui, withdraw)
    applications = "\n".join(node.value for node in ui.container(key="my_applications").markdown)
    assert "Withdrawn" in applications


def test_library_lists_the_catalog_from_the_api(ui):
    open_page(ui, "qualifications")
    cards = [node.key for node in ui.get("flex_container") if str(node.key).startswith("card_")]
    assert len(cards) == 5 and "card_COOKERY-NC-II" in cards


def test_unreachable_api_shows_an_error_instead_of_crashing(monkeypatch):
    monkeypatch.setenv("API_BASE_URL", "http://127.0.0.1:1")
    app = AppTest.from_file(str(APP_FILE), default_timeout=30).run()
    assert not app.exception
    assert any("can't reach" in error.value for error in app.error)


def test_reports_are_for_administrators_only(ui, training_data):
    create_account(ui)
    with pytest.raises(ValueError):
        ui.switch_page(PAGE["reports"])
    sign_out(ui)
    sign_in(ui, "admin@example.com")
    open_page(ui, "reports")
    metrics = {metric.label: metric.value for metric in ui.metric}
    assert metrics["Learners"] == "2", "the administrator and the learner who signed up"
    assert metrics["Open assessment seats"] == "10"
    supply = ui.dataframe[-1].value
    assert list(supply.loc[supply["Region"] == "National Capital Region", "Programs"]) == [1]
```

The badge on an application shows `status.replace("_", " ").capitalize()` ("Pending", "Withdrawn"). In AppTest a badge is a markdown node, so the `my_applications` markdown includes it.

- [ ] **Step 5: Run the tests**

Database-free (always):
Run: `.venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_portal.py frontend/tests/test_journey.py frontend/tests/test_api_client.py frontend/tests/test_skills_bridge_ui.py -q`
Expected: PASS.

Database-backed (only when the dispatch says the database is reserved for you):
Run: `.venv/Scripts/python -m pytest frontend/tests/test_ui.py -q`
Expected: PASS. If an assertion depends on real API wording that differs (a level label, a route), read the API's actual response and fix the test's literal to match it, explaining in the report.

- [ ] **Step 6: Commit**

```bash
git add frontend/app.py frontend/.streamlit/config.toml frontend/Dockerfile frontend/tests/test_portal.py frontend/tests/test_ui.py
git add -u frontend/portal_app.py frontend/styles.css
git commit -m "Switch the learner app to the new top-navigation portal

The guided finder, paged library, training page, My progress, Skills Bridge
and administrator reports replace the single tabbed page. Theme and fonts are
native and self-hosted; the old CSS and HTML presentation layer is removed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
