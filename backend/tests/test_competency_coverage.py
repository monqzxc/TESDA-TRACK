"""CORE-unit coverage and the next step it decides (services/competency_coverage)."""
import pytest

from tesda_track.services.competency_coverage import (ASSESS_AT, GAP_AT, Coverage, core_units, coverage, for_profile,
                                                      next_step, title_key)
from tesda_track.services.tsp_profile import NormalizedProfile, Unit

COOKERY_CORE = ["Clean and maintain kitchen premises", "Prepare stocks, sauces and soups", "Prepare appetizers",
                "Prepare salads and dressing", "Prepare sandwiches", "Prepare meat dishes",
                "Prepare vegetables dishes", "Prepare egg dishes", "Prepare starch dishes",
                "Prepare poultry and game dish(es"]
RULES = {"competencies": [{"name": "Work in a team environment", "category": "Basic"},
                          {"name": "Develop and update industry knowledge", "category": "Common"},
                          *({"name": name, "category": "Core"} for name in COOKERY_CORE)]}


def unit(title, status="active", kind="CORE"):
    return Unit(code=None, title=title, type=kind, sources=("X",), status=status)


@pytest.mark.parametrize("ours, theirs", [
    ("Prepare poultry and game dish(es", "PREPARE POULTRY AND GAME DISHES"),
    ("Prepare stocks, sauces and soups", "prepare stock, sauce & soup"),
    ("Prepare vegetables dishes", "Prepare vegetable dishes"),
    ("Install wiring devices", "Install  wiring   devices."),
])
def test_titles_match_across_case_punctuation_and_plurals(ours, theirs):
    assert title_key(ours) == title_key(theirs)


@pytest.mark.parametrize("ours, theirs", [
    ("Prepare meat dishes", "Prepare egg dishes"),
    ("Prepare sandwiches", "Prepare sandwiches and wraps"),  # a different unit, not a near match
])
def test_different_units_never_match(ours, theirs):
    assert title_key(ours) != title_key(theirs)


def test_only_core_units_are_counted():
    assert core_units(RULES) == COOKERY_CORE


def test_coverage_splits_core_units_and_flags_expired_ones():
    found = coverage(COOKERY_CORE, [unit("CLEAN AND MAINTAIN KITCHEN PREMISES"),
                                    unit("Prepare appetizers", status="expired"),
                                    unit("Work in a team environment", kind="BASIC")])
    assert found.covered == ("Clean and maintain kitchen premises", "Prepare appetizers")
    assert found.expired == ("Prepare appetizers",)
    assert len(found.missing) == 8 and found.share == pytest.approx(0.2)


def test_a_unit_valid_on_any_certificate_is_not_expired():
    found = coverage(COOKERY_CORE, [unit("Prepare appetizers", "expired"), unit("PREPARE APPETIZERS", "active")])
    assert found.expired == ()


def test_nothing_to_compare_is_none():
    assert coverage(COOKERY_CORE, []) is None
    assert coverage([], [unit("Prepare appetizers")]) is None


def shares(n_covered, total=10):
    return Coverage(tuple(f"u{i}" for i in range(n_covered)), tuple(f"m{i}" for i in range(total - n_covered)), ())


@pytest.mark.parametrize("covered, step", [(10, "assessment"), (7, "assessment"), (6, "gap_training"),
                                           (3, "gap_training"), (2, "training"), (0, "training")])
def test_thresholds(covered, step):
    assert (ASSESS_AT, GAP_AT) == (0.7, 0.3)
    assert next_step(None, shares(covered)) == step


def test_held_and_renew_win_and_no_units_means_training():
    assert next_step("held", shares(0)) == "held"
    assert next_step("renew", shares(10)) == "renew"
    assert next_step(None, None) == "training"


def test_for_profile_keeps_only_qualifications_with_a_covered_unit():
    profile = NormalizedProfile(units=(unit("Prepare appetizers"),))
    found = for_profile(profile, {"COOKERY-NC-II": RULES, "OTHER": {"competencies": [
        {"name": "Weld carbon steel plates", "category": "Core"}]}})
    assert set(found) == {"COOKERY-NC-II"}
    assert for_profile(NormalizedProfile(skills=("cooking",)), {"COOKERY-NC-II": RULES}) == {}
