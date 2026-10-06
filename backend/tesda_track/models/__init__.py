"""Importing this package registers every table on SQLModel.metadata (used by Alembic)."""
from tesda_track.models.base import Timestamped, utcnow
from tesda_track.models.catalog import COMPETENCY_CATEGORIES, Competency, Qualification, Sector
from tesda_track.models.learners import (ANSWER_CODES, GOAL_STATUSES, ROLES, Certification, Goal, Learner,
                                         ReadinessAnswer, ReadinessCheck, RecommendationSession)

__all__ = [
    "ANSWER_CODES", "COMPETENCY_CATEGORIES", "GOAL_STATUSES", "ROLES", "Certification", "Competency", "Goal",
    "Learner", "Qualification", "ReadinessAnswer", "ReadinessCheck", "RecommendationSession", "Sector",
    "Timestamped", "utcnow",
]
