"""Explicit forecast discovery. Generic requests have no fabricated personal-fit score."""

import re
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import or_
from sqlmodel import select
from tesda_track.models import Qualification, Region
from tesda_track.models.labor_market import (
    LaborMarketDataset as Dataset,
    LaborMarketEvidence as Evidence,
    LaborMarketMapping as Mapping,
)
from tesda_track.schemas.analysis import Match
from tesda_track.errors import InvalidRequestError
from tesda_track.services import goal_rules, pathway_input


def eligible(session, query, region_code=None):
    regions = session.exec(select(Region)).all()
    if region_code and not any(r.code == region_code for r in regions):
        raise InvalidRequestError("Unknown region.")
    if not region_code:
        lower = query.casefold()
        region_code = next(
            (
                r.code
                for r in regions
                if r.name.casefold() in lower
                or re.search(r"\bregion\s+" + re.escape(r.code) + r"\b", query, re.I)
            ),
            None,
        )
        if re.search(r"\b(?:ncr|metro manila)\b", lower):
            region_code = "NCR"
    year = datetime.now(ZoneInfo("Asia/Manila")).year
    years = [int(n) for n in re.findall(r"\b20\d{2}\b", query)]
    if years and year not in years:
        return [], regions
    preference = pathway_input.demand_preference(query)
    statement = (
        select(Evidence, Dataset, Qualification)
        .join(Mapping, Mapping.evidence_id == Evidence.id)
        .join(Dataset, Evidence.dataset_id == Dataset.id)
        .join(Qualification, Mapping.qualification_id == Qualification.id)
        .where(
            Qualification.is_active == True,
            Mapping.decision == "approved",
            Mapping.proposal == "high_confidence",
            Dataset.status == "active",
            Dataset.evidence_class.in_(["national_forecast", "regional_forecast"]),
            Dataset.period_start_year <= year,
            Dataset.period_end_year >= year,
            Evidence.classification == "in_demand",
            (
                or_(
                    Evidence.geographic_scope == "national",
                    Evidence.region_code == region_code,
                )
                if region_code
                else Evidence.geographic_scope == "national"
            ),
        )
    )
    if preference in ["in_demand", "hard_to_fill"]:
        statement = statement.where(Evidence.classification == preference)
    return session.exec(statement).all(), regions


def subject(query, regions):
    """Remove the request envelope, retaining trade words and existing negation behavior."""
    query = goal_rules.strip_negated(query.replace("’", "'"))
    # Remove complete place names, preserving trade words such as "administrative".
    for region in regions:
        for place in (region.name, "Region " + region.code):
            query = re.sub(r"\b" + re.escape(place) + r"\b", " ", query, flags=re.I)
    query = re.sub(
        r"\b(?:in[\s-]?demand|hard[\s-]+to[\s-]+fill|mataas\s+na\s+demand)\b",
        " ",
        query,
        flags=re.I,
    )
    stop = (
        goal_rules.FILLER_WORDS
        | goal_rules.GENERIC_WORDS
        | set(
            """suggest suggest me recommendations recommend recommended qualifications qualification related relevant demand area region location lugar rehiyon taon year current currently this available linked high highest employment job-market national philippines ph thisyear show list metro manila ncr""".split()
        )
    )
    return " ".join(
        word
        for word in re.findall(r"\w+", query)
        if word.casefold() not in stop and not word.isdigit()
    )


def discover(
    session, current, query, profile, embedder, params, region_code=None, limit=5
):
    from tesda_track.services import skill_search, labor_market

    rows, regions = eligible(session, query, region_code)
    codes = {q.code for _, _, q in rows}
    items = [item for item in current.items if item.code in codes]
    title = subject(query, regions)
    if not items:
        return [], [], {}
    if title:
        found = skill_search.search(
            session,
            current.items,
            labor_market.matching_rule_views(session, current.rule_views),
            title,
            embedder,
            params,
            limit=len(current.items),
        )
        return (
            [m for m in found.matches if m.qualification.code in codes][:limit],
            sorted(codes),
            found.keyword,
        )
    by_code = {item.code: item for item in items}
    # This is a directory of supported pathways, not a ranked personal-fit prediction.
    matches = []
    for code in sorted(codes, key=lambda c: (by_code[c].summary.name.casefold(), c))[
        :limit
    ]:
        related = [(e, d, q) for e, d, q in rows if q.code == code]
        labels = sorted(
            {
                f'{e.occupation_title} ({"Philippines — National" if e.geographic_scope=="national" else next(r.name for r in regions if r.code==e.region_code)}; {d.period_label})'
                for e, d, q in related
            }
        )
        matches.append(
            Match(
                qualification=by_code[code].summary,
                score=0,
                basis="demand_evidence",
                components=None,
                reason="Training pathway linked to approved forecast occupations: "
                + "; ".join(labels[:3])
                + ".",
            )
        )
    return matches, sorted(codes), {}
