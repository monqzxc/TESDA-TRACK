"""Versioned, optional self-reported preferences; no psychometric or verified-skill claims."""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

Term = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Code = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class CompetencyAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    competency_id: int = Field(gt=0)
    answer: Literal["confident", "some_experience", "not_familiar"]


class AssessmentPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")
    region_code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)] | None = None
    near_lat: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    near_lon: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    maximum_distance_km: float | None = Field(default=None, gt=0, le=2000, allow_inf_nan=False)
    delivery_mode: Literal["institution_based", "enterprise_based", "community_based", "online"] | None = None
    maximum_budget: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    needs_scholarship: bool | None = None
    start_after: date | None = None
    start_before: date | None = None
    accessibility_preferences: list[Term] = Field(default_factory=list, max_length=5)
    delivery_is_mandatory: bool = False
    budget_is_mandatory: bool = False
    schedule_is_mandatory: bool = False
    scholarship_is_mandatory: bool = False

    @model_validator(mode="after")
    def consistent(self):
        if (self.near_lat is None) != (self.near_lon is None):
            raise ValueError("Give both coordinates or neither.")
        if self.maximum_distance_km is not None and self.near_lat is None and not self.region_code:
            raise ValueError("A maximum distance needs a selected region or location.")
        if self.start_after and self.start_before and self.start_after > self.start_before:
            raise ValueError("The preferred start window is reversed.")
        if self.scholarship_is_mandatory and self.needs_scholarship is not True:
            raise ValueError("A mandatory scholarship constraint requires needs_scholarship=true.")
        for mandatory, value in ((self.delivery_is_mandatory, self.delivery_mode),
                                 (self.budget_is_mandatory, self.maximum_budget),
                                 (self.schedule_is_mandatory, self.start_after or self.start_before),
                                 (self.scholarship_is_mandatory, self.needs_scholarship)):
            if mandatory and value is None:
                raise ValueError("A mandatory preference needs its corresponding value.")
        if self.near_lat is not None:
            self.near_lat, self.near_lon = round(self.near_lat, 1), round(self.near_lon, 1)
        return self


class AssessmentAnswers(BaseModel):
    model_config = ConfigDict(extra="forbid")
    questionnaire_version: Literal[1] = 1
    interests: list[Term] = Field(default_factory=list, max_length=20)
    preferred_sectors: list[Term] = Field(default_factory=list, max_length=10)
    work_activities: list[Term] = Field(default_factory=list, max_length=10)
    work_environments: list[Literal["indoors", "outdoors", "workshop", "remote", "customer_facing"]] = Field(default_factory=list, max_length=5)
    existing_skills: list[Term] = Field(default_factory=list, max_length=20)
    competencies: list[CompetencyAnswer] = Field(default_factory=list, max_length=100)
    education: Literal["primary", "secondary", "technical_vocational", "college", "other"] | None = None
    experience_years: float | None = Field(default=None, ge=0, le=80, allow_inf_nan=False)
    has_certification: bool | None = None
    career_goal: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)] | None = None
    goal_kind: Literal["employment", "career_transition", "upskilling", "exploration"] | None = None
    preferred_qualification_codes: list[Code] = Field(default_factory=list, max_length=10)
    preferred_pathway: Literal["training", "assessment", "training_and_assessment", "exploration"] | None = None
    preferences: AssessmentPreferences = Field(default_factory=AssessmentPreferences)

    @field_validator("interests", "preferred_sectors", "work_activities", "existing_skills", "work_environments",
                     "preferred_qualification_codes")
    @classmethod
    def unique_terms(cls, values):
        unique = {}
        for value in values:
            unique.setdefault(value.casefold(), value)
        return list(unique.values())

    @model_validator(mode="after")
    def unique_competencies(self):
        ids = [c.competency_id for c in self.competencies]
        if len(ids) != len(set(ids)):
            raise ValueError("Each competency can be answered only once.")
        return self


class AssessmentWrite(BaseModel):
    request_id: uuid.UUID | None = None
    model_config = ConfigDict(extra="forbid")
    answers: AssessmentAnswers


class AssessmentPublic(BaseModel):
    id: uuid.UUID
    series_id: uuid.UUID
    revision: int
    previous_revision_id: uuid.UUID | None
    answers: AssessmentAnswers
    created_at: datetime


class AssessmentReference(BaseModel):
    assessment: AssessmentAnswers | None = None
    assessment_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def one_source(self):
        if self.assessment is not None and self.assessment_id is not None:
            raise ValueError("Supply assessment answers or a saved assessment ID, not both.")
        return self


class ScoreFactor(BaseModel):
    score: float | None = Field(default=None, ge=0, le=100)
    state: Literal["observed", "unknown", "not_applicable"]
    reason: str


class PersonalizedScore(BaseModel):
    policy_version: str = "structured-assessment-v1"
    score: int = Field(ge=0, le=100)
    configured_weights: dict[str, float]
    effective_weights: dict[str, float]
    components: dict[str, ScoreFactor]
    contributions: dict[str, float]
    evidence_coverage: float = Field(ge=0, le=1)
    limitations: list[str] = Field(default_factory=list)
