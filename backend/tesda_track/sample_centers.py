"""Labelled sample centers for the December 2 demo, while TESDA's approval of its official lists is pending
(US-0017 AC8; Product Owner decision, 19 November 2026).

    python -m tesda_track.sample_centers load              # preview what would be added
    python -m tesda_track.sample_centers load --commit     # write it
    python -m tesda_track.sample_centers remove --commit   # take every sample center off again

Every region gets two sample training providers, which share the qualifications between them, and one sample
assessment center with an upcoming schedule for every qualification. Every record is fictional: "[Sample]" names,
data_status "example", a source naming this as sample data, invented coordinates near the region's center city and
no contact details. Nothing official is changed or deleted.

Sample programs also carry sample scholarships (US-0019), marked as sample data: in each region three of every four
qualifications have one open until after the demo, and the fourth has one that already closed, so the demo shows both
the "Scholarship open" tag and a closed scholarship whose tag has gone. Which ones rotate from region to region, so
every qualification has an open scholarship in most regions.

Loading alone shows nobody anything new: set CENTER_DATA=sample and restart the API, and learners then see only these
centers, each labelled as sample data. Set CENTER_DATA=official (or remove it) to return to the official lists.
Unlike tesda_track.demo, this runs in production, because the demo deployment needs it. Loading again first removes
the previous sample set, so the result is the same each time.
"""
import argparse
import json
import random
from dataclasses import asdict, dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete
from sqlmodel import Session, select

from tesda_track.sample_scholarships import SAMPLE_CLOSED_ON, SAMPLE_CLOSES_ON
from tesda_track.models import (AssessmentApplication, AssessmentCenter, AssessmentSchedule, Region, TrainingProgram,
                                TrainingProvider)
from tesda_track.services import catalog
from tesda_track.services.center_listing import SAMPLE_REFERENCE, SAMPLE_STATUS

SAMPLE_PREFIX = "[Sample] "
SOURCE_NAME = "Sample data for the December 2 demo. Not an official TESDA list."
SOURCE_REFERENCE = SAMPLE_REFERENCE
PHILIPPINE_TIME = timezone(timedelta(hours=8))
PROVIDER_KINDS = ("Skills Training Center", "Technical Institute")
DELIVERY_MODES = ["institution_based"] * 6 + ["enterprise_based", "community_based", "online"]


@dataclass
class SampleReport:
    providers: int = 0
    programs: int = 0
    centers: int = 0
    schedules: int = 0
    applications_removed: int = 0


def _provenance(today: date) -> dict:
    return {"data_status": SAMPLE_STATUS, "source_name": SOURCE_NAME, "source_reference": SOURCE_REFERENCE,
            "source_updated_on": today}


def _near(rng: random.Random, latitude: float, longitude: float) -> tuple[float, float]:
    return round(latitude + rng.uniform(-0.05, 0.05), 4), round(longitude + rng.uniform(-0.05, 0.05), 4)


def load(session: Session, seed: int = 2026, today: date | None = None) -> SampleReport:
    today = today or date.today()
    report = remove(session)
    report = SampleReport(applications_removed=report.applications_removed)
    rng = random.Random(seed)
    qualifications = catalog.active_qualifications(session)
    provenance = _provenance(today)
    for place, region in enumerate(session.exec(select(Region).order_by(Region.position))):
        providers = []
        for kind in PROVIDER_KINDS:
            latitude, longitude = _near(rng, region.latitude, region.longitude)
            provider = TrainingProvider(name=f"{SAMPLE_PREFIX}{region.center_city} {kind}", region_code=region.code,
                                        city=region.center_city, latitude=latitude, longitude=longitude,
                                        **provenance)
            session.add(provider)
            providers.append(provider)
            report.providers += 1
        for index, qualification in enumerate(qualifications):
            hours = rng.choice([160, 240, 268, 320, 436])
            start = today + timedelta(days=rng.randint(7, 90))
            session.add(TrainingProgram(
                provider=providers[index % len(providers)], qualification=qualification,
                title=f"{qualification.name} (sample {start:%B %Y} batch)",
                description=f"Sample program for {qualification.name}, for the December 2 demo. Not a real offering.",
                delivery_mode=rng.choice(DELIVERY_MODES), duration_hours=hours, start_date=start,
                end_date=start + timedelta(days=round(hours / 8 * 7 / 5)), slots=rng.choice([20, 25, 30]),
                scholarship_available=True, scholarship_is_sample=True,
                scholarship_closes_on=SAMPLE_CLOSED_ON if (index + place) % 4 == 2 else SAMPLE_CLOSES_ON,
                **provenance))
            report.programs += 1
        latitude, longitude = _near(rng, region.latitude, region.longitude)
        center = AssessmentCenter(name=f"{SAMPLE_PREFIX}{region.center_city} Assessment Center",
                                  region_code=region.code, city=region.center_city, latitude=latitude,
                                  longitude=longitude, **provenance)
        session.add(center)
        report.centers += 1
        for qualification in qualifications:
            when = datetime.combine(today + timedelta(days=rng.randint(14, 100)), time(8, 0), PHILIPPINE_TIME)
            session.add(AssessmentSchedule(center=center, qualification=qualification, scheduled_at=when,
                                           slots=rng.choice([10, 15, 20]), fee=rng.choice([None, Decimal(750)]),
                                           **provenance))
            report.schedules += 1
    session.flush()
    return report


def remove(session: Session) -> SampleReport:
    """Delete every sample center with its programs and schedules, and any application made to a sample schedule."""
    report = SampleReport()
    providers = select(TrainingProvider.id).where(TrainingProvider.name.startswith(SAMPLE_PREFIX),
                                                  TrainingProvider.source_reference == SOURCE_REFERENCE)
    centers = select(AssessmentCenter.id).where(AssessmentCenter.name.startswith(SAMPLE_PREFIX),
                                                AssessmentCenter.source_reference == SOURCE_REFERENCE)
    schedules = select(AssessmentSchedule.id).where(AssessmentSchedule.center_id.in_(centers))
    report.applications_removed = session.exec(
        delete(AssessmentApplication).where(AssessmentApplication.schedule_id.in_(schedules))).rowcount
    report.schedules = session.exec(delete(AssessmentSchedule).where(AssessmentSchedule.id.in_(schedules))).rowcount
    report.centers = session.exec(delete(AssessmentCenter).where(AssessmentCenter.id.in_(centers))).rowcount
    report.programs = session.exec(delete(TrainingProgram).where(TrainingProgram.provider_id.in_(providers))).rowcount
    report.providers = session.exec(delete(TrainingProvider).where(TrainingProvider.id.in_(providers))).rowcount
    session.expire_all()
    return report


def main(argv=None) -> None:
    from tesda_track.db import get_engine
    from tesda_track.services import embeddings

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=("load", "remove"))
    parser.add_argument("--commit", action="store_true", help="write the change (default: preview only)")
    parser.add_argument("--seed", type=int, default=2026, help="random seed, for the same sample set each time")
    args = parser.parse_args(argv)
    with Session(get_engine()) as session:
        report = load(session, args.seed) if args.command == "load" else remove(session)
        if args.commit:
            if args.command == "load" and (embedder := embeddings.get_embedder()) is not None:
                embeddings.sync(session, embedder)  # so sample programs take part in semantic ranking
            session.commit()
        else:
            session.rollback()
    print(json.dumps({"command": args.command, "committed": args.commit, **asdict(report)}, indent=2))


if __name__ == "__main__":
    main()
