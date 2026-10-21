"""Recommendation analytics use response counts, distinct session cohorts, and gated trend estimates."""
from datetime import date, datetime, time, timedelta, timezone

import pytest
from sqlmodel import select

from tesda_track.models import Learner, Qualification, RecommendationFeedback, RecommendationSession
from tesda_track.services.match_stats import PHILIPPINE_TIME

PATH = "/api/v1/admin/reports/recommendation-analytics"
END = date(2020, 6, 30)
RECENT = END - timedelta(days=29)
PREVIOUS = RECENT - timedelta(days=30)


def stamp(day):
    return datetime.combine(day, time(12), PHILIPPINE_TIME)


def qualifications(session):
    return {q.code: q for q in session.exec(select(Qualification))}


def feedback(session, qid, *, yes=True, reason=None, model=None, intent="explore", rank=1, day=END):
    row = RecommendationFeedback(
        qualification_id=qid, satisfied=yes, reason=reason, query_hash="a" * 64, signed_in=False,
        intent=intent, match_count=3, rank=rank, score=80, keyword=0.8, readiness_score=50,
        readiness_level="needs_training", model=model, created_at=stamp(day))
    session.add(row)
    return row


def saved(session, qid, learner_id, *, day=END):
    row = RecommendationSession(
        learner_id=learner_id, query="Private learner goal", analysis_source="rules", analysis_profile={},
        profile={}, matches=[], qualification_id=qid, created_at=stamp(day))
    session.add(row)
    return row


def people(session, count):
    rows = [Learner(email=f"analytics-{i}@example.com", full_name=f"Private learner {i}", password_hash="unused",
                    privacy_consent_at=stamp(PREVIOUS)) for i in range(count)]
    session.add_all(rows)
    session.flush()
    return [row.id for row in rows]


def report(client, admin, **dates):
    response = client.get(PATH, headers=admin, params=dates)
    assert response.status_code == 200, response.text
    return response.json()


def by_code(rows):
    return {row["qualification"]["code"]: row for row in rows}


def enough_demand(session, qid):
    learners = people(session, 15)
    for i, person in enumerate(learners[:5]):
        saved(session, qid, person, day=PREVIOUS + timedelta(days=i * 5))
    for i, person in enumerate(learners[5:]):
        saved(session, qid, person, day=RECENT + timedelta(days=i))
    session.flush()
    return learners


def test_analytics_require_reports_permission(client, learner):
    assert client.get(PATH).status_code == 401
    assert client.get(PATH, headers=learner).status_code == 403


def test_empty_report_has_no_invented_percentages_or_projections(client, admin):
    body = report(client, admin, date_to=END)
    assert (body["feedback_answers"], body["accepted"], body["rejected"], body["acceptance_rate"]) == (0, 0, 0, None)
    assert body["qualification_groups"] == body["improvement_priorities"] == body["demand"]["qualifications"] == []
    demand = body["demand"]
    assert demand["recent_from"] == "2020-06-01" and demand["recent_to"] == "2020-06-30"
    assert demand["previous_from"] == "2020-05-02" and demand["previous_to"] == "2020-05-31"
    assert demand["forecast_from"] == "2020-07-01" and demand["forecast_to"] == "2020-07-30"


def test_groups_count_feedback_answers_separately_from_distinct_learner_choices(client, admin, session):
    catalog = qualifications(session)
    smaw, cookery = catalog["SMAW-NC-II"], catalog["COOKERY-NC-II"]
    [person] = people(session, 1)
    for _ in range(3):
        saved(session, smaw.id, person)
    saved(session, cookery.id, person)
    feedback(session, smaw.id)
    feedback(session, smaw.id)
    feedback(session, smaw.id, yes=False, reason="wrong_qualification")
    feedback(session, cookery.id, yes=False)
    session.flush()
    body = report(client, admin, date_to=END)
    assert (body["feedback_answers"], body["accepted"], body["rejected"], body["acceptance_rate"]) == (4, 2, 2, 0.5)
    groups = by_code(body["qualification_groups"])
    assert (groups[smaw.code]["chosen_learners"], groups[smaw.code]["accepted"],
            groups[smaw.code]["feedback_answers"]) == (1, 2, 3)
    assert groups[smaw.code]["acceptance_rate"] == 0.6667
    assert groups[cookery.code]["chosen_learners"] == 1
    assert groups[cookery.code]["acceptance_rate"] == 0
    encoded = str(body)
    assert "Private learner" not in encoded and "query_hash" not in encoded and str(person) not in encoded


def test_choice_without_feedback_has_null_satisfaction(client, admin, session):
    [person] = people(session, 1)
    qid = qualifications(session)["SMAW-NC-II"].id
    saved(session, qid, person)
    session.flush()
    [group] = report(client, admin, date_to=END)["qualification_groups"]
    assert group["chosen_learners"] == 1 and group["feedback_answers"] == 0
    assert group["acceptance_rate"] is None


def test_archived_qualifications_keep_their_historical_signals(client, admin, session):
    qualification = qualifications(session)["SMAW-NC-II"]
    feedback(session, qualification.id)
    qualification.is_active = False
    session.flush()
    [group] = report(client, admin, date_to=END)["qualification_groups"]
    assert group["qualification"]["code"] == "SMAW-NC-II"


