"""Roles an administrator can compose. The permissions they hold come from the fixed vocabulary in
tesda_track.rbac; a value outside it is inert, because no endpoint guard names it."""
from sqlalchemy import String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlmodel import Field

from tesda_track.models.base import Timestamped


class Role(Timestamped, table=True):
    # "app_role" rather than "role": Postgres has its own ROLE concept and the pilot runs SQL by hand.
    __tablename__ = "app_role"

    key: str = Field(sa_type=String(50), primary_key=True)
    label: str = Field(sa_type=String(100))
    description: str | None = Field(default=None, sa_type=Text)
    permissions: list[str] = Field(default_factory=list, sa_type=ARRAY(Text))
    # Built in: seeded by migration, never deletable, key fixed. `admin` is frozen entirely (see services.roles).
    is_system: bool = False
