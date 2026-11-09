from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, model_serializer

from tesda_track.schemas.catalog import QualificationSummary
from tesda_track.schemas.pathways import PathwayPublic
from tesda_track.schemas.learner_assessments import AssessmentReference, PersonalizedScore

GoalText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
GoalOrigin = Literal["typed", "suggestion"]
ORIGIN_DESCRIPTION = ("Sent by the TSP webview only: whether the learner typed the goal there or tapped a suggestion "
                      "from their TSP profile. Counted per day, never with the goal; omitted elsewhere, and then "
                      "not counted.")
Intent = Literal["training_recommendation", "training_and_assessment", "assessment_recommendation",
                 "career_exploration", "unknown"]
Route = Literal["ADDITIONAL_QUESTIONS", "TRAINING_AND_ASSESSMENT", "ASSESSMENT_READINESS", "SKILL_GAP_CHECK"]
AnswerCode = Literal["confident", "some_experience", "not_familiar"]
# goal: one sentence about what the learner wants (the finder's first way in). skills: a list of skills or job
# titles, each matched on its own (services/skill_search.py). A request without a mode is a goal request.
SearchMode = Literal["goal", "skills"]


class Profile(BaseModel):
    career_goal: ShortText | None = None
    possible_sector: ShortText | None = None
    existing_skills: list[ShortText] = Field(default_factory=list, max_length=20)
    experience_years: float | None = Field(default=None, ge=0, le=80)
    has_certification: bool | None = None
    intent: Intent = "unknown"


class GoalRequest(BaseModel):
    query: GoalText
    origin: GoalOrigin | None = Field(default=None, description=ORIGIN_DESCRIPTION)
    interpret_input: bool = Field(default=False, description="Resolve a unified input into an existing matching strategy")


class GoalAnalysis(BaseModel):
    profile: Profile
    source: Literal["rules", "ai"]
    matching_mode: SearchMode | None = None

    @model_serializer(mode="wrap")
    def preserve_legacy_shape(self, handler):
        result = handler(self)
        if self.matching_mode is None:
            result.pop("matching_mode", None)
        return result


class MatchRequest(AssessmentReference):
    query: GoalText
    profile: Profile
    mode: SearchMode = "goal"
    region_code: str | None = Field(default=None, max_length=20)


class MatchComponents(BaseModel):
    """Both parts on a 0..1 scale; present when semantic search contributed to the score."""
    keyword: float
    semantic: float


class Match(BaseModel):
    personalization: PersonalizedScore | None = None
    qualification: QualificationSummary
    score: int
    reason: str
    components: MatchComponents | None = None
    basis: Literal['demand_evidence'] | None = None

    @model_serializer(mode="wrap")
    def preserve_legacy_shape(self, handler):
        result = handler(self)
        if self.personalization is None:
            result.pop("personalization", None)
        if self.basis is None:
            result.pop('basis', None)
        return result


class SkillTerms(BaseModel):
    """How a skills search read the learner's list: the terms it matched with, and those it couldn't use."""
    terms: list[str]
    unmatched: list[str] = Field(description="Terms that name no trade or career TESDA trains for")


class MatchResult(BaseModel):
    profile: Profile
    matches: list[Match]
    search: SkillTerms | None = Field(default=None, description="Skills searches only")
    eligible_qualification_codes: list[str] | None = None

    @model_serializer(mode="wrap")
    def preserve_goal_shape(self, handler):
        result = handler(self)
        if self.search is None:
            result.pop("search", None)
        if self.eligible_qualification_codes is None:
            result.pop('eligible_qualification_codes', None)
        return result


class SuggestionRequest(BaseModel):
    """A suggestion is worked out from the learner's profile alone: there is no goal to send."""
    profile: Profile
    limit: int = Field(default=3, ge=1, le=10)


class SuggestionResult(BaseModel):
    profile: Profile
    suggestions: list[Match]
    basis: list[str] = Field(default_factory=list,
                             description="What the suggestions were worked out from, in the learner's own terms")


class PathwayRequest(BaseModel):
    profile: Profile
    qualification_code: str = Field(max_length=40)


class PathwayRecommendation(BaseModel):
    recommendation: Route
    reason: str
    next_step: str
    pathway: PathwayPublic | None = Field(default=None, description="Curated steps for this route, when defined")


class ReadinessRequest(BaseModel):
    qualification_code: str = Field(max_length=40)
    answers: dict[int, AnswerCode] = Field(max_length=100, description="Answer per competency id")
    origin: GoalOrigin | None = Field(default=None, description=ORIGIN_DESCRIPTION)


class ReadinessResult(BaseModel):
    score: float
    level: str
    strengths: list[str]
    skill_gaps: list[str]
    recommendation: str
