"""Where one qualification is in demand and where it is offered, region by region, and what that says about an area.

Demand is the dated posting records with a reviewed link to the qualification (services.area_jobs). Supply is the
recorded training and assessment centers that list it; example placeholders are reported beside it, never inside it.
The balance compares a region's share of each. It is a rough signal for a learner choosing where to train, not a
workforce shortage estimate, and the words written from it say so.
"""
from collections import Counter
from datetime import datetime

from sqlalchemy import or_
from sqlmodel import Session, select

from tesda_track.errors import InvalidRequestError
from tesda_track.models import (AssessmentCenter, AssessmentSchedule, Region, TrainingProgram, TrainingProvider,
                                utcnow)
from tesda_track.models.registry import RegistryBatch, RegistryLink, RegistryRecord
from tesda_track.schemas.outlook import (AreaOutlook, OutlookInsight, OutlookPoint, OutlookQualification,
                                         OutlookTotals, QualificationOutlook)
from tesda_track.services import area_jobs, catalog

LIMITATIONS = [
    "Demand counts dated posting records with a reviewed link to the qualification; they are not live openings or "
    "worker headcounts.",
    "Supply counts recorded training and assessment centers, not seats, graduates or certificate holders.",
    "The balance compares a region's share of the posting records with its share of the centers. It is a rough "
    "signal, not a workforce shortage or surplus estimate.",
    "Missing records do not prove there is no demand or no training in an area.",
]
EXAMPLES_COUNTED = "This deployment counts example sites as supply, for demonstration. They are not TESDA records."

# A region is ahead on demand when its share of the posting records is at least this many times its share of the
# centers, and ahead on supply when it is at most the inverse. Provisional until the Product Owner signs off.
AHEAD_RATIO = 1.5
# Fewer records than this on either side make the comparison a rough signal only.
MIN_RECORDS = 3
MAX_ALTERNATIVES = 3
# Where a learner open to relocating would look first: demand with centers, then demand alone, then an even balance.
_ALTERNATIVE_ORDER = {"more_demand": 0, "demand_only": 1, "balanced": 2}


def _sites(session: Session, qualification_id: int, now: datetime, include_examples: bool):
    """The centers listing the qualification, as {site id: region code}: counted training, counted assessment, and
    the example placeholders of either kind. A site with any real listing is counted, never an example. A demo
    deployment may count its examples too (`include_examples`); the answer then says so."""
    training: dict[int, str] = {}
    assessment: dict[int, str] = {}
    examples: dict[tuple[str, int], str] = {}

    def sort(kind: str, counted: dict[int, str], rows) -> None:
        for site_id, region_code, example in rows:
            if example and not include_examples:
                examples.setdefault((kind, site_id), region_code)
            else:
                counted[site_id] = region_code
        for site_id in counted:
            examples.pop((kind, site_id), None)

    sort("training", training, session.exec(
        select(TrainingProvider.id, TrainingProvider.region_code,
               or_(TrainingProvider.data_status == "example", TrainingProgram.data_status == "example"))
        .join(TrainingProgram, TrainingProgram.provider_id == TrainingProvider.id)
        .where(TrainingProgram.is_active, TrainingProvider.is_active,
               TrainingProgram.qualification_id == qualification_id)).all())
    # Open schedules that haven't happened yet, as the map's own listing of assessment centers has them.
    sort("assessment", assessment, session.exec(
        select(AssessmentCenter.id, AssessmentCenter.region_code,
               or_(AssessmentCenter.data_status == "example", AssessmentSchedule.data_status == "example"))
        .join(AssessmentSchedule, AssessmentSchedule.center_id == AssessmentCenter.id)
        .where(AssessmentSchedule.status == "open", AssessmentSchedule.scheduled_at > now, AssessmentCenter.is_active,
               AssessmentSchedule.qualification_id == qualification_id)).all())
    # The registry accredits centers per qualification without publishing schedules: the accepted rows of each
    # center's latest snapshot say what it may assess.
    for site_id, region_code in session.exec(
            select(AssessmentCenter.id, AssessmentCenter.region_code)
            .join(RegistryLink, RegistryLink.center_id == AssessmentCenter.id)
            .join(RegistryRecord, RegistryRecord.site_key == RegistryLink.external_key)
            .join(RegistryBatch, RegistryBatch.id == RegistryRecord.batch_id)
            .where(RegistryLink.entity_kind == "center", RegistryBatch.kind == "assessment",
                   RegistryBatch.snapshot_date == RegistryLink.last_snapshot_date,
                   RegistryRecord.outcome == "accepted", RegistryRecord.qualification_id == qualification_id,
                   AssessmentCenter.is_active, AssessmentCenter.data_status != "example")).all():
        assessment[site_id] = region_code
        examples.pop(("assessment", site_id), None)
    return training, assessment, examples


