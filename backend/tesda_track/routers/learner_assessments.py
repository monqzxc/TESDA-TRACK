import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from tesda_track.db import SessionDep
from tesda_track.deps import CurrentLearner
from tesda_track.schemas.learner_assessments import AssessmentPublic, AssessmentWrite
from tesda_track.services import learner_assessments
from tesda_track.services import write_receipts
from tesda_track.models import LearnerAssessment

router = APIRouter(prefix="/learner-assessments", tags=["learner assessments"])


@router.post("", response_model=AssessmentPublic, status_code=status.HTTP_201_CREATED)
def create(request: AssessmentWrite, learner: CurrentLearner, session: SessionDep):
    record = write_receipts.perform(session, learner, "learner_assessment", request, LearnerAssessment,
                                   lambda: learner_assessments.create(session, learner, request.answers))
    session.commit()
    return learner_assessments.public(record)


@router.get("", response_model=list[AssessmentPublic])
def list_assessments(learner: CurrentLearner, session: SessionDep,
                     limit: Annotated[int, Query(ge=1, le=100)] = 20, offset: Annotated[int, Query(ge=0)] = 0):
    return [learner_assessments.public(record) for record in learner_assessments.list_for(session, learner, limit, offset)]


@router.get("/{assessment_id}", response_model=AssessmentPublic)
def get(assessment_id: uuid.UUID, learner: CurrentLearner, session: SessionDep):
    return learner_assessments.public(learner_assessments.get(session, learner, assessment_id))


@router.patch("/{assessment_id}", response_model=AssessmentPublic, status_code=status.HTTP_201_CREATED)
def revise(assessment_id: uuid.UUID, request: AssessmentWrite, learner: CurrentLearner, session: SessionDep):
    """Replace answers in a new immutable revision; historical results keep the original reference."""
    record = write_receipts.perform(session, learner, f"rev:{assessment_id}", request, LearnerAssessment,
                                   lambda: learner_assessments.revise(session, learner, assessment_id, request.answers))
    session.commit()
    return learner_assessments.public(record)


@router.delete("/{assessment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(assessment_id: uuid.UUID, learner: CurrentLearner, session: SessionDep):
    learner_assessments.remove_series(session, learner, assessment_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
