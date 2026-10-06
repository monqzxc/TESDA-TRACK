import uuid

from fastapi import APIRouter, Depends, status

from tesda_track.db import SessionDep
from tesda_track.deps import CurrentLearner, require_admin
from tesda_track.schemas.pathways import (EnrollmentCreate, EnrollmentPublic, EnrollmentUpdate, PathwayCreate,
                                          PathwayPublic, PathwayUpdate, StepProgressUpdate)
from tesda_track.services import pathways

router = APIRouter(prefix="/pathways", tags=["pathways"])
learner_router = APIRouter(prefix="/me/pathways", tags=["pathway progress"])
admin_router = APIRouter(prefix="/admin/pathways", tags=["admin: pathways"], dependencies=[Depends(require_admin)])


@router.get("", response_model=list[PathwayPublic])
def list_pathways(session: SessionDep, qualification_code: str | None = None, route: str | None = None):
    return [pathways.to_public(p) for p in pathways.list_active(session, qualification_code, route)]


@router.get("/{pathway_id}", response_model=PathwayPublic)
def get_pathway(pathway_id: int, session: SessionDep):
    return pathways.to_public(pathways.get_active(session, pathway_id))


@learner_router.get("", response_model=list[EnrollmentPublic])
def my_pathways(learner: CurrentLearner, session: SessionDep):
    return [pathways.enrollment_public(e) for e in pathways.list_for(session, learner)]


@learner_router.post("", response_model=EnrollmentPublic, status_code=status.HTTP_201_CREATED)
def follow_pathway(request: EnrollmentCreate, learner: CurrentLearner, session: SessionDep):
    enrollment = pathways.enroll(session, learner, request.pathway_id)
    session.commit()
    return pathways.enrollment_public(enrollment)


@learner_router.patch("/{enrollment_id}", response_model=EnrollmentPublic)
def set_enrollment_status(enrollment_id: uuid.UUID, request: EnrollmentUpdate, learner: CurrentLearner,
                          session: SessionDep):
    enrollment = pathways.set_status(session, pathways.get_enrollment(session, learner, enrollment_id), request.status)
    session.commit()
    return pathways.enrollment_public(enrollment)


@learner_router.patch("/{enrollment_id}/steps/{step_id}", response_model=EnrollmentPublic)
def set_step_status(enrollment_id: uuid.UUID, step_id: int, request: StepProgressUpdate, learner: CurrentLearner,
                    session: SessionDep):
    enrollment = pathways.get_enrollment(session, learner, enrollment_id)
    pathways.set_step_status(session, enrollment, step_id, request.status)
    session.commit()
    return pathways.enrollment_public(enrollment)


@admin_router.post("", response_model=PathwayPublic, status_code=status.HTTP_201_CREATED)
def create_pathway(request: PathwayCreate, session: SessionDep):
    pathway = pathways.create(session, request)
    session.commit()
    return pathways.to_public(pathway)


@admin_router.put("/{pathway_id}", response_model=PathwayPublic)
def update_pathway(pathway_id: int, request: PathwayUpdate, session: SessionDep):
    pathway = pathways.update(session, pathways.get_any(session, pathway_id), request)
    session.commit()
    return pathways.to_public(pathway)
