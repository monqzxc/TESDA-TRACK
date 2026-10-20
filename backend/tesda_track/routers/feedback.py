import math
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from tesda_track.config import Settings, get_settings
from tesda_track.db import SessionDep
from tesda_track.deps import OptionalLearner
from tesda_track.schemas.feedback import FeedbackCreate, FeedbackPublic, FeedbackReasonUpdate
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
    return result


@router.patch("/recommendations/{feedback_id}", response_model=FeedbackPublic, responses={
    404: {"description": "No such answer"}, 409: {"description": "The answer was Yes"}, **LIMITED})
def explain_feedback(feedback_id: uuid.UUID, body: FeedbackReasonUpdate, request: Request, session: SessionDep,
                     settings: SettingsDep):
    """Why the learner wasn't satisfied, given after an answer of No."""
    _within_limit(request, settings)
    result = feedback.explain(session, feedback_id, body.reason)
    session.commit()
    return result
