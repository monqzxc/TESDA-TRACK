"""Prepare/import latest-main labor evidence without merging main or changing the model.

Only exact occupation-title links already approved for an active qualification
are inherited. All other titles stay unmatched. Writes target the local isolated
preview only; default is a read-only database review and bundle preparation.
"""

import argparse
import csv
import hashlib
import io
import json
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlmodel import Session, select
from tesda_track.config import get_settings
from tesda_track.models import Learner, Qualification, Region
from tesda_track.models.labor_market import (
    LaborMarketDataset as Dataset,
    LaborMarketEvidence as Evidence,
    LaborMarketMapping as Mapping,
)
from tesda_track.schemas.labor_market import ReviewInput
from tesda_track.services import labor_market as service

COMMIT = "884a3897d38287e8331ae99645bfe683cebd5fdc"
RAW = ROOT / "backend/seed/sources/labor_demand"
OUT = ROOT / "backend/seed/sources/labor_market"
REPORT = ROOT / "reports/combined-demand-20261106"
FILES = [
    "philjobnet_vacancies_2026-11-04.csv",
    "philjobnet_postings_by_region_title_2026-11-04.csv",
    "careerinfo_ph_careers.csv",
    "jlmf_calabarzon_2026_2027_priority_occupations.csv",
    "README.md",
]


def source_files():
    RAW.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        data = subprocess.check_output(
            ["git", "show", f"{COMMIT}:backend/seed/sources/labor_demand/{name}"],
            cwd=ROOT,
        )
        path = RAW / name
        if path.exists() and path.read_bytes() != data:
            raise RuntimeError(f"Preserve existing changed source: {path}")
        if not path.exists():
            path.write_bytes(data)


def read(name):
    return list(csv.DictReader((RAW / name).open(encoding="utf-8-sig", newline="")))


