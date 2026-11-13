from datetime import date, timedelta

import pytest
from pydantic import ValidationError
from sqlmodel import select

from tesda_track.config import Settings
from tesda_track.models import (AssessmentCenter, AssessmentSchedule, Qualification, TrainingProgram,
                                TrainingProvider, utcnow)
from tesda_track.models.registry import RegistryBatch, RegistryLink, RegistryRecord
from tesda_track.routers import labor_market as router
from tesda_track.services import outlook_summary, qualification_outlook
from tests.test_area_jobs import seed

CODE = "SMAW-NC-II"
URL = "/api/v1/labor-market/outlook"
EXAMPLE = {"data_status": "example", "source_name": "Fixture"}


def qualification(session, code=CODE):
    return session.exec(select(Qualification).where(Qualification.code == code)).one()


def postings(session, region, count, *, decision="approved", title="Welder"):
    for n in range(count):
        seed(session, f"{region}-{title}-{decision}-{n}", region=region, title=title, decision=decision,
             locality=f"Somewhere, {region}")


def training(session, region, count=1, *, code=CODE, active=True, **provenance):
    providers = []
    for n in range(count):
        provider = TrainingProvider(name=f"{region} institute {n}", region_code=region, is_active=active, **provenance)
        session.add(provider)
        session.flush()
        session.add(TrainingProgram(provider_id=provider.id, qualification_id=qualification(session, code).id,
                                    title="Welding", delivery_mode="unknown", **provenance))
        providers.append(provider)
    session.flush()
    return providers


def center(session, region, *, name="Assessment center", **provenance):
    row = AssessmentCenter(name=name, region_code=region, **provenance)
    session.add(row)
    session.flush()
    return row


def area(outlook, code):
    return next(item for item in outlook.areas if item.region_code == code)


def test_balance_compares_each_regions_share_of_postings_with_its_share_of_centers(session):
    postings(session, "NCR", 3)
    postings(session, "III", 12)
    sites = training(session, "NCR", 4) + training(session, "III", 1)

    outlook = qualification_outlook.build(session, CODE, "NCR", "NCR")

    ncr, central_luzon, cebu = (area(outlook, code) for code in ("NCR", "III", "VII"))
    # NCR holds 80% of the centers and 20% of the postings; Central Luzon the reverse.
    assert (ncr.posting_count, ncr.training_sites, ncr.balance, ncr.limited) == (3, 4, "more_supply", False)
    assert ncr.demand_share == pytest.approx(0.2) and ncr.supply_share == pytest.approx(0.8)
    assert (central_luzon.balance, central_luzon.limited) == ("more_demand", True)  # one center: a rough signal
    assert (cebu.balance, cebu.demand_share, cebu.supply_share) == ("no_records", 0, 0)
    assert outlook.totals.posting_count == 15 and outlook.totals.training_sites == 5
    assert (outlook.totals.regions_with_postings, outlook.totals.regions_with_sites) == (2, 2)
    assert outlook.alternatives == ["III"]
    assert outlook.training_site_ids == sorted(site.id for site in sites) and outlook.assessment_site_ids == []
    assert len(outlook.areas) == 18 and ncr.titles == ["Welder"]


def test_even_shares_are_balanced_and_one_sided_regions_say_which_side_is_missing(session):
    postings(session, "NCR", 4)
    postings(session, "VII", 4)
    postings(session, "XI", 2)
    training(session, "NCR", 3)
    training(session, "VII", 3)
    training(session, "X", 1)

    outlook = qualification_outlook.build(session, CODE)

    assert [area(outlook, code).balance for code in ("NCR", "VII", "XI", "X")] == [
        "balanced", "balanced", "demand_only", "supply_only"]
    assert area(outlook, "XI").limited and area(outlook, "X").limited
    # Demand with centers comes before demand alone; nothing is excluded without a selected region.
    assert outlook.alternatives == ["XI", "NCR", "VII"]


def test_only_reviewed_links_and_active_sites_count(session):
    postings(session, "NCR", 2)
    postings(session, "NCR", 3, decision="pending", title="Fitter")
    postings(session, "NCR", 1, decision=None, title="Driver")
    training(session, "NCR", 1)
    training(session, "NCR", 1, active=False)
    training(session, "NCR", 1, code="COOKERY-NC-II")

    ncr = area(qualification_outlook.build(session, CODE), "NCR")

    assert (ncr.posting_count, ncr.training_sites, ncr.titles) == (2, 1, ["Welder"])


