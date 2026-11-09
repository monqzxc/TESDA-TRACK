"""Typed, traceable evidence: every number says what it counts, where it came from and how much of it is known."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

EvidenceKind = Literal["observed", "estimated", "forecast"]


class Geography(BaseModel):
    scope: Literal["national", "regional", "local", "multi_regional"]
    region_code: str | None = None
    label: str


class Measure(BaseModel):
    name: str
    value: float | None
    unit: str
    evidence_kind: EvidenceKind
    geography: Geography
    reference_period: str | None = None
    observed_on: date | None = None
    sources: list[str] = Field(default_factory=list)
    method_version: str
    known_record_count: int
    eligible_record_count: int
    unknown_count: int
    coverage: float | None
    statement: str
    limitations: list[str] = Field(default_factory=list)


class PostingEvidence(BaseModel):
    postings: Measure
    employers: Measure
    by_qualification: dict[str, int]
    overlap_count: int
    repeated_captures: int
    suspected_duplicate_groups: int
    unallocated_count: int
    snapshot_dates: list[date]
    posted_between: list[date] | None
    dataset_keys: list[str]
    fingerprint: str


def measure_sum(
    name: str,
    unit: str,
    values: list[float | None],
    *,
    label: str,
    record_noun: str,
    total_noun: str,
    **context,
) -> Measure:
    """Sum the known values; unknown ones are never counted as zero, and the statement says how many were known."""
    known = [v for v in values if v is not None]
    eligible, k = len(values), len(known)
    total = sum(known) if known else None
    if eligible == 0:
        statement = f"No {record_noun} in this extent."
    elif k == 0:
        statement = f"{label[:1].upper() + label[1:]} unknown for all {eligible} {record_noun}."
    else:
        statement = f"{total:g} reported {label} across {k} of {eligible} {record_noun}"
        statement += f"; total {total_noun} unknown." if k < eligible else "."
    return Measure(
        name=name,
        value=total,
        unit=unit,
        known_record_count=k,
        eligible_record_count=eligible,
        unknown_count=eligible - k,
        coverage=k / eligible if eligible else None,
        statement=statement,
        **context,
    )
