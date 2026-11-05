"""Learners signed in through TESDA Skill Passport (docs/contracts/tsp-tracker-embed/CONTRACT.md).

A TSP learner's account has no password and no email: it is reached only through TSP's handoff, and it is linked by
Hercules' sso_id. TSP's email is never kept, so it can't claim the address of another account. Before an account
exists the learner consents; until then the cleaned profile waits in tsp_pending_sign_in for a few minutes. Every link, sign-in and refusal is recorded in tsp_sign_in_audit.
"""
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from tesda_track.models.base import one_of, timestamp_field

TSP_PROVIDER = "tsp"
AUDIT_EVENTS = ("consent_requested", "linked", "signed_in", "consent_declined", "uli_mismatch")


class LearnerIdentity(SQLModel, table=True):
    __tablename__ = "learner_identity"
    __table_args__ = (UniqueConstraint("provider", "subject", name="uq_learner_identity_provider_subject"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    provider: str = Field(sa_type=String(20))
    # Hercules' sso_id: TSP's identifier for the person, not personal information in itself.
    subject: str = Field(sa_type=String(255))
    learner_id: uuid.UUID = Field(foreign_key="learner.id", ondelete="CASCADE", unique=True)
    # Checked on every sign-in: a known sso_id arriving with another ULI is refused rather than mixing two people.
    uli: str | None = Field(default=None, sa_type=String(64))
    scopes: list = Field(sa_type=JSONB)
    # Only the sections TESDA-TRACK uses (services/tsp_sign_in.kept_profile), refreshed on every sign-in.
    profile: dict = Field(sa_type=JSONB)
    linked_at: datetime = Field(sa_type=DateTime(timezone=True))
    last_signed_in_at: datetime = Field(sa_type=DateTime(timezone=True))


class TspPendingSignIn(SQLModel, table=True):
    """A first sign-in waiting for the learner's consent. Deleted on the answer, or by the purge once expired."""
    __tablename__ = "tsp_pending_sign_in"

    id: str = Field(sa_type=String(64), primary_key=True)
    subject: str = Field(sa_type=String(255))
    uli: str | None = Field(default=None, sa_type=String(64))
    scopes: list = Field(sa_type=JSONB)
    profile: dict = Field(sa_type=JSONB)
    expires_at: datetime = Field(sa_type=DateTime(timezone=True), index=True)


class TspSignInAudit(SQLModel, table=True):
    __tablename__ = "tsp_sign_in_audit"
    __table_args__ = (CheckConstraint(one_of("event", AUDIT_EVENTS), name="event_valid"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    occurred_at: datetime = timestamp_field()
    subject: str = Field(sa_type=String(255), index=True)
    learner_id: uuid.UUID | None = Field(default=None, foreign_key="learner.id", ondelete="SET NULL")
    event: str = Field(sa_type=String(30))
    scopes: list = Field(sa_type=JSONB)
