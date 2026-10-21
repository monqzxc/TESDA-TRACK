from datetime import date, datetime, timezone

import pytest
from pydantic import ValidationError
from sqlmodel import select

from tesda_track.models import Qualification, TrainingProvider
from tesda_track.schemas.provenance import ProvenancePublic, ProvenanceWrite
from tesda_track.seed import SEED_DIR, _read, sync_delivery_sites


def test_catalog_preserves_source_without_claiming_review(client, session):
    qualification = session.exec(select(Qualification).where(Qualification.code == "SMAW-NC-II")).one()
    qualification.source_name = "TESDA Training Regulations"
    qualification.source_reference = "Download 2519"
    qualification.source_url = "https://tesda.gov.ph/Download/Training_Regulations"
    qualification.source_updated_on = date(2026, 10, 1)
    session.flush()
    record = client.get("/api/v1/qualifications/SMAW-NC-II").json()["provenance"]
    assert record["source_name"] == "TESDA Training Regulations"
    assert record["source_reference"] == "Download 2519"
    assert record["source_url"] == qualification.source_url
    assert record["source_updated_on"] == "2026-10-01"
    assert record["reviewed_at"] is None
    assert record["status"] == "incomplete"
    assert record["record_updated_at"]


def test_example_site_and_offering_provenance_is_public(client, session):
    # Use only qualifications in the fixed test catalog.
    raw = _read(SEED_DIR, "delivery_sites.json")
    entry = raw["sites"][0]
    entry["offerings"] = [o for o in entry["offerings"] if o["qualification_code"] in {"CSS-NC-II", "EIM-NC-II"}]
    sync_delivery_sites(session, {"sites": [entry]})
    provider = session.exec(select(TrainingProvider).where(TrainingProvider.name == entry["provider"]["name"])).one()
    site = client.get(f"/api/v1/training-providers/{provider.id}").json()["provenance"]
    assert site["status"] == "example"
    assert site["source_name"] == "TESDA-TRACK development fixture"
    assert site["source_reference"] == "backend/seed/delivery_sites.json"
    assert site["source_updated_on"] is None and site["reviewed_at"] is None
    programs = client.get("/api/v1/training-programs", params={"provider_id": provider.id}).json()
    assert programs
    assert all(p["provenance"]["status"] == "example" for p in programs)
    assert all(p["provider"]["provenance"]["status"] == "example" for p in programs)
    centers = client.get("/api/v1/assessment-centers").json()
    center = next(c for c in centers if c["name"] == entry["assessment_center"]["name"])
    assert center["provenance"]["status"] == "example"
    schedules = [s for s in client.get("/api/v1/assessment-schedules").json() if s["center"]["id"] == center["id"]]
    assert schedules and all(s["provenance"]["status"] == "example" for s in schedules)


def test_verified_record_requires_real_source_and_review_dates():
    with pytest.raises(ValidationError):
        ProvenanceWrite(data_status="verified")
    assert ProvenancePublic(status="verified").status == "incomplete"
    evidence = ProvenanceWrite(data_status="verified", source_name="Reviewed registry",
        source_reference="Registry row 5", source_url="https://example.com/registry",
        source_updated_on=date(2026, 1, 1), source_reviewed_at=datetime(2026, 2, 1, tzinfo=timezone.utc))
    assert evidence.data_status == "verified"


@pytest.mark.parametrize("change", [
    {"source_name": "   "}, {"source_reference": "   "},
    {"source_url": "https://user:private@example.com/registry"},
    {"source_url": "file:///private-registry.xlsx"},
    {"source_updated_on": date(2099, 1, 1)},
    {"source_reviewed_at": datetime(2099, 1, 1, tzinfo=timezone.utc)},
])
def test_verified_record_rejects_blank_unsafe_or_future_evidence(change):
    values = dict(data_status="verified", source_name="Reviewed registry", source_reference="row 5",
                  source_url="https://example.com/registry", source_updated_on=date(2026, 1, 1),
                  source_reviewed_at=datetime(2026, 2, 1, tzinfo=timezone.utc))
    with pytest.raises(ValidationError):
        ProvenanceWrite(**(values | change))


def test_legacy_future_or_unsafe_evidence_cannot_claim_public_verification():
    record = ProvenancePublic(status="verified", source_name="Registry", source_reference="row 5",
        source_url="https://user:private@example.com/registry", source_updated_on=date(2099, 1, 1),
        reviewed_at=datetime(2099, 1, 1, tzinfo=timezone.utc))
    assert record.status == "incomplete"
    assert record.source_url is None
    assert record.source_updated_on is None and record.reviewed_at is None


def test_source_updates_cannot_clear_evidence_of_verified_record(client, admin, make_provider):
    provider = make_provider(data_status="verified", source_name="Reviewed registry", source_reference="row 5",
        source_url="https://example.com/registry", source_updated_on="2026-01-01",
        source_reviewed_at="2026-02-01T00:00:00Z")
    response = client.patch(f"/api/v1/admin/training-providers/{provider['id']}", headers=admin,
                            json={"source_url": None})
    assert response.status_code == 422
    response = client.patch(f"/api/v1/admin/training-providers/{provider['id']}", headers=admin,
                            json={"source_url": None, "data_status": "incomplete"})
    assert response.status_code == 200
    assert response.json()["provenance"]["status"] == "incomplete"
