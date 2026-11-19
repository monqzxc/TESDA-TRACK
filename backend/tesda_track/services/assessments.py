"""Assessment centers, schedules with seat counts, and the application workflow."""
import uuid

from sqlalchemy import func, null, or_
from sqlalchemy.orm import object_session, selectinload
from sqlmodel import Session, select

from tesda_track.errors import ConflictError, InvalidRequestError, NotFoundError
from tesda_track.models import (AssessmentApplication, AssessmentCenter, AssessmentSchedule, Certification, Learner,
                                Qualification, RegistryBatch, RegistryLink, RegistryRecord, utcnow)
from tesda_track.schemas.delivery import (ApplicationReview, AssessmentApplicationAdmin, AssessmentApplicationPublic,
                                          AssessmentCenterCreate, AssessmentCenterPublic, AssessmentScheduleCreate,
                                          AssessmentSchedulePublic, AssessmentScheduleUpdate, CenterSearch,
                                          LearnerSummary, ScheduleSearch, SiteSummary)
from tesda_track.services import catalog, geo, sites, verification
from tesda_track.services.ownership import get_owned
from tesda_track.services.center_listing import listed

SEAT_HOLDING = ("approved", "completed")
# Review transitions an administrator may make; withdrawal belongs to the learner.
ALLOWED_REVIEWS = {"pending": {"approved", "rejected"}, "approved": {"completed", "rejected"}}


def seats_taken_subquery():
    return (select(func.count()).select_from(AssessmentApplication)
            .where(AssessmentApplication.schedule_id == AssessmentSchedule.id,
                   AssessmentApplication.status.in_(SEAT_HOLDING))
            .correlate(AssessmentSchedule).scalar_subquery())


def seats_taken(session: Session, schedule_id: int) -> int:
    return session.exec(select(func.count()).select_from(AssessmentApplication).where(
        AssessmentApplication.schedule_id == schedule_id, AssessmentApplication.status.in_(SEAT_HOLDING))).one()


def schedule_public(schedule: AssessmentSchedule, taken: int, distance_km: float | None = None) -> AssessmentSchedulePublic:
    session = object_session(schedule)
    record = verification.get(session, "assessment", schedule.center_id, schedule.qualification_id) if session else None
    return AssessmentSchedulePublic(
        provenance=schedule.provenance,
        verification=verification.public(record), availability=verification.availability(schedule),
        id=schedule.id, qualification=catalog.summary(schedule.qualification),
        center=SiteSummary.model_validate(schedule.center), scheduled_at=schedule.scheduled_at, slots=schedule.slots,
        seats_left=max(schedule.slots - taken, 0), fee=schedule.fee, status=schedule.status,
        distance_km=round(distance_km, 1) if distance_km is not None else None)


# Centers

def accreditations():
    """(center_id, qualification_id) for each qualification the registry accredits a center to assess: the accepted
    rows of the center's latest assessment snapshot. The registry publishes no dates, seats or fees, so these say
    where a learner can get certified, not that an assessment is open."""
    return (select(RegistryLink.center_id, RegistryRecord.qualification_id)
            .join(RegistryRecord, RegistryRecord.site_key == RegistryLink.external_key)
            .join(RegistryBatch, RegistryBatch.id == RegistryRecord.batch_id)
            .where(RegistryLink.entity_kind == "center", RegistryBatch.kind == "assessment",
                   RegistryBatch.snapshot_date == RegistryLink.last_snapshot_date,
                   RegistryRecord.outcome == "accepted", RegistryRecord.qualification_id.is_not(None))
            .distinct())


def accredited_codes(session: Session, center_ids: list[int] | None = None) -> dict[int, list[str]]:
    """The active qualification codes each center is accredited for, alphabetically."""
    accredited = accreditations().subquery()
    query = (select(accredited.c.center_id, Qualification.code)
             .join(Qualification, Qualification.id == accredited.c.qualification_id)
             .where(Qualification.is_active).order_by(Qualification.code))
    if center_ids is not None:
        query = query.where(accredited.c.center_id.in_(center_ids))
    codes: dict[int, list[str]] = {}
    for center_id, code in session.exec(query):
        codes.setdefault(center_id, []).append(code)
    return codes


def center_public(center: AssessmentCenter, codes: list[str]) -> AssessmentCenterPublic:
    return AssessmentCenterPublic.model_validate(center).model_copy(update={"qualification_codes": codes})


