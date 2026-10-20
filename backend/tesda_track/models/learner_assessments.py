import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from tesda_track.models.base import timestamp_field


class LearnerAssessment(SQLModel, table=True):
    __tablename__ = "learner_assessment"
    __table_args__ = (
        UniqueConstraint("series_id", "revision", name="uq_assessment_series_revision"),
        CheckConstraint("revision > 0", name="revision_positive"),
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    learner_id: uuid.UUID = Field(foreign_key="learner.id", ondelete="CASCADE", index=True)
    series_id: uuid.UUID = Field(default_factory=uuid.uuid4, index=True)
    revision: int = 1
    previous_revision_id: uuid.UUID | None = Field(default=None, foreign_key="learner_assessment.id", ondelete="SET NULL")
    answers: dict = Field(sa_type=JSONB)
    created_at: datetime = timestamp_field()
