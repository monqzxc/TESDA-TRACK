"""Semantic search with one local embedding model (no data leaves the server).

    python -m tesda_track.embeddings download   # fetch the model files (done when building the Docker image)
    python -m tesda_track.embeddings sync       # embed new or changed qualifications and training programs

The model is intfloat/multilingual-e5-small (MIT, ~100 languages including Tagalog), run on CPU through
fastembed's ONNX runtime. E5 expects "query: " and "passage: " prefixes. EMBEDDING_MODEL_PATH points at a
fine-tuned copy in a local folder instead (see backend/models/README.md); its calibration.json carries the
score parameters that were tuned with it.
"""
import hashlib
import json
import logging
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Annotated, Protocol

from fastapi import Depends
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from tesda_track.config import DEFAULT_EMBEDDING_MODEL, get_settings
from tesda_track.models import (Qualification, QualificationEmbedding, TrainingProgram, TrainingProgramEmbedding)
from tesda_track.models.semantic import EMBEDDING_DIMENSIONS

if TYPE_CHECKING:
    from tesda_track.services.analysis import MatchParams

logger = logging.getLogger(__name__)
# Models fastembed doesn't list but can run from their Hugging Face ONNX export.
CUSTOM_MODELS = {"intfloat/multilingual-e5-small": {"dim": 384, "model_file": "onnx/model.onnx"}}


class Embedder(Protocol):
    model_name: str

    def embed_queries(self, texts: list[str]) -> list[list[float]]: ...

    def embed_passages(self, texts: list[str]) -> list[list[float]]: ...


class E5Embedder:
    def __init__(self, model_name: str, cache_dir: str | None = None, model_path: str | None = None):
        from fastembed import TextEmbedding

        self.model_name = model_name
        self.calibration: "MatchParams | None" = None
        if not model_path:
            _register(model_name)
            self._model = TextEmbedding(model_name, cache_dir=cache_dir)
            return
        if model_name == DEFAULT_EMBEDDING_MODEL:
            # Vectors from two models under one name would pass the sync's hash check and silently mix.
            raise ValueError(f"EMBEDDING_MODEL_PATH is set but EMBEDDING_MODEL is still {model_name}; set "
                             "EMBEDDING_MODEL to the fine-tuned model's own name, e.g. tesda-track/<folder>")
        if not (Path(model_path) / "onnx" / "model.onnx").is_file():
            raise FileNotFoundError(f"No fine-tuned model at {model_path} (expected onnx/model.onnx)")
        _register_local(model_name)
        self._model = TextEmbedding(model_name, cache_dir=cache_dir, specific_model_path=model_path)
        self.calibration = read_calibration(model_path)

    def embed_queries(self, texts: list[str]) -> list[list[float]]:
        return [vector.tolist() for vector in self._model.embed([f"query: {text}" for text in texts])]

    def embed_passages(self, texts: list[str]) -> list[list[float]]:
        return [vector.tolist() for vector in self._model.embed([f"passage: {text}" for text in texts])]


def _register(model_name: str) -> None:
    spec = CUSTOM_MODELS.get(model_name)
    if spec is None:
        return
    from fastembed import TextEmbedding
    from fastembed.common.model_description import ModelSource, PoolingType

    if any(m["model"] == model_name for m in TextEmbedding.list_supported_models()):
        return
    TextEmbedding.add_custom_model(model=model_name, pooling=PoolingType.MEAN, normalization=True,
                                   sources=ModelSource(hf=model_name), dim=spec["dim"], model_file=spec["model_file"])


def _register_local(model_name: str) -> None:
    """Make a fine-tuned folder loadable under its own name; the files come from the folder, not the hub."""
    from fastembed import TextEmbedding
    from fastembed.common.model_description import ModelSource, PoolingType

    if any(m["model"] == model_name for m in TextEmbedding.list_supported_models()):
        return
    TextEmbedding.add_custom_model(model=model_name, pooling=PoolingType.MEAN, normalization=True,
                                   sources=ModelSource(hf=model_name), dim=EMBEDDING_DIMENSIONS,
                                   model_file="onnx/model.onnx")


def read_calibration(model_path: str | None) -> "MatchParams | None":
    """The score parameters saved beside a fine-tuned model; None when absent or invalid (settings apply then)."""
    from tesda_track.services.analysis import MatchParams

    if not model_path:
        return None
    path = Path(model_path) / "calibration.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        params = MatchParams(float(data["z_floor"]), float(data["z_ceiling"]), float(data["keyword_weight"]),
                             int(data["min_score"]))
        if not (params.z_ceiling > params.z_floor and 0 <= params.keyword_weight <= 1 and 0 <= params.min_score <= 100):
            raise ValueError("values out of range")
    except (OSError, ValueError, KeyError, TypeError) as error:
        logger.warning("Ignoring invalid %s (%s); using the settings' score parameters", path, error)
        return None
    return params


