"""Rank current assessment schedules after authoritative service and learner checks.

Training budgets, delivery modes and intake dates are not assessment fee/date evidence.
Assessment logistics are explicit request fields; geographic preferences are shared.
"""
import uuid

from sqlmodel import Session, select

from tesda_track.config import get_settings
from tesda_track.errors import InvalidRequestError
from tesda_track.models import AssessmentApplication, Learner, RankingAudit, Region, utcnow
from tesda_track.schemas.assessment_ranking import AssessmentRanking, AssessmentRankingRequest, RankedAssessment, UnconfirmedAssessment
from tesda_track.schemas.delivery import NearbySearch
from tesda_track.schemas.learner_assessments import AssessmentAnswers, ScoreFactor
from tesda_track.services import assessments, catalog, learner_assessments, personalization, verification
from tesda_track.services.ranking import goal_fingerprint


def logistics(request, schedule):
    checks = []
    if request.maximum_fee is not None:
        checks.append(("fee", schedule.fee <= request.maximum_fee if schedule.fee is not None else None,
                       "Assessment fee is unknown."))
    if request.scheduled_after or request.scheduled_before:
        day = schedule.scheduled_at.astimezone(verification.PHILIPPINE_TIME).date()
        checks.append(("schedule", (not request.scheduled_after or day >= request.scheduled_after) and
                       (not request.scheduled_before or day <= request.scheduled_before),
                       "Assessment date is outside your selected window."))
    return checks


