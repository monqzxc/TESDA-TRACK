import uuid

from fastapi import APIRouter, Response, status

from tesda_track.db import SessionDep
from tesda_track.deps import CurrentLearner
from tesda_track.schemas.records import CertificationCreate, CertificationPublic, CertificationUpdate
from tesda_track.services import certifications

router = APIRouter(prefix="/me/certifications", tags=["certifications"])


@router.get("", response_model=list[CertificationPublic])
def list_certifications(learner: CurrentLearner, session: SessionDep):
    return [certifications.to_public(c) for c in certifications.list_for(session, learner)]


@router.post("", response_model=CertificationPublic, status_code=status.HTTP_201_CREATED)
def add_certification(request: CertificationCreate, learner: CurrentLearner, session: SessionDep):
    certification = certifications.create(session, learner, request)
    session.commit()
    return certifications.to_public(certification)


@router.patch("/{certification_id}", response_model=CertificationPublic)
def update_certification(certification_id: uuid.UUID, request: CertificationUpdate, learner: CurrentLearner,
                         session: SessionDep):
    certification = certifications.update(session, certifications.get(session, learner, certification_id), request)
    session.commit()
    return certifications.to_public(certification)


@router.delete("/{certification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_certification(certification_id: uuid.UUID, learner: CurrentLearner, session: SessionDep):
    session.delete(certifications.get(session, learner, certification_id))
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
