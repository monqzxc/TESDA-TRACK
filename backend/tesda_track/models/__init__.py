"""Importing this package registers every table on SQLModel.metadata (used by Alembic)."""
from tesda_track.models.base import Timestamped, one_of, utcnow
from tesda_track.models.verification import ServiceVerification
from tesda_track.models.learner_assessments import LearnerAssessment
from tesda_track.models.catalog import (COMPETENCY_CATEGORIES, RELATIONS, Competency, OfficialQualificationCode,
                                        Qualification, Sector)
from tesda_track.models.delivery import (APPLICATION_STATUSES, ASSESSMENT_RESULTS, DELIVERY_MODES, SCHEDULE_STATUSES,
                                         AssessmentApplication, AssessmentCenter, AssessmentSchedule, Region,
                                         TrainingProgram, TrainingProvider)
from tesda_track.models.feedback import FEEDBACK_REASONS, SHARED_GOAL_CONSENT, RecommendationFeedback, SharedGoal
from tesda_track.models.learners import (ANSWER_CODES, GOAL_STATUSES, ROLES, Certification, Goal, Learner,
                                         ReadinessAnswer, ReadinessCheck, RecommendationSession)
from tesda_track.models.pathways import (ENROLLMENT_STATUSES, ROUTES, STEP_KINDS, STEP_STATUSES, Pathway,
                                         PathwayEnrollment, PathwayStep, StepProgress)
from tesda_track.models.stats import MatchDailyStat
from tesda_track.models.write_receipt import WriteReceipt
from tesda_track.models.partners import NO_CLIENT, OUTCOMES, ApiClient, McpCallDaily, McpCallLog, McpDemandSnapshot
from tesda_track.models.registry import RegistryBatch, RegistryLink, RegistryRecord
from tesda_track.models.semantic import (EMBEDDING_DIMENSIONS, CacheEntry, QualificationEmbedding, RankingAudit,
                                         TrainingProgramEmbedding)

__all__ = [
    "OfficialQualificationCode", "RELATIONS",
    "ApiClient", "McpCallDaily", "McpCallLog", "McpDemandSnapshot", "NO_CLIENT", "OUTCOMES",
    "WriteReceipt",
    "RegistryBatch", "RegistryLink", "RegistryRecord",
    "LearnerAssessment",
    "ServiceVerification",
    "EMBEDDING_DIMENSIONS", "CacheEntry", "QualificationEmbedding", "RankingAudit", "TrainingProgramEmbedding",
    "ANSWER_CODES", "APPLICATION_STATUSES", "ASSESSMENT_RESULTS", "COMPETENCY_CATEGORIES", "DELIVERY_MODES",
    "ENROLLMENT_STATUSES", "FEEDBACK_REASONS", "GOAL_STATUSES", "ROLES", "ROUTES", "SCHEDULE_STATUSES",
    "SHARED_GOAL_CONSENT", "STEP_KINDS",
    "STEP_STATUSES",
    "AssessmentApplication", "AssessmentCenter", "AssessmentSchedule", "Certification", "Competency", "Goal",
    "Learner", "MatchDailyStat", "Pathway", "PathwayEnrollment", "PathwayStep", "Qualification", "ReadinessAnswer", "ReadinessCheck",
    "RecommendationFeedback", "RecommendationSession", "Region", "Sector", "SharedGoal", "StepProgress", "Timestamped",
    "TrainingProgram",
    "TrainingProvider", "one_of", "utcnow",
]
