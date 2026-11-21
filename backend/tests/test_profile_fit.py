"""The Demand view personalized by the signed-in learner's Skill Passport (services/profile_fit)."""
from datetime import date

import pytest
from sqlmodel import select

from tesda_track.models import Learner, Qualification, utcnow
from tesda_track.models.identity import LearnerIdentity
from tesda_track.models.labor_market import LaborMarketEvidence as Evidence, LaborMarketMapping as Mapping
from tesda_track.services import catalog, profile_fit, tsp_profile
from tests.test_area_jobs import seed

TODAY = date(2026, 11, 18)
QUALIFICATIONS = "/api/v1/labor-market/qualifications"
JOBS = "/api/v1/labor-market/jobs"


def certificate(title, status, expires, core=()):
    return {"certificate_title": title, "certificate_type": "NC", "level": "II", "status": status,
            "expiration_date": expires, "issuance_date": "1st of May, 2021",
            "competencies": [{"unit_code": "B1", "type": "BASIC", "title": "Work in team environment"}]
                            + [{"unit_code": f"C{n}", "type": "CORE", "title": t} for n, t in enumerate(core)]}


def passport(skills=("waiter",), certificates=()):
    return {"skills": list(skills), "experience": [], "education": [], "qualifications": [],
            "credentials": {"certificates": list(certificates), "trainings": [], "assessments": [],
                            "external_certificates": []}}


HOLDS_COOKERY = certificate("Cookery NC II", "Active", "18th of July, 2031")


@pytest.fixture(autouse=True)
def fresh_cache():
    profile_fit.clear_cache()
    yield
    profile_fit.clear_cache()


def link(session, email, profile):
    learner = session.exec(select(Learner).where(Learner.email == email)).one()
    session.add(LearnerIdentity(provider="tsp", subject="sso-" + email, learner_id=learner.id, scopes=[],
                                profile=profile, linked_at=utcnow(), last_signed_in_at=utcnow()))
    session.flush()
    return learner


def postings(session, title, code, count, region="NCR"):
    qualification = session.exec(select(Qualification).where(Qualification.code == code)).one()
    for n in range(count):
        key = f"{title}-{code}-{n}".replace(" ", "")
        seed(session, key, title=title, region=region)
        evidence = session.exec(select(Evidence).where(Evidence.occurrence_key == key)).one()
        session.add(Mapping(mapping_key=key + ":link", evidence_id=evidence.id, qualification_id=qualification.id,
                            proposal="high_confidence", decision="approved"))
    session.flush()


@pytest.fixture
def market(session):
    postings(session, "Welder", "SMAW-NC-II", 9)
    postings(session, "Waiter", "FBS-NC-II", 2)
    postings(session, "Cook", "COOKERY-NC-II", 3)
    seed(session, "unlinked-driver", title="Driver")


def test_skill_fits_with_its_own_words_and_held_certificate_is_marked(session):
    fit = profile_fit.compute(session, passport(certificates=[HOLDS_COOKERY]), None, TODAY)
    waiter = fit.get("FBS-NC-II")
    assert waiter.score > 0 and waiter.status is None
    kinds = {reason.kind: reason for reason in waiter.reasons}
    assert kinds["skill"].terms == ["waiter"]
    assert kinds["sector"].qualification == "Cookery NC II"  # same sector (Tourism) as what they hold
    cookery = fit.get("COOKERY-NC-II")
    assert cookery.status == "held" and cookery.reasons[0].kind == "held"
    assert fit.get("SMAW-NC-II") is None


def test_an_expired_certificate_is_a_renewal(session):
    expired = certificate("Cookery NC II", "Expired", "14th of November, 2023")
    fit = profile_fit.compute(session, passport(skills=(), certificates=[expired]), None, TODAY)
    assert fit.get("COOKERY-NC-II").status == "renew"


def test_core_unit_titles_stay_whole_and_basic_units_are_left_out(session):
    held = certificate("Cookery NC II", "Active", "18th of July, 2031", core=["Prepare stocks, sauces and soups"])
    normalized = tsp_profile.normalize(passport(skills=["cooking"], certificates=[held]),
                                       profile_fit.code_book(session, catalog.snapshot(session)), TODAY)
    terms = profile_fit.evidence_terms(normalized)
    assert list(terms) == ["cooking", "Prepare stocks, sauces and soups"]
    assert terms["Prepare stocks, sauces and soups"] == ("unit", "COOKERY-NC-II")


