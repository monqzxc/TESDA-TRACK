from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlmodel import select

from tesda_track.errors import InvalidRequestError
from tesda_track.models import Qualification, utcnow
from tesda_track.models.labor_market import (
    LaborMarketDataset as Dataset,
    LaborMarketEvidence as Evidence,
    LaborMarketMapping as Mapping,
)
from tesda_track.services import area_qualifications

NOW = datetime(2026, 11, 10, 12, tzinfo=ZoneInfo("Asia/Manila"))


def test_public_area_directory_contract_and_invalid_inputs(client):
    response = client.get("/api/v1/labor-market/qualifications", params={"region_code": "NCR"})
    assert response.status_code == 200
    body = response.json()
    assert body["region_code"] == "NCR"
    assert body["ordering"] == "qualification_name"
    assert isinstance(body["items"], list)
    assert body["observed_since"] <= body["observed_through"]
    assert client.get("/api/v1/labor-market/qualifications", params={"region_code": "unknown"}).status_code == 422
    assert client.get("/api/v1/labor-market/qualifications", params={"limit": 101}).status_code == 422
    assert client.get("/api/v1/labor-market/qualifications", params={"offset": -1}).status_code == 422


@pytest.fixture
def seed_evidence(session):
    def seed(
        source, *, code="SMAW-NC-II", region="NCR", scope="regional", kind="observed_posting",
        classification=None, decision="approved", proposal="high_confidence", status="active",
        observed=date(2026, 11, 4), source_id="job-1", year=2026,
    ):
        qualification = session.exec(select(Qualification).where(Qualification.code == code)).one()
        dataset = Dataset(
            key=source + "@1", source_id=source, version=1, publisher="Official fixture board",
            title="Isolated evidence fixture", evidence_class=kind, geographic_scope=scope,
            region_code=region, period_label=str(year), period_start_year=year, period_end_year=year,
            source_url="https://www.tesda.gov.ph/", input_sha256="0" * 64,
            imported_at=utcnow(), status=status,
        )
        session.add(dataset)
        session.flush()
        evidence = Evidence(
            dataset_id=dataset.id, occurrence_key=source, source_record_id=source_id,
            occupation_title="Welder", normalized_title="welder",
            classification=classification or ("observed_posting" if kind == "observed_posting" else "in_demand"),
            geographic_scope=scope, region_code=region, period_label=str(year),
            observed_on=observed if kind == "observed_posting" else None,
        )
        session.add(evidence)
        session.flush()
        mapping = Mapping(
            mapping_key=source + ":link", evidence_id=evidence.id, qualification_id=qualification.id,
            proposal=proposal, decision=decision, review_reason="Reviewed fixture association",
        )
        session.add(mapping)
        session.flush()
        return qualification, evidence, dataset, mapping

    return seed


def test_region_directory_retains_national_fallback_and_excludes_foreign_region(session, seed_evidence):
    seed_evidence("national", scope="national", region=None, kind="national_forecast")
    seed_evidence("foreign", region="III", kind="regional_forecast")
    item, = area_qualifications.discover(session, "NCR", now=NOW).items
    assert item.observed_posting_count is None and not item.has_selected_area_evidence
    forecast, = item.forecast_support
    assert forecast.geography.scope == "national" and forecast.geography_match == "broader_scope"
    assert forecast.geography.label == "Philippines — National" and forecast.value is None
    assert item.dataset_keys == ["national@1"]


def test_posting_ids_deduplicate_across_captures_and_keep_dates(session, seed_evidence):
    seed_evidence("snapshot-one")
    seed_evidence("snapshot-two", observed=date(2026, 11, 5))
    seed_evidence("another-posting", source_id="job-2")
    seed_evidence("foreign", region="III", source_id="foreign-job")
    item, = area_qualifications.discover(session, "NCR", now=NOW).items
    assert item.observed_posting_count == 2 and item.has_selected_area_evidence
    assert item.observation_dates == [date(2026, 11, 4), date(2026, 11, 5)]
    assert item.observation_geography.scope == "regional" and item.observation_geography.region_code == "NCR"
    assert item.forecast_support == []
    assert item.posting_unit == "distinct posting records"


