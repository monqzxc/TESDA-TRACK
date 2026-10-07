"""Clearly fictional demo data for trying the app locally: python -m tesda_track.demo {load,remove}

Loads, for every region, two "[Demo]" training providers with programs and one "[Demo]" assessment center
with upcoming schedules, plus demo learners (…@demo.tesda-track.invalid, unusable passwords) whose goals,
readiness checks and applications give the reports something to show. Loading replaces earlier demo data.
Refused when ENVIRONMENT=production: real learners must never see invented providers or schedules.
"""
import argparse
import random
import secrets
import sys
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete
from sqlmodel import Session, select

from tesda_track.config import get_settings
from tesda_track.models import (AssessmentApplication, AssessmentCenter, AssessmentSchedule, Goal, Learner,
                                ReadinessCheck, RecommendationSession, Region, TrainingProgram, TrainingProvider, utcnow)
from tesda_track.schemas.delivery import ApplicationReview
from tesda_track.schemas.records import ReadinessCheckCreate, RecommendationSessionCreate, RecommendationSessionUpdate
from tesda_track.security import hash_password
from tesda_track.services import analysis, assessments, catalog, readiness_checks, recommendation_sessions

DEMO_PREFIX = "[Demo] "
DEMO_EMAIL_DOMAIN = "demo.tesda-track.invalid"
PHILIPPINE_TIME = timezone(timedelta(hours=8))
GOALS = [
    "I want to be a welder.", "I've worked as a welder for 5 years but I don't have an NC.",
    "I want to fix computers", "Gusto kong maging electrician", "I have 2 years experience in electrical wiring",
    "I want to become a chef", "Gusto kong maging cook sa restaurant", "I want to work as a waiter in a hotel",
    "I have no experience but I want to work in a kitchen", "I repair computers in our barangay for 3 years",
    "I want to work in a hotel but I don't know which qualification is suitable.",
    "I want to be a caregiver", "Gusto kong magtrabaho bilang barista", "I want to learn housekeeping for hotels",
    "I want to become a driver", "Marunong akong mag-ayos ng motor", "I want to learn bread and pastry production",
    "I want to install solar panels", "I want to work in a call center", "I want to learn dressmaking",
]
DELIVERY_MODES = ["institution_based"] * 6 + ["enterprise_based", "community_based", "online", "online"]


class DemoRefused(Exception):
    pass


@dataclass
class DemoReport:
    providers: int = 0
    programs: int = 0
    centers: int = 0
    schedules: int = 0
    learners: int = 0


def _near(rng: random.Random, latitude: float, longitude: float) -> tuple[float, float]:
    return round(latitude + rng.uniform(-0.06, 0.06), 4), round(longitude + rng.uniform(-0.06, 0.06), 4)


def _backdate(record, rng: random.Random) -> None:
    record.created_at = utcnow() - timedelta(days=rng.randint(0, 90), hours=rng.randint(0, 23))


def load(session: Session, learners: int = 40, seed: int = 7) -> DemoReport:
    if get_settings().environment == "production":
        raise DemoRefused("Demo data is never loaded in production.")
    remove(session)
    rng, report, today = random.Random(seed), DemoReport(), date.today()
    qualifications = catalog.active_qualifications(session)
    centers_by_region: dict[str, AssessmentCenter] = {}
    for region in session.exec(select(Region).order_by(Region.position)):
        for kind in ("Skills Institute", "Technical College"):
            latitude, longitude = _near(rng, region.latitude, region.longitude)
            provider = TrainingProvider(name=f"{DEMO_PREFIX}{region.center_city} {kind}", region_code=region.code,
                                        city=region.center_city, latitude=latitude, longitude=longitude)
            session.add(provider)
            report.providers += 1
            for qualification in rng.sample(qualifications, k=min(4, len(qualifications))):
                hours = rng.choice([160, 240, 268, 320, 436, 560])
                start = today + timedelta(days=rng.randint(-30, 120))
                scholarship = rng.random() < 0.5
                session.add(TrainingProgram(
                    provider=provider, qualification=qualification,
                    title=f"{qualification.name} ({start:%B %Y} batch)",
                    description=f"Demo program for {qualification.name}. Not a real offering.",
                    delivery_mode=rng.choice(DELIVERY_MODES), duration_hours=hours,
                    cost=Decimal(0) if scholarship else Decimal(rng.randrange(3000, 25001, 500)),
                    scholarship_available=scholarship, start_date=start,
                    end_date=start + timedelta(days=round(hours / 8 * 7 / 5)), slots=rng.choice([20, 25, 30])))
                report.programs += 1
        latitude, longitude = _near(rng, region.latitude, region.longitude)
        center = AssessmentCenter(name=f"{DEMO_PREFIX}{region.center_city} Assessment Center",
                                  region_code=region.code, city=region.center_city, latitude=latitude,
                                  longitude=longitude)
        session.add(center)
        centers_by_region[region.code] = center
        report.centers += 1
        for qualification in rng.sample(qualifications, k=min(4, len(qualifications))):
            when = datetime.combine(today + timedelta(days=rng.randint(7, 90)), time(8, 0), PHILIPPINE_TIME)
            session.add(AssessmentSchedule(center=center, qualification=qualification, scheduled_at=when,
                                           slots=rng.choice([10, 15, 20, 25]),
                                           fee=rng.choice([None, Decimal(500), Decimal(750), Decimal(1000)])))
            report.schedules += 1
    session.flush()
    for number in range(1, learners + 1):
        _demo_learner(session, rng, number)
        report.learners += 1
    session.flush()
    return report