def rank(session: Session, request: AssessmentRankingRequest, learner: Learner | None,
         api_client_id: uuid.UUID | None = None) -> AssessmentRanking:
    settings = get_settings()
    answers, assessment_id = learner_assessments.resolve(session, learner, request)
    answers = answers or AssessmentAnswers(career_goal=request.goal)
    if not answers.career_goal and request.goal:
        answers = answers.model_copy(update={"career_goal": request.goal})
    qualification = catalog.get_active_qualification(session, request.qualification_code)
    item = catalog.catalog_item(qualification)
    alignment = personalization.alignment(answers, item)
    pref = answers.preferences
    near_lat, near_lon = request.near_lat, request.near_lon
    if request.region_code:
        region = session.get(Region, request.region_code)
        if region is None:
            raise InvalidRequestError("Unknown assessment region.")
        if near_lat is None:
            near_lat, near_lon = region.latitude, region.longitude
    elif near_lat is None:
        near_lat, near_lon = pref.near_lat, pref.near_lon
        if near_lat is None and pref.region_code:
            region = session.get(Region, pref.region_code)
            near_lat, near_lon = region.latitude, region.longitude
    if near_lat is not None:
        near_lat, near_lon = round(near_lat, 1), round(near_lon, 1)
    maximum_distance = request.maximum_distance_km if request.maximum_distance_km is not None else pref.maximum_distance_km
    if maximum_distance is not None and near_lat is None:
        raise InvalidRequestError("Maximum assessment distance requires a location.")
    radius = maximum_distance or settings.proximity_radius_km
    now = utcnow()
    evidence = verification.certificates(session, learner)
    # Pending applications do not reserve seats; repeat applications are still prevented.
    applications = {a.schedule_id: a.status for a in session.exec(select(AssessmentApplication).where(
        AssessmentApplication.learner_id == learner.id))} if learner else {}
    ranked, pending = [], []
    offset = 0
    while True:
        batch = assessments.search_schedules(session, NearbySearch(qualification_code=qualification.code,
            region_code=request.region_code, near_lat=near_lat, near_lon=near_lon, limit=100, offset=offset))
        for schedule, taken, distance in batch:
            if schedule.slots <= taken:
                continue
            record = verification.get(session, "assessment", schedule.center_id, qualification.id)
            status = verification.effective_status(record, now)
            day = schedule.scheduled_at.astimezone(verification.PHILIPPINE_TIME).date()
            eligible = verification.eligibility(record, evidence, now, day)
            available = verification.availability(schedule, now).status
            if status in ("expired", "unavailable") or eligible.status == "unsatisfied" or available == "unavailable":
                continue
            reasons = []
            if maximum_distance is not None:
                if distance is None:
                    reasons.append("Maximum distance cannot be checked without center coordinates.")
                elif distance > maximum_distance:
                    continue
            checks = logistics(request, schedule)
            mandatory = {"fee": request.fee_is_mandatory, "schedule": request.schedule_is_mandatory}
            if any(value is False and mandatory[key] for key, value, _ in checks):
                continue
            reasons.extend(reason for key, value, reason in checks if value is None and mandatory[key])
            if status != "verified":
                reasons.append("This center's authority to assess this qualification requires verification.")
            if not verification.authorization_covers(record, schedule.scheduled_at):
                reasons.append("Service authorization does not cover the scheduled assessment date.")
            if eligible.status != "satisfied":
                reasons.append("Mandatory prerequisites require verification.")
            if available != "available":
                reasons.append("Current assessment availability requires confirmation.")
            public = assessments.schedule_public(schedule, taken, distance)
            # Every piece of evidence in the response is evaluated at checked_at.
            public = public.model_copy(update={"verification": verification.public(record, now),
                                               "availability": verification.availability(schedule, now)})
            if reasons:
                pending.append(UnconfirmedAssessment(schedule=public, eligibility=eligible, reasons=reasons))
                continue
            factors = dict(alignment)
            factors["location"] = (personalization.observed(100 * max(0, 1 - distance / radius),
                "Straight-line distance from your selected approximate location.") if distance is not None
                else personalization.unknown("This center has no confirmed coordinates.")) if near_lat is not None \
                else personalization.omitted("No location preference was supplied.")
            if pref.accessibility_preferences:
                checks.append(("accessibility", None, "Accessibility needs require center confirmation; capability data is missing."))
            if checks:
                missing = [reason for _, value, reason in checks if value is None]
                factors["preference"] = ScoreFactor(score=100 * sum(value or 0 for _, value, _ in checks) / len(checks),
                    state="unknown" if missing else "observed", reason="; ".join(missing) if missing else
                    "Share of your assessment fee and date preferences met.")
            else:
                factors["preference"] = personalization.omitted("No assessment fee or date preferences were supplied.")
            notes = personalization.context_limitations(answers)
            if pref.delivery_mode or pref.maximum_budget is not None or pref.needs_scholarship or pref.start_after or pref.start_before:
                notes.append("Training delivery, budget, scholarship and start-date preferences do not establish assessment logistics; use assessment fee and date filters.")
            notes.append("Self-reported skills describe alignment, not proven assessment readiness or eligibility.")
            if all(f.state == "not_applicable" for f in factors.values()):
                notes.append("No scoring preferences were supplied; schedules are ordered by date and ID.")
            score = personalization.combine(factors, notes).model_copy(update={"policy_version": "assessment-center-v1"})
            ranked.append(RankedAssessment(schedule=public, eligibility=eligible, score=score.score, personalization=score,
                explanation=personalization.explanations(score), application_status=applications.get(schedule.id)))
        if len(batch) < 100:
            break
        offset += len(batch)
    ranked.sort(key=lambda r: (-r.score, r.schedule.scheduled_at, r.schedule.id))
    pending.sort(key=lambda r: (r.schedule.scheduled_at, r.schedule.id))
    total, unconfirmed_total = len(ranked), len(pending)
    ranked = ranked[request.offset:request.offset + request.limit]
    pending = pending[request.offset:request.offset + request.limit]
    audit = RankingAudit(learner_id=learner.id if learner else None, api_client_id=api_client_id,
        assessment_id=assessment_id,
        qualification_id=qualification.id, near_lat=near_lat, near_lon=near_lon,
        query_hash=goal_fingerprint(request.goal, settings.secret_key.get_secret_value()) if request.goal else None,
        preferences={"service_kind": "assessment", "policy_version": "assessment-center-v1",
                     "maximum_fee": str(request.maximum_fee) if request.maximum_fee is not None else None,
                     "fee_is_mandatory": request.fee_is_mandatory,
                     "scheduled_after": str(request.scheduled_after) if request.scheduled_after else None,
                     "scheduled_before": str(request.scheduled_before) if request.scheduled_before else None,
                     "schedule_is_mandatory": request.schedule_is_mandatory, "maximum_distance_km": maximum_distance,
                     "region_code": request.region_code, "offset": request.offset, "limit": request.limit,
                     "total": total, "unconfirmed_total": unconfirmed_total},
        weights={"configured": settings.personalization_weights.model_dump(),
                 "effective": ranked[0].personalization.effective_weights if ranked else {}},
        results=[r.model_dump(mode="json", exclude={"application_status"}) for r in ranked])
    session.add(audit)
    session.flush()
    return AssessmentRanking(checked_at=now, results=ranked, requires_verification=pending, total=total,
        unconfirmed_total=unconfirmed_total, limit=request.limit, offset=request.offset, audit_id=audit.id)
