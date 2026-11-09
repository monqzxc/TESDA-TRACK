import copy
import pytest
from sqlmodel import select

from tesda_track.labor_market_release import apply_manifest
from tesda_track.models import Learner
from tesda_track.models.labor_market import (
    LaborMarketDataset as Dataset,
    LaborMarketEvidence as Evidence,
    LaborMarketMapping as Mapping,
    LaborMarketReview as Review,
)
from tesda_track.services import labor_market as service
from backend.tests.test_labor_market import bundle


def manifest_for(session):
    dataset = session.exec(select(Dataset)).one()
    mapping = session.exec(select(Mapping)).one()
    evidence = session.get(Evidence, mapping.evidence_id)
    return dict(
        format="tesda-reviewed-labor-market-v1",
        batch="isolated-release-test",
        datasets=[
            dict(key=dataset.key, input_sha256=dataset.input_sha256, status="active")
        ],
        decisions=[
            dict(
                mapping_key=mapping.mapping_key,
                dataset_key=dataset.key,
                occurrence_key=evidence.occurrence_key,
                occupation_title=evidence.occupation_title,
                classification=evidence.classification,
                qualification_code="SMAW-NC-II",
                proposal=mapping.proposal,
                decision="approved",
                note="Reviewed isolated release test fixture",
            )
        ],
    )


def test_release_is_dry_by_default_validates_identity_and_is_idempotent(
    session, bundle, admin
):
    folder, _, _ = bundle()
    service.import_bundle(session, folder)
    actor = session.exec(
        select(Learner).where(Learner.email == "admin@example.com")
    ).one()
    manifest = manifest_for(session)
    assert apply_manifest(session, manifest, actor)["decisions_to_apply"] == 1
    assert session.exec(select(Mapping)).one().decision == "pending"
    assert session.exec(select(Review)).all() == []
    wrong = copy.deepcopy(manifest)
    wrong["decisions"][0]["qualification_code"] = "wrong"
    with pytest.raises(ValueError, match="identity mismatch"):
        apply_manifest(session, wrong, actor, apply=True)
    assert session.exec(select(Mapping)).one().decision == "pending"
    assert (
        apply_manifest(session, manifest, actor, apply=True)["decisions_to_apply"] == 1
    )
    assert (
        apply_manifest(session, manifest, actor, apply=True)["decisions_to_apply"] == 0
    )
    assert len(session.exec(select(Review)).all()) == 1


def test_release_refuses_changed_source_or_ambiguous_approval(session, bundle, admin):
    folder, _, _ = bundle(proposal="needs_review")
    service.import_bundle(session, folder)
    actor = session.exec(
        select(Learner).where(Learner.email == "admin@example.com")
    ).one()
    manifest = manifest_for(session)
    wrong = copy.deepcopy(manifest)
    wrong["datasets"][0]["input_sha256"] = "0" * 64
    with pytest.raises(ValueError, match="fingerprint mismatch"):
        apply_manifest(session, wrong, actor, apply=True)
    with pytest.raises(ValueError, match="high-confidence"):
        apply_manifest(session, manifest, actor, apply=True)
    assert session.exec(select(Mapping)).one().decision == "pending"
