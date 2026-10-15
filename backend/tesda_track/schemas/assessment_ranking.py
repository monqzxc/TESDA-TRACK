"""Assessment recommendations are distinct from training program recommendations."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from tesda_track.schemas.analysis import GoalText
from tesda_track.schemas.delivery import AssessmentSchedulePublic, Latitude, Longitude, Money, RegionCode, check_location
from tesda_track.schemas.learner_assessments import AssessmentReference, PersonalizedScore
from tesda_track.schemas.verification import EligibilityPublic


class AssessmentRankingRequest(AssessmentReference):
    model_config = ConfigDict(extra="forbid")
    qualification_code: str = Field(min_length=1, max_length=40)
    goal: GoalText | None = None
    near_lat: Latitude | None = None
    near_lon: Longitude | None = None
    region_code: RegionCode | None = None
    maximum_distance_km: float | None = Field(default=None, gt=0, le=2000)
    maximum_fee: Money | None = None
    fee_is_mandatory: bool = False
    scheduled_after: date | None = None
    scheduled_before: date | None = None
    schedule_is_mandatory: bool = False
    limit: int = Field(default=10, ge=1, le=50)
    offset: int = Field(default=0, ge=0, le=10000)

    @model_validator(mode="after")
    def complete(self):
        check_location(self.near_lat, self.near_lon)
        if self.maximum_distance_km is not None and self.near_lat is None and self.region_code is None and self.assessment is None and self.assessment_id is None:
            raise ValueError("Maximum distance requires a location or learner assessment.")
        if self.fee_is_mandatory and self.maximum_fee is None:
            raise ValueError("A mandatory fee limit requires maximum_fee.")
        if self.schedule_is_mandatory and not (self.scheduled_after or self.scheduled_before):
            raise ValueError("A mandatory schedule requires a date window.")
        if self.scheduled_after and self.scheduled_before and self.scheduled_before < self.scheduled_after:
            raise ValueError("The assessment date window is reversed.")
        return self


class RankedAssessment(BaseModel):
    schedule: AssessmentSchedulePublic
    eligibility: EligibilityPublic
    score: int = Field(ge=0, le=100)
    personalization: PersonalizedScore
    explanation: list[str]
    application_status: str | None = None


class UnconfirmedAssessment(BaseModel):
    schedule: AssessmentSchedulePublic
    eligibility: EligibilityPublic
    reasons: list[str]


class AssessmentRanking(BaseModel):
    result_type: Literal["assessment"] = "assessment"
    policy_version: Literal["assessment-center-v1"] = "assessment-center-v1"
    checked_at: datetime
    results: list[RankedAssessment]
    requires_verification: list[UnconfirmedAssessment]
    total: int
    unconfirmed_total: int
    limit: int
    offset: int
    audit_id: int
