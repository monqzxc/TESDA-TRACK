"""Curated learning pathways (ordered steps per qualification and route) and learners' progress on them."""
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, String, Text, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel

from tesda_track.models.base import Timestamped, one_of, timestamp_field
from tesda_track.models.catalog import Qualification

ROUTES = ("TRAINING_AND_ASSESSMENT", "ASSESSMENT_READINESS", "SKILL_GAP_CHECK")
STEP_KINDS = ("self_check", "training", "assessment", "certification", "other")
ENROLLMENT_STATUSES = ("active", "completed", "withdrawn")
STEP_STATUSES = ("not_started", "in_progress", "completed")


class Pathway(Timestamped, table=True):
    __table_args__ = (
        UniqueConstraint("qualification_id", "route", name="uq_pathway_qualification_route"),
        CheckConstraint(one_of("route", ROUTES), name="route_valid"),
    )

    id: int | None = Field(default=None, primary_key=True)
    qualification_id: int = Field(foreign_key="qualification.id", ondelete="RESTRICT", index=True)
    route: str = Field(sa_type=String(40))
    title: str = Field(sa_type=String(200))
    description: str = Field(default="", sa_type=Text)
    is_active: bool = True

    qualification: Qualification = Relationship()
    steps: list["PathwayStep"] = Relationship(
        back_populates="pathway",
        sa_relationship_kwargs={"order_by": "PathwayStep.position", "cascade": "all, delete-orphan"})


class PathwayStep(SQLModel, table=True):
    __tablename__ = "pathway_step"
    __table_args__ = (
        UniqueConstraint("pathway_id", "position", name="uq_pathway_step_pathway_position",
                         deferrable=True, initially="DEFERRED"),
        CheckConstraint(one_of("kind", STEP_KINDS), name="kind_valid"),
        CheckConstraint("position > 0", name="position_positive"),
    )

    id: int | None = Field(default=None, primary_key=True)
    pathway_id: int = Field(foreign_key="pathway.id", ondelete="CASCADE", index=True)
    position: int
    kind: str = Field(sa_type=String(20))
    title: str = Field(sa_type=String(200))
    description: str = Field(default="", sa_type=Text)

    pathway: Pathway = Relationship(back_populates="steps")


class PathwayEnrollment(Timestamped, table=True):
    __tablename__ = "pathway_enrollment"
    __table_args__ = (
        UniqueConstraint("learner_id", "pathway_id", name="uq_pathway_enrollment_learner_pathway"),
        CheckConstraint(one_of("status", ENROLLMENT_STATUSES), name="status_valid"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    learner_id: uuid.UUID = Field(foreign_key="learner.id", ondelete="CASCADE", index=True)
    pathway_id: int = Field(foreign_key="pathway.id", ondelete="RESTRICT", index=True)
    status: str = Field(default="active", sa_type=String(20))
    completed_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))

    pathway: Pathway = Relationship()
    progress: list["StepProgress"] = Relationship(sa_relationship_kwargs={"cascade": "all, delete-orphan"})


class StepProgress(SQLModel, table=True):
    """Only steps a learner has touched have a row; every other step counts as not started."""
    __tablename__ = "step_progress"
    __table_args__ = (CheckConstraint(one_of("status", STEP_STATUSES), name="status_valid"),)

    enrollment_id: uuid.UUID = Field(foreign_key="pathway_enrollment.id", ondelete="CASCADE", primary_key=True)
    step_id: int = Field(foreign_key="pathway_step.id", ondelete="CASCADE", primary_key=True)
    status: str = Field(sa_type=String(20))
    updated_at: datetime = timestamp_field(on_update=True)
