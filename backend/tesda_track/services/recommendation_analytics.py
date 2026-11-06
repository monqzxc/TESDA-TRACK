"""Anonymous report aggregates for reviewing matching and planning learner demand.

Demand uses a session's creation cohort and its currently saved qualification. Selection timestamps are not stored,
so a later edit changes that cohort's counts. A projection is a simple trend heuristic, not a fitted demand model
or evidence of labor-market demand. No raw goals, hashes or learner IDs leave this service.
"""
from datetime import datetime, timedelta

from sqlalchemy import distinct, func, or_
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from tesda_track.models import FunnelDailyStat, Qualification, RecommendationFeedback, RecommendationSession
from tesda_track.schemas.recommendation_analytics import (
    DemandProjection, ImprovementPriority, OriginSignals, QualificationSignals, RecommendationAnalytics,
    RecommendationDemand, SuggestionSignals,
)
from tesda_track.schemas.reports import DateRange
from tesda_track.services import catalog
from tesda_track.services.match_stats import PHILIPPINE_TIME
from tesda_track.services.reports import _within

WINDOW_DAYS = 30
MINIMUM_RECENT = 10
MINIMUM_PREVIOUS = 5


def _rate(positive: int, total: int) -> float | None:
    return round(positive / total, 4) if total else None


def _advice(answers: int, wrong: int, readiness: int, pathway: int, mismatches: int) -> str:
    if answers < 5:
        return "Collect more feedback before selecting a model-training target."
    if wrong and wrong >= max(readiness, pathway):
        return "Review wrong-qualification cases and curate labeled goal/qualification pairs and hard negatives for matching."
    if readiness and readiness >= pathway:
        return "Review readiness questions and scoring with assessors before changing the matching model."
    if pathway:
        return "Review pathway rules and guidance content for this learner intent."
    if mismatches:
        return "Review lower-ranked and library choices; a different choice alone does not establish a ranking error."
    return "Collect reasons for negative feedback and monitor this segment before retraining."


def recommendation_analytics(session: Session, period: DateRange) -> RecommendationAnalytics:
    feedback = RecommendationFeedback
    negative = feedback.satisfied.is_(False)
    mismatch = or_(feedback.rank > 1, feedback.rank.is_(None) & (feedback.match_count > 0))
    segments = list(session.exec(select(
        feedback.qualification_id, feedback.model, feedback.intent, func.count(),
        func.count().filter(feedback.satisfied),
        func.count().filter(negative, feedback.reason == "wrong_qualification"),
        func.count().filter(negative, feedback.reason == "readiness_off"),
        func.count().filter(negative, feedback.reason == "pathway_not_helpful"),
        func.count().filter(negative, feedback.reason.is_(None)),
        func.count().filter(mismatch),
    ).where(*_within(feedback.created_at, period)).group_by(
        feedback.qualification_id, feedback.model, feedback.intent)))

    saved = RecommendationSession
    choices = {qid: people for qid, people in session.exec(
        select(saved.qualification_id, func.count(distinct(saved.learner_id)))
        .where(saved.qualification_id.is_not(None), *_within(saved.created_at, period))
        .group_by(saved.qualification_id))}

    # Use complete Philippine-time days; a partial current day must not depress the recent window.
    yesterday = datetime.now(PHILIPPINE_TIME).date() - timedelta(days=1)
    end = min(period.date_to, yesterday) if period.date_to else yesterday
    recent_from = end - timedelta(days=WINDOW_DAYS - 1)
    previous_to = recent_from - timedelta(days=1)
    previous_from = previous_to - timedelta(days=WINDOW_DAYS - 1)
    recent_conditions = _within(saved.created_at, DateRange(date_from=recent_from, date_to=end))
    previous_conditions = _within(saved.created_at, DateRange(date_from=previous_from, date_to=previous_to))
    observed = {qid: (recent, previous, first) for qid, recent, previous, first in session.exec(
        select(saved.qualification_id,
               func.count(distinct(saved.learner_id)).filter(*recent_conditions),
               func.count(distinct(saved.learner_id)).filter(*previous_conditions),
               func.min(saved.created_at))
        .where(saved.qualification_id.is_not(None), *_within(saved.created_at, period),
               *_within(saved.created_at, DateRange(date_to=end)))
        .group_by(saved.qualification_id))}

    ids = set(choices) | {segment[0] for segment in segments}
    qualifications = {q.id: catalog.summary(q) for q in session.exec(
        select(Qualification).where(Qualification.id.in_(ids)).options(selectinload(Qualification.sector)))}
    groups = {qid: {"feedback_answers": 0, "accepted": 0} for qid in ids}
    priorities = []
    for qid, model, intent, answers, accepted, wrong, readiness, pathway, no_reason, mismatches in segments:
        groups[qid]["feedback_answers"] += answers
        groups[qid]["accepted"] += accepted
        rejected = answers - accepted
        priority = "collect_feedback" if answers < 5 else "medium"
        if answers >= 10 and rejected >= 3 and rejected / answers >= 0.3:
            priority = "high"
        # Segments with five or more entirely positive answers do not need a corrective review.
        if rejected or mismatches or answers < 5:
            priorities.append(ImprovementPriority(
                qualification=qualifications[qid], model=model, intent=intent, feedback_answers=answers,
                accepted=accepted, rejected=rejected, acceptance_rate=_rate(accepted, answers),
                wrong_qualification=wrong, readiness_off=readiness, pathway_not_helpful=pathway,
                no_reason=no_reason, ranking_mismatches=mismatches, priority=priority,
                recommendation=_advice(answers, wrong, readiness, pathway, mismatches)))

    qualification_groups = []
    projections = []
    for qid in ids:
        answers, accepted = groups[qid]["feedback_answers"], groups[qid]["accepted"]
        qualification_groups.append(QualificationSignals(
            qualification=qualifications[qid], chosen_learners=choices.get(qid, 0), feedback_answers=answers,
            accepted=accepted, rejected=answers - accepted, acceptance_rate=_rate(accepted, answers)))
        recent, previous, first = observed.get(qid, (0, 0, None))
        full_history = (first is not None and first.astimezone(PHILIPPINE_TIME).date() <= previous_from
                        and (period.date_from is None or period.date_from <= previous_from))
        status = "available"
        if not full_history:
            status = "insufficient_history"
        elif recent < MINIMUM_RECENT or previous < MINIMUM_PREVIOUS:
            status = "insufficient_volume"
        projections.append(DemandProjection(
            qualification=qualifications[qid], recent_learners=recent, previous_learners=previous,
            change_rate=round((recent - previous) / previous, 4) if previous else None,
            projected_learners=max(0, 2 * recent - previous) if status == "available" else None,
            status=status))

    qualification_groups.sort(key=lambda row: (-row.accepted, -row.chosen_learners, row.qualification.name))
    projections.sort(key=lambda row: (-row.recent_learners, row.qualification.name))
    severity = {"high": 0, "medium": 1, "collect_feedback": 2}
    priorities.sort(key=lambda row: (severity[row.priority], -row.wrong_qualification, -row.rejected,
                                     -row.feedback_answers, row.qualification.name, row.model or "", row.intent))
    answers = sum(row.feedback_answers for row in qualification_groups)
    accepted = sum(row.accepted for row in qualification_groups)
    return RecommendationAnalytics(
        feedback_answers=answers, accepted=accepted, rejected=answers - accepted,
        acceptance_rate=_rate(accepted, answers), qualification_groups=qualification_groups,
        demand=RecommendationDemand(
            recent_from=recent_from, recent_to=end, previous_from=previous_from, previous_to=previous_to,
            forecast_from=end + timedelta(days=1), forecast_to=end + timedelta(days=WINDOW_DAYS),
            window_days=WINDOW_DAYS, minimum_recent_learners=MINIMUM_RECENT,
            minimum_previous_learners=MINIMUM_PREVIOUS, qualifications=projections),
        improvement_priorities=priorities, **_origins(session, period))


