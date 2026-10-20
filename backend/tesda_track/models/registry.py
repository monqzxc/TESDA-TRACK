"""Registry source history and durable links to importer-owned operational rows."""
import uuid
from datetime import date

from sqlalchemy import CheckConstraint, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from tesda_track.models.base import Timestamped


class RegistryBatch(Timestamped, table=True):
    __tablename__ = "registry_batch"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    fingerprint: str = Field(sa_type=String(64), unique=True)
    source_name: str = Field(sa_type=String(255))
    source_sha256: str = Field(sa_type=String(64))
    kind: str = Field(sa_type=String(20))
    sheet: str = Field(sa_type=String(120))
    snapshot_date: date
    inspected_on: date
    policy_sha256: str = Field(sa_type=String(64))
    summary: dict = Field(default_factory=dict, sa_type=JSONB)


class RegistryRecord(Timestamped, table=True):
    __tablename__ = "registry_record"
    __table_args__ = (UniqueConstraint("batch_id", "row_number", name="uq_registry_record_batch_row"),)
    id: int | None = Field(default=None, primary_key=True)
    batch_id: uuid.UUID = Field(foreign_key="registry_batch.id", ondelete="RESTRICT", index=True)
    row_number: int
    site_key: str = Field(sa_type=String(64))
    source_record_id: str | None = Field(default=None, sa_type=String(300))
    outcome: str = Field(sa_type=String(20))
    reasons: list = Field(default_factory=list, sa_type=JSONB)
    payload: dict = Field(default_factory=dict, sa_type=JSONB)
    qualification_id: int | None = Field(default=None, foreign_key="qualification.id", ondelete="RESTRICT")


class RegistryLink(Timestamped, table=True):
    __tablename__ = "registry_link"
    __table_args__ = (
        UniqueConstraint("entity_kind", "external_key", name="uq_registry_link_kind_key"),
        CheckConstraint("(entity_kind = 'provider' AND provider_id IS NOT NULL AND program_id IS NULL AND center_id IS NULL) "
                        "OR (entity_kind = 'program' AND provider_id IS NULL AND program_id IS NOT NULL AND center_id IS NULL) "
                        "OR (entity_kind = 'center' AND provider_id IS NULL AND program_id IS NULL AND center_id IS NOT NULL)",
                        name="target_valid"),
    )
    id: int | None = Field(default=None, primary_key=True)
    entity_kind: str = Field(sa_type=String(20))
    external_key: str = Field(sa_type=String(64))
    provider_id: int | None = Field(default=None, foreign_key="training_provider.id", ondelete="RESTRICT")
    program_id: int | None = Field(default=None, foreign_key="training_program.id", ondelete="RESTRICT")
    center_id: int | None = Field(default=None, foreign_key="assessment_center.id", ondelete="RESTRICT")
    last_snapshot_date: date
