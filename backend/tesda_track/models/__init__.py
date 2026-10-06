"""Importing this package registers every table on SQLModel.metadata (used by Alembic)."""
from tesda_track.models.base import Timestamped, utcnow
from tesda_track.models.catalog import COMPETENCY_CATEGORIES, Competency, Qualification, Sector

__all__ = ["COMPETENCY_CATEGORIES", "Competency", "Qualification", "Sector", "Timestamped", "utcnow"]