def test_example_sites_are_reported_beside_supply_and_counted_only_when_the_deployment_says_so(session):
    postings(session, "NCR", 2)
    training(session, "NCR", 2, **EXAMPLE)
    (real,) = training(session, "NCR", 1)

    strict = qualification_outlook.build(session, CODE, "NCR")
    ncr = area(strict, "NCR")
    assert (ncr.training_sites, ncr.example_sites) == (1, 2)
    assert strict.training_site_ids == [real.id] and not strict.includes_example_sites
    supply = next(point.text for point in strict.insight.points if point.kind == "supply")
    assert "2 example sites on the map are placeholders and not counted" in supply

    demo = qualification_outlook.build(session, CODE, "NCR", include_examples=True)
    ncr = area(demo, "NCR")
    assert (ncr.training_sites, ncr.example_sites) == (3, 0) and demo.includes_example_sites
    assert any("example sites" in text for text in demo.limitations)
    assert "include example sites" in next(p.text for p in demo.insight.points if p.kind == "supply")


def test_assessment_supply_is_open_schedules_and_the_registrys_latest_accreditations(session):
    q = qualification(session)
    scheduled, past, accredited, dropped = (center(session, "VII", name=name)
                                            for name in ("Scheduled", "Past", "Accredited", "Dropped"))
    session.add(AssessmentSchedule(center_id=scheduled.id, qualification_id=q.id, slots=10,
                                   scheduled_at=utcnow() + timedelta(days=7)))
    session.add(AssessmentSchedule(center_id=past.id, qualification_id=q.id, slots=10,
                                   scheduled_at=utcnow() - timedelta(days=7)))
    snapshot = date(2026, 10, 7)
    batch = RegistryBatch(fingerprint="f" * 64, source_name="Assessment registry.xlsx", source_sha256="0" * 64,
                          kind="assessment", sheet="Centers", snapshot_date=snapshot, inspected_on=snapshot,
                          policy_sha256="1" * 64)
    session.add(batch)
    session.flush()
    for row, (site, key, outcome) in enumerate([(accredited, "a" * 64, "accepted"), (dropped, "d" * 64, "historical")]):
        session.add(RegistryLink(entity_kind="center", external_key=key, center_id=site.id,
                                 last_snapshot_date=snapshot))
        session.add(RegistryRecord(batch_id=batch.id, row_number=row, site_key=key, outcome=outcome,
                                   qualification_id=q.id))
    session.flush()

    outlook = qualification_outlook.build(session, CODE)

    assert outlook.assessment_site_ids == sorted([scheduled.id, accredited.id])
    assert area(outlook, "VII").assessment_sites == 2 and outlook.totals.assessment_sites == 2


def points(outlook):
    return {point.kind: point.text for point in outlook.insight.points}


