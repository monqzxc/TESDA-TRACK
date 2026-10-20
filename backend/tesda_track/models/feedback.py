"""Learners' answers to "Are you satisfied with this recommendation?", with the numbers behind each recommendation.

Neither the goal's words nor the account are kept: the goal only as a keyed hash. That is enough to measure how well
matching does, and to recalibrate it, without keeping a record of what anyone typed.
"""
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from tesda_track.models.base import one_of, timestamp_field

FEEDBACK_REASONS = ("wrong_qualification", "readiness_off", "pathway_not_helpful")


class RecommendationFeedback(SQLModel, table=True):
    __tablename__ = "recommendation_feedback"
    __table_args__ = (
        CheckConstraint(one_of("reason", FEEDBACK_REASONS), name="reason_valid"),
        CheckConstraint("reason IS NULL OR NOT satisfied", name="reason_only_when_unsatisfied"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    satisfied: bool
    reason: str | None = Field(default=None, sa_type=String(30))
    qualification_id: int = Field(foreign_key="qualification.id", ondelete="RESTRICT", index=True)
    query_hash: str = Field(sa_type=String(64))
    signed_in: bool
    # The learner's situation, as matching read it.
    intent: str = Field(sa_type=String(40))
    experience_years: float | None = None
    has_certification: bool | None = None
    # What the learner was shown: how many matches, and the chosen one's place (1 = top) and score among them.
    # No place means the learner picked it from the library.
    match_count: int
    rank: int | None = None
    score: int | None = None
    # The evidence for the chosen qualification, whatever its place: keyword strength (0..1), and its meaning
    # similarity's z-score against the catalog, the number the semantic band is calibrated on (None without the model).
    keyword: float
    z_score: float | None = None
    model: str | None = Field(default=None, sa_type=String(100))
    params: dict | None = Field(default=None, sa_type=JSONB)
    readiness_score: float
    readiness_level: str = Field(sa_type=String(30))
    created_at: datetime = timestamp_field()
    updated_at: datetime = timestamp_field(on_update=True)
