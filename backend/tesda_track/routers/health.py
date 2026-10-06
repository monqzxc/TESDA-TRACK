from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from tesda_track.db import SessionDep

router = APIRouter(tags=["health"])


@router.get("/health")
def health(session: SessionDep):
    try:
        session.exec(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse({"status": "unavailable", "database": "unreachable"}, status_code=503)
    return {"status": "ok", "database": "ok"}
