from datetime import date, timedelta

from sqlmodel import select

from tesda_track.models import Qualification, utcnow
from tesda_track.models.labor_market import LaborMarketDataset as Dataset, LaborMarketEvidence as Evidence, LaborMarketMapping as Mapping
from tesda_track.services import area_jobs


def seed(session, key, *, title="Welder", source_id=None, region="NCR", locality="MAKATI CITY, NCR",
         employer="Acme", decision=None, status="active", observed=None):
    dataset = Dataset(key=key + "@1", source_id="philjobnet-postings-" + key, version=1, publisher="Fixture board",
                      title="Test snapshot", evidence_class="observed_posting", geographic_scope="regional",
                      region_code=region, source_url="https://example.com/", input_sha256="0" * 64,
                      imported_at=utcnow(), status=status)
    session.add(dataset)
    session.flush()
    evidence = Evidence(dataset_id=dataset.id, occurrence_key=key, source_record_id=source_id or key,
                        occupation_title=title, normalized_title=title.casefold(), classification="observed_posting",
                        geographic_scope="regional", region_code=region, locality=locality,
                        observed_on=observed or date.today(), provenance={"employer": employer, "posted_on": "11/1/2026"})
    session.add(evidence)
    session.flush()
    if decision:
        q = session.exec(select(Qualification).where(Qualification.code == "SMAW-NC-II")).one()
        session.add(Mapping(mapping_key=key + ":link", evidence_id=evidence.id, qualification_id=q.id,
                            proposal="high_confidence", decision=decision))
        session.flush()


def test_jobs_show_without_qualification_mappings_and_keep_snapshot_contract(session, client):
    seed(session, "one")
    seed(session, "two", title="  WELDER ", employer="  ACME ")
    response = client.get("/api/v1/labor-market/jobs", params={"region_code": "NCR"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1 and body["posting_count"] == 2
    assert body["items"][0]["employer_count"] == 1
    assert body["items"][0]["posting_count"] == 2
    assert body["snapshot_dates"]
    assert body["areas"][0]["region_code"] == "NCR"
    assert "Dated posting records" in body["limitations"][0]


def test_stable_source_ids_deduplicate_across_captures(session):
    seed(session, "older", source_id="same", observed=date.today() - timedelta(days=1))
    seed(session, "newer", source_id="same")
    data = area_jobs.discover(session)
    assert data.posting_count == 1 and data.items[0].posting_count == 1
    assert data.snapshot_dates == [date.today()]


def test_region_city_and_pagination_do_not_change_coverage_totals(session):
    seed(session, "ncr-one")
    seed(session, "ncr-two", title="Cook", locality="PASAY CITY, NCR")
    seed(session, "region-three", region="III", locality="ANGELES CITY, PAMPANGA")
    data = area_jobs.discover(session, "NCR", "PASAY CITY, NCR", limit=1)
    assert data.posting_count == 1 and data.items[0].title == "Cook"
    assert len(data.localities) == 2
    assert {a.region_code for a in data.areas} == {"NCR", "III"}
    page = area_jobs.discover(session, "NCR", limit=1, offset=1)
    assert page.total == 2 and page.posting_count == 2 and len(page.items) == 1


def test_qualification_filters_require_approval_and_active_sources(session):
    seed(session, "approved", decision="approved")
    seed(session, "pending", decision="pending")
    seed(session, "rejected", decision="rejected")
    seed(session, "retired", decision="approved", status="retired")
    seed(session, "future", decision="approved", observed=date.today() + timedelta(days=1))
    assert area_jobs.discover(session).posting_count == 3
    assert area_jobs.discover(session, qualification_code="SMAW-NC-II").posting_count == 1


def test_invalid_inputs_and_empty_are_explicit(client):
    assert client.get("/api/v1/labor-market/jobs?region_code=unknown").status_code == 422
    assert client.get("/api/v1/labor-market/jobs?limit=101").status_code == 422
    assert client.get("/api/v1/labor-market/jobs?offset=-1").status_code == 422
    body = client.get("/api/v1/labor-market/jobs?region_code=NCR").json()
    assert body["items"] == [] and body["posting_count"] == 0


def test_other_portal_snapshots_are_not_labeled_philjobnet(session):
    seed(session, "philjobnet")
    seed(session, "other-portal")
    other = session.exec(select(Dataset).where(Dataset.key == "other-portal@1")).one()
    other.source_id = "pasay-official-job-portal-2026-10"
    session.add(other)
    session.flush()
    assert area_jobs.discover(session).posting_count == 1
