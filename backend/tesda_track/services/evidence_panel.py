"""One typed evidence panel per qualification and area, composed from the demand, forecast and supply services."""

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlmodel import Session

from tesda_track.errors import InvalidRequestError
from tesda_track.models import Region
from tesda_track.schemas.evidence import (
    EvidenceContext,
    ForecastSupport,
    Geography,
    QualificationEvidencePanel,
)
from tesda_track.services import catalog, demand_evidence, labor_market, supply_statistics

LIMITATIONS = [
    "Forecast classifications are categorical; they are not projected vacancy totals.",
    "Registered programs establish an offering, not a current intake or remaining seats.",
    "Posting records and seats have different units and periods; no shortage is calculated.",
]


def _forecast(item: dict, region_code: str | None) -> ForecastSupport:
    if region_code is None:
        match = "no_area_selected"
    elif item["region_code"] == region_code:
        match = "selected_area"
    else:
        match = "broader_scope"
    return ForecastSupport(
        occupation_title=item["occupation_title"],
        classification=item["classification"],
        geography=Geography(
            scope=item["geographic_scope"],
            region_code=item["region_code"],
            label=item["coverage_label"],
        ),
        geography_match=match,
        period_label=item["period_label"],
        publisher=item["publisher"],
        source_title=item["source_title"],
        source_url=item["source_url"],
        source_reference=item["source_reference"],
        dataset_key=item["dataset_key"],
        mapping_id=item["mapping_id"],
    )


def build(
    session: Session, qualification_code: str, region_code: str | None = None, *, now: datetime | None = None
) -> QualificationEvidencePanel:
    if region_code and session.get(Region, region_code) is None:
        raise InvalidRequestError("Unknown region.")
    catalog.get_active_qualification(session, qualification_code)
    now = now or datetime.now(ZoneInfo("Asia/Manila"))
    forecasts = [_forecast(i, region_code) for i in labor_market.indicators(session, qualification_code, region_code)]
    postings = demand_evidence.posting_evidence(session, [qualification_code], region_code, today=now.date())
    supply = supply_statistics.supply_evidence(session, qualification_code, region_code, now=now)
    return QualificationEvidencePanel(
        context=EvidenceContext(
            qualification_code=qualification_code,
            region_code=region_code,
            evaluated_at=now,
            method_versions={
                "postings": demand_evidence.METHOD_VERSION,
                "supply": supply_statistics.METHOD_VERSION,
            },
        ),
        forecast_support=forecasts,
        observed_postings=postings,
        supply=supply,
        limitations=list(LIMITATIONS),
    )
