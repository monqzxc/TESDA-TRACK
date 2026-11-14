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
    summary: str = Field(description="The brief: where the learner is, the demand and supply there, and the verdict")
    points: list[OutlookPoint] = Field(description="The same analysis point by point, with the numbers behind it")


DemandLevel = Literal["high", "moderate", "low", "none"]


class HomeDemand(BaseModel):
    """How much the qualification is needed in the learner's own region (Card 3)."""
    region_code: str
    name: str
    posting_count: int = Field(ge=0)
    level: DemandLevel = Field(description="The region's share of the posting records against an even share across "
                                           "the regions: high at 1.5 times or more, moderate at half or more, low "
                                           "below that, none without a record")
    rank: int | None = Field(description="Its place among the regions with records, most first; null with none")
    ranked_of: int = Field(ge=0, description="How many regions have records")
    limited: bool = Field(description="Too few records for more than a rough signal")


class HigherDemandArea(BaseModel):
    region_code: str
    name: str
    posting_count: int = Field(ge=0)
    level: DemandLevel
    distance_km: float = Field(ge=0, description="Between the two regions' centers, as the crow flies")
    nearby: bool = Field(description="Within NEARBY_KM of the learner's region")


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
    demand_available: bool = Field(description="Whether any posting record links to this qualification at all")
    home_demand: HomeDemand | None = Field(default=None, description="The learner's region, when they gave one")
    higher_demand: list[HigherDemandArea] = Field(
        default_factory=list, description="Regions with more posting records than the learner's: nearby ones first, "
                                          "then the rest, each by records, at most five")
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
