"""The personalized pathway report: typed sections the React and Streamlit apps both present.

Every field is worked out on the server from the catalog, the learner's answers, the existing rankings and (signed
in) the learner's own records. Prose comes with the structured evidence it was written from, so the apps can show
the parts consistently and a reviewer can trace each claim.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from tesda_track.schemas.analysis import AnswerCode, GoalText, Profile, Route
from tesda_track.schemas.catalog import QualificationSummary
from tesda_track.schemas.delivery import PreferredDeliveryMode, RegionCode

Priority = Literal["high", "medium", "low"]
UnitStatus = Literal["confident", "some_experience", "not_familiar", "not_answered"]


class PathwayReportRequest(BaseModel):
    """The recommendation as the finder asked for it (as for feedback), plus where to look for options."""
    model_config = ConfigDict(extra="forbid")

    query: GoalText
    profile: Profile = Field(description="The profile the matches were asked with, follow-up answers included")
    qualification_code: str = Field(max_length=40)
    answers: dict[int, AnswerCode] = Field(default_factory=dict, max_length=100,
                                           description="The readiness answers per competency id; may be incomplete")
    region_code: RegionCode | None = Field(default=None, description="Sorts options by distance from the region's "
                                                                     "center; never stored with the learner")
    preferred_delivery_mode: PreferredDeliveryMode | None = None
    needs_scholarship: bool = False


class ReportQualification(QualificationSummary):
    possible_jobs: list[str]
    unit_count: int


class MatchSummary(BaseModel):
    """How the chosen qualification relates to the goal, from the same matching the finder uses."""
    strength: Literal["named", "similar", "chosen", "none"] = Field(
        description="named: the goal's own words point to it; similar: close in meaning only; chosen: picked by the "
                    "learner, not among the matches; none: the goal matched no qualification")
    rank: int | None
    match_count: int
    score: int | None
    explanation: str
    alternatives: list[QualificationSummary]


class CompetencyRef(BaseModel):
    competency_id: int
    name: str
    category: str


class ReadinessSummary(BaseModel):
    available: bool
    score: float | None = None
    level: str | None = None
    counts: dict[UnitStatus, int]
    summary: str
    limitations: list[str]


class CompetencyAdvice(BaseModel):
    competency_id: int
    name: str
    category: str
    status: UnitStatus
    priority: Priority
    action: Literal["learn", "practice", "demonstrate"]
    basis: Literal["required_unit", "reported_gap", "general_recommendation"] = Field(
        description="required_unit: a listed unit of the qualification the learner reports not knowing (must learn); "
                    "reported_gap: a listed unit the learner reports only some experience in; "
                    "general_recommendation: advice that rests on no reported gap")
    must_learn: bool
    what_to_do: str
    why_it_matters: str
    activities: list[str]
    relevance: str
    evidence: list[str]


class ProviderOption(BaseModel):
    """One training program or assessment schedule, as the existing rankings returned it."""
    kind: Literal["training", "assessment"]
    service_id: int = Field(description="The training program or assessment schedule id")
    site_id: int
    name: str
    title: str | None = None
    city: str | None
    region_code: str
    distance_km: int | None = Field(description="Straight-line distance from the selected region's center")
    starts_on: date | None
    cost: Decimal | None = Field(description="Program cost or assessment fee, when the listing gives one")
    duration_hours: int | None = None
    delivery_mode: str | None = None
    scholarship_available: bool | None = None
    seats_left: int | None = None
    status: Literal["confirmed", "needs_verification", "demonstration"]
    score: int | None = Field(description="The ranking's score; only confirmed options are scored")
    notes: list[str]


class PathwayOption(BaseModel):
    kind: Literal["direct_assessment", "focused_training", "full_training", "current_application", "already_certified",
                  "next_level", "lower_level"]
    title: str
    recommended: bool
    service_kind: Literal["training", "assessment"] | None
    reasons: list[str]
    qualification: QualificationSummary | None = Field(default=None, description="For another qualification's option")


class Explanation(BaseModel):
    topic: Literal["strengths", "skill_gaps", "career_goal", "assessment_readiness", "employment"]
    summary: str
    points: list[str]


class Employment(BaseModel):
    observed_data: bool = Field(description="Whether job-vacancy or labor-market data backs this section")
    possible_jobs: list[str]
    source: str
    note: str


class Consideration(BaseModel):
    topic: Literal["providers", "verification", "distance", "cost_and_schedule", "scholarship", "eligibility",
                   "equipment", "jobs", "alternatives", "missing_information"]
    text: str
    items: list[str] = Field(default_factory=list)


class NextStep(BaseModel):
    position: int
    kind: Literal["complete_readiness", "choose_region", "review_gaps", "compare_providers", "confirm_requirements",
                  "train", "recheck", "apply", "prepare_assessment", "explore_jobs", "next_level",
                  "explore_alternatives"]
    title: str
    detail: str
    competency_ids: list[int] = Field(default_factory=list)


class FinalRecommendation(BaseModel):
    summary: str
    next_action: str
    pathway: str
    focus: list[str]
    providers: list[str]


class RankingReferences(BaseModel):
    """The audited rankings the report's options came from (GET /recommendations/{audit_id} when signed in)."""
    training_audit_id: int
    training_policy: str
    assessment_audit_id: int
    assessment_policy: str


class PathwayReport(BaseModel):
    policy_version: Literal["pathway-report-v1"] = "pathway-report-v1"
    generated_at: datetime
    qualification: ReportQualification
    match: MatchSummary
    route: Route
    readiness: ReadinessSummary
    strengths: list[CompetencyRef]
    training_to_consider: list[PathwayOption]
    skills_to_improve: list[CompetencyAdvice]
    competencies_to_learn_or_practice: list[CompetencyAdvice]
    reasoning: list[Explanation]
    employment: Employment
    considerations: list[Consideration]
    providers: list[ProviderOption]
    region_name: str | None
    next_steps: list[NextStep]
    final: FinalRecommendation
    disclaimer: str
    rankings: RankingReferences
