import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from tesda_track.config import PersonalizationWeights, RankingWeights
from tesda_track.schemas.analysis import GoalText
from tesda_track.schemas.delivery import PreferredDeliveryMode, Latitude, Longitude, TrainingProgramPublic, check_location
from tesda_track.schemas.verification import EligibilityPublic
from tesda_track.schemas.learner_assessments import AssessmentReference, PersonalizedScore


class TrainingRankingRequest(AssessmentReference):
    """Sent as a POST body so the learner's goal never appears in URLs or access logs."""
    qualification_code: str = Field(max_length=40)
    goal: GoalText | None = Field(default=None, description="The learner's goal in their own words")
    near_lat: Latitude | None = None
    near_lon: Longitude | None = None
    preferred_delivery_mode: PreferredDeliveryMode | None = None
    needs_scholarship: bool = False
    require_confirmed_availability: bool = False
    limit: int = Field(default=10, ge=1, le=50)

    @model_validator(mode="after")
    def location_complete(self):
        check_location(self.near_lat, self.near_lon)
        return self


class ScoreComponents(BaseModel):
    """Each component on a 0..1 scale before weighting."""
    semantic: float
    proximity: float
    assessment: float
    schedule: float
    preference: float


class RankedProgram(BaseModel):
    personalization: PersonalizedScore | None = None
    effective_weights: dict[str, float] = Field(default_factory=dict)
    component_status: dict[str, str] = Field(default_factory=dict)
    evidence_coverage: float = Field(default=0, ge=0, le=1)
    eligibility: EligibilityPublic = Field(default_factory=EligibilityPublic)
    program: TrainingProgramPublic
    score: int = Field(description="0-100: the weighted sum of the components")
    components: ScoreComponents | dict[str, float | None]
    explanation: list[str]


class UnconfirmedProgram(BaseModel):
    program: TrainingProgramPublic
    eligibility: EligibilityPublic
    reasons: list[str]


class RankingAuditPublic(BaseModel):
    result_type: Literal["training", "assessment"] = "training"
    audit_id: int | None = None
    assessment_id: uuid.UUID | None = None
    """A learner's own ranking history, as included in their data export."""
    qualification_code: str
    created_at: datetime
    near_lat: float | None
    near_lon: float | None
    preferences: dict
    weights: dict
    results: list


class TrainingRanking(BaseModel):
    policy_version: str = "verified-services-v2"
    requires_verification: list[UnconfirmedProgram] = Field(default_factory=list)
    weights: RankingWeights | PersonalizationWeights
    effective_weights: dict[str, float] = Field(default_factory=dict)
    semantic_used: bool
    results: list[RankedProgram]
    audit_id: int
