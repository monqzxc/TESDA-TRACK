from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlmodel import select

from tesda_track.config import get_settings
from tesda_track.db import SessionDep
from tesda_track.deps import require_admin
from tesda_track.errors import ConflictError
from tesda_track.models import Qualification, QualificationEmbedding, TrainingProgram, TrainingProgramEmbedding
from tesda_track.services import embeddings, skills_bridge
from tesda_track.services.embeddings import EmbedderDep

router = APIRouter(prefix="/admin", tags=["admin: integrations"], dependencies=[Depends(require_admin)])


def _count(session, query) -> int:
    return session.exec(query).one()


@router.get("/integrations")
def integration_status(session: SessionDep, embedder: EmbedderDep):
    """Whether semantic search is running and how much is embedded, and whether Skills Bridge is set up."""
    settings = get_settings()
    model = embedder.model_name if embedder else settings.embedding_model
    semantic = {
        "enabled": embedder is not None,
        "model": model,
        "qualifications_embedded": _count(session, select(func.count()).select_from(QualificationEmbedding)
                                          .where(QualificationEmbedding.model == model)),
        "qualifications_total": _count(session, select(func.count()).select_from(Qualification)
                                       .where(Qualification.is_active)),
        "programs_embedded": _count(session, select(func.count()).select_from(TrainingProgramEmbedding)
                                    .where(TrainingProgramEmbedding.model == model)),
        "programs_total": _count(session, select(func.count()).select_from(TrainingProgram)
                                 .where(TrainingProgram.is_active)),
    }
    bridge = {"configured": True, "base_url": settings.skills_bridge_base_url} \
        if skills_bridge.is_configured(settings) else {"configured": False, "detail": skills_bridge.NOT_CONFIGURED}
    return {"semantic_search": semantic, "skills_bridge": bridge}


@router.post("/embeddings/sync")
def sync_embeddings(session: SessionDep, embedder: EmbedderDep):
    """Embed qualifications and programs that are new or changed (normally done on every deploy)."""
    if embedder is None:
        raise ConflictError("Semantic search is turned off or its model could not load.")
    report = embeddings.sync(session, embedder)
    session.commit()
    return {"created": report.created, "updated": report.updated}
