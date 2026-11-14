"""Other qualifications in demand near the learner that fit their skills (Card 4)."""
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from tesda_track.schemas.catalog import QualificationSummary
from tesda_track.schemas.outlook import DemandLevel

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class NearbySuggestionRequest(BaseModel):
    """In the body, never the address: skills are the learner's own words. Neither stored nor logged."""
    region_code: str = Field(max_length=20, description="The learner's region, as Card 3 works it out")
    skills: list[ShortText] = Field(default_factory=list, max_length=20)
    held: list[ShortText] = Field(default_factory=list, max_length=20, description=(
        "Qualifications the learner chose or already holds, as codes or names: never suggested, and their sectors "
        "count toward fit"))
    limit: int = Field(default=3, ge=1, le=5)


class NearbySuggestion(BaseModel):
    qualification: QualificationSummary
    posting_count: int = Field(ge=0, description="Distinct posting records in the learner's region")
    level: DemandLevel
    limited: bool = Field(description="Too few records for more than a rough signal")
    fit: int = Field(ge=0, le=100, description="How well it fits the learner's skills and qualifications")
    reasons: list[str] = Field(description="Why it is suggested, a short line each: demand first, then fit")


class NearbySuggestions(BaseModel):
    region_code: str
    region_name: str
    suggestions: list[NearbySuggestion]
    method_version: Literal["nearby-suggestions-v1"] = "nearby-suggestions-v1"
    limitations: list[str]
