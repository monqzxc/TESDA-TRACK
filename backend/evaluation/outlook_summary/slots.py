"""What a writer is given, and how its words become the summary.

A model never writes a figure. It is told the situation in words and given named slots; it answers with a template
such as "You are in {area} ... {demand} are here, and {supply}." and this module fills the slots from the counts. A
figure the model types itself has nowhere to come from, and is a failure (criteria.py).
"""
import re

SLOT = re.compile(r"\{([a-z_]+)\}")


def _count(n: int, noun: str) -> str:
    return f"{n:,} {noun}{'' if n == 1 else 's'}"


def _percent(share: float | None) -> str:
    if not share:
        return "0%"
    return "less than 1%" if share < 0.005 else f"{round(share * 100)}%"


def _listed(names: list[str]) -> str:
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"


def facts(outlook: dict) -> dict:
    """The case in the terms a writer needs: the situation in words, and each slot's text."""
    areas = {area["region_code"]: area for area in outlook["areas"]}
    area, home = areas.get(outlook["region_code"]), areas.get(outlook["home_region_code"])
    totals = outlook["totals"]
    postings, sites = totals["posting_count"], totals["training_sites"] + totals["assessment_sites"]
    name = outlook["qualification"]["name"]
    slots = {"qualification": name}
    if area:
        here, centers = area["posting_count"], area["training_sites"] + area["assessment_sites"]
        slots["area"] = area["name"]
        slots["demand"] = (
            f"{here:,} of the {_count(postings, 'posting record')} nationwide ({_percent(area['demand_share'])})" if here
            else f"none of the {_count(postings, 'posting record')} nationwide" if postings
            else "no posting records in any region")
        slots["supply"] = (
            f"{centers:,} of its {_count(sites, 'recorded center')} ({_percent(area['supply_share'])})" if centers
            else f"none of its {_count(sites, 'recorded center')}" if sites else "no recorded center anywhere")
    else:
        slots["demand"] = (f"{_count(postings, 'posting record')} across {_count(totals['regions_with_postings'], 'region')}"
                           if postings else "no posting records in any region")
        slots["supply"] = (f"{_count(sites, 'recorded center')} across {_count(totals['regions_with_sites'], 'region')}"
                           if sites else "no recorded center anywhere")
    alternatives = [areas[code]["name"] for code in outlook["alternatives"]]
    if not outlook["relocate"]:
        alternatives = alternatives[:1]  # a learner staying put is told of one other region, once
    if alternatives:
        slots["alternatives"] = _listed(alternatives)
    ahead = [a["name"] for a in outlook["areas"] if a["balance"] in ("more_demand", "demand_only")][:3]
    crowded = [a["name"] for a in outlook["areas"] if a["balance"] == "more_supply"][:3]
    if area is None:
        if ahead:
            slots["ahead"] = _listed(ahead)
        if crowded:
            slots["crowded"] = _listed(crowded)
    thin = bool(area) and area["balance"] in ("more_supply", "supply_only", "no_records")
    return {
        "scope": "region" if area else "country",
        "balance": area["balance"] if area else None,
        "limited": bool(area and area["limited"]),
        "relocate": outlook["relocate"],
        "at_home": bool(area and home and area["region_code"] == home["region_code"]),
        # Where else to look is said to a learner who would relocate, and once to one staying in a thin area.
        "mention_alternatives": bool(alternatives) and (outlook["relocate"] or thin),
        "examples_counted": bool(outlook.get("includes_example_sites")) and sites > 0,
        "slots": slots,
    }


def fill(template: str, slots: dict[str, str]) -> tuple[str, list[str]]:
    """The template with its slots filled, and the names it used that don't exist."""
    unknown = [name for name in SLOT.findall(template) if name not in slots]
    return SLOT.sub(lambda match: slots.get(match.group(1), match.group(0)), template), unknown
