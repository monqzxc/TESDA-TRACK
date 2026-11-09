"""Labor-market information: official datasets, their occupation evidence, and reviewed links to qualifications.

Kept apart from matching: nothing here is read by qualification scoring, rankings or readiness. Evidence enriches a
qualification only through a mapping a reviewer approved (services/labor_market.py).
"""
import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from tesda_track.models.base import Timestamped, one_of

# What kind of evidence a dataset holds. Only forecasts carry an in-demand or hard-to-fill classification.
EVIDENCE_CLASSES = ("national_forecast", "regional_forecast", "observed_posting", "historical_forecast",
                    "historical_statistics")
GEOGRAPHIC_SCOPES = ("national", "regional", "local")
CLASSIFICATIONS = ("in_demand", "hard_to_fill", "cross_cutting", "observed_posting")
DATASET_STATUSES = ("active", "retired")
# The research review's proposal, and the reviewer's decision. A rejected proposal can never be approved.
PROPOSALS = ("high_confidence", "needs_review", "rejected")
DECISIONS = ("pending", "approved", "rejected")


class LaborMarketDataset(Timestamped, table=True):
    """One version of one official publication or collection, as imported."""
    __tablename__ = "labor_market_dataset"
    __table_args__ = (
        CheckConstraint(one_of("evidence_class", EVIDENCE_CLASSES), name="evidence_class_valid"),
        CheckConstraint(one_of("geographic_scope", GEOGRAPHIC_SCOPES), name="geographic_scope_valid"),
        CheckConstraint(one_of("status", DATASET_STATUSES), name="status_valid"),
        CheckConstraint("period_end_year IS NULL OR period_start_year IS NULL OR period_end_year >= period_start_year",
                        name="period_ordered"),
    )

    id: int | None = Field(default=None, primary_key=True)
    # source_id@version, e.g. dole-ble-national-jlmf-2025-2026@1: a new version is a new row.
    key: str = Field(sa_type=String(120), unique=True)
    source_id: str = Field(sa_type=String(100), index=True)
    version: int
    publisher: str = Field(sa_type=String(200))
    title: str = Field(sa_type=String(300))
    publication_label: str | None = Field(default=None, sa_type=String(100))  # as printed, e.g. "May 2025"
    publication_date: date | None = None  # only when the source prints a full date
    evidence_class: str = Field(sa_type=String(30))
    geographic_scope: str = Field(sa_type=String(20))
    region_code: str | None = Field(default=None, foreign_key="region.code", ondelete="RESTRICT")
    period_label: str | None = Field(default=None, sa_type=String(100))
    period_start_year: int | None = None
    period_end_year: int | None = None
    source_url: str = Field(sa_type=String(1000))
    source_url_kind: str | None = Field(default=None, sa_type=String(100))
    file_sha256: str | None = Field(default=None, sa_type=String(64))
    input_sha256: str = Field(sa_type=String(64))  # of the imported files, so a re-import is recognised
    status: str = Field(default="active", sa_type=String(20))
    imported_at: datetime = Field(sa_type=DateTime(timezone=True))
    record_count: int = 0
    validation: dict = Field(default_factory=dict, sa_type=JSONB)
    notes: str | None = Field(default=None, sa_type=Text)


class LaborMarketEvidence(Timestamped, table=True):
    """One occupation as one source printed it: a title in a sector and classification, or a dated posting."""
    __tablename__ = "labor_market_evidence"
    __table_args__ = (
        UniqueConstraint("dataset_id", "occurrence_key", name="uq_labor_market_evidence_version_occurrence"),
        CheckConstraint(one_of("classification", CLASSIFICATIONS), name="classification_valid"),
        CheckConstraint(one_of("geographic_scope", GEOGRAPHIC_SCOPES), name="geographic_scope_valid"),
    )

    id: int | None = Field(default=None, primary_key=True)
    dataset_id: int = Field(foreign_key="labor_market_dataset.id", ondelete="CASCADE", index=True)
    # Unique across sources: the source's own record_id repeats across sectors, so it is kept only for auditing.
    occurrence_key: str = Field(sa_type=String(64), index=True)
    source_record_id: str = Field(sa_type=String(100), index=True)
    occupation_title: str = Field(sa_type=String(300))
    normalized_title: str = Field(sa_type=String(300), index=True)
    sector: str | None = Field(default=None, sa_type=String(300))
    classification: str = Field(sa_type=String(30))
    geographic_scope: str = Field(sa_type=String(20))
    region_code: str | None = Field(default=None, foreign_key="region.code", ondelete="RESTRICT", index=True)
    locality: str | None = Field(default=None, sa_type=String(120))
    period_label: str | None = Field(default=None, sa_type=String(100))
    observed_on: date | None = None  # postings only
    page_pdf: str | None = Field(default=None, sa_type=String(20))
    page_printed: str | None = Field(default=None, sa_type=String(20))
    source_table: str | None = Field(default=None, sa_type=String(500))
    source_url: str | None = Field(default=None, sa_type=String(1000))  # a posting's own page, else the dataset's
    verification: str | None = Field(default=None, sa_type=String(200))
    provenance: dict = Field(default_factory=dict, sa_type=JSONB)


