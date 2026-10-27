"""Rank a qualification's training programs for one learner, and record why.

Score = Σ weight × component, each component on 0..1 (weights from settings.ranking_weights):
- semantic:   measured similarity relative to the qualification's other programs; missing/degenerate evidence is zero,
              with explicit status metadata. A disabled model is removed from the request-wide effective weights.
- proximity:  1 at the learner's location (rounded to about 10 km), falling to 0 at settings.proximity_radius_km
- assessment: 1 when a verified, eligible assessment with confirmed availability and seats exists nearby
- schedule:   1 starts within 60 days, 0.7 starts later, 0 unknown dates, 0.2 already running;
              finished programs are left out
- preference: the share of the learner's stated preferences (delivery mode, scholarship) the program meets
"""
import hashlib
import hmac
import uuid
from datetime import date, datetime, time

from sqlalchemy import and_, func, or_
from sqlmodel import Session, select

from tesda_track.config import get_settings
from tesda_track.models import (AssessmentCenter, AssessmentSchedule, Learner, RankingAudit, Region, ServiceVerification, TrainingProgram,
                                TrainingProvider, utcnow)
from tesda_track.schemas.delivery import ProgramSearch
from tesda_track.schemas.ranking import RankedProgram, ScoreComponents, TrainingRanking, TrainingRankingRequest, UnconfirmedProgram
from tesda_track.services import assessments, catalog, embeddings, geo, learner_assessments, personalization, training, verification
from tesda_track.services.embeddings import Embedder
from tesda_track.utils.helpers import normalize
from tesda_track.errors import InvalidRequestError

SOON_DAYS = 60
# One decimal of a degree is about 11 km. Rounding before ranking means nothing finer is ever computed,
# returned or stored, so stored scores can't be used to trilaterate where a learner is.
LOCATION_DECIMALS = 1


def goal_fingerprint(goal: str, secret: str) -> str:
    """Keyed hash: counts repeated goals without storing them, and can't be reversed by guessing short sentences."""
    key = hashlib.sha256(b"tesda-track ranking audit:" + secret.encode()).digest()
    return hmac.new(key, normalize(goal).encode(), hashlib.sha256).hexdigest()


def schedule_component(program: TrainingProgram, today: date) -> float | None:
    if program.end_date and program.end_date < today:
        return None
    if program.start_date is None:
        return 0.0
    if program.start_date >= today:
        return 1.0 if (program.start_date - today).days <= SOON_DAYS else 0.7
    return 0.2


def proximity_component(distance_km: float | None, radius_km: float) -> float:
    return 0.0 if distance_km is None else max(0.0, 1 - distance_km / radius_km)


def preference_component(program: TrainingProgram, request: TrainingRankingRequest) -> float:
    checks = []
    if request.preferred_delivery_mode:
        checks.append(program.delivery_mode == request.preferred_delivery_mode)
    if request.needs_scholarship:
        checks.append(program.scholarship_available)
    return sum(checks) / len(checks) if checks else 0.0


def providers_near_assessment(session: Session, qualification_id: int, provider_ids: set[int],
                              radius_km: float, evidence: dict | None = None, now=None) -> set[int]:
    """The providers with an open assessment that still has seats nearby (in the same region if unmapped).

    One query for all of them, rather than one per program.
    """
    if not provider_ids:
        return set()
    nearby = or_(and_(TrainingProvider.latitude.is_not(None),
                      func.ST_DWithin(geo.point(AssessmentCenter), geo.point(TrainingProvider), radius_km * 1000)),
                 and_(TrainingProvider.latitude.is_(None), AssessmentCenter.region_code == TrainingProvider.region_code))
    now = now or utcnow()
    query = (select(TrainingProvider.id, AssessmentSchedule, ServiceVerification).select_from(TrainingProvider).join(AssessmentCenter, nearby)
             .join(AssessmentSchedule, AssessmentSchedule.center_id == AssessmentCenter.id)
             .join(ServiceVerification, and_(ServiceVerification.center_id == AssessmentCenter.id,
                                             ServiceVerification.qualification_id == qualification_id))
             .where(TrainingProvider.id.in_(provider_ids), AssessmentSchedule.qualification_id == qualification_id,
                    AssessmentSchedule.status == "open", AssessmentSchedule.scheduled_at > now,
                    AssessmentCenter.is_active, assessments.seats_taken_subquery() < AssessmentSchedule.slots))
    return {provider_id for provider_id, schedule, record in session.exec(query)
            if verification.effective_status(record, now) == "verified"
            and verification.authorization_covers(record, schedule.scheduled_at)
            and verification.availability(schedule, now).status == "available"
            and verification.eligibility(record, evidence, now,
                schedule.scheduled_at.astimezone(verification.PHILIPPINE_TIME).date()).status == "satisfied"}


