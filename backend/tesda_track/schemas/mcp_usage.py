"""What the admin usage report shows about each partner client, and a client's public record."""
import uuid
from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

from tesda_track.services.partner_clients import SCOPES

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
PurposeText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2_000)]
ToolName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]


class ApiClientPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    organisation: str
    contact_email: str | None
    declared_purpose: str
    expected_tools: list[str]
    scopes: list[str]
    rate_limit_per_minute: int
    is_active: bool
    last_token_at: datetime | None
    created_at: datetime


class ApiClientCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    organisation: ShortText
    contact_email: EmailStr | None = None
    declared_purpose: PurposeText
    expected_tools: list[ToolName] = Field(default_factory=list, max_length=20)
    scopes: list[str] = Field(min_length=1, max_length=len(SCOPES))
    rate_limit_per_minute: int = Field(default=120, ge=1, le=10_000)


class ApiClientCredentials(BaseModel):
    client: ApiClientPublic
    client_secret: str = Field(description="Shown once. Only its password hash is stored.")


class ToolUsage(BaseModel):
    tool: str
    calls: int
    ok: int
    tool_error: int
    denied_scope: int
    rate_limited: int
    p50_ms: int | None
    p95_ms: int | None
    expected: bool


class DayUsage(BaseModel):
    date: date
    calls: int


class ClientUsage(BaseModel):
    client_id: uuid.UUID
    name: str
    organisation: str
    declared_purpose: str
    expected_tools: list[str]
    scopes: list[str]
    is_active: bool
    calls: int
    by_outcome: dict[str, int]
    tools: list[ToolUsage]
    days: list[DayUsage]
    unexpected_tool_calls: int
    deep_paging_calls: int


class UsageReport(BaseModel):
    clients: list[ClientUsage]
    unattributed_denials: int
