"""Request and response shapes for composing roles out of the fixed permission vocabulary."""
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

RoleKey = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=2, max_length=50)]
RoleLabel = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
RoleDescription = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]


class PermissionPublic(BaseModel):
    key: str
    description: str


class RolePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    label: str
    description: str | None
    permissions: list[str]
    is_system: bool = Field(description="Built-in: it cannot be deleted or renamed, and `admin` cannot be edited.")
    created_at: datetime


class RoleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: RoleKey = Field(description="Stable slug stored on each account, e.g. 'regional_coordinator'.")
    label: RoleLabel
    description: RoleDescription | None = None
    permissions: list[str] = Field(default_factory=list)


class RoleUpdate(BaseModel):
    """Only the fields sent are changed, so a label edit cannot silently clear the permissions."""
    model_config = ConfigDict(extra="forbid")

    label: RoleLabel | None = None
    description: RoleDescription | None = None
    permissions: list[str] | None = None
