import uuid

from sqlalchemy import delete
from sqlmodel import Session, select

from tesda_track.errors import AuthenticationError, ConflictError, InvalidRequestError
from tesda_track.models import LearnerAssessment, Region
from tesda_track.schemas.learner_assessments import AssessmentAnswers, AssessmentPublic
from tesda_track.services import catalog
from tesda_track.services.ownership import get_owned


def validate(session: Session, answers: AssessmentAnswers) -> AssessmentAnswers:
    snapshot = catalog.snapshot(session)
    codes = {item.code for item in snapshot.items}
    sectors = {item.sector.casefold(): item.sector for item in snapshot.items}
    if any(code not in codes for code in answers.preferred_qualification_codes):
        raise InvalidRequestError("A preferred qualification is missing or archived.")
    if any(sector.casefold() not in sectors for sector in answers.preferred_sectors):
        raise InvalidRequestError("A preferred sector was not found in the active catalog.")
    if answers.competencies:
        ids = {c.competency_id for c in answers.competencies}
        valid_ids = {c.id for item in snapshot.items for c in item.public.competencies}
        if not ids.issubset(valid_ids):
            raise InvalidRequestError("An answered competency is missing or archived.")
    if answers.preferences.region_code and session.get(Region, answers.preferences.region_code) is None:
        raise InvalidRequestError("The selected region was not found.")
    return answers.model_copy(update={"preferred_sectors": [sectors[s.casefold()] for s in answers.preferred_sectors]})


def public(record: LearnerAssessment) -> AssessmentPublic:
    return AssessmentPublic(id=record.id, series_id=record.series_id, revision=record.revision,
                            previous_revision_id=record.previous_revision_id,
                            answers=AssessmentAnswers.model_validate(record.answers), created_at=record.created_at)


def get(session: Session, learner, assessment_id: uuid.UUID) -> LearnerAssessment:
    return get_owned(session, LearnerAssessment, assessment_id, learner, "Learner assessment")


def list_for(session: Session, learner, limit: int = 20, offset: int = 0) -> list[LearnerAssessment]:
    return list(session.exec(select(LearnerAssessment).where(LearnerAssessment.learner_id == learner.id)
                             .order_by(LearnerAssessment.created_at.desc(), LearnerAssessment.id)
                             .limit(limit).offset(offset)))


def create(session: Session, learner, answers: AssessmentAnswers) -> LearnerAssessment:
    record = LearnerAssessment(learner_id=learner.id, answers=validate(session, answers).model_dump(mode="json"))
    session.add(record)
    session.flush()
    return record


def revise(session: Session, learner, assessment_id: uuid.UUID, answers: AssessmentAnswers) -> LearnerAssessment:
    original = get(session, learner, assessment_id)
    # Lock the immutable series root, so two updates of the same revision cannot both become the next revision.
    session.exec(select(LearnerAssessment).where(LearnerAssessment.series_id == original.series_id,
                                               LearnerAssessment.revision == 1).with_for_update()).one()
    latest = session.exec(select(LearnerAssessment).where(LearnerAssessment.series_id == original.series_id)
                           .order_by(LearnerAssessment.revision.desc()).limit(1)).one()
    if latest.id != assessment_id:
        raise ConflictError("This assessment has a newer revision. Reload it before reassessing.")
    record = LearnerAssessment(learner_id=learner.id, series_id=original.series_id, revision=original.revision + 1,
                              previous_revision_id=original.id, answers=validate(session, answers).model_dump(mode="json"))
    session.add(record)
    session.flush()
    return record


def remove_series(session: Session, learner, assessment_id: uuid.UUID) -> None:
    record = get(session, learner, assessment_id)
    session.exec(delete(LearnerAssessment).where(LearnerAssessment.learner_id == learner.id,
                                               LearnerAssessment.series_id == record.series_id))
    session.flush()
    session.expire_all()


def resolve(session: Session, learner, request) -> tuple[AssessmentAnswers | None, uuid.UUID | None]:
    if request.assessment_id is not None:
        if learner is None:
            raise AuthenticationError("Sign in to use a saved learner assessment.")
        record = get(session, learner, request.assessment_id)
        return validate(session, AssessmentAnswers.model_validate(record.answers)), record.id
    return (validate(session, request.assessment), None) if request.assessment is not None else (None, None)
