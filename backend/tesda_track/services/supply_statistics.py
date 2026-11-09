"""Registered versus confirmed supply: counts are observed for the dataset's extent, unknown quantities stay unknown."""
from datetime import date, datetime

from sqlmodel import Session, select

from tesda_track.errors import InvalidRequestError
from tesda_track.models import (AssessmentCenter, AssessmentSchedule, Qualification, Region, TrainingProgram,
                                TrainingProvider, utcnow)
from tesda_track.schemas.evidence import Geography, Measure, SupplyEvidence, measure_sum
from tesda_track.services import verification
from tesda_track.services.assessments import seats_taken_subquery

METHOD_VERSION = "supply-statistics-v1"
NO_TRAINING_SEATS = "Remaining training seats are not recorded; published slots are a separate measure."
NO_MARKET_COVERAGE = "Registry-wide market coverage is unknown."


def _confirmed(name: str, unit: str, confirmed: int, candidates: list, now, **context) -> Measure:
    """The confirmed count, with the registered candidates as denominator and current availability checks as known."""
    eligible = len(candidates)
    known = sum(1 for c in candidates if verification.availability(c, now).status != "unknown")
    statement = (f"{confirmed} confirmed {unit} of {eligible} registered; "
                 f"{known} of {eligible} have a current availability check.")
    return Measure(name=name, value=confirmed, unit=unit, known_record_count=known, eligible_record_count=eligible,
                   unknown_count=eligible - known, coverage=known / eligible if eligible else None,
                   statement=statement, **context)


def _count(name: str, unit: str, n: int, **context) -> Measure:
    """An observed count for the stated extent; zero is an observed zero."""
    return Measure(name=name, value=n, unit=unit, known_record_count=n, eligible_record_count=n, unknown_count=0,
                   coverage=1.0, statement=f"{n} {unit} in this extent.", **context)


def supply_evidence(session: Session, qualification_code: str, region_code: str | None = None, *,
                    now: datetime | None = None, scheduled_after: date | None = None,
                    scheduled_before: date | None = None) -> SupplyEvidence:
    now = now or utcnow()
    today = now.astimezone(verification.PHILIPPINE_TIME).date()
    region = None
    if region_code:
        region = session.get(Region, region_code)
        if region is None:
            raise InvalidRequestError("Unknown region.")
    geography = (Geography(scope="regional", region_code=region_code, label=region.name) if region_code
                 else Geography(scope="national", label="All registered sites in this dataset"))
    limitations = [] if region_code else [NO_MARKET_COVERAGE]

    def context(sources: list[str], extra: tuple[str, ...] = ()) -> dict:
        return dict(evidence_kind="observed", geography=geography, observed_on=today, sources=sources,
                    method_version=METHOD_VERSION, limitations=[*limitations, *extra])

    registry, confirmed = ["registry"], ["registry", "verification"]

    # Training: one query, then the verification and availability checks.
    query = (select(TrainingProgram).join(TrainingProvider)
             .join(Qualification, TrainingProgram.qualification_id == Qualification.id)
             .where(TrainingProgram.is_active, TrainingProvider.is_active, Qualification.is_active,
                    Qualification.code == qualification_code).order_by(TrainingProgram.id))
    if region_code:
        query = query.where(TrainingProvider.region_code == region_code)
    programs = list(session.exec(query))
    verification.preload(session, "training", {(p.provider_id, p.qualification_id) for p in programs})
    unfinished = [p for p in programs if p.end_date is None or p.end_date >= today]
    offerings = [
        p for p in unfinished
        if verification.effective_status(verification.get(session, "training", p.provider_id, p.qualification_id), now) == "verified"
        and verification.availability(p, now).status == "available"]

    # Assessment: open, future schedules at active centers, inside the optional window.
    query = (select(AssessmentSchedule, seats_taken_subquery().label("taken")).join(AssessmentCenter)
             .join(Qualification, AssessmentSchedule.qualification_id == Qualification.id)
             .where(AssessmentSchedule.status == "open", AssessmentSchedule.scheduled_at > now,
                    AssessmentCenter.is_active, Qualification.is_active, Qualification.code == qualification_code)
             .order_by(AssessmentSchedule.id))
    if region_code:
        query = query.where(AssessmentCenter.region_code == region_code)
    rows = list(session.exec(query))
    verification.preload(session, "assessment", {(s.center_id, s.qualification_id) for s, _ in rows})
    schedules, candidates = [], []
    for schedule, seats in rows:
        record = verification.get(session, "assessment", schedule.center_id, schedule.qualification_id)
        local_date = schedule.scheduled_at.astimezone(verification.PHILIPPINE_TIME).date()
        if not ((scheduled_after is None or local_date >= scheduled_after)
                and (scheduled_before is None or local_date <= scheduled_before)):
            continue
        candidates.append(schedule)
        if (verification.effective_status(record, now) == "verified"
                and verification.authorization_covers(record, schedule.scheduled_at)
                and verification.availability(schedule, now).status == "available"):
            schedules.append((schedule, seats))

    result = dict(
        registered_training_sites=_count("registered_training_sites", "sites", len({p.provider_id for p in programs}),
                                         **context(registry)),
        registered_training_programs=_count("registered_training_programs", "program records", len(programs),
                                            **context(registry)),
        confirmed_training_offerings=_confirmed("confirmed_training_offerings", "offerings", len(offerings),
                                                unfinished, now, **context(confirmed)),
        published_training_slots=measure_sum(
            "published_training_slots", "slots", [p.slots for p in offerings], label="published slots",
            record_noun="offerings", total_noun="capacity", **context(confirmed)),
        remaining_training_seats=measure_sum(
            "remaining_training_seats", "seats", [None for _ in offerings], label="remaining seats",
            record_noun="offerings", total_noun="capacity", **context(confirmed, (NO_TRAINING_SEATS,))),
        confirmed_assessment_schedules=_confirmed("confirmed_assessment_schedules", "schedules", len(schedules),
                                                  candidates, now, **context(confirmed)),
        confirmed_assessment_sites=_count("confirmed_assessment_sites", "sites", len({s.center_id for s, _ in schedules}),
                                          **context(confirmed)),
        remaining_assessment_seats=measure_sum(
            "remaining_assessment_seats", "seats", [max(0, s.slots - seats) for s, seats in schedules],
            label="remaining seats", record_noun="schedules", total_noun="capacity", **context(confirmed)),
    )
    return SupplyEvidence(**result, completeness={name: m.coverage for name, m in result.items()})
