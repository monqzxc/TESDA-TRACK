"""TESDA's official qualification codes (T2MIS, TSP) and how they map onto TESDA-TRACK's own."""
import csv
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session, select

from tesda_track.models import OfficialQualificationCode, Qualification


@dataclass
class CrosswalkReport:
    linked: int = 0
    skipped: list[str] = field(default_factory=list)


def read_crosswalk(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def import_crosswalk(session: Session, path: Path) -> CrosswalkReport:
    """Upsert every link whose qualification is in the catalog; the rest are named in skipped."""
    ids = dict(session.exec(select(Qualification.code, Qualification.id)).all())
    report = CrosswalkReport()
    for row in read_crosswalk(path):
        qualification_id = ids.get(row["qualification_code"])
        if qualification_id is None:
            if row["official_code"] not in report.skipped:
                report.skipped.append(row["official_code"])
            continue
        values = {
            "official_code": row["official_code"], "qualification_id": qualification_id,
            "relation": row["relation"], "official_title": row["official_title"], "level": row["level"],
            "promulgated": date.fromisoformat(row["promulgated"]) if row["promulgated"] else None,
            "enabled_in_t2mis": row["enabled_in_t2mis"].strip().casefold() == "true"}
        changes = {key: value for key, value in values.items() if key not in ("official_code", "qualification_id")}
        session.execute(insert(OfficialQualificationCode).values(**values).on_conflict_do_update(
            index_elements=["official_code", "qualification_id"], set_=changes))
        report.linked += 1
    return report


def resolve_code(session: Session, code: str) -> list[tuple[Qualification, str]]:
    """The active qualifications a code stands for with how: our own code gives itself ("same"), an official code
    gives its links, anything else gives nothing."""
    own = session.exec(select(Qualification).where(Qualification.code == code, Qualification.is_active)).first()
    if own is not None:
        return [(own, "same")]
    query = (select(Qualification, OfficialQualificationCode.relation)
             .join(OfficialQualificationCode, OfficialQualificationCode.qualification_id == Qualification.id)
             .where(OfficialQualificationCode.official_code == code.strip().upper(), Qualification.is_active)
             .order_by(Qualification.code))
    return [(qualification, relation) for qualification, relation in session.exec(query).all()]


def official_codes_of(session: Session, qualification_id: int) -> list[OfficialQualificationCode]:
    return list(session.exec(select(OfficialQualificationCode)
                             .where(OfficialQualificationCode.qualification_id == qualification_id)
                             .order_by(OfficialQualificationCode.official_code)).all())