def test_dates_use_inclusive_philippine_days_and_validate_order(client, admin, session):
    qid = qualifications(session)["SMAW-NC-II"].id
    before = feedback(session, qid)
    before.created_at = datetime(2020, 5, 31, 15, 59, tzinfo=timezone.utc)
    inside = feedback(session, qid, yes=False)
    inside.created_at = datetime(2020, 5, 31, 16, 0, tzinfo=timezone.utc)
    after = feedback(session, qid)
    after.created_at = datetime(2020, 6, 1, 16, 0, tzinfo=timezone.utc)
    session.flush()
    body = report(client, admin, date_from="2020-06-01", date_to="2020-06-01")
    assert (body["feedback_answers"], body["accepted"], body["rejected"]) == (1, 0, 1)
    assert client.get(PATH, headers=admin, params={"date_from": "2020-06-02", "date_to": "2020-06-01"}).status_code == 422


def test_demand_projects_equal_complete_windows_and_deduplicates_repeats(client, admin, session):
    qid = qualifications(session)["SMAW-NC-II"].id
    learners = enough_demand(session, qid)
    for _ in range(4):
        saved(session, qid, learners[-1], day=RECENT)
    # The same person can express demand in both windows, once in each.
    saved(session, qid, learners[0], day=RECENT)
    session.flush()
    [row] = report(client, admin, date_to=END)["demand"]["qualifications"]
    assert (row["recent_learners"], row["previous_learners"], row["change_rate"]) == (11, 5, 1.2)
    assert (row["status"], row["projected_learners"]) == ("available", 17)


def test_demand_with_short_selected_history_withholds_estimate(client, admin, session):
    qid = qualifications(session)["SMAW-NC-II"].id
    enough_demand(session, qid)
    [row] = report(client, admin, date_from="2020-05-03", date_to=END)["demand"]["qualifications"]
    assert row["status"] == "insufficient_history" and row["projected_learners"] is None
    assert row["previous_learners"] == 4


def test_demand_with_low_volume_withholds_estimate_and_zero_denominator_rate(client, admin, session):
    [person] = people(session, 1)
    qid = qualifications(session)["SMAW-NC-II"].id
    saved(session, qid, person, day=PREVIOUS - timedelta(days=1))
    saved(session, qid, person, day=RECENT)
    session.flush()
    [row] = report(client, admin, date_to=END)["demand"]["qualifications"]
    assert row["status"] == "insufficient_volume" and row["projected_learners"] is None
    assert row["recent_learners"] == 1 and row["previous_learners"] == 0 and row["change_rate"] is None


def test_declining_demand_projection_never_goes_negative(client, admin, session):
    qid = qualifications(session)["SMAW-NC-II"].id
    learners = people(session, 25)
    for i, person in enumerate(learners):
        saved(session, qid, person, day=PREVIOUS + timedelta(days=i))
    for i, person in enumerate(learners[:10]):
        saved(session, qid, person, day=RECENT + timedelta(days=i))
    session.flush()
    [row] = report(client, admin, date_to=END)["demand"]["qualifications"]
    assert row["status"] == "available" and row["projected_learners"] == 0
    assert row["change_rate"] == -0.6


def test_current_and_future_date_to_use_last_complete_day(client, admin):
    yesterday = datetime.now(PHILIPPINE_TIME).date() - timedelta(days=1)
    for requested in (None, date(2090, 1, 1)):
        body = report(client, admin, **({"date_to": requested} if requested else {}))
        assert body["demand"]["recent_to"] == yesterday.isoformat()


@pytest.mark.parametrize("date_to", ["0001-01-01", "0001-02-28", "9999-12-31"])
def test_unrepresentable_projection_date_ranges_are_rejected(client, admin, date_to):
    assert client.get(PATH, headers=admin, params={"date_to": date_to}).status_code == 422


def test_training_priorities_group_model_and_intent_and_route_reasons(client, admin, session):
    qid = qualifications(session)["SMAW-NC-II"].id
    for i in range(10):
        feedback(session, qid, yes=i >= 4, reason="wrong_qualification" if i < 4 else None,
                 model="matching-v4", intent="career_change", rank=2)
    for _ in range(5):
        feedback(session, qid, yes=False, reason="readiness_off", model="matching-v4", intent="assessment")
        feedback(session, qid, yes=False, reason="pathway_not_helpful", model=None, intent="training")
    feedback(session, qid, yes=False, model="matching-v3", intent="explore", rank=None)
    session.flush()
    body = report(client, admin, date_to=END)
    rows = {(row["model"], row["intent"]): row for row in body["improvement_priorities"]}
    high = rows[("matching-v4", "career_change")]
    assert high["priority"] == "high" and high["wrong_qualification"] == 4 and high["ranking_mismatches"] == 10
    assert high["acceptance_rate"] == 0.6
    assert "labeled goal/qualification pairs" in high["recommendation"]
    assert "readiness questions and scoring" in rows[("matching-v4", "assessment")]["recommendation"]
    assert "pathway rules and guidance" in rows[(None, "training")]["recommendation"]
    sparse = rows[("matching-v3", "explore")]
    assert sparse["priority"] == "collect_feedback" and sparse["no_reason"] == 1
    assert body["improvement_priorities"][0] == high


def test_entirely_positive_well_sampled_segment_needs_no_corrective_priority(client, admin, session):
    qid = qualifications(session)["SMAW-NC-II"].id
    for _ in range(5):
        feedback(session, qid)
    session.flush()
    assert report(client, admin, date_to=END)["improvement_priorities"] == []
