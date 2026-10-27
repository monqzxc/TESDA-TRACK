"""The signed-in learner's account, including Data Privacy Act access (export) and erasure."""
from fastapi import APIRouter, Response, status

from tesda_track.db import SessionDep
from tesda_track.deps import CurrentLearner
from tesda_track.schemas.accounts import LearnerPublic, LearnerUpdate, PasswordChange
from tesda_track.schemas.progress import ProgressSummary
from tesda_track.schemas.records import AccountExport
from tesda_track.services import accounts, progress

router = APIRouter(prefix="/me", tags=["account"])


@router.get("", response_model=LearnerPublic)
def get_account(learner: CurrentLearner):
    return learner


@router.patch("", response_model=LearnerPublic)
def update_account(request: LearnerUpdate, learner: CurrentLearner, session: SessionDep):
    if request.full_name is not None:
        learner.full_name = request.full_name
    session.commit()
    return learner


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(request: PasswordChange, learner: CurrentLearner, session: SessionDep):
    accounts.change_password(session, learner, request.current_password, request.new_password)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/progress", response_model=ProgressSummary)
def my_progress(learner: CurrentLearner, session: SessionDep):
    return progress.summary(session, learner)


@router.get("/export", response_model=AccountExport)
def export_my_data(learner: CurrentLearner, session: SessionDep):
    return accounts.export(session, learner)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(learner: CurrentLearner, session: SessionDep):
    accounts.delete_account(session, learner)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
