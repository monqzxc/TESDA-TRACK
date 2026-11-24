"""Where else a learner's qualifications are in demand: other provinces, ranked by posting records.

Signed in (a Skill Passport fit from services/profile_fit), the qualifications used are the ones the profile fits
best (up to MAX_FITS), each weighted by its fit; a guest's are the ones they searched for, weighted equally. A
posting record counts in a province when it has a reviewed, approved, high-confidence link to one of them, with the
weight of its best-fitting link; provinces are ranked by those weighted records. The province comes from the
record's locality (services/provinces), the learner's own province is left out, and so is any province with fewer
than MIN_POSTINGS records, since one or two postings say little.

Postings have no coordinates: a province's point is the mean of its training and assessment centers, else its
region's point. Neither the profile nor the province asked about is stored or logged.
"""
from collections import Counter, defaultdict
from datetime import date, datetime
from typing import TYPE_CHECKING, Iterable
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from tesda_track.models import Qualification, Region
from tesda_track.models.delivery import AssessmentCenter, TrainingProvider
from tesda_track.models.labor_market import (
    LaborMarketDataset as Dataset,
    LaborMarketEvidence as Evidence,
    LaborMarketMapping as Mapping,
)
from tesda_track.schemas.elsewhere import ElsewhereDemand, ElsewhereProvince, ElsewhereQualification
from tesda_track.schemas.profile_fit import FitReason
from tesda_track.services import provinces
from tesda_track.services.labor_market import job_key

if TYPE_CHECKING:
    from tesda_track.services.profile_fit import ProfileFit

MIN_POSTINGS = 3
MAX_FITS = 10
MAX_CODES = 5
TOP = 3


def find(session: Session, *, exclude_province: str | None = None, limit: int = 3,
         fit: "ProfileFit | None" = None, qualification_codes: Iterable[str] = (),
         today: date | None = None) -> ElsewhereDemand:
    today = today or datetime.now(ZoneInfo("Asia/Manila")).date()
    excluded = provinces.normalize(exclude_province)
    weights = _weights(fit, qualification_codes)
    empty = ElsewhereDemand(items=[], exclude_province=excluded, personalized=fit is not None,
                            ordering="profile_fit" if fit is not None else "posting_count", min_postings=MIN_POSTINGS)
    if not weights:
        return empty
    regions = {region.code: region for region in session.exec(select(Region)).all()}
    rows = session.exec(
        select(Dataset.publisher, Evidence.source_record_id, Evidence.occupation_title, Evidence.locality,
               Evidence.region_code, Evidence.observed_on, Qualification.code, Qualification.name)
        .select_from(Mapping)
        .join(Evidence, Evidence.id == Mapping.evidence_id)
        .join(Dataset, Dataset.id == Evidence.dataset_id)
        .join(Qualification, Qualification.id == Mapping.qualification_id)
        .where(
            Qualification.code.in_(list(weights)), Qualification.is_active == True,
            Mapping.decision == "approved", Mapping.proposal == "high_confidence",
            Dataset.status == "active", Dataset.evidence_class == "observed_posting",
            Dataset.source_id.startswith("philjobnet-postings-"),
            Evidence.classification == "observed_posting",
            Evidence.observed_on.is_not(None), Evidence.observed_on <= today,
            Evidence.region_code.in_(list(regions)),
            Evidence.geographic_scope.in_(["regional", "local"]),
        )
        .order_by(Evidence.observed_on.desc(), Evidence.id)
    ).all()

    # One record per source posting (the latest capture first), with every qualification it links to.
    postings: dict[tuple, dict] = {}
    names: dict[str, str] = {}
    for publisher, record_id, title, locality, region_code, observed_on, code, name in rows:
        province = provinces.of_locality(locality)
        if province is None:
            continue
        posting = postings.setdefault((publisher, record_id), dict(
            title=title, province=province, region_code=region_code, observed_on=observed_on, codes=set()))
        posting["codes"].add(code)
        names[code] = name

    by_province: dict[str, list[dict]] = defaultdict(list)
    for posting in postings.values():
        by_province[posting["province"]].append(posting)

    ranked = []
    for province, entries in by_province.items():
        if province == excluded or len(entries) < MIN_POSTINGS:
            continue
        score = sum(max(weights[code] for code in entry["codes"]) for entry in entries)
        ranked.append((score, province, entries))
    ranked.sort(key=lambda item: (-item[0], -len(item[2]), item[1]))
    ranked = ranked[:limit]
    if not ranked:
        return empty

    points = _center_points(session, {province for _, province, _ in ranked})
    items = []
    for _, province, entries in ranked:
        region_code = Counter(entry["region_code"] for entry in entries).most_common(1)[0][0]
        region = regions[region_code]
        point = points.get(province)
        per_code = Counter(code for entry in entries for code in entry["codes"])
        top_codes = sorted(per_code, key=lambda c: (-weights[c] * per_code[c], -per_code[c], names[c].casefold()))[:TOP]
        items.append(ElsewhereProvince(
            province=province, region_code=region_code, region_name=region.name,
            latitude=point[0] if point else region.latitude, longitude=point[1] if point else region.longitude,
            location_basis="centers" if point else "region",
            posting_count=len(entries), titles=_titles(entries),
            qualifications=[ElsewhereQualification(code=c, name=names[c], posting_count=per_code[c])
                            for c in top_codes],
            reasons=_reasons(fit, top_codes) if fit is not None else [],
            observed_on=max(entry["observed_on"] for entry in entries),
        ))
    return empty.model_copy(update=dict(
        items=items,
        snapshot_dates=sorted({entry["observed_on"] for _, _, entries in ranked for entry in entries}),
    ))


def _weights(fit: "ProfileFit | None", codes: Iterable[str]) -> dict[str, float]:
    """Each qualification to count, with its weight: the fit (0-1) when signed in, 1 for a guest's search."""
    if fit is not None:
        scored = sorted(((code, fit.job_fit(code)) for code in fit.by_code), key=lambda pair: (-pair[1], pair[0]))
        return {code: score / 100 for code, score in [pair for pair in scored if pair[1] > 0][:MAX_FITS]}
    return {code: 1.0 for code in dict.fromkeys(codes)}


def _titles(entries: list[dict]) -> list[str]:
    counts, shown = Counter(), {}
    for entry in entries:
        key = job_key(entry["title"])
        counts[key] += 1
        shown.setdefault(key, entry["title"])
    return [shown[key] for key in sorted(counts, key=lambda key: (-counts[key], key))[:TOP]]


def _reasons(fit: "ProfileFit", codes: list[str]) -> list[FitReason]:
    """The fit's own reasons for the province's top qualifications, best first, without repeats."""
    reasons, seen = [], set()
    for code in sorted(codes, key=lambda c: -fit.job_fit(c)):
        personal = fit.get(code)
        for reason in personal.reasons if personal else ():
            marker = (reason.kind, tuple(reason.terms), reason.qualification, reason.sector)
            if marker not in seen:
                seen.add(marker)
                reasons.append(reason)
    return reasons[:TOP]


def _center_points(session: Session, wanted: set[str]) -> dict[str, tuple[float, float]]:
    """The mean point of each wanted province's active training and assessment centers that have one."""
    found: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for model in (TrainingProvider, AssessmentCenter):
        for province, latitude, longitude in session.exec(
            select(model.province, model.latitude, model.longitude)
            .where(model.is_active == True, model.province.is_not(None), model.latitude.is_not(None))
        ):
            name = provinces.normalize(province)
            if name in wanted:
                found[name].append((latitude, longitude))
    return {name: (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
            for name, pts in found.items()}
