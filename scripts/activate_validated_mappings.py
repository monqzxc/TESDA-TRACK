"""Validate recorded evidence, then optionally activate supported national mappings in the isolated preview.

Default is a dry run. --apply uses the existing permission-checked reviewer and
audited decision service. Original research/import bundles are never rewritten.
"""

import argparse
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlmodel import Session, select
from tesda_track.config import get_settings
from tesda_track.models import Learner, Qualification
from tesda_track.models.labor_market import (
    LaborMarketDataset as Dataset,
    LaborMarketEvidence as Evidence,
    LaborMarketMapping as Mapping,
)
from tesda_track.schemas.labor_market import ReviewInput
from tesda_track.services import labor_market as service

BATCH = "national-validation-2026-11-06"
SOURCE_ID = "dole-ble-national-jlmf-2025-2026"
HELD = {"PH4-C224", "PH4-C226", "PH4-C227"}
OUT = ROOT / "reports/activation-20261106"


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def norm(value):
    return re.sub("[^a-z0-9]", "", value.casefold())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    settings = get_settings()
    url = make_url(settings.database_url)
    if (
        url.host not in ("localhost", "127.0.0.1")
        or settings.environment == "production"
    ):
        raise RuntimeError("This command is restricted to the isolated local preview.")
    engine = create_engine(url.set(database="tesda_track_phase5_preview"))
    pdf_path = (
        Path.home()
        / "Downloads/National-Jobs-and-Labor-Market-Forecast-2025-2026-Report.pdf"
    )
    pdf_bytes = pdf_path.read_bytes()
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    pdf_sha = hashlib.sha256(pdf_bytes).hexdigest()
    proposals = read_csv(
        ROOT
        / "data-review/phase4/datasets/high_confidence_national_forecast_proposals.csv"
    )
    if len(proposals) != 80:
        raise RuntimeError(
            "The reviewed national queue changed; revalidate before activation."
        )
    scopes = json.loads(
        (ROOT / "data-review/phase4/evidence/tr-scope-index.json").read_text(
            encoding="utf-8"
        )
    )
    bundle = (
        ROOT / "backend/seed/sources/labor_market/dole-ble-national-jlmf-2025-2026-v1"
    )
    meta = json.loads((bundle / "dataset.json").read_text(encoding="utf-8-sig"))
    if pdf_sha != meta["file_sha256"]:
        raise RuntimeError("Original DOLE PDF fingerprint mismatch.")
    fingerprint = hashlib.sha256(
        b"".join(
            p.name.encode() + b"\0" + p.read_bytes()
            for p in [
                bundle / "dataset.json",
                bundle / "evidence.csv",
                bundle / "mappings.csv",
            ]
        )
    ).hexdigest()
    credentials = json.loads(
        (Path.home() / ".codex/private/tesda-track-phase5-reviewer.json").read_text(
            encoding="utf-8"
        )
    )
    decisions = []
    with Session(engine) as session:
        if (
            session.execute(text("select current_database()")).scalar()
            != "tesda_track_phase5_preview"
        ):
            raise RuntimeError("Wrong target database.")
        actor = session.exec(
            select(Learner).where(Learner.email == credentials["email"])
        ).one()
        if not actor.is_active or "labor-market:review" not in actor.permissions:
            raise RuntimeError("Existing active authorized reviewer required.")
        dataset = session.exec(
            select(Dataset).where(
                Dataset.source_id == SOURCE_ID, Dataset.status == "active"
            )
        ).one()
        if dataset.input_sha256 != fingerprint or dataset.file_sha256 != pdf_sha:
            raise RuntimeError(
                "Active database evidence does not match the reviewed bundle/PDF."
            )
        for row in proposals:
            key = row["mapping_review_id"]
            mapping, evidence, qualification = session.exec(
                select(Mapping, Evidence, Qualification)
                .join(Evidence, Mapping.evidence_id == Evidence.id)
                .join(Qualification, Mapping.qualification_id == Qualification.id)
                .where(Mapping.mapping_key == dataset.key + ":" + key)
            ).one()
            assert mapping.proposal == "high_confidence"
            assert mapping.decision in (
                "pending",
                "approved",
            ), f"{key}: another reviewer rejected this mapping"
            assert evidence.dataset_id == dataset.id
            assert evidence.occurrence_key == row["source_occurrence_key"]
            assert evidence.occupation_title == row["occupation_title_as_printed"]
            assert evidence.sector == row["sector_as_printed"]
            assert evidence.classification == row["classification"]
            assert (
                evidence.geographic_scope == "national" and evidence.region_code is None
            )
            assert (
                qualification.code == row["qualification_code"]
                and qualification.is_active
            )
            assert qualification.name == row["qualification_name"]
            assert dataset.period_start_year == 2025 and dataset.period_end_year == 2026
            assert row["source_pdf_sha256"] == pdf_sha
            core = {
                c.name
                for c in qualification.competencies
                if c.is_active and c.category == "Core"
            }
            cited_core = set(json.loads(row["relevant_core_competencies"]))
            assert (
                cited_core and cited_core <= core
            ), f"{key}: catalog competencies changed"
            page = doc[int(row["page_pdf"]) - 1]
            width = page.rect.width
            clip = pymupdf.Rect(
                width * (0.425 if evidence.classification == "in_demand" else 0.715),
                0,
                width * (0.715 if evidence.classification == "in_demand" else 1),
                page.rect.height,
            )
            assert norm(evidence.occupation_title) in norm(
                page.get_text(clip=clip)
            ), f"{key}: occupation absent from reported classification column"
            tr_verified = False
            if row["training_regulation_sha256"]:
                pdf = ROOT / "data-review/phase4/raw" / f"{qualification.code}.pdf"
                assert (
                    hashlib.sha256(pdf.read_bytes()).hexdigest()
                    == row["training_regulation_sha256"]
                )
                scope = scopes[qualification.code]
                assert (
                    scope["sha256"] == row["training_regulation_sha256"]
                    and scope["scope_text"]
                )
                tr_verified = True
            held = key in HELD
            decisions.append(
                dict(
                    mapping_id=mapping.id,
                    mapping_key=key,
                    occupation=evidence.occupation_title,
                    qualification_code=qualification.code,
                    classification=evidence.classification,
                    sector=evidence.sector,
                    occurrence_key=evidence.occurrence_key,
                    decision="hold_pending" if held else "approve",
                    reason=(
                        "Methodology component only; complete domain qualification and trainer credentials are unresolved."
                        if held
                        else row["review_reason"]
                    ),
                    evidence_tier=row["evidence_tier"],
                    independent_tr_pdf_verified=tr_verified,
                    source_reference=row["source_reference"],
                    tesda_reference=row["training_regulation_reference"],
                )
            )
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / "review-decisions.json").write_text(
            json.dumps(
                dict(
                    batch=BATCH,
                    target_database="tesda_track_phase5_preview",
                    source_pdf_sha256=pdf_sha,
                    rows=decisions,
                ),
                indent=2,
            ),
            encoding="utf-8",
        )
        applied = []
        if args.apply:
            for decision in decisions:
                mapping = session.get(Mapping, decision["mapping_id"])
                if decision["decision"] != "approve":
                    note = BATCH + ": held pending. " + decision["reason"]
                    if mapping.decision == "pending" and mapping.decision_note != note:
                        service.decide(
                            session,
                            mapping.id,
                            ReviewInput(
                                decision="pending",
                                expected_decision="pending",
                                note=note,
                            ),
                            actor,
                        )
                    continue
                if mapping.decision == "approved":
                    continue
                note = (
                    f'{BATCH}. User authorized validation and activation. Verified original DOLE PDF occupation in the {decision["classification"]} column; national 2025–2026 scope, unique occurrence, active catalog qualification and cited core units checked. Evidence tier: {decision["evidence_tier"]}. '
                    + decision["reason"]
                    + " Training relevance only; no guarantee of licensing, employment eligibility or full employer-duty coverage."
                )
                service.decide(
                    session,
                    mapping.id,
                    ReviewInput(
                        decision="approved", expected_decision="pending", note=note
                    ),
                    actor,
                )
                applied.append(mapping.id)
            demo = session.exec(
                select(Dataset).where(Dataset.source_id == "phase5-isolated-demo")
            ).first()
            if demo is not None and demo.status == "active":
                service.set_dataset_status(
                    session,
                    demo.id,
                    "retired",
                    BATCH
                    + ": real validated evidence activated; retire the demonstration fixture.",
                    actor,
                )
            session.commit()
        else:
            session.rollback()
        result = dict(
            batch=BATCH,
            dry_run=not args.apply,
            validated=len(decisions),
            approved_candidates=sum(d["decision"] == "approve" for d in decisions),
            held_pending=sum(d["decision"] == "hold_pending" for d in decisions),
            newly_activated=len(applied),
            mapping_ids=applied,
        )
        (OUT / ("activation-result.json" if args.apply else "dry-run.json")).write_text(
            json.dumps(result, indent=2), encoding="utf-8"
        )
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
