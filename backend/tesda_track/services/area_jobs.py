"""Browse imported posting snapshots without inventing qualification associations.

Personalized (a learner's Skill Passport fit from services/profile_fit), a job title fits through the qualifications
its records have a reviewed, approved link to, never through its wording: titles fitting the learner come first,
ordered by fit and posting records together, then the rest by posting records as usual.
"""

from collections import defaultdict
from statistics import median
from datetime import datetime
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from tesda_track.errors import InvalidRequestError
from tesda_track.models import Qualification, Region
from tesda_track.models.labor_market import (
    LaborMarketDataset as Dataset,
    LaborMarketEvidence as Evidence,
    LaborMarketMapping as Mapping,
)
from tesda_track.schemas.area_jobs import (
    AreaJob, AreaJobs, JobArea, JobPosting, JobPostingDetail, JobPostings, PostingQualification,
)
from tesda_track.services.demand_evidence import _employer, _posted_on
from tesda_track.services import provinces
from tesda_track.services.labor_market import job_key

if TYPE_CHECKING:
    from tesda_track.services.profile_fit import ProfileFit

FIT_WEIGHT, DEMAND_WEIGHT = 0.7, 0.3
PERSONALIZED = ("Titles linked to qualifications your Skill Passport fits come first: a starting point, not an "
                "assessment of you or a promise of an opening.")


def summarize(rows, regions, *, region_code=None, locality=None, limit=30, offset=0, fit=None, links=None,
              province=None):
    """Deduplicate source IDs before grouping titles, employers and regional markers. `province` (a display name from
    services/provinces) keeps the records whose locality is in it; the regional markers stay nationwide."""
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
    scoped = [r for r in records if (not region_code or r.region_code == region_code)
              and (province is None or provinces.of_locality(r.locality) == province)]
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
        **_salary_range(entries),
        **(_personal(entries, fit, links or {}) if fit is not None else {}),
    ) for entries in groups.values()]
    jobs.sort(key=lambda job: (-job.posting_count, job.title.casefold()))
    if fit is not None:
        busiest = max((job.posting_count for job in jobs), default=0) or 1
        jobs.sort(key=lambda job: (0, -(FIT_WEIGHT * job.personal_fit.score / 100
                                        + DEMAND_WEIGHT * job.posting_count / busiest))
                  if job.personal_fit and job.personal_fit.score else (1, 0.0))
    dates = sorted({r.observed_on for r in selected if r.observed_on})
    posted = sorted({day for r in selected if (day := _posted_on((r.provenance or {}).get("posted_on")))})
    return AreaJobs(
        items=jobs[offset:offset + limit], total=len(jobs), posting_count=len(selected),
        employer_count=len({name for r in selected if (name := _employer(r.provenance))}),
        region_code=region_code, province=province, locality=locality, localities=localities, areas=areas,
        limit=limit, offset=offset, snapshot_dates=dates,
        posted_between=[posted[0], posted[-1]] if posted else [],
        ordering="profile_fit" if fit is not None else "posting_count",
        personalized=fit is not None,
        **({"limitations": [*AreaJobs.model_fields["limitations"].default_factory(), PERSONALIZED]}
           if fit is not None else {}),
    )


def _personal(entries, fit: "ProfileFit", links: dict[int, list[tuple[str, str]]]) -> dict:
    """The best fit among the qualifications this title's records are linked to, and that qualification's name."""
    linked = {code: name for record in entries for code, name in links.get(record.id, ())}
    if not linked:
        return {}
    code = min(linked, key=lambda c: (-fit.job_fit(c), linked[c].casefold(), c))
    personal = fit.get(code)
    if personal is None or not fit.job_fit(code):
        return {}
    return {"personal_fit": personal.model_copy(update={"score": fit.job_fit(code)}),
            "linked_qualification": linked[code]}


def discover(session: Session, region_code=None, locality=None, qualification_code=None, *, limit=30, offset=0,
             fit: "ProfileFit | None" = None, province: str | None = None):
    """`province` filters in Python after the query: there is no province column, the name has to be parsed and
    normalized from `locality`, and the whole posting set (a few thousand records) is read anyway for the regional
    markers. An unknown province matches no record, so the list is empty rather than an error."""
    regions = {r.code: r for r in session.exec(select(Region)).all()}
    if region_code and region_code not in regions:
        raise InvalidRequestError("Unknown region.")
    statement = _eligible(regions)
    if qualification_code:
        # A qualification filter must never turn an unreviewed title into an association.
        statement = statement.where(Evidence.id.in_(
            select(Mapping.evidence_id)
            .join(Qualification, Qualification.id == Mapping.qualification_id)
            .where(Qualification.code == qualification_code, Qualification.is_active == True,
                   Mapping.decision == "approved", Mapping.proposal == "high_confidence")
        ))
    rows = session.exec(statement).all()
    return summarize(rows, regions, region_code=region_code, locality=locality, limit=limit, offset=offset,
                     fit=fit, links=_links(session, fit) if fit else None, province=provinces.normalize(province))


