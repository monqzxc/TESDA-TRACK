import json

import pytest
from sqlmodel import select

from tesda_track.errors import InvalidRequestError
from tesda_track.models import Learner
from tesda_track.models.labor_market import LaborMarketDataset as Dataset, LaborMarketMapping as Mapping
from tesda_track.schemas.evidence import QualificationEvidencePanel
from tesda_track.schemas.labor_market import ReviewInput
from tesda_track.services import evidence_panel, labor_market
from tests.test_labor_market import bundle  # noqa: F401  (fixture)


def _actor(session):
    return session.exec(select(Learner).where(Learner.email == "admin@example.com")).one()


def _approve_all(session):
    actor = _actor(session)
    for m in session.exec(select(Mapping)).all():
        labor_market.decide(
            session, m.id,
            ReviewInput(decision="approved", expected_decision="pending", note="Approve fixture association"),
            actor,
        )


def test_national_forecast_keeps_national_label_in_a_region(session, bundle, admin):
    folder, q, region = bundle()
    labor_market.import_bundle(session, folder)
    _approve_all(session)
    panel = evidence_panel.build(session, q.code, region.code)
    (f,) = panel.forecast_support
    assert f.geography.label == "Philippines — National" and f.geography.scope == "national"
    assert f.geography_match == "broader_scope" and f.value is None and f.evidence_kind == "forecast"
    (n,) = evidence_panel.build(session, q.code).forecast_support
    assert n.geography_match == "no_area_selected"


def test_regional_forecast_matches_selected_area(session, bundle, admin):
    folder, q, region = bundle(scope="regional", kind="regional_forecast", suffix="regional")
    labor_market.import_bundle(session, folder)
    _approve_all(session)
    (f,) = evidence_panel.build(session, q.code, region.code).forecast_support
    assert f.geography_match == "selected_area" and f.geography.label == region.name


def test_out_of_period_forecast_is_absent(session, bundle, admin):
    folder, q, _ = bundle()
    meta = json.loads((folder / "dataset.json").read_text())
    meta.update(period_start_year=2020, period_end_year=2021, period_label="2020-2021")
    (folder / "dataset.json").write_text(json.dumps(meta))
    labor_market.import_bundle(session, folder)
    _approve_all(session)
    assert evidence_panel.build(session, q.code).forecast_support == []


def test_panel_is_public_and_typed(client, session, bundle, admin):
    folder, q, region = bundle()
    labor_market.import_bundle(session, folder)
    _approve_all(session)
    session.commit()
    r = client.get("/api/v1/labor-market/evidence", params={"qualification_code": q.code, "region_code": region.code})
    assert r.status_code == 200
    body = r.json()
    assert set(body) == set(QualificationEvidencePanel.model_fields)
    assert body["context"]["qualification_code"] == q.code
    assert {"postings", "employers"} <= set(body["observed_postings"])
    assert {"registered_training_sites", "remaining_training_seats"} <= set(body["supply"])
    for text in evidence_panel.LIMITATIONS:
        assert text in body["limitations"]
    assert "shortage" not in json.dumps(body["forecast_support"]).lower()


def test_unknown_region_422_unknown_qualification_404(client, session):
    url = "/api/v1/labor-market/evidence"
    assert client.get(url, params={"qualification_code": "SMAW-NC-II", "region_code": "nope"}).status_code == 422
    assert client.get(url, params={"qualification_code": "NO-SUCH-QUAL"}).status_code == 404
    with pytest.raises(InvalidRequestError):
        evidence_panel.build(session, "SMAW-NC-II", "nope")


def test_retired_dataset_disappears_from_panel(session, bundle, admin):
    folder, q, _ = bundle()
    labor_market.import_bundle(session, folder)
    _approve_all(session)
    assert len(evidence_panel.build(session, q.code).forecast_support) == 1
    dataset = session.exec(select(Dataset)).one()
    labor_market.set_dataset_status(session, dataset.id, "retired", "Retire for test", _actor(session))
    assert evidence_panel.build(session, q.code).forecast_support == []
