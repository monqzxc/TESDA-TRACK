"""Bulk, reviewed-only qualification discovery for an area; no demand or personal-fit score."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_
from sqlmodel import Session, select

from tesda_track.errors import InvalidRequestError
from tesda_track.models import Qualification, Region
from tesda_track.models.labor_market import (
    LaborMarketDataset as Dataset,
    LaborMarketEvidence as Evidence,
    LaborMarketMapping as Mapping,
)
from tesda_track.schemas.area_qualifications import AreaQualification, AreaQualifications
from tesda_track.schemas.evidence import ForecastSupport, Geography
from tesda_track.services.demand_evidence import NO_POSTINGS, POSTING_LIMITATION


LIMITATIONS = [
    "This is an evidence-linked directory, not a personalized ranking or a workforce-shortage estimate.",
    "Qualification posting counts may overlap; one source record can support more than one qualification.",
    "Forecast classifications are categorical; they are not projected vacancy totals.",
    "Regional evidence does not establish demand in a particular municipality.",
]


def discover(
    session: Session,
    region_code: str | None = None,
    *,
    limit: int = 50,
    offset: int = 0,
    now: datetime | None = None,
) -> AreaQualifications:
    """Read candidates in one joined query; deduplicate postings by publisher/source ID.

    All active reviewed source associations are considered before alphabetic
    pagination. A region selection admits only its posting/forecast observations
    plus explicitly labeled national forecasts. Without a selection, posting
    counts cover the regions present in the dataset, never a national census.
    """
    if not 1 <= limit <= 100 or offset < 0:
        raise InvalidRequestError("Invalid area qualification page.")
    regions = {region.code: region.name for region in session.exec(select(Region)).all()}
    if region_code and region_code not in regions:
        raise InvalidRequestError("Unknown region.")
    now = now or datetime.now(ZoneInfo("Asia/Manila"))
    today = now.date()
    since = date(today.year, 1, 1)
    forecast_geography = Evidence.geographic_scope == "national"
    posting_geography = and_(
        Evidence.geographic_scope.in_(["regional", "local"]),
        Evidence.region_code.is_not(None),
    )
    if region_code:
        forecast_geography = or_(
            forecast_geography,
            and_(Evidence.geographic_scope == "regional", Evidence.region_code == region_code),
        )
        posting_geography = and_(posting_geography, Evidence.region_code == region_code)

    forecasts = and_(
        Dataset.evidence_class.in_(["national_forecast", "regional_forecast"]),
        Dataset.period_start_year <= today.year,
        Dataset.period_end_year >= today.year,
        Evidence.classification.in_(["in_demand", "hard_to_fill"]),
        forecast_geography,
    )
    postings = and_(
        Dataset.evidence_class == "observed_posting",
        Evidence.classification == "observed_posting",
        Evidence.observed_on >= since,
        Evidence.observed_on <= today,
        posting_geography,
    )
    rows = session.exec(
        select(Qualification, Mapping, Evidence, Dataset)
        .join(Mapping, Mapping.qualification_id == Qualification.id)
        .join(Evidence, Mapping.evidence_id == Evidence.id)
        .join(Dataset, Evidence.dataset_id == Dataset.id)
        .where(
            Qualification.is_active == True,
            Mapping.decision == "approved",
            Mapping.proposal == "high_confidence",
            Dataset.status == "active",
            or_(forecasts, postings),
        )
        .order_by(Qualification.name, Qualification.code, Evidence.id)
    ).all()

    observation_geography = (
        Geography(scope="regional", region_code=region_code, label=regions[region_code])
        if region_code
        else Geography(scope="multi_regional", label="Regions with mapped posting records (not a national total)")
    )
    found: dict[str, dict] = {}
    for qualification, mapping, evidence, dataset in rows:
        item = found.setdefault(
            qualification.code,
            dict(
                qualification=qualification,
                posting_ids=set(),
                observation_dates=set(),
                dataset_keys=set(),
                forecast_support=[],
                has_selected_area_evidence=False,
            ),
        )
        item["dataset_keys"].add(dataset.key)
        if region_code and evidence.region_code == region_code:
            item["has_selected_area_evidence"] = True
        if dataset.evidence_class == "observed_posting":
            item["posting_ids"].add((dataset.publisher, evidence.source_record_id))
            item["observation_dates"].add(evidence.observed_on)
            continue
        match = (
            "no_area_selected" if region_code is None
            else "selected_area" if evidence.region_code == region_code
            else "broader_scope"
        )
        source_reference = "; ".join(
            part for part in (
                evidence.source_table,
                "PDF p. " + evidence.page_pdf if evidence.page_pdf else None,
                "printed p. " + evidence.page_printed if evidence.page_printed else None,
            ) if part
        )
        item["forecast_support"].append(ForecastSupport(
            occupation_title=evidence.occupation_title,
            classification=evidence.classification,
            geography=Geography(
                scope=evidence.geographic_scope,
                region_code=evidence.region_code,
                label="Philippines — National" if evidence.geographic_scope == "national"
                else regions[evidence.region_code],
            ),
            geography_match=match,
            period_label=dataset.period_label or str(today.year),
            publisher=dataset.publisher,
            source_title=dataset.title,
            source_url=evidence.source_url or dataset.source_url,
            source_reference=source_reference,
            dataset_key=dataset.key,
            mapping_id=mapping.id,
        ))

    ordered = sorted(found.values(), key=lambda item: (item["qualification"].name.casefold(), item["qualification"].code))
    items = []
    for item in ordered[offset:offset + limit]:
        notes = [POSTING_LIMITATION]
        if not item["posting_ids"]:
            notes.append(NO_POSTINGS)
        if region_code and not item["has_selected_area_evidence"]:
            notes.append("Only broader national forecast support is available for this qualification in the selected area.")
        items.append(AreaQualification(
            qualification_code=item["qualification"].code,
            qualification_name=item["qualification"].name,
            observed_posting_count=len(item["posting_ids"]) or None,
            observation_dates=sorted(item["observation_dates"]),
            observation_geography=observation_geography,
            forecast_support=item["forecast_support"],
            has_selected_area_evidence=item["has_selected_area_evidence"],
            dataset_keys=sorted(item["dataset_keys"]),
            limitations=notes,
        ))
    return AreaQualifications(
        items=items,
        total=len(ordered),
        limit=limit,
        offset=offset,
        region_code=region_code,
        evaluated_at=now,
        observed_since=since,
        observed_through=today,
        limitations=list(LIMITATIONS),
    )
