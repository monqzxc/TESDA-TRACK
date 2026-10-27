from fastapi import APIRouter

from tesda_track.db import SessionDep
from tesda_track.schemas.catalog import QualificationPublic
from tesda_track.services import catalog

router = APIRouter(prefix="/qualifications", tags=["catalog"])


@router.get("", response_model=list[QualificationPublic])
def list_qualifications(session: SessionDep):
    return [item.public for item in catalog.snapshot(session).items]


@router.get("/{code}", response_model=QualificationPublic)
def get_qualification(code: str, session: SessionDep):
    return catalog.to_public(catalog.get_active_qualification(session, code))
