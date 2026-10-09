"""Catalog queries, plus conversion into the dict shape the rule-based services expect."""
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from tesda_track.errors import InvalidRequestError, NotFoundError
from tesda_track.models import Competency, Qualification
from tesda_track.schemas.catalog import CompetencyPublic, QualificationPublic, QualificationSummary

# Every inserted, updated or deleted row gets a new xmin (the id of the transaction that wrote it), so the row
# count plus the sum of xmins changes whenever the catalog does: from the seed in another process, or inside a
# transaction that later rolls back. About 2 ms, against about 65 ms to load the catalog through the ORM.
_CATALOG_VERSION = text("""
    SELECT count(*), coalesce(sum(xmin::text::bigint), 0) FROM (
        SELECT xmin FROM qualification UNION ALL SELECT xmin FROM competency UNION ALL SELECT xmin FROM sector
    ) AS catalog_rows""")


def _with_details(query):
    return query.options(selectinload(Qualification.sector), selectinload(Qualification.competencies))


def active_qualifications(session: Session) -> list[Qualification]:
    return list(session.exec(_with_details(select(Qualification).where(Qualification.is_active))
                             .order_by(Qualification.id)))


@dataclass(frozen=True)
class CatalogItem:
    """One active qualification, read once and shared by every request until the catalog changes."""
    id: int
    code: str
    sector: str
    possible_jobs: tuple[str, ...]
    rules: dict  # the rule-based services' view; read-only
    summary: QualificationSummary
    public: QualificationPublic


@dataclass(frozen=True)
class CatalogSnapshot:
    version: tuple
    items: tuple[CatalogItem, ...]

    @property
    def rule_views(self) -> list[dict]:
        return [item.rules for item in self.items]


_snapshot: CatalogSnapshot | None = None


def snapshot(session: Session) -> CatalogSnapshot:
    """The active catalog as plain values, rebuilt only when a qualification, competency or sector changed."""
    global _snapshot
    version = tuple(session.exec(_CATALOG_VERSION).one())
    current = _snapshot
    if current is None or current.version != version:
        items = tuple(CatalogItem(id=q.id, code=q.code, sector=q.sector.name, possible_jobs=tuple(q.possible_jobs),
                                  rules=rule_view(q), summary=summary(q), public=to_public(q))
                      for q in active_qualifications(session))
        current = _snapshot = CatalogSnapshot(version, items)
    return current


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
