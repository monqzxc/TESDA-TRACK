from typing import Literal

from fastapi import APIRouter, Depends

from tesda_track.db import SessionDep
from tesda_track.deps import require_admin
from tesda_track.schemas.verification import VerificationImport, VerificationPublic, VerificationWrite
from tesda_track.services import catalog, verification

router = APIRouter(prefix="/admin/service-verifications", tags=["admin: service verification"],
                   dependencies=[Depends(require_admin)])


@router.post("/import")
def import_verifications(request: VerificationImport, session: SessionDep):
    """Bounded, atomic upsert of reviewed evidence. Dry runs validate and roll back all writes."""
    with session.begin_nested() as transaction:
        for item in request.records:
            verification.save(session, item.kind, item.site_id, item.qualification_code, item.evidence)
        if request.dry_run:
            transaction.rollback()
    if not request.dry_run:
        session.commit()
    session.info.pop("service_verifications", None)
    return {"dry_run": request.dry_run, "validated": len(request.records),
            "saved": 0 if request.dry_run else len(request.records)}


@router.put("/{kind}/{site_id}/{qualification_code}", response_model=VerificationPublic)
def put_verification(kind: Literal["training", "assessment"], site_id: int, qualification_code: str,
                     request: VerificationWrite, session: SessionDep):
    """Replace reviewed source evidence. Training and assessment authorization are independent."""
    record = verification.save(session, kind, site_id, qualification_code, request)
    session.commit()
    return verification.public(record)


@router.get("/{kind}/{site_id}/{qualification_code}", response_model=VerificationPublic)
def get_verification(kind: Literal["training", "assessment"], site_id: int, qualification_code: str,
                     session: SessionDep):
    qualification = catalog.resolve_qualification(session, qualification_code)
    return verification.public(verification.get(session, kind, site_id, qualification.id))