def _origins(session: Session, period: DateRange) -> dict:
    """TSP webview goals by where they came from (typed or a tapped suggestion), and how often suggestions were
    taken. Answers and sessions without an origin come from the main finder or from before it was recorded."""
    stat = FunnelDailyStat
    days = [stat.date >= period.date_from] if period.date_from else []
    days += [stat.date <= period.date_to] if period.date_to else []
    counted = {(origin, event): total for origin, event, total in session.exec(
        select(stat.origin, stat.event, func.sum(stat.count)).where(*days).group_by(stat.origin, stat.event))}
    feedback, saved = RecommendationFeedback, RecommendationSession
    answers = {origin or "not_recorded": (n, yes) for origin, n, yes in session.exec(
        select(feedback.origin, func.count(), func.count().filter(feedback.satisfied))
        .where(*_within(feedback.created_at, period)).group_by(feedback.origin))}
    sessions = {origin or "not_recorded": n for origin, n in session.exec(
        select(saved.origin, func.count()).where(*_within(saved.created_at, period)).group_by(saved.origin))}
    rows = []
    for origin in ("typed", "suggestion", "not_recorded"):
        started, checked = counted.get((origin, "goal_started"), 0), counted.get((origin, "readiness_checked"), 0)
        n, yes = answers.get(origin, (0, 0))
        if origin == "not_recorded" and not (n or sessions.get(origin)):
            continue
        rows.append(OriginSignals(origin=origin, goals_started=started, readiness_checked=checked,
                                  readiness_rate=_rate(checked, started), saved_sessions=sessions.get(origin, 0),
                                  feedback_answers=n, accepted=yes, acceptance_rate=_rate(yes, n)))
    shown = counted.get(("suggestion", "suggestions_shown"), 0)
    taken = counted.get(("suggestion", "goal_started"), 0)
    return {"goal_origins": rows,
            "suggestions": SuggestionSignals(lists_shown=shown,
                                             lists_empty=counted.get(("suggestion", "suggestions_empty"), 0),
                                             taken=taken, take_rate=_rate(taken, shown))}
