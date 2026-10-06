from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from tesda_track.config import RankingWeights
from tesda_track.schemas.analysis import GoalText
from tesda_track.schemas.delivery import DeliveryMode, Latitude, Longitude, TrainingProgramPublic, check_location


class TrainingRankingRequest(BaseModel):
    """Sent as a POST body so the learner's goal never appears in URLs or access logs."""
    qualification_code: str = Field(max_length=40)
    goal: GoalText | None = Field(default=None, description="The learner's goal in their own words")
    near_lat: Latitude | None = None
    near_lon: Longitude | None = None
    preferred_delivery_mode: DeliveryMode | None = None
    needs_scholarship: bool = False
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
    program: TrainingProgramPublic
    score: int = Field(description="0-100: the weighted sum of the components")
    components: ScoreComponents
    explanation: list[str]


class RankingAuditPublic(BaseModel):
    """A learner's own ranking history, as included in their data export."""
    qualification_code: str
    created_at: datetime
    near_lat: float | None
    near_lon: float | None
    preferences: dict
    weights: dict
    results: list


class TrainingRanking(BaseModel):
    weights: RankingWeights
    semantic_used: bool
    results: list[RankedProgram]
    audit_id: int
