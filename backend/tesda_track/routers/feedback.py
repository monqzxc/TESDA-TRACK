import math
import uuid
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import select

from tesda_track.config import Settings, get_settings
from tesda_track.db import SessionDep
from tesda_track.deps import CurrentLearner, OptionalLearner, RequestedWith
from tesda_track.errors import NotFoundError, PermissionDeniedError
from tesda_track.models import AssessmentCenter, Qualification, SuggestionFeedback, TrainingProvider
from tesda_track.schemas.feedback import (FeedbackCreate, FeedbackPublic, FeedbackReasonUpdate, SharedGoalCreate,
                                          SuggestionRating, SuggestionReport, SuggestionReportPublic)
from tesda_track.services import feedback
from tesda_track.services.embeddings import EmbedderDep
from tesda_track.services.rate_limit import client_address_key

router = APIRouter(prefix="/feedback", tags=["feedback"])
SettingsDep = Annotated[Settings, Depends(get_settings)]

CLIENT_LIMITED = "You've sent a lot of feedback in the last minute. Please wait a moment and try again."
LIMITED = {429: {"description": "Too many answers from this client; see Retry-After"}}


def _within_limit(request: Request, settings: Settings) -> None:
    seconds = request.app.state.feedback_limits.hit(client_address_key(request), settings.feedback_rate_limit_per_minute)
    if seconds:
        raise HTTPException(status_code=429, detail=CLIENT_LIMITED, headers={"Retry-After": str(math.ceil(seconds))})


@router.post("/recommendations", response_model=FeedbackPublic, status_code=status.HTTP_201_CREATED,
             responses=LIMITED)
def give_feedback(body: FeedbackCreate, request: Request, session: SessionDep, settings: SettingsDep,
                  embedder: EmbedderDep, learner: OptionalLearner):
    """A learner's answer to "Are you satisfied with this recommendation?", signed in or not.

    The API works the matches and readiness result out again from what the finder sent, and keeps the answer with
    those numbers and the matching model's name. The goal is kept only as a keyed hash, and the answer isn't linked
    to an account.
    """
    _within_limit(request, settings)
    result = feedback.record(session, body, embedder, signed_in=learner is not None)
    session.commit()
    return feedback.public(session, result)


@router.patch("/recommendations/{feedback_id}", response_model=FeedbackPublic, responses={
    404: {"description": "No such answer, or no such wanted qualification"}, 409: {"description": "The answer was Yes"},
    **LIMITED})
def explain_feedback(feedback_id: uuid.UUID, body: FeedbackReasonUpdate, request: Request, session: SessionDep,
                     settings: SettingsDep):
    """Why the learner wasn't satisfied, given after an answer of No; after "wrong_qualification", optionally the
    qualification they wanted instead."""
    _within_limit(request, settings)
    result = feedback.explain(session, feedback_id, body)
    session.commit()
    return feedback.public(session, result)


@router.post("/recommendations/{feedback_id}/goal", status_code=status.HTTP_204_NO_CONTENT, responses={
    404: {"description": "No such answer"},
    409: {"description": "An answer of No without the qualification the learner wanted"},
    422: {"description": "Not the goal the answer was about, or no consent"}, **LIMITED})
def share_goal(feedback_id: uuid.UUID, body: SharedGoalCreate, request: Request, session: SessionDep,
               settings: SettingsDep):
    """The goal's words, which the learner agreed to share to test and train matching, labelled with the qualification
    their answer says fits. Kept apart from the answer and the account; the pilot team reviews them before any use."""
    _within_limit(request, settings)
    feedback.share_goal(session, feedback_id, body.goal)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _suggestion_name(session: SessionDep, body: SuggestionRating | SuggestionReport) -> str:
    code = body.result_key if body.result_kind == "qualification" else body.qualification_code
    qualification = session.exec(select(Qualification).where(Qualification.code == code)).first() if code else None
    if code and qualification is None:
        raise NotFoundError("Qualification not found.")
    if body.result_kind == "qualification" and qualification is not None:
        return qualification.name

    model = TrainingProvider if body.result_kind == "training" else AssessmentCenter
    key = body.result_key
    center = session.get(model, int(key)) if key.isascii() and key.isdecimal() and len(key) <= 9 else None
    if center is None:
        raise NotFoundError("Center not found.")
    return center.name


@router.post("/suggestions", status_code=status.HTTP_204_NO_CONTENT, dependencies=[RequestedWith],
             responses={409: {"description": "A submission of this kind already exists for this receipt"}, **LIMITED})
def give_suggestion_feedback(body: Annotated[SuggestionRating | SuggestionReport, Body(discriminator="action")],
                             request: Request, session: SessionDep, settings: SettingsDep):
    """Save a rating or report for one result, with no account link or location."""
    _within_limit(request, settings)
    result_name = _suggestion_name(session, body)
    report = body if isinstance(body, SuggestionReport) else None
    statement = insert(SuggestionFeedback).values(
        receipt=body.receipt,
        action=body.action,
        result_kind=body.result_kind,
        result_key=body.result_key,
        result_name=result_name,
        qualification_code=body.result_key if body.result_kind == "qualification" else body.qualification_code,
        helpful=body.helpful if isinstance(body, SuggestionRating) else None,
        reason=report.reason if report else None,
        shared_goal=report.shared_goal.goal if report and report.shared_goal else None,
    ).on_conflict_do_nothing(index_elements=["receipt", "action"]).returning(SuggestionFeedback.receipt)
    if session.execute(statement).scalar_one_or_none() is None:
        raise HTTPException(status_code=409, detail="Feedback already submitted for this suggestion.")
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/suggestions/reports", response_model=list[SuggestionReportPublic])
def suggestion_reports(response: Response, session: SessionDep, settings: SettingsDep, reviewer: CurrentLearner,
                       offset: Annotated[int, Query(ge=0)] = 0):
    """The named AI owner's inbox, including goal text only when explicitly shared."""
    if reviewer.id != settings.suggestion_feedback_owner_id:
        raise PermissionDeniedError("This inbox is assigned to the named AI owner.")
    response.headers["Cache-Control"] = "no-store"
    return session.exec(select(SuggestionFeedback).where(SuggestionFeedback.action == "report")
                        .order_by(SuggestionFeedback.created_at.desc(), SuggestionFeedback.receipt.desc())
                        .offset(offset).limit(25)).all()
