"""Learners' answers to "Are you satisfied with this recommendation?", with the numbers behind each recommendation.

Neither the goal's words nor the account are kept with an answer: the goal only as a keyed hash. That is enough to
measure how well matching does, and to recalibrate it, without keeping a record of what anyone typed. A learner who
chooses to share their goal's words gives a SharedGoal, kept apart from the answer.
"""
import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Column, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from tesda_track.models.base import one_of, timestamp_field

FEEDBACK_REASONS = ("wrong_qualification", "readiness_off", "pathway_not_helpful")
# The privacy policy's version (frontend features/privacy/notice.ts) that tells learners what sharing a goal means.
SHARED_GOAL_CONSENT = "2026-10-21"


class RecommendationFeedback(SQLModel, table=True):
    __tablename__ = "recommendation_feedback"
    __table_args__ = (
        CheckConstraint(one_of("reason", FEEDBACK_REASONS), name="reason_valid"),
        CheckConstraint("reason IS NULL OR NOT satisfied", name="reason_only_when_unsatisfied"),
        CheckConstraint("wanted_qualification_id IS NULL OR reason = 'wrong_qualification'",
                        name="wanted_only_when_wrong"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    satisfied: bool
    reason: str | None = Field(default=None, sa_type=String(30))
    qualification_id: int = Field(foreign_key="qualification.id", ondelete="RESTRICT", index=True)
    # After "It's the wrong qualification for my goal", the one the learner says they wanted (optional). The
    # convention's name for this key is longer than PostgreSQL's 63 characters, so it is named here.
    wanted_qualification_id: int | None = Field(default=None, sa_column=Column(
        Integer, ForeignKey("qualification.id", ondelete="RESTRICT",
                            name="fk_recommendation_feedback_wanted_qualification"), nullable=True))
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


class SharedGoal(SQLModel, table=True):
    """A goal's words that a learner chose to share after rating its recommendation, labelled with the qualification
    they say fits, for testing and training matching (backend/training/learner.py collects them for review).

    Linked to no account and no answer, and dated only by the day: the answer's numbers stay unjoinable with the words.
    """
    __tablename__ = "shared_goal"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    goal: str = Field(sa_type=String(1000))
    # The one the learner was satisfied with, or the one they wanted instead of the recommendation.
    qualification_id: int = Field(foreign_key="qualification.id", ondelete="RESTRICT")
    # After "wrong qualification", the one they were recommended: a known wrong answer for this goal.
    shown_qualification_id: int | None = Field(default=None, foreign_key="qualification.id", ondelete="RESTRICT")
    consent_version: str = Field(sa_type=String(20))
    shared_on: date
