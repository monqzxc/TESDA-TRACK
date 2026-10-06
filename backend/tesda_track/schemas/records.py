"""Request and response models for the records a learner keeps under /me."""
import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator

from tesda_track.schemas.accounts import LearnerPublic
from tesda_track.schemas.analysis import (AnswerCode, GoalText, Match, PathwayRecommendation, Profile,
                                          ReadinessRequest, ReadinessResult)
from tesda_track.schemas.catalog import QualificationSummary
from tesda_track.schemas.delivery import AssessmentApplicationPublic
from tesda_track.schemas.pathways import EnrollmentPublic

QualificationCode = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
GoalStatus = Literal["active", "achieved", "archived"]


def _ordered_dates(issued_on: date | None, expires_on: date | None) -> None:
    if issued_on and expires_on and expires_on < issued_on:
        raise ValueError("The expiry date can't be before the issue date.")


class GoalCreate(BaseModel):
    title: GoalText
    target_qualification_code: QualificationCode | None = None
    target_date: date | None = None


class GoalUpdate(BaseModel):
    title: GoalText | None = None
    target_qualification_code: QualificationCode | None = None
    status: GoalStatus | None = None
    target_date: date | None = None


class GoalPublic(BaseModel):
    id: uuid.UUID
    title: str
    target_qualification: QualificationSummary | None
    status: GoalStatus
    target_date: date | None
    created_at: datetime
    updated_at: datetime


class RecommendationSessionCreate(BaseModel):
    query: GoalText
    use_ai: bool = Field(default=False, description="The learner agreed to have their text analyzed by an AI provider.")
    goal_id: uuid.UUID | None = None


class RecommendationSessionUpdate(BaseModel):
    """Follow-up answers and the qualification the learner chose; omitted fields keep their current value."""
    experience_years: float | None = Field(default=None, ge=0, le=80)
    has_certification: bool | None = None
    qualification_code: QualificationCode | None = None


class RecommendationSessionPublic(BaseModel):
    id: uuid.UUID
    goal_id: uuid.UUID | None
    query: str
    analysis_source: Literal["rules", "ai"]
    profile: Profile
    matches: list[Match]
    selected_qualification: QualificationSummary | None
    pathway: PathwayRecommendation | None
    created_at: datetime
    updated_at: datetime


class ReadinessCheckCreate(ReadinessRequest):
    recommendation_session_id: uuid.UUID | None = None


class ReadinessCheckPublic(ReadinessResult):
    id: uuid.UUID
    qualification: QualificationSummary
    answers: dict[int, AnswerCode]
    recommendation_session_id: uuid.UUID | None
    created_at: datetime


class CertificationCreate(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    qualification_code: QualificationCode | None = None
    certificate_number: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    issuing_body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)] = "TESDA"
    issued_on: date | None = None
    expires_on: date | None = None

    @model_validator(mode="after")
    def dates_in_order(self):
        _ordered_dates(self.issued_on, self.expires_on)
        return self


class CertificationUpdate(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] | None = None
    qualification_code: QualificationCode | None = None
    certificate_number: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    issuing_body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)] | None = None
    issued_on: date | None = None
    expires_on: date | None = None


class CertificationPublic(BaseModel):
    id: uuid.UUID
    title: str
    qualification: QualificationSummary | None
    certificate_number: str | None
    issuing_body: str
    issued_on: date | None
    expires_on: date | None
    verified: bool
    source: Literal["self_reported", "assessment"]
    created_at: datetime
    updated_at: datetime


class AccountExport(BaseModel):
    exported_at: datetime
    account: LearnerPublic
    goals: list[GoalPublic]
    recommendation_sessions: list[RecommendationSessionPublic]
    readiness_checks: list[ReadinessCheckPublic]
    certifications: list[CertificationPublic]
    pathway_enrollments: list[EnrollmentPublic]
    assessment_applications: list[AssessmentApplicationPublic]
