import datetime as dt
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, model_validator

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


class LearnerDemand(BaseModel):
    """Distinct learners per measure for one qualification; the average is of each learner's latest readiness score."""
    qualification: QualificationSummary
    top_matched: int
    chose: int
    checked_readiness: int
    average_readiness: float | None
    applied: int
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


class MatchingDay(BaseModel):
    date: dt.date
    requests: int
    no_match: int


class MatchingReport(BaseModel):
    requests: int
    no_match: int
    no_match_rate: float | None
    days: list[MatchingDay]


class RegionSupply(BaseModel):
    region_code: str
    region: str
    training_providers: int
    training_programs: int
    upcoming_assessments: int
    open_seats: int


class FeedbackCount(BaseModel):
    answers: int
    satisfied: int


class FeedbackByPlace(BaseModel):
    """Where the qualification the learner was recommended stood among the matches they were shown."""
    top_match: FeedbackCount
    other_match: FeedbackCount
    own_choice: FeedbackCount = Field(description="Picked from the library rather than the matches")


class FeedbackReasons(BaseModel):
    """Why learners answered No."""
    wrong_qualification: int
    readiness_off: int
    pathway_not_helpful: int
    none: int = Field(description="No reason given")


class ModelFeedback(FeedbackCount):
    model: str | None = Field(description="The embedding model; null for keyword matching only")


class QualificationFeedback(FeedbackCount):
    qualification: QualificationSummary


class FeedbackSummary(FeedbackCount):
    """Answers to "Are you satisfied with this recommendation?" at the end of Find my pathway."""
    by_place: FeedbackByPlace
    reasons: FeedbackReasons
    by_model: list[ModelFeedback]
    by_qualification: list[QualificationFeedback]
