"""Other provinces where a learner's qualifications are in demand (services/elsewhere_demand, GET /elsewhere)."""
from datetime import date

import pytest
from sqlmodel import select

from tesda_track.models import Qualification, Region
from tesda_track.models.delivery import TrainingProvider
from tesda_track.models.labor_market import LaborMarketEvidence as Evidence, LaborMarketMapping as Mapping
from tesda_track.schemas.profile_fit import PersonalFit
from tesda_track.services import elsewhere_demand, profile_fit
from tests.test_area_jobs import seed
from tests.test_profile_fit import HOLDS_COOKERY, link, passport

ELSEWHERE = "/api/v1/labor-market/elsewhere"


@pytest.fixture(autouse=True)
def fresh_cache():
    profile_fit.clear_cache()
    yield
    profile_fit.clear_cache()


def postings(session, locality, region, title, code, count):
    qualification = session.exec(select(Qualification).where(Qualification.code == code)).one()
    for n in range(count):
        key = f"{locality}-{title}-{n}".replace(" ", "").replace(",", "")
        seed(session, key, title=title, region=region, locality=locality)
        evidence = session.exec(select(Evidence).where(Evidence.occurrence_key == key)).one()
        session.add(Mapping(mapping_key=key + ":link", evidence_id=evidence.id, qualification_id=qualification.id,
                            proposal="high_confidence", decision="approved"))
    session.flush()


@pytest.fixture
def market(session):
    postings(session, "CITY OF MAKATI, NCR, FOURTH DISTRICT", "NCR", "Cook", "COOKERY-NC-II", 4)
    postings(session, "QUEZON CITY, NCR, SECOND DISTRICT", "NCR", "Cook", "COOKERY-NC-II", 2)  # 6 in Metro Manila
    postings(session, "CEBU CITY, CEBU", "VII", "Cook", "COOKERY-NC-II", 5)
    postings(session, "ILOILO CITY, ILOILO", "VI", "Line Cook", "COOKERY-NC-II", 3)
    postings(session, "TAGBILARAN CITY, BOHOL", "VII", "Waiter", "FBS-NC-II", 6)
    postings(session, "CALAMBA CITY, LAGUNA", "IV-A", "Cook", "COOKERY-NC-II", 2)  # under 3: never listed
    postings(session, "ANGELES CITY, PAMPANGA", "III", "Welder", "SMAW-NC-II", 9)
    session.add(TrainingProvider(name="Cebu Cookery School", region_code="VII", province="CEBU",
                                 latitude=10.0, longitude=124.0))
    session.add(TrainingProvider(name="Cebu Hotel School", region_code="VII", province="Cebu",
                                 latitude=10.4, longitude=123.8))
    session.flush()


def fit(**scores):
    return profile_fit.ProfileFit({code.replace("_", "-"): PersonalFit(score=score) for code, score in scores.items()})


def test_provinces_rank_by_fit_weighted_postings(session, market):
    result = elsewhere_demand.find(session, fit=fit(COOKERY_NC_II=90, FBS_NC_II=30), limit=5)
    # Cebu 5 x 0.9, Metro Manila 6 x 0.9, Iloilo 3 x 0.9, Bohol 6 x 0.3: more postings, weaker fit.
    assert [item.province for item in result.items] == ["Metro Manila", "Cebu", "Iloilo", "Bohol"]
    assert result.personalized and result.ordering == "profile_fit"
    manila = result.items[0]
    assert manila.posting_count == 6 and manila.region_code == "NCR" and manila.titles == ["Cook"]
    assert [(q.code, q.posting_count) for q in manila.qualifications] == [("COOKERY-NC-II", 6)]
    assert result.snapshot_dates == [date.today()] and manila.observed_on == date.today()


def test_own_province_and_thin_provinces_are_left_out(session, market):
    result = elsewhere_demand.find(session, exclude_province="METRO MANILA", fit=fit(COOKERY_NC_II=90), limit=10)
    names = [item.province for item in result.items]
    assert names == ["Cebu", "Iloilo"]  # no Metro Manila (excluded), no Laguna (2 postings), no Pampanga (no fit)
    assert result.exclude_province == "Metro Manila"
    assert all(item.posting_count >= elsewhere_demand.MIN_POSTINGS for item in result.items)


def test_point_is_the_mean_of_the_province_centers_else_the_region(session, market):
    cebu, iloilo = elsewhere_demand.find(session, exclude_province="Metro Manila", fit=fit(COOKERY_NC_II=90)).items
    assert cebu.location_basis == "centers"
    assert cebu.latitude == pytest.approx(10.2) and cebu.longitude == pytest.approx(123.9)
    region = session.get(Region, "VI")
    assert iloilo.location_basis == "region" and (iloilo.latitude, iloilo.longitude) == (region.latitude, region.longitude)
    assert iloilo.region_name == region.name


def test_nothing_fits_or_nothing_asked_is_empty(session, market):
    assert elsewhere_demand.find(session, fit=fit()).items == []
    assert elsewhere_demand.find(session).items == []
    assert elsewhere_demand.find(session, qualification_codes=["NO-SUCH-CODE"]).items == []


def test_guest_ranks_by_the_searched_qualifications(client, market):
    response = client.get(ELSEWHERE, params={"qualification_code": ["SMAW-NC-II", "COOKERY-NC-II"],
                                             "exclude_province": "Cebu"})
    assert response.status_code == 200, response.text
    assert "cache-control" not in response.headers
    body = response.json()
    assert not body["personalized"] and body["ordering"] == "posting_count"
    assert [item["province"] for item in body["items"]] == ["Pampanga", "Metro Manila", "Iloilo"]
    pampanga = body["items"][0]
    assert pampanga["posting_count"] == 9 and pampanga["reasons"] == []
    assert pampanga["qualifications"][0]["code"] == "SMAW-NC-II" and pampanga["region_name"]
    assert client.get(ELSEWHERE).json()["items"] == []


def test_guest_input_is_bounded(client):
    assert client.get(ELSEWHERE, params={"qualification_code": [f"Q{n}" for n in range(6)]}).status_code == 422
    assert client.get(ELSEWHERE, params={"qualification_code": ["x" * 41]}).status_code == 422
    assert client.get(ELSEWHERE, params={"limit": 0}).status_code == 422
    assert client.get(ELSEWHERE, params={"exclude_province": "x" * 101}).status_code == 422


def test_signed_in_uses_the_skill_passport_privately(session, client, learner, market):
    link(session, "juan@example.com", passport(skills=(), certificates=[HOLDS_COOKERY]))
    response = client.get(ELSEWHERE, params={"personalize": True, "exclude_province": "Metro Manila",
                                             "qualification_code": "SMAW-NC-II"}, headers=learner)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "private, no-store"
    body = response.json()
    assert body["personalized"]
    names = [item["province"] for item in body["items"]]
    assert names[:2] == ["Cebu", "Iloilo"] and "Pampanga" not in names  # the profile, not the guest codes
    assert body["items"][0]["reasons"][0] == {"kind": "held", "terms": [], "qualification": "Cookery NC II",
                                              "sector": None}


def test_signed_in_with_nothing_that_fits_is_empty(session, client, learner, market):
    link(session, "juan@example.com", passport(skills=("zzqx",)))
    body = client.get(ELSEWHERE, params={"personalize": True}, headers=learner).json()
    assert body["personalized"] and body["items"] == []
