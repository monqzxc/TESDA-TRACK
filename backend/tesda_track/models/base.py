from datetime import datetime, timezone

from sqlalchemy import DateTime, func
from sqlmodel import Field, SQLModel

# Stable constraint names keep Alembic migrations reviewable and reversible.
SQLModel.metadata.naming_convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def one_of(column: str, values: tuple[str, ...]) -> str:
    """SQL for a CHECK constraint limiting a text column to fixed values."""
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def timestamp_field(*, on_update: bool = False):
    kwargs = {"server_default": func.now()}
    if on_update:
        kwargs["onupdate"] = utcnow
    return Field(default_factory=utcnow, sa_type=DateTime(timezone=True), nullable=False, sa_column_kwargs=kwargs)


class Timestamped(SQLModel):
    created_at: datetime = timestamp_field()
    updated_at: datetime = timestamp_field(on_update=True)