def classify(postings: int, sites: int, total_postings: int, total_sites: int) -> tuple[str, bool]:
    """A region's balance, and whether its counts are too small for more than a rough signal."""
    if not postings and not sites:
        return "no_records", False
    if not sites:
        return "demand_only", postings < MIN_RECORDS
    if not postings:
        return "supply_only", sites < MIN_RECORDS
    ratio = (postings / total_postings) / (sites / total_sites)
    balance = "more_demand" if ratio >= AHEAD_RATIO else "more_supply" if ratio <= 1 / AHEAD_RATIO else "balanced"
    return balance, min(postings, sites) < MIN_RECORDS


def build(session: Session, qualification_code: str, region_code: str | None = None,
          home_region_code: str | None = None, relocate: bool = False, *, ai_summary_available: bool = False,
          include_examples: bool = False, now: datetime | None = None) -> QualificationOutlook:
    qualification = catalog.get_active_qualification(session, qualification_code)
    regions = list(session.exec(select(Region).order_by(Region.position)))
    known = {region.code for region in regions}
    if (region_code and region_code not in known) or (home_region_code and home_region_code not in known):
        raise InvalidRequestError("Unknown region.")

    demand = area_jobs.discover(session, None, None, qualification_code, limit=1)
    posted = {area.region_code: area for area in demand.areas}
    training, assessment, examples = _sites(session, qualification.id, now or utcnow(), include_examples)
    trains, assesses, placeholders = (Counter(sites.values()) for sites in (training, assessment, examples))
    total_postings, total_sites = demand.posting_count, len(training) + len(assessment)

    areas = []
    for region in regions:
        postings = posted[region.code].posting_count if region.code in posted else 0
        sites = trains[region.code] + assesses[region.code]
        balance, limited = classify(postings, sites, total_postings, total_sites)
        areas.append(AreaOutlook(
            region_code=region.code, name=region.name, latitude=region.latitude, longitude=region.longitude,
            posting_count=postings, titles=posted[region.code].titles if region.code in posted else [],
            training_sites=trains[region.code], assessment_sites=assesses[region.code],
            example_sites=placeholders[region.code],
            demand_share=postings / total_postings if total_postings else None,
            supply_share=sites / total_sites if total_sites else None, balance=balance, limited=limited))

    totals = OutlookTotals(
        posting_count=total_postings, employer_count=demand.employer_count, training_sites=len(training),
        assessment_sites=len(assessment), regions_with_postings=sum(1 for area in areas if area.posting_count),
        regions_with_sites=sum(1 for area in areas if area.training_sites + area.assessment_sites))
    candidates = [area for area in areas if area.region_code != region_code and area.balance in _ALTERNATIVE_ORDER]
    candidates.sort(key=lambda area: (_ALTERNATIVE_ORDER[area.balance], -area.posting_count, area.name))
    alternatives = candidates[:MAX_ALTERNATIVES]
    by_code = {area.region_code: area for area in areas}
    return QualificationOutlook(
        qualification=OutlookQualification(code=qualification.code, name=qualification.name),
        region_code=region_code, home_region_code=home_region_code, relocate=relocate, areas=areas, totals=totals,
        alternatives=[area.region_code for area in alternatives], training_site_ids=sorted(training),
        assessment_site_ids=sorted(assessment), snapshot_dates=demand.snapshot_dates,
        insight=write_insight(qualification.name, by_code.get(region_code), by_code.get(home_region_code), relocate,
                              areas, totals, alternatives, include_examples),
        includes_example_sites=include_examples, ai_summary_available=ai_summary_available,
        limitations=[*LIMITATIONS, *([EXAMPLES_COUNTED] if include_examples else [])])