def test_the_analysis_speaks_to_where_the_learner_is_and_whether_they_would_relocate(session):
    postings(session, "NCR", 3)
    postings(session, "III", 12)
    training(session, "NCR", 4)
    training(session, "III", 1)

    staying = qualification_outlook.build(session, CODE, "NCR", "NCR", relocate=False)
    said = points(staying)
    assert staying.insight.headline == ("National Capital Region: training supply for Shielded Metal Arc Welding "
                                        "(SMAW) NC II is ahead of recorded demand")
    assert "You are in National Capital Region and prefer not to relocate" in said["location"]
    assert "3 posting records in National Capital Region are linked to it: 20% of the 15 recorded nationwide" in (
        said["demand"])
    assert "the 2nd most of 2 regions with records" in said["demand"]
    assert "4 training centers and 0 assessment centers are recorded for it in National Capital Region, 80% of the 5" in (
        said["supply"])
    assert "looks saturated" in said["balance"] and "80% of the recorded centers but 20%" in said["balance"]
    # Staying put in a crowded area, the learner is told once where else demand is stronger.
    assert said["relocation"].startswith("If your plans change, Region III (Central Luzon) (12 postings, 1 center)")
    # The brief says the same in a few short sentences.
    assert staying.insight.summary == (
        "You are in National Capital Region and prefer not to relocate. 3 of the 15 posting records for Shielded Metal "
        "Arc Welding (SMAW) NC II nationwide are here (20%), and 4 of its 5 recorded centers (80%). That makes National "
        "Capital Region look saturated: expect more competition for local openings. If your plans change, Region III "
        "(Central Luzon) shows more demand against its supply.")

    relocating = qualification_outlook.build(session, CODE, "NCR", "NCR", relocate=True)
    moving = points(relocating)
    assert "open to relocating" in moving["location"]
    assert moving["relocation"].startswith("If you relocate, recorded demand is strongest against training supply in "
                                           "Region III (Central Luzon)")
    assert relocating.insight.summary.startswith("You are in National Capital Region and are open to relocating.")
    assert relocating.insight.summary.endswith("If you relocate, look first at Region III (Central Luzon).")

    elsewhere = points(qualification_outlook.build(session, CODE, "III", "NCR"))
    assert elsewhere["location"] == ("You are looking at Region III (Central Luzon); your own region is National "
                                     "Capital Region, and you prefer not to relocate.")
    assert "Demand is ahead of supply" in elsewhere["balance"] and "rough signal" in elsewhere["balance"]
    assert "relocation" not in elsewhere

    national = qualification_outlook.build(session, CODE)
    said = points(national)
    assert national.insight.headline.endswith("where it is in demand and where it is offered")
    assert national.insight.summary == (
        "This is the national picture. 15 posting records for Shielded Metal Arc Welding (SMAW) NC II are recorded "
        "across 2 regions, and 5 centers across 2 regions. Demand is ahead of supply in Region III (Central Luzon). "
        "Supply is ahead of demand in National Capital Region.")
    assert "most in Region III (Central Luzon) (12) and National Capital Region (3)" in said["demand"]
    assert said["balance"] == ("Recorded demand is ahead of training supply in Region III (Central Luzon); training "
                               "supply is ahead of recorded demand in National Capital Region.")


def test_missing_evidence_is_never_read_as_low_demand(session):
    training(session, "NCR", 3)

    outlook = qualification_outlook.build(session, CODE, "NCR", "NCR")
    said = points(outlook)

    assert "missing evidence, not proof of low demand" in said["demand"]
    assert "no local postings" in said["balance"]
    assert "No posting records are linked to Shielded Metal Arc Welding (SMAW) NC II in this snapshot; 3 of its 3 " \
           "recorded centers are here (100%)." in outlook.insight.summary


def test_the_brief_covers_every_mix_of_records(session):
    def brief(**kwargs):
        return qualification_outlook.build(session, CODE, "NCR", **kwargs).insight.summary

    assert brief() == ("This looks at National Capital Region. Nothing is recorded for Shielded Metal Arc Welding "
                       "(SMAW) NC II yet: no posting records and no centers. There is nothing to compare here yet.")
    postings(session, "VII", 4)
    assert "None of the 4 posting records for Shielded Metal Arc Welding (SMAW) NC II nationwide are here; no center " \
           "is recorded for it yet." in brief()
    postings(session, "NCR", 1)
    assert "1 of the 5 posting records for Shielded Metal Arc Welding (SMAW) NC II nationwide is here (20%); no " \
           "center is recorded for it yet. Employers posted for it here" in brief()
    training(session, "VII", 2, **EXAMPLE)
    counted = brief(include_examples=True, relocate=True)
    assert "is here (20%), but none of its 2 recorded centers." in counted
    assert counted.endswith("If you relocate, look first at Region VII (Central Visayas). Center counts include "
                            "example sites, shown for demonstration.")


