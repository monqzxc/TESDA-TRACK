"""Browse imported posting snapshots without inventing qualification associations."""

from collections import defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from tesda_track.errors import InvalidRequestError
from tesda_track.models import Qualification, Region
from tesda_track.models.labor_market import (
    LaborMarketDataset as Dataset,
    LaborMarketEvidence as Evidence,
    LaborMarketMapping as Mapping,
)
from tesda_track.schemas.area_jobs import AreaJob, AreaJobs, JobArea
from tesda_track.services.demand_evidence import _employer, _posted_on
from tesda_track.services.labor_market import job_key


def summarize(rows, regions, *, region_code=None, locality=None, limit=30, offset=0):
    """Deduplicate source IDs before grouping titles, employers and regional markers."""
    retained = {}
    for evidence, dataset in rows:
        retained.setdefault((dataset.publisher, evidence.source_record_id), evidence)
    records = list(retained.values())
    by_area = defaultdict(list)
    for record in records:
        by_area[record.region_code].append(record)
    areas = []
    for code, entries in by_area.items():
        region = regions.get(code)
        if not region:
            continue
        counts = defaultdict(int)
        titles = {}
        for entry in entries:
            key = job_key(entry.occupation_title)
            counts[key] += 1
            titles.setdefault(key, entry.occupation_title)
        areas.append(JobArea(
            region_code=code, name=region.name, latitude=region.latitude, longitude=region.longitude,
            posting_count=len(entries),
            titles=[titles[key] for key in sorted(counts, key=lambda key: (-counts[key], key))[:3]],
        ))
    areas.sort(key=lambda area: (-area.posting_count, area.name))
    scoped = [r for r in records if not region_code or r.region_code == region_code]
    localities = sorted({r.locality for r in scoped if r.locality})
    selected = [r for r in scoped if not locality or r.locality == locality]
    groups = defaultdict(list)
    for record in selected:
        groups[job_key(record.occupation_title)].append(record)
    jobs = [AreaJob(
        title=entries[0].occupation_title,
        posting_count=len(entries),
        employer_count=len({name for r in entries if (name := _employer(r.provenance))}),
        localities=sorted({r.locality for r in entries if r.locality}),
        region_codes=sorted({r.region_code for r in entries if r.region_code}),
    ) for entries in groups.values()]
    jobs.sort(key=lambda job: (-job.posting_count, job.title.casefold()))
    dates = sorted({r.observed_on for r in selected if r.observed_on})
    posted = sorted({day for r in selected if (day := _posted_on((r.provenance or {}).get("posted_on")))})
    return AreaJobs(
        items=jobs[offset:offset + limit], total=len(jobs), posting_count=len(selected),
        employer_count=len({name for r in selected if (name := _employer(r.provenance))}),
        region_code=region_code, locality=locality, localities=localities, areas=areas,
        limit=limit, offset=offset, snapshot_dates=dates,
        posted_between=[posted[0], posted[-1]] if posted else [],
    )


def discover(session: Session, region_code=None, locality=None, qualification_code=None, *, limit=30, offset=0):
    regions = {r.code: r for r in session.exec(select(Region)).all()}
    if region_code and region_code not in regions:
        raise InvalidRequestError("Unknown region.")
    today = datetime.now(ZoneInfo("Asia/Manila")).date()
    statement = (
        select(Evidence, Dataset)
        .join(Dataset, Dataset.id == Evidence.dataset_id)
        .where(
            Dataset.status == "active", Dataset.evidence_class == "observed_posting",
            Dataset.source_id.startswith("philjobnet-postings-"),
            Evidence.classification == "observed_posting",
            Evidence.observed_on.is_not(None), Evidence.observed_on <= today,
            Evidence.region_code.in_(list(regions)),
            Evidence.geographic_scope.in_(["regional", "local"]),
        )
        .order_by(Evidence.observed_on.desc(), Evidence.id)
    )
    if qualification_code:
        # A qualification filter must never turn an unreviewed title into an association.
        statement = statement.where(Evidence.id.in_(
            select(Mapping.evidence_id)
            .join(Qualification, Qualification.id == Mapping.qualification_id)
            .where(Qualification.code == qualification_code, Qualification.is_active == True,
                   Mapping.decision == "approved", Mapping.proposal == "high_confidence")
        ))
    return summarize(session.exec(statement).all(), regions, region_code=region_code,
                     locality=locality, limit=limit, offset=offset)
