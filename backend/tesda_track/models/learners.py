"""Learner accounts and the records they own. Deleting a learner cascades to all of them."""
import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel

from tesda_track.models.base import Timestamped, one_of, timestamp_field
from tesda_track.models.catalog import Qualification

ROLES = ("learner", "admin")
GOAL_STATUSES = ("active", "achieved", "archived")
ANALYSIS_SOURCES = ("rules", "ai")
ANSWER_CODES = ("confident", "some_experience", "not_familiar")
CERTIFICATION_SOURCES = ("self_reported", "assessment")


class Learner(Timestamped, table=True):
    __table_args__ = (CheckConstraint(one_of("role", ROLES), name="role_valid"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(sa_type=String(254), unique=True)
    password_hash: str = Field(sa_type=String(255))
    full_name: str = Field(sa_type=String(150))
    role: str = Field(default="learner", sa_type=String(20))
    is_active: bool = True
    privacy_consent_at: datetime = Field(sa_type=DateTime(timezone=True))
    # Incremented on password change; tokens carrying an older version stop working.
    token_version: int = 0
    failed_login_attempts: int = 0
    locked_until: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))


class Goal(Timestamped, table=True):
    __table_args__ = (CheckConstraint(one_of("status", GOAL_STATUSES), name="status_valid"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    learner_id: uuid.UUID = Field(foreign_key="learner.id", ondelete="CASCADE", index=True)
    title: str = Field(sa_type=String(1000))
    target_qualification_id: int | None = Field(default=None, foreign_key="qualification.id", ondelete="RESTRICT")
    status: str = Field(default="active", sa_type=String(20))
    target_date: date | None = None

    target_qualification: Optional[Qualification] = Relationship()


class RecommendationSession(Timestamped, table=True):
    __tablename__ = "recommendation_session"
    __table_args__ = (CheckConstraint(one_of("analysis_source", ANALYSIS_SOURCES), name="analysis_source_valid"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    learner_id: uuid.UUID = Field(foreign_key="learner.id", ondelete="CASCADE", index=True)
    goal_id: uuid.UUID | None = Field(default=None, foreign_key="goal.id", ondelete="SET NULL")
    query: str = Field(sa_type=Text)
    analysis_source: str = Field(sa_type=String(10))
    # The profile as first analyzed; follow-up answers are re-applied to it, never accumulated.
    analysis_profile: dict = Field(sa_type=JSONB)
    profile: dict = Field(sa_type=JSONB)
    matches: list = Field(sa_type=JSONB)
    qualification_id: int | None = Field(default=None, foreign_key="qualification.id", ondelete="RESTRICT")
    pathway: dict | None = Field(default=None, sa_type=JSONB)

    qualification: Optional[Qualification] = Relationship()


class ReadinessCheck(SQLModel, table=True):
    __tablename__ = "readiness_check"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    learner_id: uuid.UUID = Field(foreign_key="learner.id", ondelete="CASCADE", index=True)
    qualification_id: int = Field(foreign_key="qualification.id", ondelete="RESTRICT", index=True)
    recommendation_session_id: uuid.UUID | None = Field(
        default=None, foreign_key="recommendation_session.id", ondelete="SET NULL")
    score: float
    level: str = Field(sa_type=String(30))
    # Snapshot of strengths, gaps and advice as shown to the learner at the time.
    result: dict = Field(sa_type=JSONB)
    created_at: datetime = timestamp_field()

    qualification: Qualification = Relationship()
    answers: list["ReadinessAnswer"] = Relationship(sa_relationship_kwargs={"cascade": "all, delete-orphan"})


class ReadinessAnswer(SQLModel, table=True):
    __tablename__ = "readiness_answer"
    __table_args__ = (CheckConstraint(one_of("answer", ANSWER_CODES), name="answer_valid"),)

    readiness_check_id: uuid.UUID = Field(foreign_key="readiness_check.id", ondelete="CASCADE", primary_key=True)
    competency_id: int = Field(foreign_key="competency.id", ondelete="RESTRICT", primary_key=True, index=True)
    answer: str = Field(sa_type=String(20))


class Certification(Timestamped, table=True):
    __table_args__ = (
        CheckConstraint(one_of("source", CERTIFICATION_SOURCES), name="source_valid"),
        CheckConstraint("expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on", name="dates_ordered"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    learner_id: uuid.UUID = Field(foreign_key="learner.id", ondelete="CASCADE", index=True)
    qualification_id: int | None = Field(default=None, foreign_key="qualification.id", ondelete="RESTRICT")
    title: str = Field(sa_type=String(200))
    certificate_number: str | None = Field(default=None, sa_type=String(100))
    issuing_body: str = Field(default="TESDA", sa_type=String(150))
    issued_on: date | None = None
    expires_on: date | None = None
    verified: bool = False
    source: str = Field(default="self_reported", sa_type=String(20))
    # Set when the certification was issued from a completed assessment; verified records come from here.
    assessment_application_id: uuid.UUID | None = Field(
        default=None, foreign_key="assessment_application.id", ondelete="SET NULL", unique=True)

    qualification: Optional[Qualification] = Relationship()
