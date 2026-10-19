"""Outside systems (TESDA Skill Passport, BSRS) that call the MCP server with client credentials."""
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlmodel import Field

from tesda_track.models.base import Timestamped


class ApiClient(Timestamped, table=True):
    __tablename__ = "api_client"
    __table_args__ = (CheckConstraint("rate_limit_per_minute > 0", name="rate_limit_positive"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(sa_type=String(100), unique=True)
    organisation: str = Field(sa_type=String(200))
    contact_email: str | None = Field(default=None, sa_type=String(254))
    declared_purpose: str = Field(sa_type=Text)
    expected_tools: list[str] = Field(default_factory=list, sa_type=ARRAY(Text))
    scopes: list[str] = Field(default_factory=list, sa_type=ARRAY(Text))
    rate_limit_per_minute: int = 120
    secret_hash: str = Field(sa_type=String(255))
    # Incremented when the secret rotates or the client is revoked; older access tokens stop working.
    token_version: int = 1
    is_active: bool = True
    last_token_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
