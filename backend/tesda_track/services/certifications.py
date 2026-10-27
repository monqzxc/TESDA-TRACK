import uuid

from sqlmodel import Session, select

from tesda_track.errors import ConflictError, InvalidRequestError
from tesda_track.models import Certification, Learner
from tesda_track.schemas.records import CertificationCreate, CertificationPublic, CertificationUpdate
from tesda_track.services import catalog
from tesda_track.services.ownership import get_owned

EDITABLE_FIELDS = ("title", "certificate_number", "issuing_body", "issued_on", "expires_on")
REQUIRED_FIELDS = ("title", "issuing_body")


def to_public(certification: Certification) -> CertificationPublic:
    qualification = catalog.summary(certification.qualification) if certification.qualification else None
    return CertificationPublic(
        id=certification.id, title=certification.title, qualification=qualification,
        certificate_number=certification.certificate_number, issuing_body=certification.issuing_body,
        issued_on=certification.issued_on, expires_on=certification.expires_on, verified=certification.verified,
        source=certification.source, created_at=certification.created_at, updated_at=certification.updated_at)


def list_for(session: Session, learner: Learner) -> list[Certification]:
    return list(session.exec(select(Certification).where(Certification.learner_id == learner.id)
                             .order_by(Certification.created_at.desc())))


def get(session: Session, learner: Learner, certification_id: uuid.UUID) -> Certification:
    return get_owned(session, Certification, certification_id, learner, "Certification")


def create(session: Session, learner: Learner, request: CertificationCreate) -> Certification:
    qualification = catalog.resolve_qualification(session, request.qualification_code) \
        if request.qualification_code else None
    certification = Certification(learner_id=learner.id, qualification=qualification,
                                  **request.model_dump(include=set(EDITABLE_FIELDS)))
    session.add(certification)
    session.flush()
    return certification


def update(session: Session, certification: Certification, request: CertificationUpdate) -> Certification:
    if certification.verified:
        raise ConflictError("Verified certifications can't be edited.")
    fields = request.model_fields_set
    if "qualification_code" in fields:
        code = request.qualification_code
        certification.qualification = catalog.resolve_qualification(session, code) if code else None
    for field in EDITABLE_FIELDS:
        value = getattr(request, field)
        if field in fields and (value is not None or field not in REQUIRED_FIELDS):
            setattr(certification, field, value)
    if certification.issued_on and certification.expires_on and certification.expires_on < certification.issued_on:
        raise InvalidRequestError("The expiry date can't be before the issue date.")
    session.flush()
    return certification
