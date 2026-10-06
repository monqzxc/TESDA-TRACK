import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from tesda_track.db import SessionDep
from tesda_track.deps import CurrentLearner
from tesda_track.schemas.records import (RecommendationSessionCreate, RecommendationSessionPublic,
                                         RecommendationSessionUpdate)
from tesda_track.services import analysis, recommendation_sessions

router = APIRouter(prefix="/me/recommendations", tags=["recommendation history"])


@router.get("", response_model=list[RecommendationSessionPublic])
def list_sessions(learner: CurrentLearner, session: SessionDep, limit: Annotated[int, Query(ge=1, le=100)] = 20,
                  offset: Annotated[int, Query(ge=0)] = 0):
    return [recommendation_sessions.to_public(record)
            for record in recommendation_sessions.list_for(session, learner, limit, offset)]


@router.post("", response_model=RecommendationSessionPublic, status_code=status.HTTP_201_CREATED)
def start_session(request: RecommendationSessionCreate, learner: CurrentLearner, session: SessionDep):
    analyzed = analysis.analyze_goal(session, request.query)
    record = recommendation_sessions.start(session, learner, request, analyzed)
    session.commit()
    return recommendation_sessions.to_public(record)


@router.get("/{session_id}", response_model=RecommendationSessionPublic)
def get_session(session_id: uuid.UUID, learner: CurrentLearner, session: SessionDep):
    return recommendation_sessions.to_public(recommendation_sessions.get(session, learner, session_id))


@router.patch("/{session_id}", response_model=RecommendationSessionPublic)
def update_session(session_id: uuid.UUID, request: RecommendationSessionUpdate, learner: CurrentLearner,
                   session: SessionDep):
    record = recommendation_sessions.update(session, recommendation_sessions.get(session, learner, session_id), request)
    session.commit()
    return recommendation_sessions.to_public(record)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: uuid.UUID, learner: CurrentLearner, session: SessionDep):
    session.delete(recommendation_sessions.get(session, learner, session_id))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
