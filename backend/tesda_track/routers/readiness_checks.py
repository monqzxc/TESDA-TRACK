import uuid

from fastapi import APIRouter, BackgroundTasks, status

from tesda_track.db import SessionDep
from tesda_track.deps import CurrentLearner
from tesda_track.schemas.records import ReadinessCheckCreate, ReadinessCheckPublic
from tesda_track.services import match_stats, readiness_checks
from tesda_track.services import write_receipts
from tesda_track.models import ReadinessCheck

router = APIRouter(prefix="/me/readiness-checks", tags=["readiness history"])


@router.get("", response_model=list[ReadinessCheckPublic])
def list_checks(learner: CurrentLearner, session: SessionDep, qualification_code: str | None = None):
    return [readiness_checks.to_public(check)
            for check in readiness_checks.list_for(session, learner, qualification_code)]


@router.post("", response_model=ReadinessCheckPublic, status_code=status.HTTP_201_CREATED)
def submit_check(request: ReadinessCheckCreate, learner: CurrentLearner, session: SessionDep,
                 background: BackgroundTasks):
    def create():
        # Counted only for a new check, not when a retried request returns the one it already made.
        if request.origin:
            background.add_task(match_stats.count, "readiness_checked", request.origin)
        return readiness_checks.create(session, learner, request)
    check = write_receipts.perform(session, learner, "readiness", request, ReadinessCheck, create)
    session.commit()
    return readiness_checks.to_public(check)


@router.get("/{check_id}", response_model=ReadinessCheckPublic)
def get_check(check_id: uuid.UUID, learner: CurrentLearner, session: SessionDep):
    return readiness_checks.to_public(readiness_checks.get(session, learner, check_id))
