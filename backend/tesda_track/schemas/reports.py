from datetime import date

from pydantic import BaseModel, ConfigDict, model_validator

from tesda_track.schemas.catalog import QualificationSummary
from tesda_track.schemas.progress import CertificationCounts


class DateRange(BaseModel):
    """Inclusive dates in Philippine time; omit either end for an open range."""
    model_config = ConfigDict(extra="forbid")

    date_from: date | None = None
    date_to: date | None = None

    @model_validator(mode="after")
    def ordered(self):
        if self.date_from and self.date_to and self.date_to < self.date_from:
            raise ValueError("date_to can't be before date_from.")
        return self


class SkillGapQuery(DateRange):
    qualification_code: str


class Overview(BaseModel):
    learners: int
    recommendation_sessions: int
    semantic_analyses: int
    readiness_checks: int
    average_readiness: float | None
    training_rankings: int
    assessment_applications: dict[str, int]
    certifications: CertificationCounts


class QualificationDemand(BaseModel):
    qualification: QualificationSummary
    top_match: int
    chosen: int
    readiness_checks: int
    average_readiness: float | None
    assessment_applications: int
    competent: int
    certified: int


class CompetencyGap(BaseModel):
    competency_id: int
    position: int
    name: str
    answers: int
    confident: int
    some_experience: int
    not_familiar: int
    gap_rate: float | None


class Funnel(BaseModel):
    registered: int
    saved_a_recommendation: int
    checked_readiness: int
    applied_for_assessment: int
    certified: int


class RegionSupply(BaseModel):
    region_code: str
    region: str
    training_providers: int
    training_programs: int
    upcoming_assessments: int
    open_seats: int
