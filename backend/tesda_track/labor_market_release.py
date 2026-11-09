"""Apply a portable, reviewed labor-market handoff after importing its bundles.

Dry run by default. No database-specific IDs or reviewer credentials are stored in
the manifest. All checks precede writes; decisions and dataset activation use the
existing authorized, audited workflow in one transaction.
"""

import argparse
import json
from pathlib import Path

from sqlmodel import Session, select
from tesda_track.db import get_engine
from tesda_track.models import Learner, Qualification
from tesda_track.models.labor_market import (
    LaborMarketDataset as Dataset,
    LaborMarketEvidence as Evidence,
    LaborMarketMapping as Mapping,
)
from tesda_track.schemas.labor_market import ReviewInput
from tesda_track.services import labor_market as service


def apply_manifest(session, manifest, actor, *, apply=False):
    if not actor.is_active or "labor-market:review" not in actor.permissions:
        raise ValueError("An active authorized reviewer is required")
    if manifest.get("format") != "tesda-reviewed-labor-market-v1":
        raise ValueError("Unsupported release manifest")
    datasets, decisions = {}, []
    for entry in manifest["datasets"]:
        if entry["key"] in datasets or entry["status"] not in ("active", "retired"):
            raise ValueError("Invalid or duplicate dataset entry")
        dataset = session.exec(
            select(Dataset).where(Dataset.key == entry["key"]).with_for_update()
        ).one()
        if dataset.input_sha256 != entry["input_sha256"]:
            raise ValueError("Dataset fingerprint mismatch: " + entry["key"])
        datasets[entry["key"]] = (dataset, entry["status"])
    active_sources = [
        row.source_id for row, desired in datasets.values() if desired == "active"
    ]
    if len(active_sources) != len(set(active_sources)):
        raise ValueError("Manifest activates multiple versions of one source")
    for dataset in session.exec(
        select(Dataset).where(
            Dataset.source_id.in_(active_sources), Dataset.status == "active"
        )
    ).all():
        if dataset.key not in datasets:
            raise ValueError(
                "A different active source version needs review: " + dataset.key
            )
    seen = set()
    for entry in manifest["decisions"]:
        key = entry["mapping_key"]
        if key in seen or entry["decision"] not in ("approved", "rejected"):
            raise ValueError("Invalid or duplicate mapping decision")
        seen.add(key)
        mapping, evidence, qualification = session.exec(
            select(Mapping, Evidence, Qualification)
            .join(Evidence, Mapping.evidence_id == Evidence.id)
            .join(Qualification, Mapping.qualification_id == Qualification.id)
            .where(Mapping.mapping_key == key)
            .with_for_update()
        ).one()
        dataset = datasets[entry["dataset_key"]][0]
        if (
            evidence.dataset_id != dataset.id
            or evidence.occurrence_key != entry["occurrence_key"]
            or evidence.occupation_title != entry["occupation_title"]
            or evidence.classification != entry["classification"]
            or qualification.code != entry["qualification_code"]
            or mapping.proposal != entry["proposal"]
        ):
            raise ValueError("Mapping identity mismatch: " + key)
        if entry["decision"] == "approved" and mapping.proposal != "high_confidence":
            raise ValueError("Only reviewed high-confidence mappings may activate")
        if mapping.decision not in ("pending", entry["decision"]):
            raise ValueError("Conflicting existing review decision: " + key)
        if mapping.decision != entry["decision"]:
            # Validate the note before any mutation, even in dry-run mode.
            request = ReviewInput(
                decision=entry["decision"],
                expected_decision="pending",
                note=entry["note"],
            )
            decisions.append((mapping, request))
    statuses = [
        (row, desired) for row, desired in datasets.values() if row.status != desired
    ]
    if apply:
        for mapping, request in decisions:
            service.decide(session, mapping.id, request, actor)
        # Retire recorded superseded versions before activating replacements.
        for row, desired in sorted(statuses, key=lambda pair: pair[1] != "retired"):
            service.set_dataset_status(
                session,
                row.id,
                desired,
                "Reviewed release handoff: " + manifest["batch"],
                actor,
            )
    return dict(
        dry_run=not apply,
        dataset_versions_verified=len(datasets),
        decisions_verified=len(seen),
        decisions_to_apply=len(decisions),
        dataset_statuses_to_apply=len(statuses),
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--actor-email", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8-sig"))
    with Session(get_engine()) as session:
        actor = session.exec(
            select(Learner).where(Learner.email == args.actor_email)
        ).one()
        result = apply_manifest(session, manifest, actor, apply=args.apply)
        if args.apply:
            session.commit()
        else:
            session.rollback()
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
