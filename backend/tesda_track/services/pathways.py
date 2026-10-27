import uuid

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from tesda_track.errors import ConflictError, InvalidRequestError, NotFoundError
from tesda_track.models import Learner, Pathway, PathwayEnrollment, PathwayStep, Qualification, StepProgress, utcnow
from tesda_track.schemas.pathways import (EnrollmentPublic, PathwayCreate, PathwayPublic, PathwayStepInput,
                                          PathwayStepPublic, PathwayUpdate, StepWithStatus)
from tesda_track.services import catalog
from tesda_track.services.ownership import get_owned


def to_public(pathway: Pathway) -> PathwayPublic:
    return PathwayPublic(id=pathway.id, qualification=catalog.summary(pathway.qualification), route=pathway.route,
                         title=pathway.title, description=pathway.description,
                         steps=[PathwayStepPublic.model_validate(step) for step in pathway.steps])


def list_active(session: Session, qualification_code: str | None, route: str | None) -> list[Pathway]:
    query = (select(Pathway).join(Qualification).where(Pathway.is_active, Qualification.is_active)
             .options(selectinload(Pathway.steps), selectinload(Pathway.qualification).selectinload(Qualification.sector)))
    if qualification_code:
        query = query.where(Qualification.code == qualification_code)
    if route:
        query = query.where(Pathway.route == route)
    return list(session.exec(query.order_by(Qualification.id, Pathway.route)))


def get_active(session: Session, pathway_id: int) -> Pathway:
    pathway = session.get(Pathway, pathway_id)
    if pathway is None or not pathway.is_active:
        raise NotFoundError("Pathway was not found.")
    return pathway


def get_any(session: Session, pathway_id: int) -> Pathway:
    pathway = session.get(Pathway, pathway_id)
    if pathway is None:
        raise NotFoundError("Pathway was not found.")
    return pathway


def for_route(session: Session, qualification: Qualification, route: str) -> Pathway | None:
    return session.exec(select(Pathway).where(Pathway.qualification_id == qualification.id, Pathway.route == route,
                                              Pathway.is_active)).first()


def create(session: Session, request: PathwayCreate) -> Pathway:
    qualification = catalog.resolve_qualification(session, request.qualification_code)
    if session.exec(select(Pathway).where(Pathway.qualification_id == qualification.id,
                                          Pathway.route == request.route)).first():
        raise ConflictError("This qualification already has a pathway for that route; edit it instead.")
    if any(step.id is not None for step in request.steps):
        raise InvalidRequestError("New pathways can't reuse existing step ids.")
    pathway = Pathway(qualification=qualification, route=request.route, title=request.title,
                      description=request.description,
                      steps=[PathwayStep(position=n, kind=s.kind, title=s.title, description=s.description)
                             for n, s in enumerate(request.steps, start=1)])
    session.add(pathway)
    session.flush()
    return pathway


def update(session: Session, pathway: Pathway, request: PathwayUpdate) -> Pathway:
    for field in ("title", "description", "is_active"):
        value = getattr(request, field)
        if value is not None:
            setattr(pathway, field, value)
    if request.steps is not None:
        _replace_steps(pathway, request.steps)
    session.flush()
    session.refresh(pathway)
    return pathway


def _replace_steps(pathway: Pathway, inputs: list[PathwayStepInput]) -> None:
    """Steps given with an id are kept (with learners' progress); unlisted steps are removed."""
    existing = {step.id: step for step in pathway.steps}
    steps = []
    for position, item in enumerate(inputs, start=1):
        if item.id is not None:
            step = existing.get(item.id)
            if step is None:
                raise InvalidRequestError(f"Step {item.id} does not belong to this pathway.")
            step.position, step.kind, step.title, step.description = position, item.kind, item.title, item.description
        else:
            step = PathwayStep(position=position, kind=item.kind, title=item.title, description=item.description)
        steps.append(step)
    pathway.steps = steps  # delete-orphan removes the rest; the database cascades their progress rows


# Enrollments

def enrollment_public(enrollment: PathwayEnrollment) -> EnrollmentPublic:
    statuses = {progress.step_id: progress.status for progress in enrollment.progress}
    steps = [StepWithStatus(**PathwayStepPublic.model_validate(step).model_dump(),
                            status=statuses.get(step.id, "not_started")) for step in enrollment.pathway.steps]
    return EnrollmentPublic(id=enrollment.id, pathway=to_public(enrollment.pathway), status=enrollment.status,
                            completion_percent=completion_percent(enrollment), steps=steps,
                            completed_at=enrollment.completed_at, created_at=enrollment.created_at,
                            updated_at=enrollment.updated_at)


def completion_percent(enrollment: PathwayEnrollment) -> int:
    steps = enrollment.pathway.steps
    if not steps:
        return 0
    step_ids = {step.id for step in steps}
    done = sum(1 for p in enrollment.progress if p.status == "completed" and p.step_id in step_ids)
    return round(100 * done / len(steps))


def next_step(enrollment: PathwayEnrollment) -> PathwayStep | None:
    done = {p.step_id for p in enrollment.progress if p.status == "completed"}
    return next((step for step in enrollment.pathway.steps if step.id not in done), None)


def list_for(session: Session, learner: Learner) -> list[PathwayEnrollment]:
    return list(session.exec(select(PathwayEnrollment).where(PathwayEnrollment.learner_id == learner.id)
                             .order_by(PathwayEnrollment.created_at.desc())))


def get_enrollment(session: Session, learner: Learner, enrollment_id: uuid.UUID) -> PathwayEnrollment:
    return get_owned(session, PathwayEnrollment, enrollment_id, learner, "Pathway enrollment")


def enroll(session: Session, learner: Learner, pathway_id: int) -> PathwayEnrollment:
    pathway = session.get(Pathway, pathway_id)
    if pathway is None or not pathway.is_active:
        raise InvalidRequestError("Pathway was not found.")
    if session.exec(select(PathwayEnrollment).where(PathwayEnrollment.learner_id == learner.id,
                                                    PathwayEnrollment.pathway_id == pathway_id)).first():
        raise ConflictError("You're already following this pathway.")
    enrollment = PathwayEnrollment(learner_id=learner.id, pathway=pathway)
    session.add(enrollment)
    session.flush()
    return enrollment


def set_step_status(session: Session, enrollment: PathwayEnrollment, step_id: int, status: str) -> PathwayEnrollment:
    if enrollment.status == "withdrawn":
        raise ConflictError("Resume this pathway before updating its steps.")
    if step_id not in {step.id for step in enrollment.pathway.steps}:
        raise NotFoundError("Step was not found in this pathway.")
    progress = next((p for p in enrollment.progress if p.step_id == step_id), None)
    if progress is None:
        enrollment.progress.append(StepProgress(step_id=step_id, status=status))
    else:
        progress.status = status
    _sync_completion(enrollment)
    session.flush()
    return enrollment


def set_status(session: Session, enrollment: PathwayEnrollment, status: str) -> PathwayEnrollment:
    enrollment.status = status
    if status == "active":
        _sync_completion(enrollment)
    session.flush()
    return enrollment


def _sync_completion(enrollment: PathwayEnrollment) -> None:
    if completion_percent(enrollment) == 100:
        if enrollment.status != "completed":
            enrollment.status, enrollment.completed_at = "completed", utcnow()
    elif enrollment.status == "completed":
        enrollment.status, enrollment.completed_at = "active", None
