"""Other provinces where a learner's qualifications are in demand, by posting records (the "Elsewhere" block)."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from tesda_track.schemas.profile_fit import FitReason


class ElsewhereQualification(BaseModel):
    code: str
    name: str
    posting_count: int = Field(ge=1, description="Distinct posting records in the province linked to it")


class ElsewhereProvince(BaseModel):
    province: str = Field(description="Display name, as the Skill Passport writes it (\"Metro Manila\" for NCR)")
    region_code: str
    region_name: str
    latitude: float
    longitude: float
    location_basis: Literal["centers", "region"] = Field(description=(
        "centers: the mean of the province's training and assessment centers; region: the region's point, "
        "when no center in the province has one"))
    posting_count: int = Field(ge=1, description="Distinct posting records linked to the qualifications used")
    titles: list[str] = Field(max_length=3, description="The most posted job titles")
    qualifications: list[ElsewhereQualification] = Field(max_length=3)
    reasons: list[FitReason] = Field(default_factory=list, max_length=3, description=(
        "Why these qualifications fit the Skill Passport; personalized requests only"))
    observed_on: date | None = Field(default=None, description="The latest snapshot date of these postings")


class ElsewhereDemand(BaseModel):
    items: list[ElsewhereProvince]
    exclude_province: str | None = Field(default=None, description="The province left out, as a display name")
    personalized: bool = False
    ordering: Literal["profile_fit", "posting_count"] = "posting_count"
    min_postings: int = Field(default=3, description="Provinces with fewer posting records are left out")
    snapshot_dates: list[date] = Field(default_factory=list, description="Snapshot dates of the listed postings")
    source_url: str = "https://philjobnet.gov.ph/job-vacancies/"
    method_version: Literal["elsewhere-demand-v1"] = "elsewhere-demand-v1"
    limitations: list[str] = Field(default_factory=lambda: [
        "Dated posting records, not live openings or worker headcounts.",
        "Province demand is posting records only: labor market forecasts are published per region.",
    ])
