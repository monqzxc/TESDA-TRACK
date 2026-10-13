"""Fail-closed service verification; unknown evidence never proves eligibility."""
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import tuple_
from sqlalchemy.dialects.postgresql import insert
from pydantic import ValidationError
from sqlmodel import Session, select

from tesda_track.errors import InvalidRequestError
from tesda_track.models import (AssessmentCenter, Certification, Qualification, ServiceVerification,
                                TrainingProvider, utcnow)
from tesda_track.schemas.verification import (AvailabilityPublic, AvailabilityWrite, EligibilityCheck, EligibilityPublic,
                                             VerificationPublic, VerificationWrite)
from tesda_track.services import catalog

PHILIPPINE_TIME = ZoneInfo("Asia/Manila")


def effective_status(record, now: datetime) -> str:
    if record is None:
        return "unknown"
    if record.is_synthetic:
        return "unknown"
    if record.status != "verified":
        return record.status
    if not all((record.source_name, record.source_reference, record.reviewed_at, record.review_due_at)):
        return "unknown"
    if record.reviewed_at > now or (record.valid_from and record.valid_from > now):
        return "unknown"
    if record.review_due_at <= now or (record.valid_until and record.valid_until <= now):
        return "expired"
    return "verified"


def public(record, now: datetime | None = None) -> VerificationPublic:
    if record is None:
        return VerificationPublic()
    return VerificationPublic(status=effective_status(record, now or utcnow()), **{
        field: getattr(record, field) for field in VerificationPublic.model_fields if field != "status"})


def get(session: Session, kind: str, site_id: int, qualification_id: int):
    key = (kind, site_id, qualification_id)
    cache = session.info.setdefault("service_verifications", {})
    if key not in cache:
        column = ServiceVerification.provider_id if kind == "training" else ServiceVerification.center_id
        cache[key] = session.exec(select(ServiceVerification).where(
            column == site_id, ServiceVerification.qualification_id == qualification_id)).first()
    return cache[key]


def preload(session: Session, kind: str, pairs: set[tuple[int, int]]) -> None:
    """Batch lookup, including missing records, to keep listing/ranking queries bounded."""
    if not pairs:
        return
    column = ServiceVerification.provider_id if kind == "training" else ServiceVerification.center_id
    cache = session.info.setdefault("service_verifications", {})
    for site_id, qualification_id in pairs:
        cache[(kind, site_id, qualification_id)] = None
    for row in session.exec(select(ServiceVerification).where(tuple_(column, ServiceVerification.qualification_id).in_(pairs))):
        site_id = row.provider_id if kind == "training" else row.center_id
        cache[(kind, site_id, row.qualification_id)] = row


def save(session: Session, kind: str, site_id: int, code: str, request: VerificationWrite):
    site_type = TrainingProvider if kind == "training" else AssessmentCenter
    if session.get(site_type, site_id) is None:
        raise InvalidRequestError("The provider or assessment center was not found.")
    qualification = catalog.resolve_qualification(session, code)
    for rule in request.requirements:
        if rule.qualification_code:
            catalog.resolve_qualification(session, rule.qualification_code)
    site_column = "provider_id" if kind == "training" else "center_id"
    values = request.model_dump(exclude={"requirements"})
    values["requirements"] = [rule.model_dump() for rule in request.requirements]
    statement = insert(ServiceVerification).values(**values, **{site_column: site_id}, qualification_id=qualification.id)
    session.exec(statement.on_conflict_do_update(
        index_elements=[site_column, "qualification_id"], set_={**values, "updated_at": utcnow()}))
    session.flush()
    session.expire_all()
    session.info.pop("service_verifications", None)
    return get(session, kind, site_id, qualification.id)


def certificates(session: Session, learner) -> dict[str, list[Certification]] | None:
    if learner is None:
        return None
    result = {}
    rows = session.exec(select(Certification, Qualification.code).join(
        Qualification, Certification.qualification_id == Qualification.id).where(
        Certification.learner_id == learner.id, Certification.verified))
    for certificate, code in rows:
        result.setdefault(code, []).append(certificate)
    return result


def eligibility(record, evidence: dict | None, now: datetime) -> EligibilityPublic:
    checks = []
    if record is None or not record.requirements_reviewed or effective_status(record, now) != "verified":
        return EligibilityPublic(checks=[EligibilityCheck(description="Mandatory prerequisites",
            status="unknown", reason="Current authoritative prerequisite information requires verification.")])
    today = now.astimezone(PHILIPPINE_TIME).date()
    for rule in record.requirements:
        status, reason = "unknown", "This prerequisite requires manual verification."
        if rule["kind"] == "verified_certification":
            candidates = (evidence or {}).get(rule["qualification_code"], [])
            if any(c.issued_on is not None and c.issued_on <= today and
                   (c.expires_on is None or c.expires_on >= today) for c in candidates):
                status, reason = "satisfied", "A current verified qualification certificate is on your account."
            elif candidates and all((c.expires_on is not None and c.expires_on < today) or
                                    (c.issued_on is not None and c.issued_on > today) for c in candidates):
                status, reason = "unsatisfied", "The recorded certificates are expired or not yet valid."
            else:
                reason = "A current verified certificate is required; missing or self-reported records do not prove it."
        checks.append(EligibilityCheck(description=rule["description"], status=status, reason=reason))
    status = "unsatisfied" if any(c.status == "unsatisfied" for c in checks) else (
        "unknown" if any(c.status == "unknown" for c in checks) else "satisfied")
    return EligibilityPublic(status=status, checks=checks)


def availability(record, now: datetime | None = None) -> AvailabilityPublic:
    now = now or utcnow()
    status = record.availability_status
    if not all((record.availability_source, record.availability_checked_at, record.availability_valid_until)):
        status = "unknown"
    elif record.availability_checked_at > now or record.availability_valid_until <= now:
        status = "unknown"
    return AvailabilityPublic(status=status, source_reference=record.availability_source,
                              checked_at=record.availability_checked_at, valid_until=record.availability_valid_until)


def validate_availability_update(record, request) -> None:
    values = {field: getattr(request, field) if field in request.model_fields_set else getattr(record, field)
              for field in AvailabilityWrite.model_fields}
    try:
        AvailabilityWrite.model_validate(values)
    except ValidationError:
        raise InvalidRequestError("Availability changes need a valid status, source and observation/expiry timestamps.") from None


def availability_needs_review(record, request, fields: set[str]) -> bool:
    """An observation about the old intake does not confirm a changed schedule or offering."""
    changed = any(field in request.model_fields_set and getattr(request, field) != getattr(record, field)
                  for field in fields)
    return changed and not set(AvailabilityWrite.model_fields).issubset(request.model_fields_set)


def require_application_eligibility(session: Session, schedule, learner) -> None:
    now = utcnow()
    if not schedule.center.is_active or not schedule.qualification.is_active:
        raise InvalidRequestError("This center or qualification is no longer active.")
    record = get(session, "assessment", schedule.center_id, schedule.qualification_id)
    if effective_status(record, now) != "verified":
        raise InvalidRequestError("This center's authority for this qualification requires current verification.")
    if availability(schedule, now).status != "available":
        raise InvalidRequestError("Current availability of this assessment requires confirmation.")
    if eligibility(record, certificates(session, learner), now).status != "satisfied":
        raise InvalidRequestError("Mandatory prerequisites are unmet or require verification before applying.")