def list_centers(session: Session, search: CenterSearch) -> list[AssessmentCenterPublic]:
    query = select(AssessmentCenter).where(listed(AssessmentCenter))
    if search.qualification_code:
        # Accredited for it, or with an open schedule for it (a center added by hand has no registry rows).
        qualification = select(Qualification.id).where(Qualification.code == search.qualification_code,
                                                       Qualification.is_active).scalar_subquery()
        accredited = accreditations().where(RegistryRecord.qualification_id == qualification).subquery()
        scheduled = select(AssessmentSchedule.center_id).where(
            AssessmentSchedule.qualification_id == qualification, AssessmentSchedule.status == "open",
            AssessmentSchedule.scheduled_at > utcnow())
        query = query.where(or_(AssessmentCenter.id.in_(select(accredited.c.center_id)),
                                AssessmentCenter.id.in_(scheduled)))
    if search.region_code:
        query = query.where(AssessmentCenter.region_code == search.region_code)
    if search.radius_km is not None:
        query = query.where(geo.within_radius(AssessmentCenter, search))
    centers = list(session.exec(query.order_by(AssessmentCenter.name)))
    # Every center, or a filtered few: reading every accreditation once is cheaper than a long IN list.
    codes = accredited_codes(session, [c.id for c in centers] if len(centers) <= 500 else None)
    return [center_public(center, codes.get(center.id, [])) for center in centers]


def get_center(session: Session, center_id: int, active_only: bool = True) -> AssessmentCenter:
    center = session.get(AssessmentCenter, center_id)
    if center is None or (active_only and not center.is_active):
        raise NotFoundError("Assessment center was not found.")
    return center


def create_center(session: Session, request: AssessmentCenterCreate) -> AssessmentCenter:
    sites.require_region(session, request.region_code)
    center = AssessmentCenter(**request.model_dump())
    session.add(center)
    session.flush()
    return center


# Schedules

def get_schedule(session: Session, schedule_id: int) -> AssessmentSchedule:
    schedule = session.get(AssessmentSchedule, schedule_id)
    if schedule is None:
        raise NotFoundError("Assessment schedule was not found.")
    return schedule


def create_schedule(session: Session, request: AssessmentScheduleCreate) -> AssessmentSchedule:
    center = session.get(AssessmentCenter, request.center_id)
    if center is None:
        raise InvalidRequestError("Assessment center was not found.")
    schedule = AssessmentSchedule(center=center, qualification=catalog.resolve_qualification(session, request.qualification_code),
                                  **request.model_dump(exclude={"center_id", "qualification_code"}))
    session.add(schedule)
    session.flush()
    return schedule


def update_schedule(session: Session, schedule: AssessmentSchedule, request: AssessmentScheduleUpdate) -> AssessmentSchedule:
    from tesda_track.services.provenance import validate_update

    validate_update(schedule, request)
    verification.validate_availability_update(schedule, request)
    fields = request.model_fields_set
    if "slots" in fields and request.slots is not None and request.slots < seats_taken(session, schedule.id):
        raise ConflictError("More applicants are already approved than the new number of slots.")
    needs_review = verification.availability_needs_review(schedule, request, {"scheduled_at", "slots", "fee", "status"})
    for field in fields:
        value = getattr(request, field)
        if value is not None or field in {"fee", "source_name", "source_reference", "source_url",
                                           "source_updated_on", "source_reviewed_at"}:
            setattr(schedule, field, value)
    if needs_review:
        schedule.availability_status = "unknown"
    session.flush()
    return schedule


def search_schedules(session: Session, search: ScheduleSearch) -> list[tuple[AssessmentSchedule, int, float | None]]:
    """Open schedules that haven't happened yet, at active centers."""
    distance = geo.distance_km(AssessmentCenter, search) if search.near_lat is not None else null()
    query = (select(AssessmentSchedule, seats_taken_subquery().label("taken"), distance.label("distance_km"))
             .join(AssessmentCenter).join(Qualification, AssessmentSchedule.qualification_id == Qualification.id)
             .where(AssessmentSchedule.status == "open", AssessmentSchedule.scheduled_at > utcnow(),
                    listed(AssessmentCenter), Qualification.is_active)
             .options(selectinload(AssessmentSchedule.center),
                      selectinload(AssessmentSchedule.qualification).selectinload(Qualification.sector)))
    if search.qualification_code:
        query = query.where(Qualification.code == search.qualification_code)
    if search.region_code:
        query = query.where(AssessmentCenter.region_code == search.region_code)
    if search.center_id is not None:
        query = query.where(AssessmentSchedule.center_id == search.center_id)
    if search.radius_km is not None:
        query = query.where(geo.within_radius(AssessmentCenter, search))
    order = ((distance.asc().nulls_last(),) if search.near_lat is not None else ()) + (AssessmentSchedule.scheduled_at, AssessmentSchedule.id)
    rows = list(session.exec(query.order_by(*order).limit(search.limit).offset(search.offset)).all())
    verification.preload(session, "assessment", {(s.center_id, s.qualification_id) for s, _, _ in rows})
    return rows


# Applications

