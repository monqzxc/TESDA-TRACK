"""Importing this package registers every table on SQLModel.metadata (used by Alembic)."""
from tesda_track.models.base import Timestamped, one_of, utcnow
from tesda_track.models.catalog import COMPETENCY_CATEGORIES, Competency, Qualification, Sector
from tesda_track.models.delivery import (APPLICATION_STATUSES, ASSESSMENT_RESULTS, DELIVERY_MODES, SCHEDULE_STATUSES,
                                         AssessmentApplication, AssessmentCenter, AssessmentSchedule, Region,
                                         TrainingProgram, TrainingProvider)
from tesda_track.models.learners import (ANSWER_CODES, GOAL_STATUSES, ROLES, Certification, Goal, Learner,
                                         ReadinessAnswer, ReadinessCheck, RecommendationSession)
from tesda_track.models.pathways import (ENROLLMENT_STATUSES, ROUTES, STEP_KINDS, STEP_STATUSES, Pathway,
                                         PathwayEnrollment, PathwayStep, StepProgress)

__all__ = [
    "ANSWER_CODES", "APPLICATION_STATUSES", "ASSESSMENT_RESULTS", "COMPETENCY_CATEGORIES", "DELIVERY_MODES",
    "ENROLLMENT_STATUSES", "GOAL_STATUSES", "ROLES", "ROUTES", "SCHEDULE_STATUSES", "STEP_KINDS", "STEP_STATUSES",
    "AssessmentApplication", "AssessmentCenter", "AssessmentSchedule", "Certification", "Competency", "Goal",
    "Learner", "Pathway", "PathwayEnrollment", "PathwayStep", "Qualification", "ReadinessAnswer", "ReadinessCheck",
    "RecommendationSession", "Region", "Sector", "StepProgress", "Timestamped", "TrainingProgram",
    "TrainingProvider", "one_of", "utcnow",
]
