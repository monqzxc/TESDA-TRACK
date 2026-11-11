"""An area evidence directory, separate from personalized qualification scores."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from tesda_track.schemas.evidence import ForecastSupport, Geography


class AreaQualification(BaseModel):
    qualification_code: str
    qualification_name: str
    observed_posting_count: int | None = Field(default=None, ge=0)
    posting_unit: Literal["distinct posting records"] = "distinct posting records"
    observation_dates: list[date] = Field(default_factory=list)
    observation_geography: Geography
    forecast_support: list[ForecastSupport] = Field(default_factory=list)
    has_selected_area_evidence: bool = False
    dataset_keys: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class AreaQualifications(BaseModel):
    items: list[AreaQualification]
    total: int = Field(ge=0)
    limit: int = Field(ge=1, le=100)
    offset: int = Field(ge=0)
    region_code: str | None = None
    evaluated_at: datetime
    observed_since: date
    observed_through: date
    ordering: Literal["qualification_name"] = "qualification_name"
    method_version: Literal["area-qualifications-v1"] = "area-qualifications-v1"
    limitations: list[str] = Field(default_factory=list)