# The analysis in plain words. Every sentence is built from the counts above, so it can't say more than they do.

def _count(n: int, noun: str) -> str:
    return f"{n:,} {noun}{'' if n == 1 else 's'}"


def _percent(share: float | None) -> str:
    if not share:
        return "0%"
    return "less than 1%" if share < 0.005 else f"{round(share * 100)}%"


def _ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _listed(names: list[str]) -> str:
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"


def _centers(area: AreaOutlook) -> int:
    return area.training_sites + area.assessment_sites


HEADLINES = {
    "more_demand": "{area}: recorded demand for {name} is ahead of training supply",
    "balanced": "{area}: demand and training supply for {name} look balanced",
    "more_supply": "{area}: training supply for {name} is ahead of recorded demand",
    "demand_only": "{area}: employers posted for {name}, but no center is recorded here",
    "supply_only": "{area}: centers offer {name}, but no posting records were captured here",
    "no_records": "{area}: nothing is recorded for {name} yet",
}


def write_insight(name: str, area: AreaOutlook | None, home: AreaOutlook | None, relocate: bool,
                  areas: list[AreaOutlook], totals: OutlookTotals, alternatives: list[AreaOutlook],
                  examples_counted: bool = False) -> OutlookInsight:
    points: list[OutlookPoint] = []

    def say(kind: str, text: str) -> None:
        points.append(OutlookPoint(kind=kind, text=text))

    by_postings = sorted((a for a in areas if a.posting_count), key=lambda a: (-a.posting_count, a.name))
    by_centers = sorted((a for a in areas if _centers(a)), key=lambda a: (-_centers(a), a.name))
    stance = "are open to relocating" if relocate else "prefer not to relocate"
    if area is None:
        say("location", f"No region is selected, so this is the national picture for {name}. Share your location or "
                        "pick a region for advice about your own area.")
    elif home is None:
        say("location", f"This looks at {name} in {area.name}. Share your location to compare it with your own region.")
    elif home.region_code == area.region_code:
        scope = ("this compares your region with the rest of the country" if relocate
                 else "this looks at your own region")
        say("location", f"You are in {area.name} and {stance}, so {scope} for {name}.")
    else:
        say("location", f"You are looking at {area.name}; your own region is {home.name}, and you {stance}.")

    # Demand.
    if not totals.posting_count:
        say("demand", f"No posting records are linked to {name} in any region in this snapshot. That is missing "
                      "evidence, not proof of low demand.")
    elif area is None:
        top = [f"{a.name} ({a.posting_count:,})" for a in by_postings[:3]]
        say("demand", f"{_count(totals.posting_count, 'posting record')} are linked to it across "
                      f"{_count(totals.regions_with_postings, 'region')}, most in {_listed(top)}.")
    elif area.posting_count:
        rank = by_postings.index(area) + 1
        standing = ("more than any other region" if rank == 1 and len(by_postings) > 1
                    else "the only region with records" if rank == 1
                    else f"the {_ordinal(rank)} most of {len(by_postings)} regions with records")
        titles = f" Most-posted titles: {', '.join(area.titles)}." if area.titles else ""
        say("demand", f"{_count(area.posting_count, 'posting record')} in {area.name} "
                      f"{'is' if area.posting_count == 1 else 'are'} linked to it: {_percent(area.demand_share)} of the "
                      f"{totals.posting_count:,} recorded nationwide, {standing}.{titles}")
    else:
        say("demand", f"No posting records linked to it were captured in {area.name}. "
                      f"{_count(totals.posting_count, 'record')} elsewhere, most in {by_postings[0].name}.")

    # Supply.
    total_sites = totals.training_sites + totals.assessment_sites
    demo = " These counts include example sites, shown for demonstration." if examples_counted and total_sites else ""
    if area is None:
        if total_sites:
            top = [f"{a.name} ({_centers(a):,})" for a in by_centers[:3]]
            say("supply", f"{_count(totals.training_sites, 'training center')} and "
                          f"{_count(totals.assessment_sites, 'assessment center')} are recorded for it across "
                          f"{_count(totals.regions_with_sites, 'region')}, most in {_listed(top)}.{demo}")
        else:
            say("supply", "No training or assessment center is recorded for it yet.")
    else:
        share = (f", {_percent(area.supply_share)} of the {total_sites:,} recorded nationwide" if _centers(area) else "")
        placeholders = (f" {_count(area.example_sites, 'example site')} on the map "
                        f"{'is a placeholder' if area.example_sites == 1 else 'are placeholders'} and not counted."
                        if area.example_sites else "")
        say("supply", f"{_count(area.training_sites, 'training center')} and "
                      f"{_count(area.assessment_sites, 'assessment center')} are recorded for it in "
                      f"{area.name}{share}.{placeholders}{demo}")

    # Balance.
    if area is None:
        ahead = [a.name for a in areas if a.balance in ("more_demand", "demand_only")][:3]
        crowded = [a.name for a in areas if a.balance == "more_supply"][:3]
        parts = ([f"recorded demand is ahead of training supply in {_listed(ahead)}"] if ahead else []) + (
            [f"training supply is ahead of recorded demand in {_listed(crowded)}"] if crowded else [])
        text = "; ".join(parts)
        say("balance", f"{text[0].upper()}{text[1:]}." if text
            else "No region stands out yet: there are too few records to compare.")
    else:
        demand, supply = _percent(area.demand_share), _percent(area.supply_share)
        text = {
            "more_supply": f"{area.name} looks saturated: it holds {supply} of the recorded centers but {demand} of "
                           "the posting records, so expect more competition for local openings.",
            "more_demand": f"Demand is ahead of supply: {area.name} has {demand} of the posting records but {supply} "
                           "of the recorded centers, a good sign for finding work nearby once you qualify.",
            "balanced": f"{area.name}'s share of the posting records ({demand}) is close to its share of the recorded "
                        f"centers ({supply}), so demand and training supply look balanced.",
            "demand_only": "Employers here posted for it, but you would need to train or get assessed in another "
                           "region.",
            "supply_only": "You can train or get assessed here, but this snapshot shows no local postings for it, so "
                           "it may be harder to use close to home.",
            "no_records": "Nothing is recorded for it here yet, so no comparison can be made.",
        }[area.balance]
        say("balance", text + (" The counts are small, so treat this as a rough signal." if area.limited else ""))

    # Relocation: where else to look. Offered to a learner staying put only when their own area looks thin.
    if alternatives:
        named = [f"{a.name} ({_count(a.posting_count, 'posting')}, {_count(_centers(a), 'center')})"
                 for a in alternatives]
        if relocate:
            say("relocation", f"If you relocate, recorded demand is strongest against training supply in "
                              f"{_listed(named)}.")
        elif area is not None and area.balance in ("more_supply", "supply_only", "no_records"):
            say("relocation", f"If your plans change, {named[0]} shows more recorded demand against its training "
                              "supply.")
    elif relocate:
        say("relocation", "No other region shows stronger recorded demand for it in this snapshot.")

    headline = (HEADLINES[area.balance].format(area=area.name, name=name) if area
                else f"{name}: where it is in demand and where it is offered")
    return OutlookInsight(headline=headline, points=points)
