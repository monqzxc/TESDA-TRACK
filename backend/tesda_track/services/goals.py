import uuid

from sqlmodel import Session, select

from tesda_track.models import Goal, Learner
from tesda_track.schemas.records import GoalCreate, GoalPublic, GoalUpdate
from tesda_track.services import catalog
from tesda_track.services.ownership import get_owned


def to_public(goal: Goal) -> GoalPublic:
    target = catalog.summary(goal.target_qualification) if goal.target_qualification else None
    return GoalPublic(id=goal.id, title=goal.title, target_qualification=target, status=goal.status,
                      target_date=goal.target_date, created_at=goal.created_at, updated_at=goal.updated_at)


def list_for(session: Session, learner: Learner) -> list[Goal]:
    return list(session.exec(select(Goal).where(Goal.learner_id == learner.id).order_by(Goal.created_at.desc())))


def get(session: Session, learner: Learner, goal_id: uuid.UUID) -> Goal:
    return get_owned(session, Goal, goal_id, learner, "Goal")


def create(session: Session, learner: Learner, request: GoalCreate) -> Goal:
    target = catalog.resolve_qualification(session, request.target_qualification_code) \
        if request.target_qualification_code else None
    goal = Goal(learner_id=learner.id, title=request.title, target_qualification=target,
                target_date=request.target_date)
    session.add(goal)
    session.flush()
    return goal


def update(session: Session, goal: Goal, request: GoalUpdate) -> Goal:
    fields = request.model_fields_set
    if "target_qualification_code" in fields:
        code = request.target_qualification_code
        goal.target_qualification = catalog.resolve_qualification(session, code) if code else None
    for field in ("title", "status", "target_date"):
        value = getattr(request, field)
        if field in fields and (value is not None or field == "target_date"):
            setattr(goal, field, value)
    session.flush()
    return goal
