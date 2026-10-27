import uuid

from sqlmodel import Session, select

from tesda_track.models import Learner, Qualification, ReadinessAnswer, ReadinessCheck, RecommendationSession
from tesda_track.schemas.records import ReadinessCheckCreate, ReadinessCheckPublic
from tesda_track.services import analysis, catalog
from tesda_track.services.ownership import get_owned, resolve_owned


def to_public(check: ReadinessCheck) -> ReadinessCheckPublic:
    return ReadinessCheckPublic(
        id=check.id, qualification=catalog.summary(check.qualification), score=check.score, level=check.level,
        strengths=check.result["strengths"], skill_gaps=check.result["skill_gaps"],
        recommendation=check.result["recommendation"],
        answers={answer.competency_id: answer.answer for answer in check.answers},
        recommendation_session_id=check.recommendation_session_id, created_at=check.created_at)


def list_for(session: Session, learner: Learner, qualification_code: str | None) -> list[ReadinessCheck]:
    query = select(ReadinessCheck).where(ReadinessCheck.learner_id == learner.id)
    if qualification_code:
        query = query.join(Qualification).where(Qualification.code == qualification_code)
    return list(session.exec(query.order_by(ReadinessCheck.created_at.desc())))


def get(session: Session, learner: Learner, check_id: uuid.UUID) -> ReadinessCheck:
    return get_owned(session, ReadinessCheck, check_id, learner, "Readiness check")


def create(session: Session, learner: Learner, request: ReadinessCheckCreate) -> ReadinessCheck:
    resolve_owned(session, RecommendationSession, request.recommendation_session_id, learner, "Recommendation session")
    qualification = catalog.get_active_qualification(session, request.qualification_code)
    result = analysis.score_readiness(qualification, request.answers)
    check = ReadinessCheck(
        learner_id=learner.id, qualification=qualification, recommendation_session_id=request.recommendation_session_id,
        score=result.score, level=result.level,
        result={"strengths": result.strengths, "skill_gaps": result.skill_gaps, "recommendation": result.recommendation},
        # Only the qualification's own competencies are kept; stray ids in the request are ignored.
        answers=[ReadinessAnswer(competency_id=c.id, answer=request.answers[c.id])
                 for c in catalog.active_competencies(qualification)])
    session.add(check)
    session.flush()
    return check
