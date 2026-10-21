from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from tesda_track.db import SessionDep
from tesda_track.services.api_readiness import ReadinessReport, readiness

router = APIRouter(tags=["health"])


@router.get("/health")
def health(session: SessionDep):
    try:
        session.exec(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse({"status": "unavailable", "database": "unreachable"}, status_code=503)
    return {"status": "ok", "database": "ok"}


@router.get("/api/v1/ready", response_model=ReadinessReport, responses={503: {"model": ReadinessReport}})
def ready(session: SessionDep):
    report = readiness(session)
    return JSONResponse(report.model_dump(), status_code=503 if report.status == "unavailable" else 200)
