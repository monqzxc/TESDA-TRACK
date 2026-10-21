"""Learners' answers about their recommendation, kept with the numbers matching and readiness gave for it, and the
goals learners chose to share, kept apart from their answers."""
import uuid
from dataclasses import asdict
from datetime import datetime

from sqlmodel import Session

from tesda_track.config import get_settings
from tesda_track.errors import ConflictError, InvalidRequestError, NotFoundError
from tesda_track.models import SHARED_GOAL_CONSENT, Qualification, RecommendationFeedback, SharedGoal
from tesda_track.schemas.feedback import FeedbackCreate, FeedbackPublic, FeedbackReasonUpdate
from tesda_track.services import analysis, catalog
from tesda_track.services.embeddings import Embedder
from tesda_track.services.match_stats import PHILIPPINE_TIME
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


def public(session: Session, feedback: RecommendationFeedback) -> FeedbackPublic:
    wanted = session.get(Qualification, feedback.wanted_qualification_id) if feedback.wanted_qualification_id else None
    return FeedbackPublic(id=feedback.id, satisfied=feedback.satisfied, reason=feedback.reason,
                          wanted_qualification_code=wanted.code if wanted else None)


def _answer(session: Session, feedback_id: uuid.UUID) -> RecommendationFeedback:
    """An answer by its id, which is known only to the browser that gave it."""
    feedback = session.get(RecommendationFeedback, feedback_id)
    if feedback is None:
        raise NotFoundError("Feedback not found.")
    return feedback


def explain(session: Session, feedback_id: uuid.UUID, update: FeedbackReasonUpdate) -> RecommendationFeedback:
    """Why a learner wasn't satisfied and, for the wrong qualification, which one they wanted instead."""
    feedback = _answer(session, feedback_id)
    if feedback.satisfied:
        raise ConflictError("A reason can only be given for an answer of No.")
    wanted = None
    if update.wanted_qualification_code is not None:
        wanted = catalog.get_active_qualification(session, update.wanted_qualification_code)
        if wanted.id == feedback.qualification_id:
            raise InvalidRequestError("That is the qualification this answer was about.")
    feedback.reason = update.reason
    feedback.wanted_qualification_id = wanted.id if wanted else None
    session.add(feedback)
    return feedback


def share_goal(session: Session, feedback_id: uuid.UUID, goal: str) -> SharedGoal:
    """The goal's words, which the learner agreed to share, labelled from their answer: the qualification they were
    satisfied with, or the one they wanted instead (with the one they were recommended as a known wrong answer).

    Only the goal that was rated (its keyed hash must match the answer's) and only once there is a label. The shared
    goal stores no link back to the answer or the account."""
    feedback = _answer(session, feedback_id)
    if goal_fingerprint(goal, get_settings().secret_key.get_secret_value()) != feedback.query_hash:
        raise InvalidRequestError("That isn't the goal this answer was about.")
    if feedback.satisfied:
        qualification_id, shown_id = feedback.qualification_id, None
    elif feedback.wanted_qualification_id is not None:
        qualification_id, shown_id = feedback.wanted_qualification_id, feedback.qualification_id
    else:
        raise ConflictError("Choose the qualification you wanted before sharing your goal.")
    shared = SharedGoal(goal=goal, qualification_id=qualification_id, shown_qualification_id=shown_id,
                        consent_version=SHARED_GOAL_CONSENT, shared_on=datetime.now(PHILIPPINE_TIME).date())
    session.add(shared)
    return shared
