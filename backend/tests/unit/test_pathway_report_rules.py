"""Database-free checks of the pathway report's rules. Run with --confcutdir=backend/tests/unit."""
import pytest

from tesda_track.schemas.analysis import ReadinessResult
from tesda_track.services.pathway_report import Unit, advise, band, listing, lower_first, priority, readiness_kind

NAME, SECTOR, JOBS = "Bread and Pastry Production NC II", "Processed Food and Beverages", ["Baker", "Pastry Cook"]


@pytest.mark.parametrize("category, status, expected", [
    ("Core", "not_familiar", "high"), ("Core", "some_experience", "medium"),
    ("Common", "not_familiar", "medium"), ("Common", "some_experience", "low"),
    ("Basic", "not_familiar", "medium"), ("Basic", "some_experience", "low"),
    ("Elective", "not_familiar", "medium"), ("Core", "confident", "low")])
def test_priority_weighs_the_unit_category_and_the_answer(category, status, expected):
    assert priority(category, status) == expected


def units(*rows):
    return [Unit(id=i, position=i, name=name, category=category, status=status)
            for i, (name, category, status) in enumerate(rows, start=1)]


def test_gaps_are_ordered_by_priority_then_category_then_catalog_order():
    learner = units(("Lead workplace communication", "Basic", "not_familiar"),
                    ("Apply food safety and sanitation", "Common", "not_familiar"),
                    ("Prepare and produce bakery products", "Core", "some_experience"),
                    ("Prepare and present gateaux", "Core", "not_familiar"),
                    ("Develop and update industry knowledge", "Common", "some_experience"),
                    ("Prepare and produce pastry products", "Core", "confident"))
    improve, essential = advise(learner, NAME, SECTOR, JOBS, show_confident_core=False)

    assert [(a.name, a.priority) for a in improve] == [
        ("Prepare and present gateaux", "high"),
        ("Prepare and produce bakery products", "medium"),
        ("Apply food safety and sanitation", "medium"),
        ("Lead workplace communication", "medium"),
        ("Develop and update industry knowledge", "low")]
    # The low-priority gap stays among skills to improve but isn't essential.
    assert [a.name for a in essential] == [a.name for a in improve[:4]]
    assert "Prepare and produce pastry products" not in {a.name for a in improve + essential}


def test_must_learn_needs_a_listed_unit_the_learner_reports_not_knowing():
    learner = units(("Prepare and present gateaux", "Core", "not_familiar"),
                    ("Prepare and produce bakery products", "Core", "some_experience"),
                    ("Prepare and produce pastry products", "Core", "confident"))
    improve, essential = advise(learner, NAME, SECTOR, JOBS, show_confident_core=True)

    by_name = {a.name: a for a in essential}
    learn, practice, show = (by_name[u.name] for u in learner)
    assert (learn.must_learn, learn.basis, learn.action) == (True, "required_unit", "learn")
    assert (practice.must_learn, practice.basis, practice.action) == (False, "reported_gap", "practice")
    assert (show.must_learn, show.basis, show.action, show.priority) == (
        False, "general_recommendation", "demonstrate", "low")
    assert learn.what_to_do == "Learn to prepare and present gateaux."
    assert "Baker and Pastry Cook" in learn.relevance and SECTOR not in learn.relevance
    assert learn.evidence[-1] == "You answered “I am not familiar with this”."


def test_shared_units_explain_their_sector():
    [common], _ = advise(units(("Apply food safety and sanitation", "Common", "some_experience")), NAME, SECTOR, JOBS,
                         show_confident_core=False)
    assert "shared by qualifications in the Processed Food and Beverages sector" in common.why_it_matters
    assert common.activities[0] == "Review what the unit covers and apply it in your daily work."


@pytest.mark.parametrize("level, score, expected", [("High Readiness", 90, "high"), ("Moderate Readiness", 60, "moderate"),
                                                    ("Low Readiness", 10, "low"), ("Unrated", 85, "high"),
                                                    ("", 49.9, "low")])
def test_the_band_follows_the_level_then_the_score(level, score, expected):
    assert band(ReadinessResult(score=score, level=level, strengths=[], skill_gaps=[], recommendation="")) == expected


def test_readiness_picks_the_pathway_and_the_route_stands_in_without_it():
    assert readiness_kind("high", "TRAINING_AND_ASSESSMENT") == "direct_assessment"
    assert readiness_kind(None, "SKILL_GAP_CHECK") == "focused_training"
    assert readiness_kind(None, "ADDITIONAL_QUESTIONS") is None


def test_wording_helpers():
    assert listing([]) == "" and listing(["A"]) == "A" and listing(["A", "B"]) == "A and B"
    assert listing(["A", "B", "C"]) == "A, B and C" and listing(["A", "B", "C", "D", "E"]) == "A, B, C and 2 more"
    assert lower_first("Perform fillet welding") == "perform fillet welding"
    assert lower_first("OHS procedures") == "OHS procedures"
