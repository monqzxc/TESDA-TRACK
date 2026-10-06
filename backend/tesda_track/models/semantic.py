"""Embeddings for semantic search, the audit trail of ranked recommendations, and a small TTL cache."""
import uuid
from datetime import datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import BigInteger, DateTime, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from tesda_track.models.base import timestamp_field

# Dimensions of intfloat/multilingual-e5-small; a model with another size needs a migration.
EMBEDDING_DIMENSIONS = 384


class QualificationEmbedding(SQLModel, table=True):
    __tablename__ = "qualification_embedding"

    qualification_id: int = Field(foreign_key="qualification.id", ondelete="CASCADE", primary_key=True)
    model: str = Field(sa_type=String(100))
    # Hash of the model name and embedded text: unchanged text is never embedded twice.
    content_hash: str = Field(sa_type=String(64))
    embedding: list[float] = Field(sa_type=Vector(EMBEDDING_DIMENSIONS))
    updated_at: datetime = timestamp_field(on_update=True)


class TrainingProgramEmbedding(SQLModel, table=True):
    __tablename__ = "training_program_embedding"

    program_id: int = Field(foreign_key="training_program.id", ondelete="CASCADE", primary_key=True)
    model: str = Field(sa_type=String(100))
    content_hash: str = Field(sa_type=String(64))
    embedding: list[float] = Field(sa_type=Vector(EMBEDDING_DIMENSIONS))
    updated_at: datetime = timestamp_field(on_update=True)


class RankingAudit(SQLModel, table=True):
    """What was ranked, with which weights, and why. The learner's goal text is never stored, only its hash."""
    __tablename__ = "ranking_audit"

    id: int | None = Field(default=None, primary_key=True, sa_type=BigInteger)
    learner_id: uuid.UUID | None = Field(default=None, foreign_key="learner.id", ondelete="SET NULL", index=True)
    qualification_id: int = Field(foreign_key="qualification.id", ondelete="RESTRICT", index=True)
    query_hash: str | None = Field(default=None, sa_type=String(64))
    # Rounded to one decimal (about 11 km): enough to explain proximity, too coarse to locate a person.
    near_lat: float | None = None
    near_lon: float | None = None
    preferences: dict = Field(default_factory=dict, sa_type=JSONB)
    weights: dict = Field(sa_type=JSONB)
    model: str | None = Field(default=None, sa_type=String(100))
    results: list = Field(sa_type=JSONB)
    created_at: datetime = timestamp_field()


class CacheEntry(SQLModel, table=True):
    __tablename__ = "cache_entry"

    key: str = Field(sa_type=String(255), primary_key=True)
    value: Any = Field(sa_type=JSONB)
    expires_at: datetime = Field(sa_type=DateTime(timezone=True), index=True)
    created_at: datetime = timestamp_field()