class LaborMarketMapping(Timestamped, table=True):
    """A proposed link from one evidence occurrence to one qualification, and the reviewer's decision on it."""
    __tablename__ = "labor_market_mapping"
    __table_args__ = (
        CheckConstraint(one_of("proposal", PROPOSALS), name="proposal_valid"),
        CheckConstraint(one_of("decision", DECISIONS), name="decision_valid"),
        CheckConstraint("NOT (proposal = 'rejected' AND decision = 'approved')", name="rejected_never_approved"),
        UniqueConstraint("evidence_id", "qualification_id", name="uq_labor_market_mapping_pair"),
    )

    id: int | None = Field(default=None, primary_key=True)
    mapping_key: str = Field(sa_type=String(220), unique=True)  # the review's id, e.g. PH4-C001
    evidence_id: int = Field(foreign_key="labor_market_evidence.id", ondelete="CASCADE", index=True)
    qualification_id: int = Field(foreign_key="qualification.id", ondelete="RESTRICT", index=True)
    proposal: str = Field(sa_type=String(20))
    evidence_tier: str | None = Field(default=None, sa_type=String(60))
    review_reason: str | None = Field(default=None, sa_type=Text)
    competencies: list = Field(default_factory=list, sa_type=JSONB)  # the qualification competencies the review cited
    training_regulation_url: str | None = Field(default=None, sa_type=String(1000))
    training_regulation_reference: str | None = Field(default=None, sa_type=String(300))
    cautions: str | None = Field(default=None, sa_type=Text)
    decision: str = Field(default="pending", sa_type=String(20), index=True)
    decided_by: uuid.UUID | None = Field(default=None, sa_column=Column(
        Uuid, ForeignKey("learner.id", ondelete="SET NULL", name="fk_labor_market_mapping_decided_by_learner"),
        nullable=True))
    decided_by_label: str | None = Field(default=None, sa_type=String(254))  # who, for command-line reviews
    decided_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    decision_note: str | None = Field(default=None, sa_type=Text)


class LaborMarketReview(Timestamped, table=True):
    """Append-only application audit trail; previous decisions are never overwritten here."""
    __tablename__ = "labor_market_review"
    id: int | None = Field(default=None, primary_key=True)
    mapping_id: int | None = Field(default=None, foreign_key="labor_market_mapping.id", ondelete="RESTRICT", index=True)
    dataset_id: int = Field(foreign_key="labor_market_dataset.id", ondelete="RESTRICT", index=True)
    actor_id: uuid.UUID | None = Field(default=None, foreign_key="learner.id", ondelete="SET NULL")
    action: str = Field(sa_type=String(30))
    previous: str = Field(sa_type=String(30))
    decision: str = Field(sa_type=String(30))
    note: str = Field(sa_type=Text)


class CareerGoalSelection(Timestamped, table=True):
    __tablename__ = "career_goal_selection"
    __table_args__ = (UniqueConstraint("learner_id", "journey_key", name="uq_career_goal_selection_journey"),)
    id: int | None = Field(default=None, primary_key=True)
    learner_id: uuid.UUID = Field(foreign_key="learner.id", ondelete="CASCADE", index=True)
    journey_key: uuid.UUID
    goal_id: uuid.UUID = Field(foreign_key="goal.id", ondelete="CASCADE")