def write_rows(path, rows):
    if not rows:
        return
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    settings = get_settings()
    url = make_url(settings.database_url)
    if (
        url.host not in ("127.0.0.1", "localhost")
        or settings.environment == "production"
    ):
        raise RuntimeError("Local isolated preview required")
    engine = create_engine(url.set(database="tesda_track_phase5_preview"))
    source_files()
    REPORT.mkdir(parents=True, exist_ok=True)
    with Session(engine) as session:
        assert (
            session.execute(text("select current_database()")).scalar()
            == "tesda_track_phase5_preview"
        )
        regions = set(session.exec(select(Region.code)).all())
        anchors = session.exec(
            select(Mapping, Evidence, Dataset, Qualification)
            .join(Evidence, Mapping.evidence_id == Evidence.id)
            .join(Dataset, Evidence.dataset_id == Dataset.id)
            .join(Qualification, Mapping.qualification_id == Qualification.id)
            .where(
                Mapping.decision == "approved",
                Mapping.proposal == "high_confidence",
                Dataset.status == "active",
                Dataset.evidence_class.in_(["national_forecast", "regional_forecast"]),
                Qualification.is_active == True,
            )
        ).all()
        by_title = defaultdict(dict)
        for mapping, evidence, dataset, qualification in anchors:
            if (
                mapping.training_regulation_url
                and mapping.training_regulation_reference
            ):
                by_title[service.job_key(evidence.occupation_title)][
                    qualification.code
                ] = (mapping, evidence, dataset, qualification)
        bundles = {}
        review = []
        skipped = Counter()

        def add(name, meta, evidence):
            entry = bundles.setdefault(name, [meta, [], []])
            entry[1].append(evidence)
            linked = by_title.get(service.job_key(evidence["occupation_title"]), {})
            for code, (anchor, old, old_dataset, q) in linked.items():
                # Exact reviewed title does not transfer forecast classification to a posting.
                proposal = (
                    "high_confidence"
                    if evidence["classification"] == "observed_posting"
                    else "needs_review"
                )
                mapping = dict(
                    mapping_key=evidence["occurrence_key"] + "-" + code,
                    occurrence_key=evidence["occurrence_key"],
                    qualification_code=code,
                    proposal=proposal,
                    evidence_tier="exact_previously_approved_title",
                    review_reason=f"Exact case/space-normalized title matches approved mapping {anchor.mapping_key}. Qualification scope and competencies retained from that review; source classification and geography remain independent. Regional forecast qualification requirements need separate manual review.",
                    competencies=json.dumps(anchor.competencies, ensure_ascii=False),
                    training_regulation_url=anchor.training_regulation_url,
                    training_regulation_reference=anchor.training_regulation_reference,
                    cautions=(
                        "Posting observation does not establish current availability, headcount, hiring eligibility or forecast demand."
                        if evidence["classification"] == "observed_posting"
                        else anchor.cautions or ""
                    ),
                )
                entry[2].append(mapping)
                review.append(
                    dict(
                        dataset=meta["source_id"],
                        occurrence_key=evidence["occurrence_key"],
                        occupation_title=evidence["occupation_title"],
                        classification=evidence["classification"],
                        region_code=meta["region_code"],
                        qualification_code=code,
                        anchor_mapping_key=anchor.mapping_key,
                        review_status=(
                            "validated_exact_existing_approved_title"
                            if proposal == "high_confidence"
                            else "regional_scope_manual_review"
                        ),
                    )
                )
            if not linked:
                review.append(
                    dict(
                        dataset=meta["source_id"],
                        occurrence_key=evidence["occurrence_key"],
                        occupation_title=evidence["occupation_title"],
                        classification=evidence["classification"],
                        region_code=meta["region_code"],
                        qualification_code="",
                        anchor_mapping_key="",
                        review_status="unmatched_manual_review",
                    )
                )

        postings = read(FILES[0])
        if len({r["job_id"] for r in postings}) != len(postings):
            raise RuntimeError("Duplicate posting IDs require review")
        for row in postings:
            region = row["region"]
            if region not in regions:
                skipped[region] += 1
                continue
            observed = datetime.strptime(row["snapshot_date"], "%Y-%m-%d").date()
            posted = datetime.strptime(row["posted_on"], "%m/%d/%Y").date()
            if posted > observed or observed.year != 2026 or posted.year != 2026:
                raise RuntimeError("Unexpected posting/snapshot period")
            source_id = "philjobnet-postings-2026-11-04-" + region.lower()
            meta = dict(
                source_id=source_id,
                version=1,
                publisher="DOLE-BLE / PhilJobNet",
                title=f"PhilJobNet posting snapshot — {region} — 4 November 2026",
                evidence_class="observed_posting",
                geographic_scope="regional",
                region_code=region,
                period_label="Observed 2026-11-04",
                period_start_year=2026,
                period_end_year=2026,
                source_url="https://philjobnet.gov.ph/job-vacancies/",
                file_sha256=hashlib.sha256((RAW / FILES[0]).read_bytes()).hexdigest(),
                notes="Dated list-page snapshot, not live vacancies or a forecast; counts are postings, not workers.",
                metadata=dict(
                    git_commit=COMMIT,
                    source_file=FILES[0],
                    snapshot_date=row["snapshot_date"],
                ),
            )
            evidence = dict(
                occurrence_key="PJN-" + row["job_id"],
                source_record_id=row["job_id"],
                occupation_title=row["title"],
                classification="observed_posting",
                geographic_scope="regional",
                region_code=region,
                locality=row["location"][:120],
                observed_on=row["snapshot_date"],
                source_url="https://philjobnet.gov.ph/job-vacancies/?page="
                + row["list_page"],
                source_table="PhilJobNet list page " + row["list_page"],
                verification="Existing latest-main snapshot; no live availability check",
                provenance=json.dumps(
                    dict(row, original_git_commit=COMMIT), ensure_ascii=False
                ),
            )
            add(source_id + "-v1", meta, evidence)

        # Preserve IV-A evidence as a regional forecast; never call it NCR demand.
        cal_name = FILES[3]
        cal_url = "https://sites.google.com/dole.gov.ph/employment-programs/home/jlmf"
        for index, row in enumerate(read(cal_name), 1):
            for flag, classification in [
                ("in_demand", "in_demand"),
                ("hard_to_fill", "hard_to_fill"),
            ]:
                if row[flag] != "True":
                    continue
                source_id = "dole-iva-jlmf-2026-2027"
                meta = dict(
                    source_id=source_id,
                    version=1,
                    publisher="DOLE Region IV-A",
                    title="CALABARZON Jobs and Labor Market Forecast 2026–2027",
                    evidence_class="regional_forecast",
                    geographic_scope="regional",
                    region_code="IV-A",
                    period_label="2026–2027",
                    period_start_year=2026,
                    period_end_year=2027,
                    source_url=cal_url,
                    file_sha256=hashlib.sha256(
                        (RAW / cal_name).read_bytes()
                    ).hexdigest(),
                    notes="Latest-main page-checked transcription; source portal retained. Consultation date 2025-11-14 per source README; PDF page as in CSV.",
                    metadata=dict(git_commit=COMMIT, source_file=cal_name),
                )
                evidence = dict(
                    occurrence_key=f"IVA-{index:03d}-{classification}",
                    source_record_id=f"IVA-CSV-{index}",
                    occupation_title=row["occupation"],
                    sector=row["sector"],
                    classification=classification,
                    geographic_scope="regional",
                    region_code="IV-A",
                    page_pdf=row["page"],
                    source_table=row["sector"],
                    source_url=cal_url,
                    verification="Latest-main page-checked transcription; see retained original CSV",
                    provenance=json.dumps(
                        dict(row, original_git_commit=COMMIT), ensure_ascii=False
                    ),
                )
                add(source_id + "-v1", meta, evidence)

        imported = []
        for name, (meta, evidence, mappings) in sorted(bundles.items()):
            folder = OUT / name
            folder.mkdir(parents=True, exist_ok=True)
            files = {
                "dataset.json": (
                    json.dumps(meta, ensure_ascii=False, indent=2) + "\n"
                ).encode()
            }
            for filename, rows in [
                ("evidence.csv", evidence),
                ("mappings.csv", mappings),
            ]:
                if rows:
                    buffer = io.StringIO(newline="")
                    writer = csv.DictWriter(
                        buffer, fieldnames=list(rows[0]), lineterminator="\n"
                    )
                    writer.writeheader()
                    writer.writerows(rows)
                    files[filename] = buffer.getvalue().encode()
            for filename, content in files.items():
                path = folder / filename
                already_imported = (
                    session.exec(
                        select(Dataset.id).where(
                            Dataset.key == meta["source_id"] + "@1"
                        )
                    ).first()
                    is not None
                )
                if path.exists() and path.read_bytes() != content and already_imported:
                    raise RuntimeError(f"Refuse to overwrite changed bundle: {path}")
                if not path.exists() or path.read_bytes() != content:
                    path.write_bytes(content)
            if args.apply:
                imported.append(service.import_bundle(session, folder))
        if args.apply:
            credentials = json.loads(
                (
                    Path.home() / ".codex/private/tesda-track-phase5-reviewer.json"
                ).read_text()
            )
            actor = session.exec(
                select(Learner).where(Learner.email == credentials["email"])
            ).one()
            if not actor.is_active or "labor-market:review" not in actor.permissions:
                raise RuntimeError("Authorized existing reviewer required")
            new_source_ids = [entry[0]["source_id"] for entry in bundles.values()]
            for mapping in session.exec(
                select(Mapping)
                .join(Evidence, Mapping.evidence_id == Evidence.id)
                .join(Dataset, Evidence.dataset_id == Dataset.id)
                .where(
                    Dataset.source_id.in_(new_source_ids),
                    Mapping.decision == "pending",
                    Mapping.proposal == "high_confidence",
                )
            ).all():
                service.decide(
                    session,
                    mapping.id,
                    ReviewInput(
                        decision="approved",
                        expected_decision="pending",
                        note="User-authorized combined-data activation. Exact occupation title and qualification match an existing approved mapping; TR scope retained. No fuzzy or model-generated links approved.",
                    ),
                    actor,
                )
            session.commit()
        write_rows(REPORT / "mapping-review.csv", review)
        summary = dict(
            applied=args.apply,
            database="tesda_track_phase5_preview",
            main_commit=COMMIT,
            posting_source_rows=len(postings),
            domestic_postings_importable=sum(
                len(b[1])
                for b in bundles.values()
                if b[0]["evidence_class"] == "observed_posting"
            ),
            skipped_postings=dict(skipped),
            exact_mapping_proposals=sum(len(b[2]) for b in bundles.values()),
            matched_occurrences=len(
                {
                    (r["dataset"], r["occurrence_key"])
                    for r in review
                    if r["qualification_code"]
                }
            ),
            unmatched_occurrences=sum(
                r["review_status"] == "unmatched_manual_review" for r in review
            ),
            by_dataset={
                name: dict(evidence=len(b[1]), mappings=len(b[2]))
                for name, b in sorted(bundles.items())
            },
            imports=imported,
            career_profiles="124 undated profiles preserved as context only; not activated as 2026 demand",
        )
        (REPORT / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
        print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
