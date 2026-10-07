"""Sync reference data from backend/seed/ into the database: python -m tesda_track.seed

The seed files are the source of truth for regions and the qualification catalog. Catalog rows that
disappear from the files are archived (is_active = false) rather than deleted, so learner records that
point at them stay valid. Default pathways are only created where missing, never overwritten, because
administrators curate them afterwards.
"""
import argparse
import json
import logging
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, TypeAdapter, ValidationError
from sqlmodel import Session, select

from tesda_track.models import (DELIVERY_MODES, ROUTES, STEP_KINDS, AssessmentCenter, AssessmentSchedule,
                                Competency, Pathway, PathwayStep, Qualification, Region, Sector, TrainingProgram,
                                TrainingProvider)

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


class RegionEntry(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=120)
    center_city: str = Field(min_length=1, max_length=120)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class DeliverySiteFields(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    region_code: str = Field(min_length=1, max_length=20)
    province: str | None = Field(default=None, max_length=100)
    city: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=300)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    contact_email: str | None = Field(default=None, max_length=254)
    contact_phone: str | None = Field(default=None, max_length=50)
    website: str | None = Field(default=None, max_length=300)


class DeliveryOfferingEntry(BaseModel):
    qualification_code: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    delivery_mode: Literal[DELIVERY_MODES] = "institution_based"
    duration_hours: int = Field(gt=0)
    cost: Decimal | None = Field(default=None, ge=0, decimal_places=2, max_digits=10)
    scholarship_available: bool = False
    start_days: int = Field(default=14, ge=0, le=730)
    duration_days: int = Field(default=180, gt=0, le=730)
    slots: int = Field(default=25, gt=0)
    assessment_days: int = Field(default=45, ge=1, le=730)
    assessment_slots: int = Field(default=15, gt=0)
    assessment_fee: Decimal | None = Field(default=None, ge=0, decimal_places=2, max_digits=10)


class DeliverySiteEntry(BaseModel):
    provider: DeliverySiteFields
    assessment_center: DeliverySiteFields
    offerings: list[DeliveryOfferingEntry] = Field(min_length=1)


class PathwayStepTemplate(BaseModel):
    kind: Literal[STEP_KINDS]
    title: str = Field(min_length=1, max_length=200)
    description: str = ""


class PathwayTemplate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    steps: list[PathwayStepTemplate] = Field(min_length=1)


@dataclass
class SyncReport:
    created: int = 0
    updated: int = 0
    archived: int = 0


@dataclass
class DeliverySyncReport:
    providers: int = 0
    programs: int = 0
    centers: int = 0
    schedules: int = 0
    updated: int = 0
    archived: int = 0

    @property
    def created(self) -> int:
        return self.providers + self.programs + self.centers + self.schedules


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


def sync_regions(session: Session, raw: object) -> SyncReport:
    try:
        entries = TypeAdapter(list[RegionEntry]).validate_python(raw)
    except ValidationError as error:
        raise SeedError(f"Invalid regions: {error}") from error
    report = SyncReport()
    existing = {region.code: region for region in session.exec(select(Region))}
    for position, entry in enumerate(entries, start=1):
        values = {**entry.model_dump(exclude={"code"}), "position": position}
        region = existing.get(entry.code)
        if region is None:
            session.add(Region(code=entry.code, **values))
            report.created += 1
        elif _assign(region, values):
            report.updated += 1
    session.flush()
    return report


def parse_delivery_sites(raw: object) -> list[DeliverySiteEntry]:
    """Validate the optional, clearly labelled delivery-site fixture before writing anything."""
    try:
        entries = TypeAdapter(list[DeliverySiteEntry]).validate_python(
            raw.get("sites", []) if isinstance(raw, dict) else raw)
    except (ValidationError, AttributeError) as error:
        raise SeedError(f"Invalid delivery sites: {error}") from error
    names = [entry.provider.name for entry in entries] + [entry.assessment_center.name for entry in entries]
    if any(not name.startswith("[Seed]") for name in names):
        raise SeedError("Delivery-site fixture names must start with '[Seed]' so invented records stay identifiable.")
    if len(set(names)) != len(names):
        raise SeedError("Delivery-site provider and assessment-center names must be unique.")
    for entry in entries:
        codes = [offering.qualification_code for offering in entry.offerings]
        if len(set(codes)) != len(codes):
            raise SeedError(f"{entry.provider.name}: each qualification may appear only once in offerings")
        if entry.provider.region_code != entry.assessment_center.region_code:
            raise SeedError(f"{entry.provider.name}: provider and assessment center must use the same region")
    return entries


def _site_values(entry: DeliverySiteFields) -> dict:
    return entry.model_dump(exclude={"name", "website"})


def _sync_site(session: Session, model, entry: DeliverySiteFields):
    row = session.exec(select(model).where(model.name == entry.name)).first()
    values = _site_values(entry)
    if row is None:
        row = model(name=entry.name, **values)
        session.add(row)
    else:
        for field, value in values.items():
            setattr(row, field, value)
        row.is_active = True
    if isinstance(row, TrainingProvider):
        row.website = entry.website
    session.flush()
    return row