def _eligible(regions):
    """The posting records the map counts: active PhilJobNet snapshots, dated, in a known region."""
    today = datetime.now(ZoneInfo("Asia/Manila")).date()
    return (
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


def _salary(record) -> int | None:
    try:
        value = int(float(str((record.provenance or {}).get("salary_php", "")).replace(",", "")))
    except ValueError:
        return None
    return value if value > 0 else None


def _salary_range(entries) -> dict:
    salaries = sorted(value for r in entries if (value := _salary(r)))
    return {"salary_min": salaries[0], "salary_max": salaries[-1],
            "salary_median": round(median(salaries))} if salaries else {}


def _text(value) -> str | None:
    value = " ".join(str(value).split()) if value else ""
    return value if value and not value.casefold().endswith("not specified") else None


def _posting(record, regions) -> JobPosting:
    provenance = record.provenance or {}
    region = regions.get(record.region_code)
    return JobPosting(
        job_id=str(provenance.get("job_id") or record.source_record_id),
        title=record.occupation_title,
        employer=_text(provenance.get("employer")),
        location=_text(record.locality or provenance.get("location")),
        region_code=record.region_code,
        region_name=region.name if region else None,
        salary_php=_salary(record),
        employment_type=_text(provenance.get("employment_type")),
        education=_text(provenance.get("education")),
        posted_on=_posted_on(provenance.get("posted_on")),
        observed_on=record.observed_on,
    )


def _unique(rows):
    """One record per source ID, the latest capture first (the statement's order)."""
    retained = {}
    for evidence, dataset in rows:
        retained.setdefault((dataset.publisher, evidence.source_record_id), evidence)
    return list(retained.values())


def _newest(posting: JobPosting):
    day = posting.posted_on or posting.observed_on
    return (-day.toordinal() if day else 0, posting.job_id)


def postings(session: Session, title: str, region_code=None, province=None, *, limit=10) -> JobPostings:
    """The posting records behind one title's count in an area, newest posted first."""
    regions = {r.code: r for r in session.exec(select(Region)).all()}
    if region_code and region_code not in regions:
        raise InvalidRequestError("Unknown region.")
    key = job_key(title)
    province = provinces.normalize(province)
    records = [r for r in _unique(session.exec(_eligible(regions)).all())
               if job_key(r.occupation_title) == key
               and (not region_code or r.region_code == region_code)
               and (province is None or provinces.of_locality(r.locality) == province)]
    items = sorted((_posting(r, regions) for r in records), key=_newest)
    return JobPostings(items=items[:limit], total=len(items))


def posting(session: Session, job_id: str) -> JobPostingDetail | None:
    """One posting record by its PhilJobNet job ID, its reviewed qualification links and others with its title."""
    regions = {r.code: r for r in session.exec(select(Region)).all()}
    found = session.exec(_eligible(regions).where(Evidence.source_record_id == job_id)).first()
    if found is None:
        return None
    record = found[0]
    key = job_key(record.occupation_title)
    linked = session.exec(
        select(Qualification.code, Qualification.name)
        .join(Mapping, Mapping.qualification_id == Qualification.id)
        .join(Evidence, Evidence.id == Mapping.evidence_id)
        .where(Evidence.source_record_id == job_id, Qualification.is_active == True,
               Mapping.decision == "approved", Mapping.proposal == "high_confidence")
        .distinct()
    ).all()
    peers = [r for r in _unique(session.exec(_eligible(regions)).all())
             if job_key(r.occupation_title) == key and r.source_record_id != record.source_record_id]
    peers.sort(key=lambda r: (r.region_code != record.region_code, r.locality != record.locality))
    same = [_posting(r, regions) for r in peers]
    return JobPostingDetail(
        posting=_posting(record, regions),
        qualifications=[PostingQualification(code=code, name=name) for code, name in linked],
        same_title=same[:6], same_title_total=len(same),
        **{"salary_min": None, "salary_max": None, "salary_median": None, **_salary_range([record, *peers])},
    )


def _links(session: Session, fit: "ProfileFit") -> dict[int, list[tuple[str, str]]]:
    """Reviewed links from posting records to the qualifications the learner fits: evidence id -> (code, name)."""
    links = defaultdict(list)
    for evidence_id, code, name in session.exec(
        select(Mapping.evidence_id, Qualification.code, Qualification.name)
        .join(Qualification, Qualification.id == Mapping.qualification_id)
        .where(Qualification.code.in_(list(fit.by_code)), Qualification.is_active == True,
               Mapping.decision == "approved", Mapping.proposal == "high_confidence")
    ):
        links[evidence_id].append((code, name))
    return links
