"""Dated posting observations, independent of occupation-to-qualification review."""

from datetime import date
from typing import Literal
from pydantic import BaseModel, Field

from tesda_track.schemas.profile_fit import PersonalFit


class AreaJob(BaseModel):
    title: str
    posting_count: int = Field(ge=1)
    employer_count: int = Field(ge=0)
    localities: list[str]
    region_codes: list[str]
    personal_fit: PersonalFit | None = Field(default=None, description=(
        "Through the best-fitting qualification this title has a reviewed link to; personalized requests only"))
    linked_qualification: str | None = Field(default=None, description="That qualification, by name")


class JobArea(BaseModel):
    region_code: str
    name: str
    latitude: float
    longitude: float
    posting_count: int = Field(ge=1)
    titles: list[str]


class AreaJobs(BaseModel):
    items: list[AreaJob]
    total: int
    posting_count: int
    employer_count: int
    limit: int
    offset: int
    region_code: str | None
    province: str | None = Field(default=None, description=(
        "The province filter as a display name (\"Metro Manila\" for all of NCR); its records' locality ends in it"))
    locality: str | None
    localities: list[str]
    areas: list[JobArea]
    snapshot_dates: list[date]
    posted_between: list[date]
    ordering: Literal["posting_count", "profile_fit"] = "posting_count"
    personalized: bool = False
    source_url: str = "https://philjobnet.gov.ph/job-vacancies/"
    limitations: list[str] = Field(default_factory=lambda: [
        "Dated posting records, not live openings or worker headcounts.",
        "More recorded postings do not establish a workforce shortage or a demand forecast.",
        "Map shading compares regional posting totals; it does not establish demand in a particular city.",
    ])
