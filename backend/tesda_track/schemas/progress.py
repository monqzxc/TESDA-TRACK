import uuid
from datetime import datetime

from pydantic import BaseModel

from tesda_track.schemas.catalog import QualificationSummary
from tesda_track.schemas.pathways import PathwayStepPublic


class ReadinessProgress(BaseModel):
    qualification: QualificationSummary
    latest_score: float
    latest_level: str
    best_score: float
    checks: int
    last_checked_at: datetime


class PathwayProgress(BaseModel):
    enrollment_id: uuid.UUID
    pathway_title: str
    route: str
    qualification: QualificationSummary
    status: str
    completion_percent: int
    next_step: PathwayStepPublic | None


class CertificationCounts(BaseModel):
    total: int
    verified: int


class ProgressSummary(BaseModel):
    readiness: list[ReadinessProgress]
    pathways: list[PathwayProgress]
    assessment_applications: dict[str, int]
    certifications: CertificationCounts
    goals: dict[str, int]
