"""Validation checks for the deterministic delivery-site fixture."""
import json
from pathlib import Path

import pytest

from tesda_track.seed import SeedError, parse_delivery_sites


SEED_DIR = Path(__file__).resolve().parents[2] / "seed"


def test_delivery_fixture_is_coordinate_complete_and_catalog_linked():
    raw = json.loads((SEED_DIR / "delivery_sites.json").read_text(encoding="utf-8"))
    entries = parse_delivery_sites(raw)
    codes = {item["code"] for item in json.loads((SEED_DIR / "qualifications.json").read_text(encoding="utf-8"))}
    assert len(entries) == 6
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
