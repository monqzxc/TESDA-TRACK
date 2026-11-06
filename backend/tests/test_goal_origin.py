"""Where a goal came from, typed or a tapped TSP profile suggestion: counted per day, kept on sessions and answers,
and compared in the recommendation analytics. Counts only; nothing a learner typed."""
import uuid
from datetime import date, datetime, timedelta

import pytest
from sqlmodel import select

from tesda_track.models import FunnelDailyStat, Qualification, RecommendationFeedback, RecommendationSession
from tesda_track.services.match_stats import PHILIPPINE_TIME

pytestmark = pytest.mark.usefixtures("clean_match_stats")
GOAL = "I want to be a welder."
ANALYTICS = "/api/v1/admin/reports/recommendation-analytics"


def counts(engine) -> dict:
    """The committed counters, read on their own connection like the counters write them."""
    from sqlmodel import Session

    with Session(engine) as fresh:
        return {(row.origin, row.event): row.count for row in fresh.exec(select(FunnelDailyStat))}


def test_suggestions_are_off_unless_the_server_turns_them_on(client, monkeypatch, engine):
    from tesda_track.config import Settings, get_settings

    assert Settings.model_fields["tsp_suggestions_enabled"].default is False
    monkeypatch.setattr(get_settings(), "tsp_suggestions_enabled", False)
    assert client.post("/api/v1/analysis/suggestions", json={"profile": {"existing_skills": ["welding"]}}).status_code == 404
    assert client.get("/api/v1/client-config").json()["tsp_suggestions"] is False
    assert counts(engine) == {}


def test_counters_keep_counts_only():
    assert set(FunnelDailyStat.model_fields) == {"date", "origin", "event", "count"}


def test_only_webview_goals_count_and_by_where_they_came_from(client, engine):
    """The webview sends an origin; the main finder doesn't, and isn't counted, so the counters are the webview's."""
    for origin in (None, "typed", "typed", "suggestion"):
        body = {"query": GOAL} | ({"origin": origin} if origin else {})
        assert client.post("/api/v1/analysis/goal", json=body).status_code == 200
    assert counts(engine) == {("typed", "goal_started"): 2, ("suggestion", "goal_started"): 1}


def test_an_unknown_origin_is_refused(client):
    assert client.post("/api/v1/analysis/goal", json={"query": GOAL, "origin": "partner"}).status_code == 422


def test_suggestion_lists_count_as_shown_or_empty_and_skill_less_profiles_not_at_all(client, engine):
    client.post("/api/v1/analysis/suggestions", json={"profile": {"existing_skills": ["welding"]}})
    client.post("/api/v1/analysis/suggestions", json={"profile": {"existing_skills": ["volleyball"]}})
    client.post("/api/v1/analysis/suggestions", json={"profile": {"experience_years": 2}})
    assert counts(engine) == {("suggestion", "suggestions_shown"): 1, ("suggestion", "suggestions_empty"): 1}


def test_readiness_counts_by_origin(client, engine, competency_ids):
    answers = {str(i): "confident" for i in competency_ids("SMAW-NC-II")}
    body = {"qualification_code": "SMAW-NC-II", "answers": answers}
    client.post("/api/v1/analysis/readiness", json=body | {"origin": "suggestion"})
    client.post("/api/v1/analysis/readiness", json=body | {"origin": "typed"})
    client.post("/api/v1/analysis/readiness", json=body)
    assert counts(engine) == {("suggestion", "readiness_checked"): 1, ("typed", "readiness_checked"): 1}


def test_a_saved_session_keeps_its_origin_and_a_retry_is_not_counted_twice(client, engine, session, learner):
    request = {"query": GOAL, "origin": "suggestion", "request_id": str(uuid.uuid4())}
    first = client.post("/api/v1/me/recommendations", headers=learner, json=request)
    again = client.post("/api/v1/me/recommendations", headers=learner, json=request)
    assert first.status_code == 201 and again.json()["id"] == first.json()["id"]
    assert first.json()["origin"] == "suggestion"
    assert session.get(RecommendationSession, uuid.UUID(first.json()["id"])).origin == "suggestion"
    assert counts(engine) == {("suggestion", "goal_started"): 1}


def test_feedback_keeps_the_origin(client, session, competency_ids):
    profile = client.post("/api/v1/analysis/goal", json={"query": GOAL}).json()["profile"]
    answers = {str(i): "confident" for i in competency_ids("SMAW-NC-II")}
    response = client.post("/api/v1/feedback/recommendations", json={
        "query": GOAL, "profile": profile, "qualification_code": "SMAW-NC-II", "answers": answers,
        "satisfied": True, "origin": "suggestion"})
    assert response.status_code == 201
    [row] = session.exec(select(RecommendationFeedback)).all()
    assert row.origin == "suggestion"


def test_analytics_compare_origins_and_how_often_suggestions_are_taken(client, admin, session):
    today = datetime.now(PHILIPPINE_TIME).date()
    for origin, event, n in [("suggestion", "suggestions_shown", 10), ("suggestion", "suggestions_empty", 3),
                             ("suggestion", "goal_started", 4), ("suggestion", "readiness_checked", 2),
                             ("typed", "goal_started", 20), ("typed", "readiness_checked", 15)]:
        session.add(FunnelDailyStat(date=today, origin=origin, event=event, count=n))
    # Outside the period: not counted.
    session.add(FunnelDailyStat(date=date(2001, 1, 1), origin="typed", event="goal_started", count=99))
    smaw = session.exec(select(Qualification).where(Qualification.code == "SMAW-NC-II")).one()
    for origin, satisfied in [("suggestion", True), ("suggestion", False), ("typed", True), (None, True)]:
        session.add(RecommendationFeedback(
            satisfied=satisfied, qualification_id=smaw.id, query_hash="x" * 64, signed_in=False, origin=origin,
            intent="unknown", match_count=1, rank=1, score=50, keyword=0.5, readiness_score=0.5,
            readiness_level="ready"))
    session.flush()
    period = {"date_from": (today - timedelta(days=7)).isoformat(), "date_to": today.isoformat()}
    body = client.get(ANALYTICS, headers=admin, params=period).json()
    rows = {row["origin"]: row for row in body["goal_origins"]}
    assert rows["suggestion"] == {
        "origin": "suggestion", "goals_started": 4, "readiness_checked": 2, "readiness_rate": 0.5,
        "saved_sessions": 0, "feedback_answers": 2, "accepted": 1, "acceptance_rate": 0.5}
    assert (rows["typed"]["goals_started"], rows["typed"]["readiness_rate"]) == (20, 0.75)
    assert rows["not_recorded"]["feedback_answers"] == 1 and rows["not_recorded"]["goals_started"] == 0
    assert body["suggestions"] == {"lists_shown": 10, "lists_empty": 3, "taken": 4, "take_rate": 0.4}
