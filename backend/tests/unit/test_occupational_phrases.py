import pytest

from tesda_track.schemas.learner_assessments import AssessmentAnswers
from tesda_track.services.analysis import structured_matches
from tesda_track.services.personalization import matches_term
from training.catalog import load_catalog


@pytest.fixture(scope="module")
def catalog_items():
    return load_catalog()[1]


@pytest.mark.parametrize("goal,code", [
    ("I would like to provide senior care", "CAREGIVING-NC-II-2"),
    ("Looking for solar installation training", "PV-SYSTEMS-INSTALLATION-NC-II"),
    ("Interested in a call centre career", "CONTACT-CENTER-SERVICES-NC-II"),
    ("I enjoy pastry making", "FOOD-PRODUCTION-NC-II"),
])
def test_occupational_phrases_match_the_catalog(goal, code, catalog_items):
    result = structured_matches(catalog_items, AssessmentAnswers(career_goal=goal))
    assert result[0].qualification.code == code


@pytest.mark.parametrize("goal", ["I don't want solar panels", "I am not interested in a call center",
                                      "I don't want to provide senior care", "I dislike pastry making"])
def test_negated_phrases_are_not_positive_evidence(goal, catalog_items):
    assert not any(matches_term(goal, item.rules) for item in catalog_items)
