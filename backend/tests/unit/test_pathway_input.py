"""Unified submission selects a strategy, while legacy requests retain their contracts."""

import pytest

from tesda_track.schemas.analysis import (
    GoalAnalysis,
    GoalRequest,
    MatchRequest,
    Profile,
)
from tesda_track.services.pathway_input import matching_mode, demand_preference


@pytest.mark.parametrize(
    "query, expected",
    [
        ("I want to become an electrician.", "goal"),
        ("Welder", "skills"),
        ("Welding", "skills"),
        ("Welding, blueprint reading", "skills"),
        ("I have 3 years of welding experience.", "goal"),
        ("I do not want welding; I want cooking.", "goal"),
        ("gusto kong maging karpintero", "goal"),
        ("Food and beverage attendant", "skills"),
    ],
)
def test_matching_strategy_keeps_context_and_negation(query, expected):
    assert matching_mode(query) == expected


def test_existing_requests_and_response_shapes_are_unchanged():
    assert not GoalRequest(query="Welder").interpret_input
    assert MatchRequest(query="Welder", profile=Profile()).mode == "goal"
    assert (
        "matching_mode"
        not in GoalAnalysis(profile=Profile(), source="rules").model_dump()
    )


@pytest.mark.parametrize(
    "query, expected",
    [
        ("Web developer", None),
        ("Suggest qualifications relevant to in-demand jobs in my area", "in_demand"),
        ("hard-to-fill jobs", "hard_to_fill"),
        ("in-demand and hard-to-fill jobs", "either"),
        ("I don’t want in-demand jobs. I want cooking.", None),
        ("I'm not interested in in-demand jobs. I want welding.", None),
        ("gusto ko ng indemand na trabaho", "in_demand"),
    ],
)
def test_demand_is_explicit_and_preserves_negation(query, expected):
    assert demand_preference(query) == expected


def test_demand_subject_preserves_trade_words_in_region_names():
    from types import SimpleNamespace
    from tesda_track.services.demand_discovery import subject

    regions = [SimpleNamespace(name="Cordillera Administrative Region", code="CAR")]
    assert (
        subject("in-demand administrative jobs in Region CAR", regions)
        == "administrative"
    )
