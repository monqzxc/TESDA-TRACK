import csv, json
from pathlib import Path
from datetime import date
import pytest
from sqlmodel import select
from tesda_track.models import Qualification, Region
from tesda_track.models.labor_market import (
    LaborMarketDataset as Dataset,
    LaborMarketEvidence as Evidence,
    LaborMarketMapping as Mapping,
    LaborMarketReview as Review,
)
from tesda_track.services import labor_market as service
from tesda_track.schemas.labor_market import ReviewInput
from tesda_track.errors import ConflictError, InvalidRequestError


@pytest.fixture
def bundle(tmp_path, session):
    q = session.exec(
        select(Qualification).where(Qualification.code == "SMAW-NC-II")
    ).one()
    region = session.exec(select(Region)).first()

    def make(
        *,
        version=1,
        scope="national",
        proposal="high_confidence",
        kind="national_forecast",
        classification="in_demand",
        suffix="source",
    ):
        folder = tmp_path / f"{suffix}-{version}"
        folder.mkdir(exist_ok=True)
        meta = dict(
            source_id=suffix,
            version=version,
            publisher="Official test fixture",
            title="ISOLATED TEST FORECAST",
            evidence_class=kind,
            geographic_scope=scope,
            region_code=region.code if scope != "national" else None,
            period_label=str(date.today().year),
            period_start_year=date.today().year,
            period_end_year=date.today().year,
            source_url="https://www.tesda.gov.ph/",
        )
        (folder / "dataset.json").write_text(json.dumps(meta), encoding="utf-8")
        e = dict(
            occurrence_key="OCC-fixture",
            source_record_id="duplicate-original-id",
            occupation_title="Welder",
            classification=classification,
            geographic_scope=scope,
            region_code=meta["region_code"] or "",
            period_label=meta["period_label"],
            observed_on=str(date.today()) if kind == "observed_posting" else "",
            provenance="{}",
        )
        m = dict(
            mapping_key="TEST-001",
            occurrence_key=e["occurrence_key"],
            qualification_code=q.code,
            proposal=proposal,
            review_reason="Explicit test fixture for approval boundaries",
            competencies='["Welding"]',
            training_regulation_url="https://www.tesda.gov.ph/",
            training_regulation_reference="Section 1",
        )
        for name, row in [("evidence.csv", e), ("mappings.csv", m)]:
            with (folder / name).open("w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=list(row))
                w.writeheader()
                w.writerow(row)
        return folder, q, region

    return make


def test_repeat_import_preserves_decision_and_changed_version_rejected(
    session, bundle, admin
):
    f, q, _ = bundle()
    r = service.import_bundle(session, f)
    m = session.exec(select(Mapping)).one()
    from tesda_track.models import Learner

    actor = session.exec(
        select(Learner).where(Learner.email == "admin@example.com")
    ).one()
    service.decide(
        session,
        m.id,
        ReviewInput(
            decision="approved",
            expected_decision="pending",
            note="Reviewed test qualification scope",
        ),
        actor,
    )
    assert service.import_bundle(session, f)["unchanged"]
    assert session.get(Mapping, m.id).decision == "approved"
    assert len(service.indicators(session, q.code)) == 1
    raw = json.loads((f / "dataset.json").read_text())
    raw["title"] = "Changed in place"
    (f / "dataset.json").write_text(json.dumps(raw))
    with pytest.raises(ConflictError):
        service.import_bundle(session, f)


def test_versions_are_separate_and_controlled_rollback(session, bundle, admin):
    from tesda_track.models import Learner

    actor = session.exec(
        select(Learner).where(Learner.email == "admin@example.com")
    ).one()
    f, q, _ = bundle()
    one = service.import_bundle(session, f)
    m = session.exec(select(Mapping)).one()
    service.decide(
        session,
        m.id,
        ReviewInput(
            decision="approved",
            expected_decision="pending",
            note="Approve isolated version fixture",
        ),
        actor,
    )
    f2, _, _ = bundle(version=2)
    two = service.import_bundle(session, f2)
    assert two["status"] == "retired"
    assert len(service.indicators(session, q.code)) == 1
    service.set_dataset_status(
        session,
        two["dataset_id"],
        "active",
        "Demonstrate controlled replacement",
        actor,
    )
    assert service.indicators(session, q.code) == []
    service.set_dataset_status(
        session,
        one["dataset_id"],
        "active",
        "Rollback preserves reviewed records",
        actor,
    )
    assert len(service.indicators(session, q.code)) == 1
    assert len(session.exec(select(Review)).all()) >= 4


@pytest.mark.parametrize("proposal", ["needs_review", "rejected"])
def test_non_high_proposals_cannot_be_approved(session, bundle, admin, proposal):
    from tesda_track.models import Learner

    actor = session.exec(
        select(Learner).where(Learner.email == "admin@example.com")
    ).one()
    f, q, _ = bundle(proposal=proposal)
    service.import_bundle(session, f)
    m = session.exec(select(Mapping)).one()
    with pytest.raises(InvalidRequestError):
        service.decide(
            session,
            m.id,
            ReviewInput(
                decision="approved",
                expected_decision=m.decision,
                note="Attempt forbidden activation",
            ),
            actor,
        )
    assert service.indicators(session, q.code) == []


def test_review_auth_concurrency_and_revocation(
    client, session, bundle, admin, learner
):
    f, q, _ = bundle()
    service.import_bundle(session, f)
    m = session.exec(select(Mapping)).one()
    url = f"/api/v1/admin/labor-market/mappings/{m.id}/review"
    body = dict(
        decision="approved",
        expected_decision="pending",
        note="Approved isolated fixture scope",
    )
    assert client.get("/api/v1/admin/labor-market/mappings").status_code == 401
    assert client.post(url, headers=learner, json=body).status_code == 403
    assert (
        client.get(
            "/api/v1/labor-market/indicators", params={"qualification_code": q.code}
        ).json()["items"]
        == []
    )
    assert client.post(url, headers=admin, json=body).status_code == 200
    assert client.post(url, headers=admin, json=body).status_code == 409
    assert (
        len(
            client.get(
                "/api/v1/labor-market/indicators", params={"qualification_code": q.code}
            ).json()["items"]
        )
        == 1
    )
    body.update(decision="rejected", expected_decision="approved")
    assert client.post(url, headers=admin, json=body).status_code == 200
    assert (
        client.get(
            "/api/v1/labor-market/indicators", params={"qualification_code": q.code}
        ).json()["items"]
        == []
    )
    items = client.get("/api/v1/admin/labor-market/mappings", headers=admin).json()[
        "items"
    ]
    assert len(items[0]["history"]) == 2


def test_national_fallback_and_regional_scope(session, bundle, admin):
    from tesda_track.models import Learner

    actor = session.exec(
        select(Learner).where(Learner.email == "admin@example.com")
    ).one()
    f, q, region = bundle()
    service.import_bundle(session, f)
    f2, _, _ = bundle(scope="regional", kind="regional_forecast", suffix="regional")
    service.import_bundle(session, f2)
    for m in session.exec(select(Mapping)).all():
        service.decide(
            session,
            m.id,
            ReviewInput(
                decision="approved",
                expected_decision="pending",
                note="Scope-checked isolated regional fixture",
            ),
            actor,
        )
    assert [x["geographic_scope"] for x in service.indicators(session, q.code)] == [
        "national"
    ]
    assert {
        x["geographic_scope"] for x in service.indicators(session, q.code, region.code)
    } == {"national", "regional"}
    with pytest.raises(InvalidRequestError):
        service.indicators(session, q.code, "invented-region")


@pytest.mark.parametrize(
    "kind,classification",
    [("observed_posting", "observed_posting"), ("historical_forecast", "in_demand")],
)
def test_other_evidence_types_never_become_forecast_badges(
    session, bundle, admin, kind, classification
):
    from tesda_track.models import Learner

    actor = session.exec(
        select(Learner).where(Learner.email == "admin@example.com")
    ).one()
    f, q, _ = bundle(kind=kind, classification=classification)
    service.import_bundle(session, f)
    m = session.exec(select(Mapping)).one()
    service.decide(
        session,
        m.id,
        ReviewInput(
            decision="approved",
            expected_decision="pending",
            note="Test-only cross-classification approval",
        ),
        actor,
    )
    assert service.indicators(session, q.code) == []


def test_import_validates_whole_bundle_before_writing(session, bundle):
    f, q, _ = bundle()
    data = (f / "evidence.csv").read_text()
    (f / "evidence.csv").write_text(data + data.splitlines()[1] + "\n")
    with pytest.raises(InvalidRequestError):
        service.import_bundle(session, f)
    assert session.exec(select(Dataset)).all() == []


def test_career_goal_updates_one_owned_record_without_matching(
    client, session, learner, other_learner
):
    import uuid

    key = uuid.uuid4()
    url = f"/api/v1/me/goals/career-selection/{key}"
    one = client.put(
        url,
        headers=learner,
        json={"title": "Welder", "target_qualification_code": "SMAW-NC-II"},
    )
    assert one.status_code == 200, one.text
    two = client.put(
        url,
        headers=learner,
        json={"title": "Fabricator", "target_qualification_code": "SMAW-NC-II"},
    )
    assert two.status_code == 200 and two.json()["id"] == one.json()["id"]
    assert len(client.get("/api/v1/me/goals", headers=learner).json()) == 1
    other = client.put(
        url,
        headers=other_learner,
        json={"title": "Welder", "target_qualification_code": "SMAW-NC-II"},
    )
    assert other.json()["id"] != one.json()["id"]
    assert (
        client.put(
            url,
            headers=learner,
            json={"title": "Doctor", "target_qualification_code": "SMAW-NC-II"},
        ).status_code
        == 422
    )


def test_approved_expired_forecast_is_not_current_demand(session, bundle, admin):
    from tesda_track.models import Learner

    actor = session.exec(
        select(Learner).where(Learner.email == "admin@example.com")
    ).one()
    folder, q, _ = bundle()
    meta = json.loads((folder / "dataset.json").read_text())
    meta.update(period_start_year=2020, period_end_year=2021, period_label="2020-2021")
    (folder / "dataset.json").write_text(json.dumps(meta))
    service.import_bundle(session, folder)
    mapping = session.exec(select(Mapping)).one()
    service.decide(
        session,
        mapping.id,
        ReviewInput(
            decision="approved",
            expected_decision="pending",
            note="Approve historical fixture to test expiry",
        ),
        actor,
    )
    assert service.indicators(session, q.code) == []


def test_whitespace_is_not_a_review_note():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ReviewInput(decision="approved", expected_decision="pending", note="        ")


def test_only_approved_forecast_titles_enrich_matching(session, bundle, admin):
    from tesda_track.models import Learner

    actor = session.exec(
        select(Learner).where(Learner.email == "admin@example.com")
    ).one()
    folder, q, _ = bundle()
    service.import_bundle(session, folder)
    mapping = session.exec(select(Mapping)).one()
    views = [{"code": q.code, "career_keywords": ["welding"]}]
    assert service.matching_rule_views(session, views)[0]["career_keywords"] == [
        "welding"
    ]
    service.decide(
        session,
        mapping.id,
        ReviewInput(
            decision="approved",
            expected_decision="pending",
            note="Approve isolated occupation search fixture",
        ),
        actor,
    )
    assert "welder" in service.matching_rule_views(session, views)[0]["career_keywords"]
    assert views[0]["career_keywords"] == ["welding"]
    service.decide(
        session,
        mapping.id,
        ReviewInput(
            decision="rejected",
            expected_decision="approved",
            note="Revoke isolated occupation search fixture",
        ),
        actor,
    )
    assert service.matching_rule_views(session, views)[0]["career_keywords"] == [
        "welding"
    ]


def test_review_history_does_not_block_account_deletion(session, bundle, admin):
    from tesda_track.models import Learner
    from tesda_track.services.accounts import delete_account

    actor = session.exec(
        select(Learner).where(Learner.email == "admin@example.com")
    ).one()
    folder, q, _ = bundle()
    service.import_bundle(session, folder)
    mapping = session.exec(select(Mapping)).one()
    service.decide(
        session,
        mapping.id,
        ReviewInput(
            decision="approved",
            expected_decision="pending",
            note="Reviewed isolated fixture before account deletion",
        ),
        actor,
    )
    delete_account(session, actor)
    session.flush()
    session.expire_all()
    history = session.exec(select(Review)).one()
    assert history.actor_id is None
    assert history.decision == "approved"
    assert len(service.indicators(session, q.code)) == 1


def test_explicit_demand_discovery_requires_approval_and_has_no_fake_fit(
    client, session, bundle, admin
):
    from tesda_track.models import Learner

    actor = session.exec(
        select(Learner).where(Learner.email == "admin@example.com")
    ).one()
    folder, q, _ = bundle()
    service.import_bundle(session, folder)
    body = {
        "query": "Suggest qualifications that are relevant to in-demand jobs in my area",
        "profile": {},
        "mode": "goal",
    }
    assert client.post("/api/v1/analysis/matches", json=body).json()["matches"] == []
    mapping = session.exec(select(Mapping)).one()
    service.decide(
        session,
        mapping.id,
        ReviewInput(
            decision="approved",
            expected_decision="pending",
            note="Approve isolated demand discovery fixture",
        ),
        actor,
    )
    response = client.post("/api/v1/analysis/matches", json=body)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["eligible_qualification_codes"] == [q.code]
    assert result["matches"][0]["qualification"]["code"] == q.code
    assert result["matches"][0]["basis"] == "demand_evidence"
    assert result["matches"][0]["score"] == 0
    assert "Philippines — National" in result["matches"][0]["reason"]
    body["query"] = "in-demand basketball jobs"
    assert client.post("/api/v1/analysis/matches", json=body).json()["matches"] == []
    body["query"] = "in-demand welding jobs"
    matched = client.post("/api/v1/analysis/matches", json=body).json()["matches"]
    assert matched[0]["qualification"]["code"] == q.code
    assert matched[0]["score"] > 0 and "basis" not in matched[0]


def test_demand_discovery_does_not_relabel_regional_evidence(
    client, session, bundle, admin
):
    from tesda_track.models import Learner

    actor = session.exec(
        select(Learner).where(Learner.email == "admin@example.com")
    ).one()
    folder, q, region = bundle(scope="regional", kind="regional_forecast")
    service.import_bundle(session, folder)
    mapping = session.exec(select(Mapping)).one()
    service.decide(
        session,
        mapping.id,
        ReviewInput(
            decision="approved",
            expected_decision="pending",
            note="Approve isolated regional forecast fixture",
        ),
        actor,
    )
    body = {"query": "in-demand jobs", "profile": {}, "mode": "skills"}
    assert client.post("/api/v1/analysis/matches", json=body).json()["matches"] == []
    body["region_code"] = region.code
    response = client.post("/api/v1/analysis/matches", json=body)
    assert response.status_code == 200, response.text
    assert region.name in response.json()["matches"][0]["reason"]
    assert "Philippines — National" not in response.json()["matches"][0]["reason"]
    body["region_code"] = "invented"
    assert client.post("/api/v1/analysis/matches", json=body).status_code == 422


def test_observed_postings_stay_separate_and_require_approved_current_evidence(
    client, session, bundle, admin
):
    from tesda_track.models import Learner

    actor = session.exec(
        select(Learner).where(Learner.email == "admin@example.com")
    ).one()
    folder, q, region = bundle(
        scope="regional", kind="observed_posting", classification="observed_posting"
    )
    service.import_bundle(session, folder)
    assert service.observed_postings(session, q.code) == []
    mapping = session.exec(select(Mapping)).one()
    service.decide(
        session,
        mapping.id,
        ReviewInput(
            decision="approved",
            expected_decision="pending",
            note="Review isolated posting association",
        ),
        actor,
    )
    result = client.get(
        "/api/v1/labor-market/indicators", params={"qualification_code": q.code}
    ).json()
    assert result["items"] == []
    assert result["postings"][0]["classification"] == "observed_posting"
    assert result["postings"][0]["coverage_label"] == region.name
    assert result["postings"][0]["observed_on"] == str(date.today())
    assert service.indicators(session, q.code) == []
    with pytest.raises(InvalidRequestError):
        service.observed_postings(session, q.code, "unknown")


def test_hard_to_fill_does_not_supply_learner_demand_recommendations(
    client, session, bundle, admin
):
    from tesda_track.models import Learner

    actor = session.exec(
        select(Learner).where(Learner.email == "admin@example.com")
    ).one()
    folder, q, _ = bundle(classification="hard_to_fill")
    service.import_bundle(session, folder)
    mapping = session.exec(select(Mapping)).one()
    service.decide(
        session,
        mapping.id,
        ReviewInput(
            decision="approved",
            expected_decision="pending",
            note="Preserve isolated hard-to-fill research record",
        ),
        actor,
    )
    assert service.indicators(session, q.code)[0]["classification"] == "hard_to_fill"
    result = client.post(
        "/api/v1/analysis/matches",
        json={"query": "in-demand jobs", "mode": "skills", "profile": {}},
    )
    assert result.status_code == 200
    assert result.json()["matches"] == []
