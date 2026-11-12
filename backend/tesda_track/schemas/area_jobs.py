"""Dated posting observations, independent of occupation-to-qualification review."""

from datetime import date
from pydantic import BaseModel, Field


class AreaJob(BaseModel):
    title: str
    posting_count: int = Field(ge=1)
    employer_count: int = Field(ge=0)
    localities: list[str]
    region_codes: list[str]


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
    locality: str | None
    localities: list[str]
    areas: list[JobArea]
    snapshot_dates: list[date]
    posted_between: list[date]
    source_url: str = "https://philjobnet.gov.ph/job-vacancies/"
    limitations: list[str] = Field(default_factory=lambda: [
        "Dated posting records, not live openings or worker headcounts.",
        "More recorded postings do not establish a workforce shortage or a demand forecast.",
        "Map shading compares regional posting totals; it does not establish demand in a particular city.",
    ])
