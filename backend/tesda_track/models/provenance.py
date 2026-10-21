"""Public record provenance, separate from service authorization and intake checks."""
from datetime import date, datetime

from sqlalchemy import DateTime, String
from sqlmodel import Field

from tesda_track.models.base import Timestamped


class ProvenanceFields(Timestamped):
    data_status: str = Field(default="incomplete", sa_type=String(20))
    source_name: str | None = Field(default=None, sa_type=String(255))
    source_reference: str | None = Field(default=None, sa_type=String(500))
    source_url: str | None = Field(default=None, sa_type=String(1000))
    source_updated_on: date | None = None
    source_reviewed_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))

    @property
    def provenance(self) -> dict:
        return {"status": self.data_status, "source_name": self.source_name,
                "source_reference": self.source_reference, "source_url": self.source_url,
                "source_updated_on": self.source_updated_on, "reviewed_at": self.source_reviewed_at,
                "record_updated_at": self.updated_at}