@pytest.mark.parametrize("changes", [
    {"decision": "pending"}, {"decision": "rejected"}, {"proposal": "needs_review"},
    {"status": "retired"}, {"observed": date(2025, 12, 31)},
    {"observed": NOW.date() + timedelta(days=1)},
])
def test_unapproved_retired_and_out_of_date_postings_are_absent(session, seed_evidence, changes):
    seed_evidence("unavailable", **changes)
    result = area_qualifications.discover(session, "NCR", now=NOW)
    assert result.items == [] and result.total == 0


def test_outdated_forecast_and_inactive_qualification_are_absent(session, seed_evidence):
    seed_evidence("old", scope="national", region=None, kind="national_forecast", year=2025)
    qualification, _, _, _ = seed_evidence("current")
    qualification.is_active = False
    session.add(qualification)
    session.flush()
    assert area_qualifications.discover(session, "NCR", now=NOW).items == []


def test_revocation_is_visible_on_next_request(session, seed_evidence):
    _, _, _, mapping = seed_evidence("reviewed")
    assert area_qualifications.discover(session, "NCR", now=NOW).total == 1
    mapping.decision = "rejected"
    session.add(mapping)
    session.flush()
    assert area_qualifications.discover(session, "NCR", now=NOW).total == 0


def test_selected_regional_forecast_is_separate_from_observations(session, seed_evidence):
    seed_evidence("regional", kind="regional_forecast", classification="hard_to_fill")
    seed_evidence("snapshot")
    item, = area_qualifications.discover(session, "NCR", now=NOW).items
    assert item.observed_posting_count == 1
    forecast, = item.forecast_support
    assert forecast.classification == "hard_to_fill" and forecast.geography_match == "selected_area"
    assert forecast.evidence_kind == "forecast" and forecast.value is None


def test_no_region_has_explicit_multiregional_observation_scope(session, seed_evidence):
    seed_evidence("snapshot")
    seed_evidence("regional", region="III", kind="regional_forecast")
    item, = area_qualifications.discover(session, now=NOW).items
    assert item.observed_posting_count == 1 and item.forecast_support == []
    assert item.observation_geography.scope == "multi_regional"
    assert "not a national total" in item.observation_geography.label
    assert not item.has_selected_area_evidence


def test_qualification_overlap_and_alphabetical_pagination(session, seed_evidence):
    second = session.exec(select(Qualification).where(Qualification.code != "SMAW-NC-II")).first()
    qualification, evidence, _, _ = seed_evidence("snapshot")
    session.add(Mapping(
        mapping_key="snapshot:second", evidence_id=evidence.id, qualification_id=second.id,
        proposal="high_confidence", decision="approved", review_reason="Also relevant to another fixture qualification",
    ))
    session.flush()
    first_page = area_qualifications.discover(session, "NCR", limit=1, now=NOW)
    second_page = area_qualifications.discover(session, "NCR", limit=1, offset=1, now=NOW)
    assert first_page.total == second_page.total == 2
    actual = [first_page.items[0], second_page.items[0]]
    assert [item.qualification_code for item in actual] == [q.code for q in sorted(
        [qualification, second], key=lambda q: (q.name.casefold(), q.code)
    )]
    assert all(item.observed_posting_count == 1 for item in actual)
    assert first_page.ordering == "qualification_name"
    assert any("overlap" in note for note in first_page.limitations)


def test_unknown_region_and_invalid_paging_are_rejected(session):
    for kwargs in ({"region_code": "missing"}, {"limit": 0}, {"limit": 101}, {"offset": -1}):
        with pytest.raises(InvalidRequestError):
            area_qualifications.discover(session, now=NOW, **kwargs)
