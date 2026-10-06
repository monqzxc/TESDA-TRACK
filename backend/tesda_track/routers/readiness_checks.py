import uuid

from fastapi import APIRouter, status

from tesda_track.db import SessionDep
from tesda_track.deps import CurrentLearner
from tesda_track.schemas.records import ReadinessCheckCreate, ReadinessCheckPublic
from tesda_track.services import readiness_checks

router = APIRouter(prefix="/me/readiness-checks", tags=["readiness history"])


@router.get("", response_model=list[ReadinessCheckPublic])
def list_checks(learner: CurrentLearner, session: SessionDep, qualification_code: str | None = None):
    return [readiness_checks.to_public(check)
            for check in readiness_checks.list_for(session, learner, qualification_code)]


@router.post("", response_model=ReadinessCheckPublic, status_code=status.HTTP_201_CREATED)
def submit_check(request: ReadinessCheckCreate, learner: CurrentLearner, session: SessionDep):
    check = readiness_checks.create(session, learner, request)
    session.commit()
    return readiness_checks.to_public(check)


@router.get("/{check_id}", response_model=ReadinessCheckPublic)
def get_check(check_id: uuid.UUID, learner: CurrentLearner, session: SessionDep):
    return readiness_checks.to_public(readiness_checks.get(session, learner, check_id))
