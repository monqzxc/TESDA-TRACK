"""Aggregate recommendation signals. Feedback counts are answers, never distinct learners."""
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from tesda_track.schemas.catalog import QualificationSummary
from tesda_track.schemas.reports import DateRange


class RecommendationAnalyticsPeriod(DateRange):
    @model_validator(mode="after")
    def projection_dates(self):
        # The report needs two complete 30-day windows, and inclusive timestamp bounds add one day.
        if self.date_to and not date(1, 3, 1) <= self.date_to <= date(9999, 12, 30):
            raise ValueError("date_to must be between 0001-03-01 and 9999-12-30 for recommendation analytics.")
        return self


class QualificationSignals(BaseModel):
    qualification: QualificationSummary
    chosen_learners: int = Field(description="Distinct learners with a saved session choosing this qualification")
    feedback_answers: int
    accepted: int = Field(description="Positive satisfaction answers, not agreement, enrollment or distinct people")
    rejected: int = Field(description="Negative satisfaction answers")
    acceptance_rate: float | None = Field(description="Positive satisfaction answers / all answers; null with none")


class DemandProjection(BaseModel):
    qualification: QualificationSummary
    recent_learners: int
    previous_learners: int
    change_rate: float | None
    projected_learners: int | None
    status: Literal["available", "insufficient_history", "insufficient_volume"]


class RecommendationDemand(BaseModel):
    recent_from: date
    recent_to: date
    previous_from: date
    previous_to: date
    forecast_from: date
    forecast_to: date
    window_days: int = 30
    minimum_recent_learners: int = 10
    minimum_previous_learners: int = 5
    method: Literal["linear_recent_trend"] = "linear_recent_trend"
    qualifications: list[DemandProjection]


class ImprovementPriority(BaseModel):
    qualification: QualificationSummary
    model: str | None
    intent: str
    feedback_answers: int
    accepted: int
    rejected: int
    acceptance_rate: float
    wrong_qualification: int
    readiness_off: int
    pathway_not_helpful: int
    no_reason: int
    ranking_mismatches: int = Field(description="Answers for a choice below rank 1 or outside nonempty matches; not proof of error")
    priority: Literal["high", "medium", "collect_feedback"]
    recommendation: str


class RecommendationAnalytics(BaseModel):
    feedback_answers: int
    accepted: int = Field(description="Positive Yes satisfaction answers, not explicit agreement or enrollment")
    rejected: int
    acceptance_rate: float | None
    qualification_groups: list[QualificationSignals]
    demand: RecommendationDemand
    improvement_priorities: list[ImprovementPriority]
