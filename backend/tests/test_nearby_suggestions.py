"""Card 4: other qualifications in demand near the learner, ranked by demand and fit to their skills."""
import pytest
from sqlmodel import select

from tesda_track.models import Qualification
from tesda_track.models.labor_market import LaborMarketEvidence as Evidence, LaborMarketMapping as Mapping
from tesda_track.schemas.nearby_suggestions import NearbySuggestionRequest
from tesda_track.services import nearby_suggestions
from tests.test_area_jobs import seed

URL = "/api/v1/labor-market/suggestions"


def postings(session, region, code, count):
    qualification = session.exec(select(Qualification).where(Qualification.code == code)).one()
    for n in range(count):
        key = f"{region}-{code}-{n}"
        seed(session, key, region=region, locality=f"Somewhere, {region}")
        evidence = session.exec(select(Evidence).where(Evidence.occurrence_key == key)).one()
        session.add(Mapping(mapping_key=key + ":link", evidence_id=evidence.id, qualification_id=qualification.id,
                            proposal="high_confidence", decision="approved"))
    session.flush()


@pytest.fixture
def market(session):
    # Metro Manila: cookery and food service. Cebu: welding, and one cookery record.
    postings(session, "NCR", "COOKERY-NC-II", 6)
    postings(session, "NCR", "FBS-NC-II", 4)
    postings(session, "VII", "SMAW-NC-II", 39)
    postings(session, "VII", "COOKERY-NC-II", 1)
    postings(session, "NCR", "SMAW-NC-II", 1)  # 1 of 40 welding records: low demand in Manila


def suggest(session, region, skills=(), held=(), limit=3):
    request = NearbySuggestionRequest(region_code=region, skills=list(skills), held=list(held), limit=limit)
    return nearby_suggestions.suggest(session, request, None)


def codes(result):
    return [s.qualification.code for s in result.suggestions]


def test_skills_lift_the_qualification_they_fit(session, market):
    assert codes(suggest(session, "NCR", ["cooking"]))[0] == "COOKERY-NC-II"
    waiter = suggest(session, "NCR", ["waiter"])
    assert codes(waiter)[0] == "FBS-NC-II"
    assert waiter.suggestions[0].fit > 0 and any("Fits your skills" in r for r in waiter.suggestions[0].reasons)


def test_suggestions_change_with_the_learners_region(session, market):
    assert codes(suggest(session, "VII", ["welding"]))[0] == "SMAW-NC-II"
    assert "SMAW-NC-II" not in codes(suggest(session, "NCR", ["welding"]))  # low demand there


def test_a_chosen_or_held_qualification_is_never_suggested_and_its_sector_counts(session, market):
    result = suggest(session, "NCR", ["cooking"], held=["Cookery NC II"])
    assert "COOKERY-NC-II" not in codes(result)
    food = result.suggestions[0]
    assert food.qualification.code == "FBS-NC-II"
    assert "Same sector as Cookery NC II: Tourism." in food.reasons
    assert "COOKERY-NC-II" not in codes(suggest(session, "NCR", held=["cookery-nc-ii"]))


def test_every_suggestion_says_why_with_the_demand_first(session, market):
    for suggestion in suggest(session, "NCR", ["cooking"]).suggestions:
        assert suggestion.level in ("high", "moderate")
        assert suggestion.reasons[0].startswith(f"{suggestion.posting_count:,} posting record")
        assert "in National Capital Region" in suggestion.reasons[0]


def test_without_skills_it_ranks_by_demand_alone(session, market):
    result = suggest(session, "NCR")
    assert codes(result) == ["COOKERY-NC-II", "FBS-NC-II"]
    assert all(s.fit == 0 and len(s.reasons) == 1 for s in result.suggestions)


def test_a_few_records_are_marked_as_a_rough_signal(session, market):
    cebu_cookery = next(s for s in suggest(session, "VII", ["cooking"]).suggestions
                        if s.qualification.code == "COOKERY-NC-II")
    assert cebu_cookery.limited is True


def test_nothing_in_demand_nearby_is_an_empty_list(session, market):
    assert suggest(session, "XI", ["cooking"]).suggestions == []


def test_the_endpoint_takes_skills_in_the_body_and_needs_no_sign_in(client, session, market):
    response = client.post(URL, json={"region_code": "NCR", "skills": ["waiter"], "held": [], "limit": 2})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["region_name"] == "National Capital Region" and len(body["suggestions"]) <= 2
    assert body["suggestions"][0]["qualification"]["code"] == "FBS-NC-II"
    assert client.post(URL, json={"region_code": "Atlantis"}).status_code == 422
    assert client.get(URL).status_code == 405
