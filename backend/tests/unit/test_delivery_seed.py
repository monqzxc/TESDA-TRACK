"""Validation checks for the deterministic delivery-site fixture."""
import json
from math import asin, cos, radians, sin, sqrt
from pathlib import Path

import pytest

from tesda_track.seed import SeedError, parse_delivery_sites


SEED_DIR = Path(__file__).resolve().parents[2] / "seed"


def test_delivery_fixture_is_coordinate_complete_and_catalog_linked():
    raw = json.loads((SEED_DIR / "delivery_sites.json").read_text(encoding="utf-8"))
    entries = parse_delivery_sites(raw)
    codes = {item["code"] for item in json.loads((SEED_DIR / "qualifications.json").read_text(encoding="utf-8"))}
    assert len(entries) == 16
    assert all(entry.provider.name.startswith("[Seed]") for entry in entries)
    assert all(entry.provider.latitude is not None and entry.provider.longitude is not None for entry in entries)
    assert all(offering.qualification_code in codes for entry in entries for offering in entry.offerings)


def test_delivery_fixture_rejects_unmarked_sites_and_duplicate_offerings():
    raw = json.loads((SEED_DIR / "delivery_sites.json").read_text(encoding="utf-8"))
    raw["sites"][0]["provider"]["name"] = "Unverified provider"
    with pytest.raises(SeedError, match="start with"):
        parse_delivery_sites(raw)

    raw = json.loads((SEED_DIR / "delivery_sites.json").read_text(encoding="utf-8"))
    raw["sites"][0]["offerings"].append(raw["sites"][0]["offerings"][0])
    with pytest.raises(SeedError, match="only once"):
        parse_delivery_sites(raw)


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    a = sin(radians(lat2 - lat1) / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * asin(sqrt(a))


def test_fixture_has_housekeeping_sites_near_between_and_beyond_quezon_city():
    """The map-first page's demo examples: near, between and beyond 25 and 100 km of Quezon City (14.65, 121.05)."""
    entries = parse_delivery_sites(json.loads((SEED_DIR / "delivery_sites.json").read_text(encoding="utf-8")))
    housekeeping = [entry for entry in entries
                    if any(o.qualification_code == "HOUSEKEEPING-NC-II" for o in entry.offerings)]
    distances = [_km(14.65, 121.05, entry.provider.latitude, entry.provider.longitude) for entry in housekeeping]
    assert sum(km <= 25 for km in distances) >= 6
    assert sum(25 < km <= 100 for km in distances) >= 2
    assert sum(km > 100 for km in distances) >= 2
    assert all(entry.provider.province and entry.provider.city for entry in housekeeping)
    for code, least in (("FBS-NC-II", 5), ("COOKERY-NC-II", 4), ("DRIVING-NC-III", 3)):
        assert sum(any(o.qualification_code == code for o in entry.offerings) for entry in housekeeping) >= least
    for entry in entries:
        if any(o.qualification_code == "DRIVING-NC-III" for o in entry.offerings):
            for site in (entry.provider, entry.assessment_center):
                assert _km(14.65, 121.05, site.latitude, site.longitude) > 25, site.name
