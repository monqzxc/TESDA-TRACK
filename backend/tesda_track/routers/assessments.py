import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from tesda_track.db import SessionDep
from tesda_track.deps import CurrentLearner, require_admin
from tesda_track.models import APPLICATION_STATUSES
from tesda_track.schemas.delivery import (ApplicationCreate, ApplicationReview, AssessmentApplicationAdmin,
                                          AssessmentApplicationPublic, AssessmentCenterCreate, AssessmentCenterPublic,
                                          AssessmentCenterUpdate, AssessmentScheduleCreate, AssessmentSchedulePublic,
                                          AssessmentScheduleUpdate, NearbySearch)
from tesda_track.services import assessments, sites

router = APIRouter(tags=["assessment"])
learner_router = APIRouter(prefix="/me/assessment-applications", tags=["assessment applications"])
admin_router = APIRouter(prefix="/admin", tags=["admin: assessment"], dependencies=[Depends(require_admin)])

Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


@router.get("/assessment-centers", response_model=list[AssessmentCenterPublic])
def list_centers(session: SessionDep, region_code: str | None = None):
    return assessments.list_centers(session, region_code)


@router.get("/assessment-schedules", response_model=list[AssessmentSchedulePublic])
def search_schedules(session: SessionDep, search: Annotated[NearbySearch, Query()]):
    """Upcoming open schedules with seats left; give near_lat/near_lon to sort by distance."""
    rows = assessments.search_schedules(session, search)
    return [assessments.schedule_public(schedule, taken, distance) for schedule, taken, distance in rows]


@learner_router.get("", response_model=list[AssessmentApplicationPublic])
def my_applications(learner: CurrentLearner, session: SessionDep):
    return [assessments.application_public(session, a) for a in assessments.list_for(session, learner)]


@learner_router.post("", response_model=AssessmentApplicationPublic, status_code=status.HTTP_201_CREATED)
def apply(request: ApplicationCreate, learner: CurrentLearner, session: SessionDep):
    application = assessments.apply(session, learner, request.schedule_id)
    session.commit()
    return assessments.application_public(session, application)


@learner_router.post("/{application_id}/withdraw", response_model=AssessmentApplicationPublic)
def withdraw(application_id: uuid.UUID, learner: CurrentLearner, session: SessionDep):
    application = assessments.withdraw(session, assessments.get_for_learner(session, learner, application_id))
    session.commit()
    return assessments.application_public(session, application)


@admin_router.post("/assessment-centers", response_model=AssessmentCenterPublic, status_code=status.HTTP_201_CREATED)
def create_center(request: AssessmentCenterCreate, session: SessionDep):
    center = assessments.create_center(session, request)
    session.commit()
    return center


@admin_router.patch("/assessment-centers/{center_id}", response_model=AssessmentCenterPublic)
def update_center(center_id: int, request: AssessmentCenterUpdate, session: SessionDep):
    center = assessments.get_center(session, center_id, active_only=False)
    sites.apply_update(session, center, request)
    session.commit()
    return center


@admin_router.post("/assessment-schedules", response_model=AssessmentSchedulePublic,
                   status_code=status.HTTP_201_CREATED)
def create_schedule(request: AssessmentScheduleCreate, session: SessionDep):
    schedule = assessments.create_schedule(session, request)
    session.commit()
    return assessments.schedule_public(schedule, 0)


@admin_router.patch("/assessment-schedules/{schedule_id}", response_model=AssessmentSchedulePublic)
def update_schedule(schedule_id: int, request: AssessmentScheduleUpdate, session: SessionDep):
    schedule = assessments.update_schedule(session, assessments.get_schedule(session, schedule_id), request)
    session.commit()
    return assessments.schedule_public(schedule, assessments.seats_taken(session, schedule.id))


@admin_router.get("/assessment-applications", response_model=list[AssessmentApplicationAdmin])
def list_applications(session: SessionDep,
                      status_filter: Annotated[str | None, Query(alias="status", enum=list(APPLICATION_STATUSES))] = None,
                      schedule_id: int | None = None, limit: Limit = 50, offset: Offset = 0):
    return [assessments.application_admin(session, a)
            for a in assessments.list_all(session, status_filter, schedule_id, limit, offset)]


@admin_router.patch("/assessment-applications/{application_id}", response_model=AssessmentApplicationAdmin)
def review_application(application_id: uuid.UUID, request: ApplicationReview, session: SessionDep):
    application = assessments.review(session, assessments.get_application(session, application_id), request)
    session.commit()
    return assessments.application_admin(session, application)