def application_public(session: Session, application: AssessmentApplication) -> AssessmentApplicationPublic:
    schedule = schedule_public(application.schedule, seats_taken(session, application.schedule_id))
    return AssessmentApplicationPublic(id=application.id, schedule=schedule, status=application.status,
                                       result=application.result, reviewer_note=application.reviewer_note,
                                       created_at=application.created_at, updated_at=application.updated_at)


def application_admin(session: Session, application: AssessmentApplication) -> AssessmentApplicationAdmin:
    return AssessmentApplicationAdmin(**application_public(session, application).model_dump(),
                                      learner=LearnerSummary.model_validate(application.learner))


def list_for(session: Session, learner: Learner) -> list[AssessmentApplication]:
    return list(session.exec(select(AssessmentApplication).where(AssessmentApplication.learner_id == learner.id)
                             .order_by(AssessmentApplication.created_at.desc())))


def list_all(session: Session, status: str | None, schedule_id: int | None, limit: int, offset: int) -> list[AssessmentApplication]:
    query = select(AssessmentApplication)
    if status:
        query = query.where(AssessmentApplication.status == status)
    if schedule_id:
        query = query.where(AssessmentApplication.schedule_id == schedule_id)
    return list(session.exec(query.order_by(AssessmentApplication.created_at).limit(limit).offset(offset)))


def get_for_learner(session: Session, learner: Learner, application_id: uuid.UUID) -> AssessmentApplication:
    return get_owned(session, AssessmentApplication, application_id, learner, "Assessment application")


def get_application(session: Session, application_id: uuid.UUID) -> AssessmentApplication:
    application = session.get(AssessmentApplication, application_id)
    if application is None:
        raise NotFoundError("Assessment application was not found.")
    return application


def apply(session: Session, learner: Learner, schedule_id: int) -> AssessmentApplication:
    schedule = session.get(AssessmentSchedule, schedule_id)
    if schedule is None:
        raise InvalidRequestError("Assessment schedule was not found.")
    if schedule.status != "open" or schedule.scheduled_at <= utcnow():
        raise InvalidRequestError("This schedule is no longer open for applications.")
    verification.require_application_eligibility(session, schedule, learner)
    existing = session.exec(select(AssessmentApplication).where(
        AssessmentApplication.learner_id == learner.id, AssessmentApplication.schedule_id == schedule_id)).first()
    if existing is not None:
        if existing.status != "withdrawn":
            raise ConflictError("You have already applied for this schedule.")
        if seats_taken(session, schedule.id) >= schedule.slots:
            raise InvalidRequestError("No seats are left for this schedule.")
        existing.status, existing.result, existing.reviewer_note = "pending", None, None
        session.flush()
        return existing
    if seats_taken(session, schedule.id) >= schedule.slots:
        raise InvalidRequestError("No seats are left for this schedule.")
    application = AssessmentApplication(learner_id=learner.id, schedule=schedule)
    session.add(application)
    session.flush()
    return application


def withdraw(session: Session, application: AssessmentApplication) -> AssessmentApplication:
    if application.status == "withdrawn":
        return application  # An uncertain withdrawal can safely be retried.
    if application.status not in ("pending", "approved"):
        raise ConflictError("Only pending or approved applications can be withdrawn.")
    application.status = "withdrawn"
    session.flush()
    return application


def review(session: Session, application: AssessmentApplication, request: ApplicationReview) -> AssessmentApplication:
    if request.status is not None:
        if request.status not in ALLOWED_REVIEWS.get(application.status, set()):
            raise ConflictError(f"An application that is {application.status} can't be marked {request.status}.")
        if request.status == "approved":
            # Lock the schedule so two approvals can't both take the last seat.
            schedule = session.exec(select(AssessmentSchedule).where(AssessmentSchedule.id == application.schedule_id)
                                    .with_for_update()).one()
            if schedule.status != "open" or schedule.scheduled_at <= utcnow():
                raise InvalidRequestError("This schedule is no longer open for approvals.")
            verification.require_application_eligibility(session, schedule, application.learner)
            if seats_taken(session, schedule.id) >= schedule.slots:
                raise ConflictError("No seats are left for this schedule.")
        application.status = request.status
        application.result = request.result
        if request.result == "competent":
            _issue_certification(session, application)
    if "reviewer_note" in request.model_fields_set:
        application.reviewer_note = request.reviewer_note
    session.flush()
    return application


def _issue_certification(session: Session, application: AssessmentApplication) -> None:
    schedule = application.schedule
    session.add(Certification(
        learner_id=application.learner_id, qualification_id=schedule.qualification_id,
        title=schedule.qualification.name, issuing_body="TESDA", issued_on=schedule.scheduled_at.date(),
        verified=True, source="assessment", assessment_application_id=application.id))
