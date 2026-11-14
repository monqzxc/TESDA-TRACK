"""Other qualifications in demand near the learner that fit their skills (Card 4).

Demand is Card 3's: a qualification's reviewed posting records in the learner's region against an even share of its
records across the regions (qualification_outlook.demand_level). Only qualifications at moderate demand or more in
the region are candidates. Fit is the existing profile matcher's score for the learner's skills
(analysis.suggest), plus credit for sharing a sector with a qualification they chose or hold. Candidates are ranked
by the two together, half each, and the reasons say only what the records and the matcher showed.
"""
import re

from sqlmodel import Session, select

from tesda_track.errors import InvalidRequestError
from tesda_track.models import Region
from tesda_track.schemas.analysis import Profile
from tesda_track.schemas.nearby_suggestions import NearbySuggestion, NearbySuggestionRequest, NearbySuggestions
from tesda_track.services import analysis, area_qualifications, catalog
from tesda_track.services.embeddings import Embedder
from tesda_track.services.qualification_outlook import MIN_RECORDS, demand_level

IN_DEMAND = ("high", "moderate")
SECTOR_FIT = 30
DEMAND_WEIGHT = FIT_WEIGHT = 0.5
PAGE = 100
LIMITATIONS = [
    "Demand is dated posting records with a reviewed link to each qualification: a rough signal, not a forecast.",
    "Fit comes from the skills and qualifications given: a starting point, not an assessment of the learner.",
]


def _posting_counts(session: Session, region_code: str | None) -> dict[str, int]:
    counts, offset = {}, 0
    while True:
        page = area_qualifications.discover(session, region_code, limit=PAGE, offset=offset)
        counts |= {item.qualification_code: item.observed_posting_count or 0 for item in page.items}
        offset += PAGE
        if offset >= page.total:
            return counts


def _folded(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.casefold()).strip()


def suggest(session: Session, request: NearbySuggestionRequest, embedder: Embedder | None) -> NearbySuggestions:
    region = session.get(Region, request.region_code)
    if region is None:
        raise InvalidRequestError("Unknown region.")
    region_count = len(session.exec(select(Region.code)).all())
    here, everywhere = _posting_counts(session, region.code), _posting_counts(session, None)
    items = {item.code: item for item in catalog.snapshot(session).items}

    wanted = {_folded(text) for text in request.held}
    held = {code for code, item in items.items() if _folded(code) in wanted or _folded(item.summary.name) in wanted}
    held_sectors = {items[code].sector: items[code].summary.name for code in held}

    candidates = []
    for code, postings in here.items():
        if code in held or code not in items or not postings:
            continue
        level = demand_level(postings, everywhere.get(code, postings), region_count)
        if level in IN_DEMAND:
            candidates.append((items[code], postings, level))
    if not candidates:
        return _result(region, [])

    skills = {}
    if request.skills:
        _, matches = analysis.suggest(session, Profile(existing_skills=request.skills), embedder, len(items))
        skills = {match.qualification.code: match for match in matches}

    busiest = max(postings for _, postings, _ in candidates)
    ranked = []
    for item, postings, level in candidates:
        match = skills.get(item.code)
        sector = held_sectors.get(item.sector)
        fit = min(100, (match.score if match else 0) + (SECTOR_FIT if sector else 0))
        reasons = [f"{postings:,} posting record{'' if postings == 1 else 's'} in {region.name}: "
                   f"{level} demand here."]
        if match:
            reasons.append(_skill_reason(match.reason))
        if sector:
            reasons.append(f"Same sector as {sector}: {item.sector}.")
        score = DEMAND_WEIGHT * postings / busiest + FIT_WEIGHT * fit / 100
        ranked.append((score, NearbySuggestion(qualification=item.summary, posting_count=postings, level=level,
                                               limited=postings < MIN_RECORDS, fit=fit, reasons=reasons)))
    ranked.sort(key=lambda pair: (-pair[0], pair[1].qualification.name))
    return _result(region, [suggestion for _, suggestion in ranked[:request.limit]])


def _skill_reason(reason: str) -> str:
    # The matcher speaks of "your words"; here the words are the learner's skills.
    return reason.replace("Matched your words", "Fits your skills").replace("From your TSP profile", "Fits your skills")


def _result(region: Region, suggestions: list[NearbySuggestion]) -> NearbySuggestions:
    return NearbySuggestions(region_code=region.code, region_name=region.name, suggestions=suggestions,
                             limitations=LIMITATIONS)
