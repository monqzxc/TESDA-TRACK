"""Aggregate reports for administrators. Only counts and averages leave this module, never individual records."""
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import distinct, func, or_
from sqlmodel import Session, select

from tesda_track.models import (AssessmentApplication, AssessmentCenter, AssessmentSchedule, Certification, Learner,
                                RankingAudit, ReadinessAnswer, ReadinessCheck, RecommendationSession, Region,
                                TrainingProgram, TrainingProvider, utcnow)
from tesda_track.schemas.progress import CertificationCounts
from tesda_track.schemas.reports import (CompetencyGap, DateRange, Funnel, Overview, QualificationDemand,
                                         RegionSupply)
from tesda_track.services import assessments, catalog

PHILIPPINE_TIME = timezone(timedelta(hours=8))


def _within(column, period: DateRange):
    """Conditions keeping `column` (a timestamp) inside the period's Philippine-time dates."""
    conditions = []
    if period.date_from:
        conditions.append(column >= datetime.combine(period.date_from, time.min, PHILIPPINE_TIME))
    if period.date_to:
        conditions.append(column < datetime.combine(period.date_to + timedelta(days=1), time.min, PHILIPPINE_TIME))
    return conditions


def _count(session: Session, model, period: DateRange, *conditions) -> int:
    return session.exec(select(func.count()).select_from(model).where(*_within(model.created_at, period),
                                                                      *conditions)).one()


def overview(session: Session, period: DateRange) -> Overview:
    average = session.exec(select(func.avg(ReadinessCheck.score)).where(*_within(ReadinessCheck.created_at, period))).one()
    applications = session.exec(select(AssessmentApplication.status, func.count())
                                .where(*_within(AssessmentApplication.created_at, period))
                                .group_by(AssessmentApplication.status))
    total, verified = session.exec(select(func.count(), func.count().filter(Certification.verified))
                                   .where(*_within(Certification.created_at, period))).one()
    return Overview(
        learners=_count(session, Learner, period),
        recommendation_sessions=_count(session, RecommendationSession, period),
        semantic_analyses=_count(session, RecommendationSession, period, RecommendationSession.analysis_source == "ai"),
        readiness_checks=_count(session, ReadinessCheck, period),
        average_readiness=round(float(average), 1) if average is not None else None,
        training_rankings=_count(session, RankingAudit, period),
        assessment_applications={status: count for status, count in applications},
        certifications=CertificationCounts(total=total, verified=verified))


def _grouped(session: Session, query) -> dict:
    return {key: value for key, value in session.exec(query)}


def qualification_demand(session: Session, period: DateRange) -> list[QualificationDemand]:
    top_code = func.jsonb_extract_path_text(RecommendationSession.matches, "0", "qualification", "code")
    top_match = _grouped(session, select(top_code, func.count()).where(
        *_within(RecommendationSession.created_at, period), top_code.is_not(None)).group_by(top_code))
    chosen = _grouped(session, select(RecommendationSession.qualification_id, func.count()).where(
        *_within(RecommendationSession.created_at, period)).group_by(RecommendationSession.qualification_id))
    readiness = {qualification_id: (count, average) for qualification_id, count, average in session.exec(
        select(ReadinessCheck.qualification_id, func.count(), func.avg(ReadinessCheck.score))
        .where(*_within(ReadinessCheck.created_at, period)).group_by(ReadinessCheck.qualification_id))}
    applications = {qualification_id: (count, competent) for qualification_id, count, competent in session.exec(
        select(AssessmentSchedule.qualification_id, func.count(),
               func.count().filter(AssessmentApplication.result == "competent"))
        .join(AssessmentSchedule).where(*_within(AssessmentApplication.created_at, period))
        .group_by(AssessmentSchedule.qualification_id))}
    certified = _grouped(session, select(Certification.qualification_id, func.count()).where(
        Certification.verified, *_within(Certification.created_at, period)).group_by(Certification.qualification_id))
    rows = []
    for qualification in catalog.active_qualifications(session):
        checks, average = readiness.get(qualification.id, (0, None))
        applied, competent = applications.get(qualification.id, (0, 0))
        rows.append(QualificationDemand(
            qualification=catalog.summary(qualification), top_match=top_match.get(qualification.code, 0),
            chosen=chosen.get(qualification.id, 0), readiness_checks=checks,
            average_readiness=round(float(average), 1) if average is not None else None,
            assessment_applications=applied, competent=competent, certified=certified.get(qualification.id, 0)))
    return rows