def test_personalized_qualifications_put_the_fit_first_then_what_they_hold(session, client, learner, market):
    link(session, "juan@example.com", passport(certificates=[HOLDS_COOKERY]))
    response = client.get(QUALIFICATIONS, params={"region_code": "NCR", "personalize": True}, headers=learner)
    assert response.status_code == 200, response.text
    assert "no-store" in response.headers["cache-control"]
    body = response.json()
    assert body["personalized"] and body["ordering"] == "profile_fit"
    codes = [item["qualification_code"] for item in body["items"]]
    assert codes == ["FBS-NC-II", "COOKERY-NC-II", "SMAW-NC-II"]
    first = body["items"][0]["personal_fit"]
    assert first["reasons"][0] == {"kind": "skill", "terms": ["waiter"], "qualification": None, "sector": None}
    assert body["items"][2]["personal_fit"] is None
    assert body["limitations"][0].startswith("Ordered by how well your Skill Passport fits")


def test_personalize_without_a_passport_is_the_plain_directory(session, client, learner, market):
    signed_out = client.get(QUALIFICATIONS, params={"region_code": "NCR", "personalize": True}).json()
    unlinked = client.get(QUALIFICATIONS, params={"region_code": "NCR", "personalize": True}, headers=learner).json()
    plain = client.get(QUALIFICATIONS, params={"region_code": "NCR"}, headers=learner)
    for body in (signed_out, unlinked):
        assert not body["personalized"] and body["ordering"] == "qualification_name"
        assert all(item["personal_fit"] is None for item in body["items"])
    assert "cache-control" not in plain.headers


def test_personalized_jobs_rank_through_reviewed_links_only(session, client, learner, market):
    link(session, "juan@example.com", passport(certificates=[HOLDS_COOKERY]))
    body = client.get(JOBS, params={"region_code": "NCR", "personalize": True}, headers=learner).json()
    assert body["personalized"] and body["ordering"] == "profile_fit"
    titles = [job["title"] for job in body["items"]]
    # Cook: linked to the qualification they hold. Waiter: fits their skill. Then the rest by posting count, and a
    # title with no reviewed link never gets a fit, whatever its wording.
    assert titles == ["Cook", "Waiter", "Welder", "Driver"]
    cook, waiter = body["items"][0], body["items"][1]
    assert cook["linked_qualification"] == "Cookery NC II" and cook["personal_fit"]["status"] == "held"
    assert waiter["linked_qualification"] == "Food and Beverage Services NC II"
    assert waiter["personal_fit"]["reasons"][0]["terms"] == ["waiter"]
    assert body["items"][3]["personal_fit"] is None

    plain = client.get(JOBS, params={"region_code": "NCR"}, headers=learner).json()
    assert [job["title"] for job in plain["items"]][0] == "Welder" and not plain["personalized"]


def test_a_stale_sign_in_never_breaks_the_public_demand_lists(client, market):
    client.cookies.set("tesda_session", "not-a-valid-token", path="/api")
    for url in (QUALIFICATIONS, JOBS):
        for params in ({"region_code": "NCR"}, {"region_code": "NCR", "personalize": True}):
            response = client.get(url, params=params)
            assert response.status_code == 200, response.text
            assert not response.json()["personalized"]
    expired = client.get(JOBS, params={"personalize": True}, headers={"Authorization": "Bearer expired.token.here"})
    assert expired.status_code == 200 and not expired.json()["personalized"]


# The test catalog's five CORE units for Cookery NC II, written as TSP might (case, punctuation).
COOKERY_CORE = ["USE AND MAINTAIN KITCHEN EQUIPMENT", "Prepare ingredients and mise en place", "Prepare hot dishes",
                "Prepare salads & cold dishes", "Present and store prepared food safely."]


def coc(title, units, status="Active", expires="18th of July, 2031"):
    """A Certificate of Competency: some of a qualification's CORE units, under a title of its own."""
    return {**certificate(title, status, expires, core=units), "certificate_type": "COC"}


def test_core_units_on_certificates_decide_the_next_step(session):
    most = coc("Cookery COC 1", COOKERY_CORE[:4])           # 4 of 5
    fit = profile_fit.compute(session, passport(skills=(), certificates=[most]), None, TODAY).get("COOKERY-NC-II")
    assert fit.next_step == "assessment" and fit.status is None
    assert fit.coverage.share == pytest.approx(0.8)
    assert fit.coverage.missing == ["Present and store prepared food safely"]  # the catalog's own name
    assert fit.score >= 80  # never less than the share of CORE units shown

    some = coc("Cookery COC 1", COOKERY_CORE[:2])           # 2 of 5
    assert profile_fit.compute(session, passport(skills=(), certificates=[some]), None,
                               TODAY).get("COOKERY-NC-II").next_step == "gap_training"

    few = coc("Cookery COC 1", COOKERY_CORE[:1], status="Expired", expires="1st of May, 2022")
    fit = profile_fit.compute(session, passport(skills=(), certificates=[few]), None, TODAY).get("COOKERY-NC-II")
    assert fit.next_step == "training" and fit.coverage.expired == ["Use and maintain kitchen equipment"]


