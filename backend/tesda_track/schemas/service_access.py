"""Modeled access to known qualification sites, separate from service eligibility."""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from tesda_track.schemas.routes import RoadMode

ServiceKind = Literal["training", "assessment"]
AccessStatus = Literal[
    "modeled_route", "no_route_in_network", "unsupported_mode", "routing_unavailable",
    "location_unknown", "routing_busy",
]


class TravelOrigin(BaseModel):
    model_config = ConfigDict(extra="forbid")

    latitude: float = Field(ge=4, le=22, allow_inf_nan=False)
    longitude: float = Field(ge=116, le=127.5, allow_inf_nan=False)


class ServiceAccessCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: ServiceKind
    site_id: int = Field(gt=0)


class ServiceAccessRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    qualification_code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    origin: TravelOrigin
    mode: RoadMode = "car"
    maximum_minutes: float | None = Field(default=None, gt=0, le=1440, allow_inf_nan=False)
    # One request routes only the visible comparison, never an unbounded provider catalog.
    candidates: list[ServiceAccessCandidate] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def distinct_sites(self):
        keys = {(site.kind, site.site_id) for site in self.candidates}
        if len(keys) != len(self.candidates):
            raise ValueError("Compare each site only once.")
        return self


class ServiceAccessResult(BaseModel):
    kind: ServiceKind
    site_id: int
    name: str
    status: AccessStatus
    duration_min: float | None = Field(default=None, ge=0)
    distance_km: float | None = Field(default=None, ge=0)
    within_budget: bool | None = Field(
        default=None,
        description="Whether modeled road time meets the requested budget; null for unknown or no budget. "
                    "Excludes traffic and unmodeled access from snapped road endpoints.",
    )
    origin_snap_distance_km: float | None = Field(default=None, ge=0)
    destination_snap_distance_km: float | None = Field(default=None, ge=0)
    explanation: str


class ServiceAccessComparison(BaseModel):
    qualification_code: str
    mode: RoadMode
    maximum_minutes: float | None
    checked_at: datetime
    routing_enabled: bool
    origin_precision_decimals: Literal[2] = 2
    method: Literal["OSRM road network"] = "OSRM road network"
    network_version: str | None = None
    results: list[ServiceAccessResult]
    limitations: list[str] = Field(default_factory=lambda: [
        "Modeled road travel is without traffic and does not include public-transport waiting or transfers.",
        "Road endpoints may differ from the selected departure point or site entrance; connecting access is unverified.",
        "A travel result does not establish current service authority, intake, learner eligibility or available seats.",
        "The configured router does not supply a routing-network version through this adapter.",
    ])
