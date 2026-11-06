"""Validated import and review contracts for the independent labor-market layer."""

from datetime import date
from typing import Literal, Annotated
from pydantic import BaseModel, Field, model_validator, HttpUrl, StringConstraints


class DatasetInput(BaseModel):
    source_id: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    version: int = Field(ge=1)
    publisher: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=300)
    publication_label: str | None = None
    publication_date: date | None = None
    evidence_class: Literal[
        "national_forecast",
        "regional_forecast",
        "observed_posting",
        "historical_forecast",
        "historical_statistics",
    ]
    geographic_scope: Literal["national", "regional", "local"]
    region_code: str | None = None
    period_label: str = Field(min_length=1, max_length=100)
    period_start_year: int | None = Field(default=None, ge=1900, le=2200)
    period_end_year: int | None = Field(default=None, ge=1900, le=2200)
    source_url: HttpUrl
    source_url_kind: str | None = None
    file_sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    notes: str | None = None
    research: dict = Field(default_factory=dict)
    metadata: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def geography(self):
        if (
            self.period_end_year is not None
            and self.period_start_year is not None
            and self.period_end_year < self.period_start_year
        ):
            raise ValueError("Reporting period is reversed")
        if self.evidence_class in [
            "national_forecast",
            "regional_forecast",
            "observed_posting",
        ] and (self.period_start_year is None or self.period_end_year is None):
            raise ValueError("Current forecast/posting requires reporting years")
        if self.geographic_scope == "national" and self.region_code:
            raise ValueError("National evidence cannot have a region code")
        if self.geographic_scope != "national" and not self.region_code:
            raise ValueError("Regional/local source needs region_code")
        if (
            self.evidence_class == "national_forecast"
            and self.geographic_scope != "national"
        ):
            raise ValueError("National forecast needs national scope")
        if (
            self.evidence_class == "regional_forecast"
            and self.geographic_scope != "regional"
        ):
            raise ValueError("Regional forecast needs regional scope")
        return self


class EvidenceInput(BaseModel):
    occurrence_key: str = Field(min_length=1, max_length=64)
    source_record_id: str = Field(min_length=1, max_length=100)
    occupation_title: str = Field(min_length=1, max_length=300)
    sector: str | None = None
    classification: Literal[
        "in_demand", "hard_to_fill", "cross_cutting", "observed_posting"
    ]
    geographic_scope: Literal["national", "regional", "local"]
    region_code: str | None = None
    locality: str | None = None
    period_label: str | None = None
    observed_on: date | None = None
    page_pdf: str | None = None
    page_printed: str | None = None
    source_table: str | None = None
    source_url: HttpUrl | None = None
    verification: str | None = None
    provenance: dict = Field(default_factory=dict)


class MappingInput(BaseModel):
    mapping_key: str = Field(min_length=1, max_length=80)
    occurrence_key: str
    qualification_code: str
    proposal: Literal["high_confidence", "needs_review", "rejected"]
    evidence_tier: str | None = None
    review_reason: str = Field(min_length=1)
    competencies: list[str] = Field(default_factory=list)
    training_regulation_url: HttpUrl
    training_regulation_reference: str
    cautions: str | None = None


class ReviewInput(BaseModel):
    decision: Literal["approved", "rejected", "pending"]
    expected_decision: Literal["approved", "rejected", "pending"]
    note: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=5, max_length=4000)
    ]


class DatasetStatusInput(BaseModel):
    status: Literal["active", "retired"]
    note: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=5, max_length=4000)
    ]
