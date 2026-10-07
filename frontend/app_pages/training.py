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
