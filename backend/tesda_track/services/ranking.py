"""Rank a qualification's training programs for one learner, and record why.

Score = Σ weight × component, each component on 0..1 (weights from settings.ranking_weights):
- semantic:   how close the program is in meaning to the learner's goal, relative to the qualification's other
              programs (best 1, worst 0); 1 for all when there is no goal, no model, or only one program,
              because every listed program already teaches the chosen qualification
- proximity:  1 at the learner's location (rounded to about 10 km), falling to 0 at settings.proximity_radius_km
- assessment: 1 when an open assessment with seats exists near the provider (same region if unmapped)
- schedule:   1 starts within 60 days, 0.7 starts later, 0.5 open intake (no dates), 0.2 already running;
              finished programs are left out
- preference: the share of the learner's stated preferences (delivery mode, scholarship) the program meets
"""
import hashlib
import hmac
from datetime import date

from sqlalchemy import and_, func, or_
from sqlmodel import Session, select

from tesda_track.config import get_settings
from tesda_track.models import (AssessmentCenter, AssessmentSchedule, Learner, RankingAudit, TrainingProgram,
                                TrainingProvider, utcnow)
from tesda_track.schemas.delivery import ProgramSearch
from tesda_track.schemas.ranking import RankedProgram, ScoreComponents, TrainingRanking, TrainingRankingRequest
from tesda_track.services import assessments, catalog, embeddings, geo, training
from tesda_track.services.embeddings import Embedder
from tesda_track.utils.helpers import normalize

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
        return 0.5
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
                              radius_km: float) -> set[int]:
    """The providers with an open assessment that still has seats nearby (in the same region if unmapped).

    One query for all of them, rather than one per program.
    """
    if not provider_ids:
        return set()
    nearby = or_(and_(TrainingProvider.latitude.is_not(None),
                      func.ST_DWithin(geo.point(AssessmentCenter), geo.point(TrainingProvider), radius_km * 1000)),
                 and_(TrainingProvider.latitude.is_(None), AssessmentCenter.region_code == TrainingProvider.region_code))
    query = (select(TrainingProvider.id).distinct().join(AssessmentCenter, nearby)
             .join(AssessmentSchedule, AssessmentSchedule.center_id == AssessmentCenter.id)
             .where(TrainingProvider.id.in_(provider_ids), AssessmentSchedule.qualification_id == qualification_id,
                    AssessmentSchedule.status == "open", AssessmentSchedule.scheduled_at > utcnow(),
                    AssessmentCenter.is_active, assessments.seats_taken_subquery() < AssessmentSchedule.slots))
    return set(session.exec(query))


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
                    0.5: "Open intake", 0.2: "Already running"}[components.schedule])
    if components.preference:
        reasons.append("Fits your stated preferences")
    return [reason for reason in reasons if reason]


def rank_programs(session: Session, request: TrainingRankingRequest, embedder: Embedder | None,
                  learner: Learner | None) -> TrainingRanking:
    settings = get_settings()
    weights = settings.ranking_weights
    qualification = catalog.get_active_qualification(session, request.qualification_code)
    near_lat = round(request.near_lat, LOCATION_DECIMALS) if request.near_lat is not None else None
    near_lon = round(request.near_lon, LOCATION_DECIMALS) if request.near_lon is not None else None
    rows = training.search_programs(session, ProgramSearch(
        qualification_code=qualification.code, near_lat=near_lat, near_lon=near_lon, limit=100))
    semantic_used = embedder is not None and request.goal is not None
    similarities = embeddings.program_similarities(session, embedder, request.goal, [p.id for p, _ in rows]) \
        if semantic_used else {}
    low, high = (min(similarities.values()), max(similarities.values())) if similarities else (0.0, 0.0)
    with_assessment = providers_near_assessment(session, qualification.id, {p.provider_id for p, _ in rows},
                                                settings.proximity_radius_km)
    today = date.today()
    ranked = []
    for program, distance in rows:
        schedule = schedule_component(program, today)
        if schedule is None:
            continue
        if not semantic_used or high - low < 1e-6:
            semantic = 1.0
        else:
            semantic = (similarities[program.id] - low) / (high - low) if program.id in similarities else 0.0
        components = ScoreComponents(
            semantic=round(semantic, 3),
            proximity=round(proximity_component(distance, settings.proximity_radius_km), 3),
            assessment=1.0 if program.provider_id in with_assessment else 0.0,
            schedule=schedule, preference=preference_component(program, request))
        score = round(100 * sum(getattr(weights, name) * value for name, value in components.model_dump().items()))
        ranked.append(RankedProgram(program=training.program_public(program, distance), score=score,
                                    components=components,
                                    explanation=_explain(program, distance, components, semantic_used)))
    ranked.sort(key=lambda item: (-item.score, item.program.id))
    ranked = ranked[:request.limit]
    audit = RankingAudit(
        learner_id=learner.id if learner else None, qualification_id=qualification.id,
        query_hash=goal_fingerprint(request.goal, settings.secret_key.get_secret_value()) if request.goal else None,
        near_lat=near_lat, near_lon=near_lon,
        preferences={"delivery_mode": request.preferred_delivery_mode, "needs_scholarship": request.needs_scholarship},
        weights=weights.model_dump(), model=embedder.model_name if semantic_used else None,
        results=[{"program_id": item.program.id, "score": item.score, "components": item.components.model_dump()}
                 for item in ranked])
    session.add(audit)
    session.flush()
    return TrainingRanking(weights=weights, semantic_used=semantic_used, results=ranked, audit_id=audit.id)
