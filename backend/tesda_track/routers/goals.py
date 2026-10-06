import uuid

from fastapi import APIRouter, Response, status

from tesda_track.db import SessionDep
from tesda_track.deps import CurrentLearner
from tesda_track.schemas.records import GoalCreate, GoalPublic, GoalUpdate
from tesda_track.services import goals

router = APIRouter(prefix="/me/goals", tags=["goals"])


@router.get("", response_model=list[GoalPublic])
def list_goals(learner: CurrentLearner, session: SessionDep):
    return [goals.to_public(goal) for goal in goals.list_for(session, learner)]


@router.post("", response_model=GoalPublic, status_code=status.HTTP_201_CREATED)
def create_goal(request: GoalCreate, learner: CurrentLearner, session: SessionDep):
    goal = goals.create(session, learner, request)
    session.commit()
    return goals.to_public(goal)


@router.get("/{goal_id}", response_model=GoalPublic)
def get_goal(goal_id: uuid.UUID, learner: CurrentLearner, session: SessionDep):
    return goals.to_public(goals.get(session, learner, goal_id))


@router.patch("/{goal_id}", response_model=GoalPublic)
def update_goal(goal_id: uuid.UUID, request: GoalUpdate, learner: CurrentLearner, session: SessionDep):
    goal = goals.update(session, goals.get(session, learner, goal_id), request)
    session.commit()
    return goals.to_public(goal)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(goal_id: uuid.UUID, learner: CurrentLearner, session: SessionDep):
    session.delete(goals.get(session, learner, goal_id))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