_lock = threading.Lock()
_embedder: Embedder | None = None
_load_failed = False


def get_embedder() -> Embedder | None:
    """The shared model, loaded on first use; None when semantic search is off or the model can't load."""
    global _embedder, _load_failed
    settings = get_settings()
    if not settings.semantic_search_enabled:
        return None
    with _lock:
        if _embedder is None and not _load_failed:
            try:
                _embedder = E5Embedder(settings.embedding_model, settings.embedding_cache_dir,
                                     settings.embedding_model_path)
            except Exception:
                _load_failed = True
                logger.exception("Could not load embedding model %s; using keyword matching only",
                                 settings.embedding_model)
    return _embedder


def is_loaded() -> bool:
    return _embedder is not None


EmbedderDep = Annotated[Embedder | None, Depends(get_embedder)]


# What gets embedded

def qualification_text(qualification: Qualification) -> str:
    competencies = "; ".join(c.name for c in qualification.competencies if c.is_active)
    return (f"{qualification.name}. Sector: {qualification.sector.name}. Jobs: {', '.join(qualification.possible_jobs)}. "
            f"Skills: {qualification.skill_label}. Keywords: {', '.join(qualification.career_keywords)}. "
            f"Competencies: {competencies}.")


def program_text(program: TrainingProgram) -> str:
    return f"{program.title}. {program.qualification.name}. {program.description or ''}".strip()


def _hash(model_name: str, text: str) -> str:
    return hashlib.sha256(f"{model_name}\n{text}".encode()).hexdigest()


@dataclass
class EmbeddingReport:
    created: int = 0
    updated: int = 0


def _sync_rows(session: Session, embedder: Embedder, items: list[tuple[int, str]], model, key: str,
               report: EmbeddingReport) -> None:
    existing = {getattr(row, key): row for row in session.exec(select(model))}
    stale = [(item_id, text, _hash(embedder.model_name, text)) for item_id, text in items
             if item_id not in existing or existing[item_id].content_hash != _hash(embedder.model_name, text)]
    if not stale:
        return
    vectors = embedder.embed_passages([text for _, text, _ in stale])
    for (item_id, _, content_hash), vector in zip(stale, vectors):
        row = existing.get(item_id)
        if row is None:
            session.add(model(**{key: item_id}, model=embedder.model_name, content_hash=content_hash, embedding=vector))
            report.created += 1
        else:
            row.model, row.content_hash, row.embedding = embedder.model_name, content_hash, vector
            report.updated += 1


def sync(session: Session, embedder: Embedder) -> EmbeddingReport:
    """Embed active qualifications and programs whose text (or the model) changed since last time."""
    report = EmbeddingReport()
    qualifications = session.exec(select(Qualification).where(Qualification.is_active).options(
        selectinload(Qualification.sector), selectinload(Qualification.competencies))).all()
    _sync_rows(session, embedder, [(q.id, qualification_text(q)) for q in qualifications], QualificationEmbedding,
               "qualification_id", report)
    programs = session.exec(select(TrainingProgram).where(TrainingProgram.is_active).options(
        selectinload(TrainingProgram.qualification))).all()
    _sync_rows(session, embedder, [(p.id, program_text(p)) for p in programs], TrainingProgramEmbedding,
               "program_id", report)
    session.flush()
    return report


def refresh_program(session: Session, embedder: Embedder | None, program: TrainingProgram) -> None:
    if embedder is not None:
        _sync_rows(session, embedder, [(program.id, program_text(program))], TrainingProgramEmbedding, "program_id",
                   EmbeddingReport())
        session.flush()


# Similarity

def qualification_similarities(session: Session, embedder: Embedder, text: str) -> dict[int, float]:
    vector = embedder.embed_queries([text])[0]
    similarity = 1 - QualificationEmbedding.embedding.cosine_distance(vector)
    rows = session.exec(select(QualificationEmbedding.qualification_id, similarity)
                        .where(QualificationEmbedding.model == embedder.model_name))
    return {qualification_id: float(value) for qualification_id, value in rows}


def program_similarities(session: Session, embedder: Embedder, text: str, program_ids: list[int]) -> dict[int, float]:
    if not program_ids:
        return {}
    vector = embedder.embed_queries([text])[0]
    similarity = 1 - TrainingProgramEmbedding.embedding.cosine_distance(vector)
    rows = session.exec(select(TrainingProgramEmbedding.program_id, similarity).where(
        TrainingProgramEmbedding.model == embedder.model_name, TrainingProgramEmbedding.program_id.in_(program_ids)))
    return {program_id: float(value) for program_id, value in rows}
