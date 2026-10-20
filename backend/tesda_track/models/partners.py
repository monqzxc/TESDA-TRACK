"""Outside systems (TESDA Skill Passport, BSRS) that call the MCP server with client credentials."""
import datetime as dt
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlmodel import Field, SQLModel

from tesda_track.models.base import Timestamped, one_of, utcnow


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


OUTCOMES = ("ok", "tool_error", "denied_token", "denied_scope", "rate_limited", "invalid_request", "server_error")
NO_CLIENT = uuid.UUID(int=0)


class McpCallLog(SQLModel, table=True):
    """One MCP request. Shapes only: which arguments were sent, never their values (a goal is kept as a keyed hash)."""
    __tablename__ = "mcp_call_log"
    __table_args__ = (CheckConstraint(one_of("outcome", OUTCOMES), name="outcome_known"),)

    id: int | None = Field(default=None, primary_key=True, sa_type=BigInteger)
    client_id: uuid.UUID | None = Field(default=None, foreign_key="api_client.id", ondelete="RESTRICT", index=True)
    called_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True), index=True)
    latency_ms: int = 0
    method: str = Field(sa_type=String(40))
    tool: str | None = Field(default=None, sa_type=String(64))
    outcome: str = Field(sa_type=String(20))
    error_code: str | None = Field(default=None, sa_type=String(64))
    result_count: int | None = None
    qualification_code: str | None = Field(default=None, sa_type=String(40))
    region_code: str | None = Field(default=None, sa_type=String(20))
    inputs_sent: list[str] = Field(default_factory=list, sa_type=ARRAY(Text))
    goal_fingerprint: str | None = Field(default=None, sa_type=String(64))
    page_offset: int | None = None
    ranking_audit_id: int | None = Field(default=None, foreign_key="ranking_audit.id", ondelete="SET NULL",
                                         sa_type=BigInteger)
    protocol_version: str | None = Field(default=None, sa_type=String(20))


class McpCallDaily(SQLModel, table=True):
    """Calls older than the retention period, counted per Philippine-time day. No tool is '' and no client is the nil UUID."""
    __tablename__ = "mcp_call_daily"

    date: dt.date = Field(primary_key=True)
    client_id: uuid.UUID = Field(primary_key=True)
    tool: str = Field(primary_key=True, sa_type=String(64))
    outcome: str = Field(primary_key=True, sa_type=String(20))
    calls: int = 0


class McpDemandSnapshot(SQLModel, table=True):
    """A completed quarter's demand figures as first published to a partner, already suppressed. Later requests get
    these rows, so figures that change afterwards cannot be compared month to month."""
    __tablename__ = "mcp_demand_snapshot"

    quarter: str = Field(sa_type=String(7), primary_key=True)
    computed_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))
    rows: list = Field(sa_type=JSONB)
