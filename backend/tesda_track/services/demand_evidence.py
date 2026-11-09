"""Posting statistics deduplicated by stable source ID, on the same eligibility as labor_market.observed_postings."""

import hashlib
from collections.abc import Sequence
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from tesda_track.errors import InvalidRequestError
from tesda_track.models import Qualification, Region
from tesda_track.models.labor_market import (
    LaborMarketDataset as Dataset,
    LaborMarketEvidence as Evidence,
    LaborMarketMapping as Mapping,
)
from tesda_track.schemas.evidence import Geography, Measure, PostingEvidence

METHOD_VERSION = "postings-dedup-v1"
POSTING_LIMITATION = "Posting records are dated observations, not vacancies or workers; headcount is unknown."
NO_POSTINGS = "No mapped posting records in this extent; absence of evidence is not absence of demand."


def _posted_on(raw) -> date | None:
    try:
        month, day, year = (int(p) for p in str(raw).strip().split("/"))
        return date(year, month, day)
    except (ValueError, TypeError):
        return None


def _employer(provenance) -> str | None:
    name = (provenance or {}).get("employer")
    name = " ".join(str(name).split()).casefold() if name else ""
    return name or None


def posting_evidence(
    session: Session,
    qualification_codes: Sequence[str],
    region_code: str | None = None,
    *,
    today: date | None = None,
) -> PostingEvidence:
    region = None
    if region_code:
        region = session.get(Region, region_code)
        if region is None:
            raise InvalidRequestError("Unknown region.")
    today = today or datetime.now(ZoneInfo("Asia/Manila")).date()
    statement = (
        select(Evidence, Dataset, Qualification.code)
        .join(Mapping, Mapping.evidence_id == Evidence.id)
        .join(Dataset, Evidence.dataset_id == Dataset.id)
        .join(Qualification, Mapping.qualification_id == Qualification.id)
        .where(
            Qualification.code.in_(list(qualification_codes)),
            Qualification.is_active == True,
            Mapping.decision == "approved",
            Mapping.proposal == "high_confidence",
            Dataset.status == "active",
            Dataset.evidence_class == "observed_posting",
            Evidence.classification == "observed_posting",
            Evidence.observed_on >= date(today.year, 1, 1),
            Evidence.observed_on <= today,
            Evidence.geographic_scope.in_(["regional", "local"]),
        )
        .order_by(Evidence.id)
    )
    if region_code:
        statement = statement.where(Evidence.region_code == region_code)

    postings: dict[str, dict] = {}
    for evidence, dataset, code in session.exec(statement).all():
        stable = f"{dataset.publisher}|{evidence.source_record_id}"
        p = postings.setdefault(
            stable, dict(first=evidence, captures=set(), codes=set(), datasets=set(), dates=set())
        )
        p["captures"].add(evidence.id)
        p["codes"].add(code)
        p["datasets"].add(dataset.key)
        p["dates"].add(evidence.observed_on)

    unallocated = [s for s, p in postings.items() if not p["first"].region_code]
    counted = {s: p for s, p in postings.items() if p["first"].region_code}

    by_qualification = {code: 0 for code in qualification_codes}
    groups: dict[tuple, int] = {}
    employers: set[str] = set()
    known_employers = 0
    posted: list[date] = []
    for p in counted.values():
        e = p["first"]
        for code in p["codes"]:
            by_qualification[code] += 1
        employer = _employer(e.provenance)
        if employer:
            known_employers += 1
            employers.add(employer)
            key = (employer, e.normalized_title, (e.locality or "").casefold(), str(e.provenance.get("posted_on")))
            groups[key] = groups.get(key, 0) + 1
        when = _posted_on(e.provenance.get("posted_on"))
        if when:
            posted.append(when)

    n = len(counted)
    snapshot_dates = sorted({d for p in counted.values() for d in p["dates"]})
    dataset_keys = sorted({k for p in counted.values() for k in p["datasets"]})
    geography = (
        Geography(scope="regional", region_code=region.code, label=region.name)
        if region
        else Geography(scope="multi_regional", label="Regions with mapped posting records (not a national total)")
    )
    context = dict(
        evidence_kind="observed",
        geography=geography,
        reference_period=str(today.year),
        observed_on=snapshot_dates[-1] if snapshot_dates else None,
        sources=dataset_keys,
        method_version=METHOD_VERSION,
        limitations=[POSTING_LIMITATION],
    )
    postings_measure = Measure(
        name="distinct_postings",
        value=float(n) if n else None,
        unit="posting records",
        known_record_count=n,
        eligible_record_count=n,
        unknown_count=0,
        coverage=1.0 if n else None,
        statement=(f"{n} distinct posting records, counted once per stable source ID." if n else NO_POSTINGS),
        **context,
    )
    if not n:
        employer_statement = "No posting records in this extent."
    elif known_employers:
        employer_statement = f"{len(employers)} distinct employers named on {known_employers} of {n} posting records."
    else:
        employer_statement = f"Employer unknown for all {n} posting records."
    employers_measure = Measure(
        name="distinct_employers",
        value=float(len(employers)) if known_employers else None,
        unit="employers",
        known_record_count=known_employers,
        eligible_record_count=n,
        unknown_count=n - known_employers,
        coverage=known_employers / n if n else None,
        statement=employer_statement,
        **context,
    )
    return PostingEvidence(
        postings=postings_measure,
        employers=employers_measure,
        by_qualification=by_qualification,
        overlap_count=sum(1 for p in counted.values() if len(p["codes"]) > 1),
        repeated_captures=sum(len(p["captures"]) - 1 for p in counted.values()),
        suspected_duplicate_groups=sum(1 for c in groups.values() if c > 1),
        unallocated_count=len(unallocated),
        snapshot_dates=snapshot_dates,
        posted_between=[min(posted), max(posted)] if posted else None,
        dataset_keys=dataset_keys,
        fingerprint=hashlib.sha256("\n".join([METHOD_VERSION, *sorted(counted)]).encode()).hexdigest(),
    )