def test_outlook_is_public_and_refuses_unknown_codes(client, session):
    postings(session, "NCR", 2)
    training(session, "NCR", 1)

    response = client.get(URL, params={"qualification_code": CODE, "region_code": "NCR", "home_region_code": "NCR",
                                       "relocate": "true"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["qualification"] == {"code": CODE, "name": "Shielded Metal Arc Welding (SMAW) NC II"}
    assert (body["region_code"], body["home_region_code"], body["relocate"]) == ("NCR", "NCR", True)
    assert body["method_version"] == "qualification-outlook-v1" and body["ai_summary_available"] is False
    assert body["snapshot_dates"] and len(body["limitations"]) == 4
    assert client.get(URL, params={"qualification_code": "NOPE"}).status_code == 404
    assert client.get(URL, params={"qualification_code": CODE, "region_code": "ZZ"}).status_code == 422
    assert client.get(URL, params={"qualification_code": CODE, "home_region_code": "ZZ"}).status_code == 422
    assert client.get(URL).status_code == 422


class Writer:
    model = "test-model"

    def __init__(self, text):
        self.text, self.asked = text, []

    def write(self, facts):
        self.asked.append(facts)
        return self.text


@pytest.fixture
def written(app):
    def use(writer):
        app.dependency_overrides[router.summary_writer] = lambda: writer
        return writer
    return use


def summary(client, **params):
    response = client.get(URL + "/summary", params={"qualification_code": CODE, "region_code": "NCR", **params})
    assert response.status_code == 200, response.text
    return response.json()


def test_summary_is_the_rules_own_words_when_ai_is_off(client, session):
    postings(session, "NCR", 2)

    body = summary(client)

    assert body["source"] == "rules" and body["model"] is None
    assert body["text"].startswith("This looks at National Capital Region. 2 of the 2 posting records")


def test_ai_summary_is_written_from_public_counts_once_and_then_served_from_the_cache(client, session, written):
    postings(session, "NCR", 2)
    training(session, "NCR", 1)
    writer = written(Writer("In National Capital Region, 2 posting records are linked to it and 1 center offers it."))

    assert client.get(URL, params={"qualification_code": CODE}).json()["ai_summary_available"] is True
    first, again = summary(client, home_region_code="NCR"), summary(client, home_region_code="NCR")

    assert first == again == {"source": "ai", "model": "test-model", "text": writer.text}
    (facts,) = writer.asked
    assert facts["qualification"] == "Shielded Metal Arc Welding (SMAW) NC II"
    assert facts["selected_region"]["posting_records"] == 2 and facts["selected_region_is_home"] is True
    assert facts["open_to_relocating"] is False and facts["analysis_by_rules"]["points"]
    assert facts["analysis_by_rules"]["summary"].startswith("You are in National Capital Region")
    # Another selection is another paragraph.
    summary(client, home_region_code="NCR", relocate="true")
    assert len(writer.asked) == 2


@pytest.mark.parametrize("text", [
    "About 40 employers are hiring welders near you right now.",  # a figure the counts don't hold
    "word " * 300,  # far longer than the note under the map
    None,  # Claude couldn't be reached, or declined
])
def test_an_ai_summary_that_cant_be_trusted_gives_way_to_the_rules(client, session, written, text):
    postings(session, "NCR", 2)
    writer = written(Writer(text))

    assert summary(client)["source"] == "rules"
    # Nothing was cached: the next request asks again.
    assert summary(client)["source"] == "rules" and len(writer.asked) == 2


def test_new_ai_summaries_are_limited_per_client(client, session, written, monkeypatch):
    from tesda_track.config import get_settings

    monkeypatch.setattr(get_settings(), "outlook_summary_rate_limit_per_minute", 1)
    postings(session, "NCR", 2)
    writer = written(Writer("2 posting records are linked to it."))

    assert summary(client)["source"] == "ai"
    assert summary(client, relocate="true")["source"] == "rules"
    # What was already written is still served.
    assert summary(client)["source"] == "ai" and len(writer.asked) == 1


def test_figures_are_checked_against_the_facts():
    facts = {"selected_region": {"posting_records": 1250, "percent": 20}, "posting_snapshot_dates": ["2026-11-04"]}

    assert outlook_summary.grounded("1,250 records (20%) as of November 4, 2026.", facts)
    assert not outlook_summary.grounded("1,300 records.", facts)


def test_ai_summaries_need_a_key():
    base = dict(_env_file=None, database_url="postgresql://unused", secret_key="test-only-" * 8)

    assert Settings(**base).outlook_ai_summary_enabled is False
    assert Settings(**base, outlook_ai_summary_enabled=True, anthropic_api_key="sk-test").anthropic_api_key
    with pytest.raises(ValidationError):
        Settings(**base, outlook_ai_summary_enabled=True, anthropic_api_key="")
    assert router.summary_writer(Settings(**base, anthropic_api_key="sk-test")) is None