def sync_delivery_sites(session: Session, raw: object) -> DeliverySyncReport:
    """Upsert deterministic development sites and their catalog-linked offerings.

    The fixture intentionally uses ``[Seed]`` names and never deletes rows. Entries removed from the
    fixture are archived, which keeps learner applications and reporting history referentially safe.
    """
    entries = parse_delivery_sites(raw)
    report = DeliverySyncReport()
    regions = {region.code for region in session.exec(select(Region))}
    qualifications = {qualification.code: qualification for qualification in session.exec(select(Qualification))}
    known_provider_names = {entry.provider.name for entry in entries}
    known_center_names = {entry.assessment_center.name for entry in entries}
    today = date.today()
    ph_time = timezone(timedelta(hours=8))

    for entry in entries:
        if entry.provider.region_code not in regions:
            raise SeedError(f"{entry.provider.name}: unknown region '{entry.provider.region_code}'")
        missing = sorted({o.qualification_code for o in entry.offerings} - qualifications.keys())
        if missing:
            raise SeedError(f"{entry.provider.name}: unknown qualification code(s): {', '.join(missing)}")

        provider_exists = session.exec(
            select(TrainingProvider).where(TrainingProvider.name == entry.provider.name)).first() is not None
        center_exists = session.exec(
            select(AssessmentCenter).where(AssessmentCenter.name == entry.assessment_center.name)).first() is not None
        provider = _sync_site(session, TrainingProvider, entry.provider)
        center = _sync_site(session, AssessmentCenter, entry.assessment_center)
        report.providers += not provider_exists
        report.centers += not center_exists
        for offering in entry.offerings:
            qualification = qualifications[offering.qualification_code]
            start = today + timedelta(days=offering.start_days)
            end = start + timedelta(days=offering.duration_days)
            values = {
                "title": offering.title,
                "description": offering.description or f"Seed catalog offering for {qualification.name}. Verify with TESDA before applying.",
                "delivery_mode": offering.delivery_mode,
                "duration_hours": offering.duration_hours,
                "cost": offering.cost,
                "scholarship_available": offering.scholarship_available,
                "start_date": start,
                "end_date": end,
                "slots": offering.slots,
                "is_active": True,
            }
            program = session.exec(select(TrainingProgram).where(
                TrainingProgram.provider_id == provider.id,
                TrainingProgram.qualification_id == qualification.id)).first()
            if program is None:
                session.add(TrainingProgram(provider=provider, qualification=qualification, **values))
                report.programs += 1
            else:
                if _assign(program, values):
                    report.updated += 1

            scheduled_at = datetime.combine(today + timedelta(days=offering.assessment_days), time(9, 0), ph_time)
            schedule = session.exec(select(AssessmentSchedule).where(
                AssessmentSchedule.center_id == center.id,
                AssessmentSchedule.qualification_id == qualification.id)).first()
            schedule_values = {"scheduled_at": scheduled_at, "slots": offering.assessment_slots,
                               "fee": offering.assessment_fee, "status": "open"}
            if schedule is None:
                session.add(AssessmentSchedule(center=center, qualification=qualification, **schedule_values))
                report.schedules += 1
            elif _assign(schedule, schedule_values):
                report.updated += 1
    session.flush()

    for provider in session.exec(select(TrainingProvider).where(TrainingProvider.name.startswith("[Seed]"))):
        if provider.name not in known_provider_names and provider.is_active:
            provider.is_active = False
            report.archived += 1
    for center in session.exec(select(AssessmentCenter).where(AssessmentCenter.name.startswith("[Seed]"))):
        if center.name not in known_center_names and center.is_active:
            center.is_active = False
            report.archived += 1
    session.flush()
    return report


def create_missing_pathways(session: Session, raw: object) -> SyncReport:
    try:
        templates = {route: PathwayTemplate.model_validate(raw[route]) for route in ROUTES}
    except (KeyError, TypeError, ValidationError) as error:
        raise SeedError(f"Invalid pathway templates: {error}") from error
    report = SyncReport()
    existing = set(session.exec(select(Pathway.qualification_id, Pathway.route)))
    for qualification in session.exec(select(Qualification).where(Qualification.is_active).order_by(Qualification.id)):
        for route, template in templates.items():
            if (qualification.id, route) in existing:
                continue
            fill = lambda text: text.replace("{qualification}", qualification.name)  # noqa: E731
            session.add(Pathway(
                qualification=qualification, route=route, title=fill(template.title),
                description=fill(template.description),
                steps=[PathwayStep(position=n, kind=step.kind, title=fill(step.title), description=fill(step.description))
                       for n, step in enumerate(template.steps, start=1)]))
            report.created += 1
    session.flush()
    return report


def _read(seed_dir: Path, name: str) -> object:
    return json.loads((seed_dir / name).read_text(encoding="utf-8"))


def seed_all(session: Session, seed_dir: Path = SEED_DIR) -> dict[str, SyncReport | DeliverySyncReport]:
    reports: dict[str, SyncReport | DeliverySyncReport] = {
        "regions": sync_regions(session, _read(seed_dir, "regions.json")),
        "qualifications": sync_catalog(session, parse_catalog(_read(seed_dir, "qualifications.json"))),
        "pathways": create_missing_pathways(session, _read(seed_dir, "pathways.json")),
    }
    delivery_file = seed_dir / "delivery_sites.json"
    if delivery_file.exists():
        from tesda_track.config import get_settings
        if get_settings().environment == "production":
            logger.warning("Skipping the development delivery-site fixture in production; load an approved T2MIS import instead.")
        else:
            reports["delivery"] = sync_delivery_sites(session, _read(seed_dir, "delivery_sites.json"))
    return reports


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
