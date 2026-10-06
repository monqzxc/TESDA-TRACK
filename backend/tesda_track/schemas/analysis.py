from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from tesda_track.schemas.catalog import QualificationSummary

GoalText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Intent = Literal["training_recommendation", "training_and_assessment", "assessment_recommendation",
                 "career_exploration", "unknown"]
Route = Literal["ADDITIONAL_QUESTIONS", "TRAINING_AND_ASSESSMENT", "ASSESSMENT_READINESS", "SKILL_GAP_CHECK"]
AnswerCode = Literal["confident", "some_experience", "not_familiar"]


class Profile(BaseModel):
    career_goal: ShortText | None = None
    possible_sector: ShortText | None = None
    existing_skills: list[ShortText] = Field(default_factory=list, max_length=20)
    experience_years: float | None = Field(default=None, ge=0, le=80)
    has_certification: bool | None = None
    intent: Intent = "unknown"


class GoalRequest(BaseModel):
    query: GoalText
    use_ai: bool = Field(default=False, description="The learner agreed to have their text analyzed by an AI provider.")


class GoalAnalysis(BaseModel):
    profile: Profile
    source: Literal["rules", "ai"]


class MatchRequest(BaseModel):
    query: GoalText
    profile: Profile


class Match(BaseModel):
    qualification: QualificationSummary
    score: int
    reason: str


class MatchResult(BaseModel):
    profile: Profile
    matches: list[Match]


class PathwayRequest(BaseModel):
    profile: Profile
    qualification_code: str = Field(max_length=40)


class PathwayRecommendation(BaseModel):
    recommendation: Route
    reason: str
    next_step: str


class ReadinessRequest(BaseModel):
    qualification_code: str = Field(max_length=40)
    answers: dict[int, AnswerCode] = Field(max_length=100, description="Answer per competency id")


class ReadinessResult(BaseModel):
    score: float
    level: str
    strengths: list[str]
    skill_gaps: list[str]
    recommendation: str