def _demo_learner(session: Session, rng: random.Random, number: int) -> None:
    learner = Learner(email=f"learner{number:03d}@{DEMO_EMAIL_DOMAIN}", full_name=f"Demo Learner {number:03d}",
                      password_hash=hash_password(secrets.token_urlsafe(24)), privacy_consent_at=utcnow())
    session.add(learner)
    session.flush()
    _backdate(learner, rng)
    for goal_text in rng.sample(GOALS, k=rng.randint(1, 2)):
        request = RecommendationSessionCreate(query=goal_text)
        record = recommendation_sessions.start(session, learner, request, analysis.analyze_goal(session, goal_text))
        _backdate(record, rng)
        if not record.matches:
            continue
        code = record.matches[0]["qualification"]["code"]
        recommendation_sessions.update(session, record, RecommendationSessionUpdate(
            experience_years=rng.choice([0, 0.5, 2, 4]), has_certification=rng.random() < 0.2, qualification_code=code))
        if rng.random() < 0.5:
            session.add(Goal(learner_id=learner.id, title=f"Earn my {record.matches[0]['qualification']['name']}",
                             target_qualification_id=record.qualification_id))
        if rng.random() < 0.8:
            _readiness_and_assessment(session, rng, learner, record, code)


def _readiness_and_assessment(session: Session, rng: random.Random, learner: Learner, record: RecommendationSession,
                              code: str) -> None:
    qualification = catalog.get_active_qualification(session, code)
    answers = {c.id: rng.choices(["confident", "some_experience", "not_familiar"], weights=[45, 35, 20])[0]
               for c in catalog.active_competencies(qualification)}
    check = readiness_checks.create(session, learner, ReadinessCheckCreate(
        qualification_code=code, answers=answers, recommendation_session_id=record.id))
    _backdate(check, rng)
    if check.score < 50 or rng.random() < 0.4:
        return
    schedule = session.exec(select(AssessmentSchedule).join(AssessmentCenter).where(
        AssessmentSchedule.qualification_id == qualification.id, AssessmentCenter.name.startswith(DEMO_PREFIX),
        AssessmentSchedule.status == "open")).first()
    if schedule is None or assessments.seats_taken(session, schedule.id) >= schedule.slots:
        return
    application = assessments.apply(session, learner, schedule.id)
    if rng.random() < 0.7:
        assessments.review(session, application, ApplicationReview(status="approved"))
        if rng.random() < 0.5:
            result = "competent" if rng.random() < 0.75 else "not_yet_competent"
            assessments.review(session, application, ApplicationReview(status="completed", result=result))


def remove(session: Session) -> DemoReport:
    """Delete every demo record; learners' own records go with them through the database's cascades."""
    report = DemoReport()
    demo_learners = select(Learner.id).where(Learner.email.endswith("@" + DEMO_EMAIL_DOMAIN))
    demo_centers = select(AssessmentCenter.id).where(AssessmentCenter.name.startswith(DEMO_PREFIX))
    demo_schedules = select(AssessmentSchedule.id).where(AssessmentSchedule.center_id.in_(demo_centers))
    demo_providers = select(TrainingProvider.id).where(TrainingProvider.name.startswith(DEMO_PREFIX))
    report.learners = session.exec(delete(Learner).where(Learner.id.in_(demo_learners))).rowcount
    session.exec(delete(AssessmentApplication).where(AssessmentApplication.schedule_id.in_(demo_schedules)))
    report.schedules = session.exec(delete(AssessmentSchedule).where(AssessmentSchedule.id.in_(demo_schedules))).rowcount
    report.centers = session.exec(delete(AssessmentCenter).where(AssessmentCenter.id.in_(demo_centers))).rowcount
    report.programs = session.exec(delete(TrainingProgram).where(TrainingProgram.provider_id.in_(demo_providers))).rowcount
    report.providers = session.exec(delete(TrainingProvider).where(TrainingProvider.id.in_(demo_providers))).rowcount
    session.expire_all()
    return report


def main() -> None:
    from tesda_track.db import get_engine
    from tesda_track.services import embeddings

    parser = argparse.ArgumentParser(description="Load or remove clearly fictional demo data.")
    parser.add_argument("command", choices=("load", "remove"))
    parser.add_argument("--learners", type=int, default=40, help="demo learners to create (load only)")
    parser.add_argument("--seed", type=int, default=7, help="random seed, for repeatable demo data")
    args = parser.parse_args()
    with Session(get_engine()) as session:
        try:
            report = load(session, args.learners, args.seed) if args.command == "load" else remove(session)
        except DemoRefused as error:
            sys.exit(str(error))
        if args.command == "load" and (embedder := embeddings.get_embedder()) is not None:
            embeddings.sync(session, embedder)  # so demo programs take part in semantic ranking
        session.commit()
    verb = "Loaded" if args.command == "load" else "Removed"
    print(f"{verb} {report.providers} providers, {report.programs} programs, {report.centers} assessment centers, "
          f"{report.schedules} schedules and {report.learners} learners.")


if __name__ == "__main__":
    main()
