"""One summary of a learner's journey: readiness trend, pathway progress, applications, certifications, goals."""
from sqlalchemy import func
from sqlmodel import Session, select

from tesda_track.models import AssessmentApplication, Certification, Goal, Learner, ReadinessCheck
from tesda_track.schemas.pathways import PathwayStepPublic
from tesda_track.schemas.progress import CertificationCounts, PathwayProgress, ProgressSummary, ReadinessProgress
from tesda_track.services import catalog, pathways


def _counts_by_status(session: Session, model, learner: Learner) -> dict[str, int]:
    rows = session.exec(select(model.status, func.count()).where(model.learner_id == learner.id).group_by(model.status))
    return {status: count for status, count in rows}


def summary(session: Session, learner: Learner) -> ProgressSummary:
    checks = session.exec(select(ReadinessCheck).where(ReadinessCheck.learner_id == learner.id)
                          .order_by(ReadinessCheck.created_at)).all()
    by_qualification: dict[int, list[ReadinessCheck]] = {}
    for check in checks:
        by_qualification.setdefault(check.qualification_id, []).append(check)
    readiness = [ReadinessProgress(qualification=catalog.summary(history[-1].qualification),
                                   latest_score=history[-1].score, latest_level=history[-1].level,
                                   best_score=max(c.score for c in history), checks=len(history),
                                   last_checked_at=history[-1].created_at)
                 for history in by_qualification.values()]
    readiness.sort(key=lambda item: item.last_checked_at, reverse=True)

    pathway_progress = []
    for enrollment in pathways.list_for(session, learner):
        if enrollment.status == "withdrawn":
            continue
        step = pathways.next_step(enrollment)
        pathway_progress.append(PathwayProgress(
            enrollment_id=enrollment.id, pathway_title=enrollment.pathway.title, route=enrollment.pathway.route,
            qualification=catalog.summary(enrollment.pathway.qualification), status=enrollment.status,
            completion_percent=pathways.completion_percent(enrollment),
            next_step=PathwayStepPublic.model_validate(step) if step else None))

    total, verified = session.exec(select(func.count(), func.count().filter(Certification.verified))
                                   .where(Certification.learner_id == learner.id)).one()
    return ProgressSummary(readiness=readiness, pathways=pathway_progress,
                           assessment_applications=_counts_by_status(session, AssessmentApplication, learner),
                           certifications=CertificationCounts(total=total, verified=verified),
                           goals=_counts_by_status(session, Goal, learner))
