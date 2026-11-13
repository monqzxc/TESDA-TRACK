"""One qualification across the regions: recorded demand beside recorded supply, and what that says about an area."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

# How a region's share of the posting records compares with its share of the recorded centers.
Balance = Literal["more_demand", "balanced", "more_supply", "demand_only", "supply_only", "no_records"]
PointKind = Literal["location", "demand", "supply", "balance", "relocation"]


class OutlookQualification(BaseModel):
    code: str
    name: str


class AreaOutlook(BaseModel):
    region_code: str
    name: str
    latitude: float
    longitude: float
    posting_count: int = Field(ge=0, description="Distinct dated posting records with a reviewed link to the qualification")
    titles: list[str] = Field(description="The most-posted job titles here, at most three")
    training_sites: int = Field(ge=0, description="Recorded centers with an active program for it")
    assessment_sites: int = Field(ge=0, description="Recorded centers with an open schedule or a registry accreditation for it")
    example_sites: int = Field(ge=0, description="Example placeholders listing it: on the map, never counted as supply")
    demand_share: float | None = Field(description="This region's share of the posting records, 0 to 1")
    supply_share: float | None = Field(description="This region's share of the recorded centers, 0 to 1")
    balance: Balance
    limited: bool = Field(description="Too few records for more than a rough signal")


class OutlookTotals(BaseModel):
    posting_count: int = Field(ge=0)
    employer_count: int = Field(ge=0)
    training_sites: int = Field(ge=0)
    assessment_sites: int = Field(ge=0)
    regions_with_postings: int = Field(ge=0)
    regions_with_sites: int = Field(ge=0)


class OutlookPoint(BaseModel):
    kind: PointKind
    text: str


class OutlookInsight(BaseModel):
    """The analysis in plain words, written by fixed rules from the counts above."""
    headline: str
    points: list[OutlookPoint]


class QualificationOutlook(BaseModel):
    qualification: OutlookQualification
    region_code: str | None = Field(description="The region the analysis is about, or null for the whole country")
    home_region_code: str | None = Field(description="The learner's own region, when they gave one")
    relocate: bool
    areas: list[AreaOutlook] = Field(description="Every region, in the regions' usual order")
    totals: OutlookTotals
    alternatives: list[str] = Field(
        description="Other regions where recorded demand is strongest against supply, best first, at most three")
    training_site_ids: list[int] = Field(description="The training providers counted as supply")
    assessment_site_ids: list[int] = Field(description="The assessment centers counted as supply")
    snapshot_dates: list[date]
    insight: OutlookInsight
    includes_example_sites: bool = Field(
        default=False, description="A demo deployment counted its example placeholders as supply")
    ai_summary_available: bool = Field(description="Whether /labor-market/outlook/summary can return an AI-written summary")
    method_version: Literal["qualification-outlook-v1"] = "qualification-outlook-v1"
    limitations: list[str]


class OutlookSummary(BaseModel):
    """The same analysis as a short paragraph: AI-written from the counts, or the rules' own words when AI is off."""
    source: Literal["ai", "rules"]
    model: str | None = None
    text: str
