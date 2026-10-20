"""Learners' answers about their recommendation, kept with the numbers matching and readiness gave for it."""
import uuid
from dataclasses import asdict

from sqlmodel import Session

from tesda_track.config import get_settings
from tesda_track.errors import ConflictError, NotFoundError
from tesda_track.models import RecommendationFeedback
from tesda_track.schemas.feedback import FeedbackCreate, FeedbackReason
from tesda_track.services import analysis, catalog
from tesda_track.services.embeddings import Embedder
from tesda_track.services.ranking import goal_fingerprint


def record(session: Session, request: FeedbackCreate, embedder: Embedder | None,
           signed_in: bool) -> RecommendationFeedback:
    """Works the recommendation out again from what the finder asked, rather than trusting numbers sent with the
    answer, so every row says what this server's matching gave and with which model."""
    qualification = catalog.get_active_qualification(session, request.qualification_code)
    readiness = analysis.score_readiness(qualification, request.answers)
    evidence = analysis.match_evidence(session, request.query, request.profile, embedder)
    codes = [match.qualification.code for match in evidence.matches]
    rank = codes.index(qualification.code) + 1 if qualification.code in codes else None
    z_score = evidence.z_scores.get(qualification.id)
    feedback = RecommendationFeedback(
        satisfied=request.satisfied,
        qualification_id=qualification.id,
        query_hash=goal_fingerprint(request.query, get_settings().secret_key.get_secret_value()),
        signed_in=signed_in,
        intent=evidence.profile.intent,
        experience_years=evidence.profile.experience_years,
        has_certification=evidence.profile.has_certification,
        match_count=len(evidence.matches),
        rank=rank,
        score=evidence.matches[rank - 1].score if rank else None,
        keyword=evidence.keyword.get(qualification.code, 0.0),
        z_score=round(z_score, 3) if z_score is not None else None,
        model=evidence.model,
        params=asdict(evidence.params) if evidence.params else None,
        readiness_score=readiness.score,
        readiness_level=readiness.level)
    session.add(feedback)
    return feedback


def explain(session: Session, feedback_id: uuid.UUID, reason: FeedbackReason) -> RecommendationFeedback:
    """Why a learner wasn't satisfied. The answer's id is known only to the browser that gave it."""
    feedback = session.get(RecommendationFeedback, feedback_id)
    if feedback is None:
        raise NotFoundError("Feedback not found.")
    if feedback.satisfied:
        raise ConflictError("A reason can only be given for an answer of No.")
    feedback.reason = reason
    session.add(feedback)
    return feedback