def test_skills_alone_never_count_as_coverage(session):
    fit = profile_fit.compute(session, passport(skills=("cooking", "prepare hot dishes")), None, TODAY)
    cookery = fit.get("COOKERY-NC-II")
    assert cookery is None or (cookery.coverage is None and cookery.next_step == "training")


def test_held_today_stays_held_whatever_the_coverage(session):
    held = certificate("Cookery NC II", "Active", "18th of July, 2031", core=COOKERY_CORE)
    fit = profile_fit.compute(session, passport(skills=(), certificates=[held]), None, TODAY).get("COOKERY-NC-II")
    assert fit.status == "held" and fit.next_step == "held" and fit.coverage.share == 1


FIT = "/api/v1/auth/tsp/fit"


@pytest.fixture
def tsp_enabled(app):
    from tesda_track.config import get_settings
    settings = get_settings().model_copy(update={"tsp_sign_in_enabled": True})
    app.dependency_overrides[get_settings] = lambda: settings
    yield
    app.dependency_overrides.pop(get_settings, None)


def test_fit_endpoint_gives_the_next_step_privately(session, client, learner, tsp_enabled):
    link(session, "juan@example.com", passport(skills=(), certificates=[coc("Cookery COC 1", COOKERY_CORE[:4])]))
    response = client.get(FIT, params={"qualification_code": "COOKERY-NC-II"}, headers=learner)
    assert response.status_code == 200, response.text
    assert "no-store" in response.headers["cache-control"]
    body = response.json()
    assert body["qualification_code"] == "COOKERY-NC-II" and body["fit"]["next_step"] == "assessment"
    assert client.get(FIT, params={"qualification_code": "SMAW-NC-II"}, headers=learner).json()["fit"] is None
    assert client.get(FIT, params={"qualification_code": "NO-SUCH"}, headers=learner).status_code == 404


def test_fit_endpoint_needs_a_linked_passport(client, learner, tsp_enabled):
    assert client.get(FIT, params={"qualification_code": "COOKERY-NC-II"}, headers=learner).status_code == 404
    assert client.get(FIT, params={"qualification_code": "COOKERY-NC-II"}).status_code == 401


def manuel(experience=("Jeepney driver",), licenses=("LTO Professional Driver's License",)):
    """Kuya Manuel (US-0004): years behind the wheel and a license, but no TESDA certificate. The test catalog has no
    Driving NC II, so FBS-NC-II stands in for it: the rule reads the evidence, never the code."""
    return {**passport(skills=("Driving",)), "experience": [{"job_title": job} for job in experience],
            "credentials": {"certificates": [], "trainings": [], "assessments": [],
                            "external_certificates": [{"certificate_name": name} for name in licenses]}}


def test_a_strong_fit_backed_by_experience_goes_to_assessment(session, monkeypatch):
    monkeypatch.setattr(profile_fit.skill_search, "search_terms", fake_search({"FBS-NC-II": (91, ["Driving", "Jeepney driver"])}))
    fit = profile_fit.compute(session, manuel(), None, TODAY).get("FBS-NC-II")
    assert fit.next_step == "assessment" and fit.assessment_basis == "experience"
    assert fit.experience == ["Jeepney driver"]
    assert fit.licenses == ["LTO Professional Driver's License"]


def test_skills_alone_or_a_weak_fit_stay_training_and_unrelated_licenses_are_left_out(session, monkeypatch):
    monkeypatch.setattr(profile_fit.skill_search, "search_terms", fake_search({"FBS-NC-II": (60, ["Jeepney driver"])}))
    weak = profile_fit.compute(session, manuel(), None, TODAY).get("FBS-NC-II")
    assert weak.next_step == "training" and weak.assessment_basis is None and weak.licenses == []

    monkeypatch.setattr(profile_fit.skill_search, "search_terms", fake_search({"SMAW-NC-II": (90, ["Welder"])}))
    welder = profile_fit.compute(session, manuel(experience=("Welder",), licenses=("LTO Non-Professional Driver's License",)),
                                 None, TODAY).get("SMAW-NC-II")
    assert welder.assessment_basis == "experience" and welder.licenses == []

    monkeypatch.setattr(profile_fit.skill_search, "search_terms", fake_search({"FBS-NC-II": (91, ["Driving"])}))
    skill_only = profile_fit.compute(session, manuel(experience=()), None, TODAY).get("FBS-NC-II")
    assert skill_only.next_step == "training"


def fake_search(results):
    """skill_search.search_terms answering with fixed scores and supporting terms, by catalog code."""
    from types import SimpleNamespace

    def search(session, items, rules, terms, embedder, params, limit, **_):
        by_code = {item.code: item for item in items}
        matches = [SimpleNamespace(qualification=by_code[code].summary, score=score)
                   for code, (score, _) in results.items() if code in by_code]
        return SimpleNamespace(matches=matches, supporting={code: tuple(t) for code, (_, t) in results.items()})
    return search
