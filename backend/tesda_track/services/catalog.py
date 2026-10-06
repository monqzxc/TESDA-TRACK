"""Catalog queries, plus conversion into the dict shape the rule-based services expect."""
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from tesda_track.errors import InvalidRequestError, NotFoundError
from tesda_track.models import Competency, Qualification
from tesda_track.schemas.catalog import CompetencyPublic, QualificationPublic, QualificationSummary


def _with_details(query):
    return query.options(selectinload(Qualification.sector), selectinload(Qualification.competencies))


def active_qualifications(session: Session) -> list[Qualification]:
    return list(session.exec(_with_details(select(Qualification).where(Qualification.is_active))
                             .order_by(Qualification.id)))


def get_active_qualification(session: Session, code: str) -> Qualification:
    query = _with_details(select(Qualification).where(Qualification.code == code, Qualification.is_active))
    qualification = session.exec(query).first()
    if qualification is None:
        raise NotFoundError(f"Qualification '{code}' was not found.")
    return qualification


def resolve_qualification(session: Session, code: str) -> Qualification:
    """For codes inside request bodies: an unknown code is invalid input (422) rather than a missing page."""
    try:
        return get_active_qualification(session, code)
    except NotFoundError as error:
        raise InvalidRequestError(error.detail) from None


def active_competencies(qualification: Qualification) -> list[Competency]:
    return [c for c in qualification.competencies if c.is_active]


def rule_view(qualification: Qualification) -> dict:
    return {"code": qualification.code, "name": qualification.name, "sector": qualification.sector.name,
            "skill_label": qualification.skill_label, "career_keywords": list(qualification.career_keywords),
            "possible_jobs": list(qualification.possible_jobs),
            "competencies": [{"id": c.id, "name": c.name, "category": c.category}
                             for c in active_competencies(qualification)]}


def summary(qualification: Qualification) -> QualificationSummary:
    return QualificationSummary(code=qualification.code, name=qualification.name, sector=qualification.sector.name)


def to_public(qualification: Qualification) -> QualificationPublic:
    return QualificationPublic(**summary(qualification).model_dump(), possible_jobs=list(qualification.possible_jobs),
                               competencies=[CompetencyPublic.model_validate(c)
                                             for c in active_competencies(qualification)])