def skill_gaps(session: Session, qualification_code: str, period: DateRange) -> list[CompetencyGap]:
    qualification = catalog.get_active_qualification(session, qualification_code)
    counts: dict[int, dict[str, int]] = {}
    for competency_id, answer, count in session.exec(
            select(ReadinessAnswer.competency_id, ReadinessAnswer.answer, func.count()).join(ReadinessCheck)
            .where(ReadinessCheck.qualification_id == qualification.id, *_within(ReadinessCheck.created_at, period))
            .group_by(ReadinessAnswer.competency_id, ReadinessAnswer.answer)):
        counts.setdefault(competency_id, {})[answer] = count
    rows = []
    for competency in catalog.active_competencies(qualification):
        tally = counts.get(competency.id, {})
        answers = sum(tally.values())
        gaps = tally.get("some_experience", 0) + tally.get("not_familiar", 0)
        rows.append(CompetencyGap(
            competency_id=competency.id, position=competency.position, name=competency.name, answers=answers,
            confident=tally.get("confident", 0), some_experience=tally.get("some_experience", 0),
            not_familiar=tally.get("not_familiar", 0), gap_rate=round(gaps / answers, 3) if answers else None))
    return rows


def funnel(session: Session, period: DateRange) -> Funnel:
    def learners_with(model, *conditions) -> int:
        return session.exec(select(func.count(distinct(model.learner_id)))
                            .where(*_within(model.created_at, period), *conditions)).one()

    return Funnel(registered=_count(session, Learner, period),
                  saved_a_recommendation=learners_with(RecommendationSession),
                  checked_readiness=learners_with(ReadinessCheck),
                  applied_for_assessment=learners_with(AssessmentApplication,
                                                       AssessmentApplication.status != "withdrawn"),
                  certified=learners_with(Certification, Certification.verified))


def supply(session: Session) -> list[RegionSupply]:
    """Current training and assessment capacity per region (not limited to a date range)."""
    today = date.today()
    providers = _grouped(session, select(TrainingProvider.region_code, func.count())
                         .where(TrainingProvider.is_active).group_by(TrainingProvider.region_code))
    programs = _grouped(session, select(TrainingProvider.region_code, func.count()).select_from(TrainingProgram)
                        .join(TrainingProvider)
                        .where(TrainingProgram.is_active, TrainingProvider.is_active,
                               or_(TrainingProgram.end_date.is_(None), TrainingProgram.end_date >= today))
                        .group_by(TrainingProvider.region_code))
    open_seats = func.greatest(AssessmentSchedule.slots - assessments.seats_taken_subquery(), 0)
    schedules = {region: (count, seats) for region, count, seats in session.exec(
        select(AssessmentCenter.region_code, func.count(), func.coalesce(func.sum(open_seats), 0))
        .select_from(AssessmentSchedule).join(AssessmentCenter)
        .where(AssessmentSchedule.status == "open", AssessmentSchedule.scheduled_at > utcnow(),
               AssessmentCenter.is_active).group_by(AssessmentCenter.region_code))}
    rows = []
    for region in session.exec(select(Region).order_by(Region.position)):
        upcoming, seats = schedules.get(region.code, (0, 0))
        rows.append(RegionSupply(region_code=region.code, region=region.name,
                                 training_providers=providers.get(region.code, 0),
                                 training_programs=programs.get(region.code, 0),
                                 upcoming_assessments=upcoming, open_seats=int(seats)))
    return rows
