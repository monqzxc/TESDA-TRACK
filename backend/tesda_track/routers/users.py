"""Administrator-only account role assignment."""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import select

from tesda_track.db import SessionDep
from tesda_track.deps import CurrentLearner, require_permission
from tesda_track.errors import InvalidRequestError, NotFoundError
from tesda_track.models import Learner
from tesda_track.schemas.accounts import LearnerPublic
from tesda_track.services import roles as role_service

router = APIRouter(prefix="/admin", tags=["admin: users"],
                   dependencies=[Depends(require_permission("users:manage"))])


class AccountRoleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Any role in app_role, including ones an administrator composed. Checked against the table, not a Literal,
    # so an unknown name is a 422 on the role rather than a 404 on the account.
    role: str = Field(max_length=50)


@router.get("/users", response_model=list[LearnerPublic])
def list_users(session: SessionDep, limit: Annotated[int, Query(ge=1, le=100)] = 50,
               offset: Annotated[int, Query(ge=0)] = 0):
    return session.exec(select(Learner).order_by(Learner.created_at, Learner.id).limit(limit).offset(offset)).all()


@router.patch("/users/{user_id}/role", response_model=LearnerPublic)
def assign_role(user_id: uuid.UUID, request: AccountRoleUpdate, learner: CurrentLearner, session: SessionDep):
    account = session.get(Learner, user_id)
    if account is None:
        raise NotFoundError("Account not found.")
    role_service.require_assignable(session, request.role)
    if account.id == learner.id and request.role != learner.role:
        raise InvalidRequestError("Ask another administrator to change your role.")
    if account.role != request.role:
        account.role = request.role
        account.token_version += 1
    session.commit()
    # Reload the role row the response payload reads its permission list from.
    session.refresh(account)
    return account
