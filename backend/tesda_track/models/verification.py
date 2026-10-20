"""Evidence for a particular site's authority to deliver one qualification."""
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from tesda_track.models.base import Timestamped


class ServiceVerification(Timestamped, table=True):
    __tablename__ = "service_verification"
    __table_args__ = (
        CheckConstraint("(provider_id IS NULL) <> (center_id IS NULL)", name="one_site"),
        UniqueConstraint("provider_id", "qualification_id", name="uq_verification_provider_qualification"),
        UniqueConstraint("center_id", "qualification_id", name="uq_verification_center_qualification"),
        CheckConstraint("status IN ('unknown', 'verified', 'unavailable', 'expired')", name="status_valid"),
        CheckConstraint("status <> 'verified' OR (NOT is_synthetic AND source_reference IS NOT NULL "
                        "AND source_name IS NOT NULL AND reviewed_at IS NOT NULL AND review_due_at IS NOT NULL)",
                        name="verified_evidence"),
        CheckConstraint("review_due_at IS NULL OR reviewed_at IS NULL OR review_due_at > reviewed_at",
                        name="review_dates"),
        CheckConstraint("valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from", name="valid_dates"),
    )

    id: int | None = Field(default=None, primary_key=True)
    provider_id: int | None = Field(default=None, foreign_key="training_provider.id", ondelete="CASCADE")
    center_id: int | None = Field(default=None, foreign_key="assessment_center.id", ondelete="CASCADE")
    qualification_id: int = Field(foreign_key="qualification.id", ondelete="RESTRICT", index=True)
    status: str = Field(default="unknown", sa_type=String(20))
    source_name: str | None = Field(default=None, sa_type=String(200))
    source_reference: str | None = Field(default=None, sa_type=String(500))
    source_record_id: str | None = Field(default=None, sa_type=String(200))
    source_version: str | None = Field(default=None, sa_type=String(100))
    reviewed_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    review_due_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    valid_from: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    valid_until: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    is_synthetic: bool = False
    requirements_reviewed: bool = False
    requirements: list = Field(default_factory=list, sa_type=JSONB)
