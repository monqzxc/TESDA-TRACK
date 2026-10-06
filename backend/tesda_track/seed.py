"""Sync reference data from backend/seed/ into the database: python -m tesda_track.seed

The seed files are the source of truth for the qualification catalog. Rows that disappear from
the files are archived (is_active = false) rather than deleted, so learner records that point
at them stay valid.
"""
import argparse
import json
import logging
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, TypeAdapter, ValidationError
from sqlmodel import Session, select

from tesda_track.models import Competency, Qualification, Sector

SEED_DIR = Path(__file__).resolve().parents[1] / "seed"
logger = logging.getLogger(__name__)


class SeedError(ValueError):
    pass


class CompetencyEntry(BaseModel):
    id: int = Field(gt=0, description="The competency's position within its qualification")
    name: str = Field(min_length=1, max_length=255)
    category: Literal["Basic", "Common", "Core"]


class QualificationEntry(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=200)
    sector: str = Field(min_length=1, max_length=120)
    skill_label: str = Field(min_length=1, max_length=120)
    career_keywords: list[str] = Field(min_length=1)
    possible_jobs: list[str] = Field(min_length=1)
    competencies: list[CompetencyEntry] = Field(min_length=1)


@dataclass
class SyncReport:
    created: int = 0
    updated: int = 0
    archived: int = 0


def parse_catalog(raw: object) -> list[QualificationEntry]:
    try:
        entries = TypeAdapter(list[QualificationEntry]).validate_python(raw)
    except ValidationError as error:
        raise SeedError(f"Invalid qualification catalog: {error}") from error
    duplicate_codes = [code for code, count in Counter(e.code for e in entries).items() if count > 1]
    if duplicate_codes:
        raise SeedError(f"Duplicate qualification codes: {', '.join(duplicate_codes)}")
    for entry in entries:
        if len({c.id for c in entry.competencies}) != len(entry.competencies):
            raise SeedError(f"{entry.code}: competency ids (positions) must be unique")
    return entries


def _assign(row: object, values: dict) -> bool:
    changed = False
    for field, value in values.items():
        if getattr(row, field) != value:
            setattr(row, field, value)
            changed = True
    return changed


def sync_catalog(session: Session, entries: list[QualificationEntry]) -> SyncReport:
    report = SyncReport()
    sectors = {sector.name: sector for sector in session.exec(select(Sector))}
    remaining = {q.code: q for q in session.exec(select(Qualification))}
    for entry in entries:
        sector = sectors.get(entry.sector)
        if sector is None:
            sector = sectors[entry.sector] = Sector(name=entry.sector)
            session.add(sector)
        values = {"name": entry.name, "skill_label": entry.skill_label, "career_keywords": entry.career_keywords,
                  "possible_jobs": entry.possible_jobs, "is_active": True}
        qualification = remaining.pop(entry.code, None)
        if qualification is None:
            qualification = Qualification(code=entry.code, sector=sector, **values)
            session.add(qualification)
            report.created += 1
        elif _assign(qualification, values) | (qualification.sector is not sector):
            qualification.sector = sector
            report.updated += 1
        _sync_competencies(qualification, entry.competencies, report)
    for qualification in remaining.values():
        if qualification.is_active:
            qualification.is_active = False
            report.archived += 1
    session.flush()
    return report


def _sync_competencies(qualification: Qualification, entries: list[CompetencyEntry], report: SyncReport) -> None:
    existing = {c.position: c for c in qualification.competencies}
    for entry in entries:
        values = {"name": entry.name, "category": entry.category, "is_active": True}
        competency = existing.pop(entry.id, None)
        if competency is None:
            qualification.competencies.append(Competency(position=entry.id, **values))
        elif _assign(competency, values):
            report.updated += 1
    for competency in existing.values():
        if competency.is_active:
            competency.is_active = False
            report.archived += 1


def seed_all(session: Session, seed_dir: Path = SEED_DIR) -> dict[str, SyncReport]:
    raw = json.loads((seed_dir / "qualifications.json").read_text(encoding="utf-8"))
    return {"qualifications": sync_catalog(session, parse_catalog(raw))}


def main() -> None:
    from tesda_track.db import get_engine

    parser = argparse.ArgumentParser(description="Sync reference data from seed files into the database.")
    parser.add_argument("--dir", type=Path, default=SEED_DIR, help="directory containing the seed JSON files")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    with Session(get_engine()) as session:
        reports = seed_all(session, args.dir)
        session.commit()
    for name, report in reports.items():
        logger.info("%s: %d created, %d updated, %d archived", name, report.created, report.updated, report.archived)


if __name__ == "__main__":
    main()