def _explain(program: TrainingProgram, distance_km: float | None, components: ScoreComponents,
             semantic_used: bool) -> list[str]:
    reasons = []
    if semantic_used and components.semantic >= 0.6:
        reasons.append("Closely matches your goal")
    if distance_km is not None:
        reasons.append(f"About {distance_km:,.0f} km from you")
    if components.assessment:
        reasons.append("An assessment with open seats is available nearby")
    reasons.append({1.0: f"Starts {program.start_date:%b %d, %Y}" if program.start_date else "",
                    0.7: f"Starts {program.start_date:%b %d, %Y}" if program.start_date else "",
                    0.0: "Start date not confirmed", 0.2: "Already running"}[components.schedule])
    if verification.availability(program).status == "unknown":
        reasons.append("Current intake availability requires confirmation")
    if components.preference:
        reasons.append("Fits your stated preferences")
    return [reason for reason in reasons if reason]


def rank_programs(session: Session, request: TrainingRankingRequest, embedder: Embedder | None,
                  learner: Learner | None, api_client_id: uuid.UUID | None = None) -> TrainingRanking:
    settings = get_settings()
    answers, assessment_id = learner_assessments.resolve(session, learner, request)
    if answers is not None:
        pref = answers.preferences
        overrides = {}
        if request.near_lat is not None:
            overrides.update(near_lat=round(request.near_lat, LOCATION_DECIMALS),
                             near_lon=round(request.near_lon, LOCATION_DECIMALS), region_code=None)
        if "preferred_delivery_mode" in request.model_fields_set:
            overrides["delivery_mode"] = request.preferred_delivery_mode
        if "needs_scholarship" in request.model_fields_set:
            overrides["needs_scholarship"] = request.needs_scholarship
        try:
            pref = type(pref).model_validate({**pref.model_dump(), **overrides})
        except ValueError:
            raise InvalidRequestError("Preference overrides conflict with the assessment's mandatory constraints.") from None
        answers = answers.model_copy(update={"preferences": pref})
        if not answers.career_goal and request.goal:
            answers = answers.model_copy(update={"career_goal": request.goal})
    weights = settings.personalization_weights if answers is not None else settings.ranking_weights
    policy_version = "structured-assessment-v1" if answers is not None else "verified-services-v2"
    qualification = catalog.get_active_qualification(session, request.qualification_code)
    near_lat = round(request.near_lat, LOCATION_DECIMALS) if request.near_lat is not None else None
    near_lon = round(request.near_lon, LOCATION_DECIMALS) if request.near_lon is not None else None
    if answers is not None and near_lat is None:
        pref = answers.preferences
        if pref.near_lat is not None:
            near_lat, near_lon = pref.near_lat, pref.near_lon
        elif pref.region_code:
            region = session.get(Region, pref.region_code)
            near_lat, near_lon = round(region.latitude, LOCATION_DECIMALS), round(region.longitude, LOCATION_DECIMALS)
    now = utcnow()
    today = now.astimezone(verification.PHILIPPINE_TIME).date()
    evidence = verification.certificates(session, learner)
    rows, pending, eligibility_by_id = [], [], {}
    offset = 0
    while True:
        batch = training.search_programs(session, ProgramSearch(
            qualification_code=qualification.code, near_lat=near_lat, near_lon=near_lon, limit=100, offset=offset))
        for program, distance in batch:
            record = verification.get(session, "training", program.provider_id, program.qualification_id)
            status = verification.effective_status(record, now)
            eligibility = verification.eligibility(record, evidence, now, program.start_date)
            available = verification.availability(program, now).status
            if (schedule_component(program, today) is None or status in ("expired", "unavailable")
                    or eligibility.status == "unsatisfied" or available == "unavailable"):
                continue
            reasons = []
            if answers is not None:
                excluded, unknown_constraints = personalization.constraint_reasons(answers, program, distance)
                if excluded:
                    continue
                reasons.extend(unknown_constraints)
            if status != "verified":
                reasons.append("This provider's authority to deliver this qualification requires verification.")
            if eligibility.status != "satisfied":
                reasons.append("Mandatory prerequisites require verification.")
            if program.start_date:
                start = datetime.combine(program.start_date, time.min, verification.PHILIPPINE_TIME)
                end = datetime.combine(program.end_date, time.max, verification.PHILIPPINE_TIME) if program.end_date else None
                if not verification.authorization_covers(record, start, end):
                    reasons.append("Service authorization does not cover the published training dates.")
            if request.require_confirmed_availability and available != "available":
                reasons.append("Current intake availability requires confirmation.")
            if reasons:
                if len(pending) < request.limit:
                    pending.append(UnconfirmedProgram(program=training.program_public(program, distance),
                                                      eligibility=eligibility, reasons=reasons))
            else:
                rows.append((program, distance))
                eligibility_by_id[program.id] = eligibility
        if len(batch) < 100:
            break
        offset += len(batch)
    semantic_requested = answers is None and embedder is not None and request.goal is not None
    similarities = embeddings.program_similarities(session, embedder, request.goal, [p.id for p, _ in rows]) \
        if semantic_requested and rows else {}
    low, high = (min(similarities.values()), max(similarities.values())) if similarities else (0.0, 0.0)
    semantic_used = semantic_requested and bool(similarities) and high - low >= 1e-6
    with_assessment = providers_near_assessment(session, qualification.id, {p.provider_id for p, _ in rows},
                                                settings.proximity_radius_km, evidence, now) if answers is None else set()
    active = {"semantic": semantic_requested, "proximity": near_lat is not None, "assessment": True,
              "schedule": True, "preference": bool(request.preferred_delivery_mode or request.needs_scholarship)}
    effective_weights = {}
    if answers is None:
        denominator = sum(value for key, value in weights.model_dump().items() if active[key])
        effective_weights = {key: value / denominator if denominator and active[key] else 0.0
                             for key, value in weights.model_dump().items()}
    item = catalog.catalog_item(qualification)
    ranked = []
    for program, distance in rows:
        if answers is not None:
            score = personalization.program_score(answers, item, program, distance, near_lat is not None)
            effective_weights = score.effective_weights
            ranked.append(RankedProgram(program=training.program_public(program, distance), score=score.score,
                eligibility=eligibility_by_id[program.id], personalization=score,
                effective_weights=score.effective_weights, evidence_coverage=score.evidence_coverage,
                component_status={key: factor.state for key, factor in score.components.items()},
                components={key: factor.score / 100 if factor.score is not None else None
                            for key, factor in score.components.items()}, explanation=personalization.explanations(score)))
            continue
        schedule = schedule_component(program, today)
        if schedule is None:
            continue
        if not semantic_used or high - low < 1e-6:
            semantic = 0.0
        else:
            semantic = (similarities[program.id] - low) / (high - low) if program.id in similarities else 0.0
        components = ScoreComponents(
            semantic=round(semantic, 3),
            proximity=round(proximity_component(distance, settings.proximity_radius_km), 3),
            assessment=1.0 if program.provider_id in with_assessment else 0.0,
            schedule=schedule, preference=preference_component(program, request))
        statuses = {key: "observed" if active[key] else "not_applicable" for key in active}
        if semantic_requested and (not semantic_used or program.id not in similarities):
            statuses["semantic"] = "unknown"
        if near_lat is not None and distance is None:
            statuses["proximity"] = "unknown"
        if program.start_date is None:
            statuses["schedule"] = "unknown"
        coverage = sum(effective_weights[key] for key, status in statuses.items() if status == "observed")
        score = round(100 * sum(effective_weights[name] * value for name, value in components.model_dump().items()))
        ranked.append(RankedProgram(program=training.program_public(program, distance), score=score,
                                    effective_weights=effective_weights, component_status=statuses, evidence_coverage=min(1, coverage),
                                    eligibility=eligibility_by_id[program.id],
                                    components=components,
                                    explanation=_explain(program, distance, components, semantic_used)))
    ranked.sort(key=lambda item: (-item.score, item.program.id))
    ranked = ranked[:request.limit]
    audit = RankingAudit(
        assessment_id=assessment_id,
        learner_id=learner.id if learner else None, api_client_id=api_client_id, qualification_id=qualification.id,
        query_hash=goal_fingerprint(request.goal, settings.secret_key.get_secret_value()) if request.goal else None,
        near_lat=near_lat, near_lon=near_lon,
        preferences={"delivery_mode": request.preferred_delivery_mode, "needs_scholarship": request.needs_scholarship,
                     "require_confirmed_availability": request.require_confirmed_availability,
                     "policy_version": policy_version},
        weights={"configured": weights.model_dump(), "effective": effective_weights}, model=embedder.model_name if semantic_used else None,
        results=[{"program_id": item.program.id, "score": item.score,
                  "components": item.components.model_dump() if isinstance(item.components, ScoreComponents) else item.components,
                  "component_status": item.component_status, "evidence_coverage": item.evidence_coverage,
                  "personalization": item.personalization.model_dump(mode="json") if item.personalization else None,
                  "verification": item.program.verification.model_dump(mode="json"),
                  "availability": item.program.availability.model_dump(mode="json"),
                  "eligibility_status": item.eligibility.status}
                 for item in ranked])
    session.add(audit)
    session.flush()
    return TrainingRanking(weights=weights, effective_weights=effective_weights, policy_version=policy_version,
                           semantic_used=semantic_used, results=ranked, audit_id=audit.id,
                           requires_verification=pending)
