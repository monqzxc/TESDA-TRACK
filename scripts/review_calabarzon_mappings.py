"""Reproduce the evidence review of 25 CALABARZON candidates; preview-only activation.

Original v1 bundles and Phase 3/4 research remain immutable. A reviewed v2 bundle
records stronger evidence and retains original occupation titles/classifications.
Default prepares review artifacts without database writes. --apply activates only
the eight supported in-demand links; hard-to-fill links stay excluded.
"""

import argparse
import csv
import hashlib
import io
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlmodel import Session, select
from tesda_track.config import get_settings
from tesda_track.models import Learner
from tesda_track.models.labor_market import (
    LaborMarketDataset as Dataset,
    LaborMarketEvidence as Evidence,
    LaborMarketMapping as Mapping,
)
from tesda_track.schemas.labor_market import ReviewInput
from tesda_track.services import catalog, labor_market as service

REVIEW = ROOT / "data-review/calabarzon-review-2026-11-06"
V1 = ROOT / "backend/seed/sources/labor_market/dole-iva-jlmf-2026-2027-v1"
V2 = V1.with_name("dole-iva-jlmf-2026-2027-v2")
PDF_URL = "https://drive.google.com/file/d/1X1zTC5KfxGpJ3W4FXgvrd6EX2c6h5SKu/view"
TABLES = {
    39: 12,
    40: 13,
    41: 13,
    42: 14,
    43: 15,
    44: 15,
    45: 16,
    46: 17,
    47: 18,
    48: 19,
    49: 20,
}


def rows(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_csv(path, records):
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=list(records[0]), lineterminator="\n")
    writer.writeheader()
    writer.writerows(records)
    content = buffer.getvalue()
    if (
        path.parent == V2
        and path.exists()
        and path.read_text(encoding="utf-8") != content
    ):
        raise RuntimeError(
            "Reviewed v2 is immutable; create a new dataset version: " + str(path)
        )
    with path.open("w", encoding="utf-8", newline="") as stream:
        stream.write(content)


HIGH = {
    4: "The forecast accepts HS graduates for retail bagging. TESDA's Customer Services NC II TR explicitly names Counter-Checker/Bagger; customer handling, retail equipment and merchandise presentation support this training pathway.",
    47: "JHS-level warehouse personnel in transportation/storage align with receiving, storing, picking, dispatching and packing goods in Warehousing Services NC II. Its TR explicitly includes Warehouseperson.",
    52: "The construction forecast explicitly requires Electrical NC II for wiring and onsite work. EIM NC II's building/residential wiring scope and installation/protection competencies directly match, without implying electrical-engineer licensing eligibility.",
    115: "The manpower-agency deployment is wholesale/retail and requires HS graduation plus POS skills. Customer Services NC II explicitly includes Cashier, retail-equipment operation and register balancing; the unrelated degree requirement from the other Cashier occurrence is not inherited.",
    116: "The forecast places cooks in accommodation/food services and requests vocational training with NC II. Cookery NC II explicitly includes Cook/Commis and Assistant Cook and teaches kitchen hygiene and meal preparation; this is relevant training, not guaranteed employment or experience.",
    126: "The manpower-agency deployment is wholesale/retail and requires SHS plus sales skills. Customer Services NC II covers selling, stock control and elective merchandise presentation and explicitly includes Promo Merchandiser. Merchandise electives may be needed.",
    141: "The manpower-agency deployment is transportation/storage, requires HS graduation and cites e-commerce logistics. Warehousing Services NC II's Warehouseperson role and goods-handling competencies directly align.",
}
MANUAL = {
    5: "Cashier is a strong retail competency match, but this specific wholesale/retail forecast row requires BS Accountancy. NC II does not replace that degree; retain as a possible supplementary training relationship pending an education-aware presentation.",
    10: "Retail display and stock rotation align with the TR's merchandiser role, but this forecast occurrence specifies a four-year course. The NC II connection alone would conceal an education requirement; supplementary-training scope needs explicit review.",
    18: "The automotive electrical-repair NC II TR covers ignition, starting, charging, body electrical systems and manual air-conditioning. The forecast highlights modern electronics and advanced diagnostics. Obtain the actual task scope before claiming this NC II covers advanced systems; Automotive Diagnosis (Electrical) NC III may be needed.",
    48: "Warehousing Services NC IV explicitly prepares Warehouse Supervisors, but the forecast additionally specifies BS Logistics or a business-related course. The training relevance is strong, but NC IV must not be presented as a substitute for that degree; confirm education/experience-aware guidance first.",
    88: "The IT-BPM sector and outsourcing reason align with contact-center customer support, but the report specifies a business-related course and six months' experience. Retain only as a potential entry-level skills relationship until education/experience constraints can be communicated.",
    96: "The contact-center TR explicitly includes entry-level Technical Support and IT Helpdesk; however, the forecast requires a business-related course and six months' experience. NC II is not evidence of those credentials or all specialist troubleshooting duties; keep the contextual link for manual review.",
    97: "The existing Web Development NC III covers website design, scripting and back-end work, but the forecast requires BS IT and programming knowledge. TESDA Board Resolution 2024-14 also amends the legacy qualification into Web Design, Front-End and Back-End qualifications. Review catalog currency and degree-aware guidance before activating this regional link.",
    119: "The original PDF explicitly deploys these electricians to manufacturing and requires at least an associate degree. EIM NC II is scoped to building/residential-commercial wiring; factory machinery or industrial controls are not established by the report. Require employer task evidence and education-aware guidance.",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    original_csv = (
        ROOT
        / "backend/seed/sources/labor_demand/jlmf_calabarzon_2026_2027_priority_occupations.csv"
    )
    reextracted = REVIEW / "evidence/reextracted-forecast.csv"
    if rows(original_csv) != rows(reextracted):
        raise RuntimeError(
            "Original PDF extraction must exactly match all 142 source rows"
        )
    pdf = REVIEW / "raw/DOLE-IVA-JLMF-2026-2027.pdf"
    if sha(pdf) != "793365290995c681af4fd7665bb9197096a5aece5472ab1b129c9ef2ea3a4767":
        raise RuntimeError("Unexpected official forecast PDF")
    scope_index = json.loads(
        (ROOT / "data-review/phase4/evidence/tr-scope-index.json").read_text(
            encoding="utf-8"
        )
    )
    downloaded = json.loads(
        (REVIEW / "evidence/tr-downloads.json").read_text(encoding="utf-8")
    )
    settings = get_settings()
    url = make_url(settings.database_url)
    if (
        url.host not in ("localhost", "127.0.0.1")
        or settings.environment == "production"
    ):
        raise RuntimeError("Local isolated preview required")
    engine = create_engine(url.set(database="tesda_track_phase5_preview"))
    evidence = rows(V1 / "evidence.csv")
    by_key = {row["occurrence_key"]: row for row in evidence}
    mappings = rows(V1 / "mappings.csv")
    if len(mappings) != 25:
        raise RuntimeError("Expected original review queue of 25")
    reviewed = []
    activation = []
    with Session(engine) as session:
        if (
            session.execute(text("select current_database()")).scalar()
            != "tesda_track_phase5_preview"
        ):
            raise RuntimeError("Wrong database")
        active = {item.code: item for item in catalog.snapshot(session).items}
        for mapping in mappings:
            item = by_key[mapping["occurrence_key"]]
            origin = json.loads(item["provenance"])
            number = int(mapping["occurrence_key"].split("-")[1])
            code = mapping["qualification_code"]
            qualification = active[code]
            core = [
                c.name
                for c in qualification.public.competencies
                if c.category.casefold() == "core"
            ]
            if number == 61:
                if code == "PLUMBING-NC-II":
                    status = "high_confidence"
                    reason = "The construction row explicitly specifies Plumbing NC II. The amended Plumbing NC II TR names Plumber II and covers multi-unit plumbing installation, leak testing, repair and maintenance. NC I must not substitute for this requirement."
                else:
                    status = "rejected"
                    reason = "The original forecast explicitly requires Plumbing NC II, whereas this candidate links NC I's single-unit/entry-level scope. Reject this candidate for the stated requirement; use the reviewed NC II link for the same original occupation."
            elif number in (6, 117):
                status = "rejected"
                reason = "The source sector/deployment is wholesale-retail (and accommodation/food services for the agency row), not an established contact-center role. Contact Center Services NC II is scoped to inbound/outbound contact-center agents. A shared Customer Service Representative title and mention of online/BPO growth do not establish the required channel or tasks. Review Customer Services NC II or hospitality-specific training separately."
            elif number in HIGH:
                status, reason = "high_confidence", HIGH[number]
            else:
                status, reason = "needs_review", MANUAL[number]
            tr = downloaded.get(code) or scope_index.get(code)
            if tr:
                tr_url = tr.get("url") or tr["final_url"]
                tr_hash = tr["sha256"]
                tr_file = (
                    REVIEW / "raw" / (code + ".pdf")
                    if code in downloaded
                    else ROOT / "data-review/phase4/raw" / (code + ".pdf")
                )
                if sha(tr_file) != tr_hash:
                    raise RuntimeError("TR evidence fingerprint mismatch: " + code)
            else:
                tr_url, tr_hash = mapping["training_regulation_url"], ""
            tr_reference = {
                "COOKERY-NC-II": "Section 1, PDF p.3 / printed p.1",
                "PLUMBING-NC-II": "Section 1, PDF p.3 / printed p.1",
                "WAREHOUSING-SERVICES-NC-IV": "Section 1, PDF pp.3-4 / printed pp.1-2",
                "WEB-DEVELOPMENT-NC-III": "Legacy TR Section 1, PDF p.5 / printed p.1; TESDA Board Resolution 2024-14",
                "AUTOMOTIVE-SERVICING-NC-II-2": "Section 1, PDF pp.5-6 / printed pp.4-5",
            }.get(code, mapping["training_regulation_reference"])
            decision = (
                "approved"
                if status == "high_confidence" and item["classification"] == "in_demand"
                else "rejected" if status == "rejected" else "pending"
            )
            mapping.update(
                proposal=status,
                evidence_tier="official_forecast_and_TR_scope_review",
                review_reason=reason,
                competencies=json.dumps(core, ensure_ascii=False),
                training_regulation_url=tr_url,
                training_regulation_reference=tr_reference,
                cautions="Training relationship only; source education, experience, licensing and deployment requirements remain applicable. Hard-to-fill-only evidence is excluded from learner recommendations.",
            )
            page = int(item["page_pdf"])
            reviewed.append(
                dict(
                    mapping_key=mapping["mapping_key"],
                    source_occurrence_key=item["occurrence_key"],
                    original_record_id=item["source_record_id"],
                    occupation_title=item["occupation_title"],
                    sector=item["sector"],
                    deployment=origin.get("deployment", ""),
                    original_general_qualification=origin["general_qualification"],
                    classification=item["classification"],
                    region_code="IV-A",
                    reporting_period="2026-2027",
                    qualification_code=code,
                    qualification_name=qualification.summary.name,
                    review_status=status,
                    application_decision=decision,
                    reason=reason,
                    relevant_competencies=json.dumps(core, ensure_ascii=False),
                    source_url=PDF_URL,
                    source_reference=f"Table {TABLES[page]}, PDF p.{page}; printed p.{page-4}",
                    source_pdf_sha256=sha(pdf),
                    training_regulation_url=tr_url,
                    training_regulation_reference=tr_reference,
                    training_regulation_sha256=tr_hash,
                    additional_source_url=(
                        "https://www.tesda.gov.ph/boardreso?page=4"
                        if number == 97
                        else ""
                    ),
                )
            )
            activation.append(
                dict(
                    mapping_key=mapping["mapping_key"],
                    occurrence_key=item["occurrence_key"],
                    qualification_code=code,
                    decision=decision,
                    reason=reason,
                )
            )
        for item in evidence:
            page = int(item["page_pdf"])
            item["page_printed"] = str(page - 4)
            item["source_table"] = (
                f"Table {TABLES.get(page, '')}: " + item["source_table"]
            )
            item["source_url"] = PDF_URL
            item["verification"] = (
                "Source CSV re-extracted identically from official PDF; all candidate pages visually checked"
            )
        metadata = json.loads((V1 / "dataset.json").read_text(encoding="utf-8"))
        metadata.update(
            version=2,
            source_url=PDF_URL,
            source_url_kind="public_official_PDF_from_DOLE_IV_A_compendium",
            file_sha256=sha(pdf),
            notes="Evidence-reviewed replacement for v1. All 142 CSV rows reproduce identically from the official 70-page PDF. Only supported in-demand links activate; degree/context gaps stay pending and unsupported candidates are rejected.",
            metadata={
                **metadata.get("metadata", {}),
                "source_csv_sha256": sha(original_csv),
                "review_batch": "calabarzon-scope-review-2026-11-06",
                "supersedes": "dole-iva-jlmf-2026-2027@1",
            },
        )
        V2.mkdir(parents=True, exist_ok=True)
        write_csv(REVIEW / "reviewed-mappings.csv", reviewed)
        write_csv(V2 / "evidence.csv", evidence)
        write_csv(V2 / "mappings.csv", mappings)
        metadata_content = json.dumps(metadata, ensure_ascii=False, indent=2) + "\n"
        metadata_path = V2 / "dataset.json"
        if (
            metadata_path.exists()
            and metadata_path.read_text(encoding="utf-8") != metadata_content
        ):
            raise RuntimeError(
                "Reviewed v2 metadata is immutable; create a new version"
            )
        metadata_path.write_text(metadata_content, encoding="utf-8")
        (REVIEW / "decisions.json").write_text(
            json.dumps(
                dict(
                    batch="calabarzon-scope-review-2026-11-06",
                    dataset_key="dole-iva-jlmf-2026-2027@2",
                    rows=activation,
                ),
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        if args.apply:
            result = service.import_bundle(session, V2)
            credentials = json.loads(
                (
                    Path.home() / ".codex/private/tesda-track-phase5-reviewer.json"
                ).read_text()
            )
            actor = session.exec(
                select(Learner).where(Learner.email == credentials["email"])
            ).one()
            if not actor.is_active or "labor-market:review" not in actor.permissions:
                raise RuntimeError("Existing authorized reviewer required")
            for record in activation:
                mapping = session.exec(
                    select(Mapping).where(
                        Mapping.mapping_key
                        == "dole-iva-jlmf-2026-2027@2:" + record["mapping_key"]
                    )
                ).one()
                if record["decision"] == "approved" and mapping.decision == "pending":
                    service.decide(
                        session,
                        mapping.id,
                        ReviewInput(
                            decision="approved",
                            expected_decision="pending",
                            note="Reviewed original forecast PDF and TESDA TR scope. "
                            + record["reason"],
                        ),
                        actor,
                    )
                elif record["decision"] == "rejected" and not mapping.decision_note:
                    service.decide(
                        session,
                        mapping.id,
                        ReviewInput(
                            decision="rejected",
                            expected_decision="rejected",
                            note=record["reason"],
                        ),
                        actor,
                    )
            dataset = session.get(Dataset, result["dataset_id"])
            if dataset.status != "active":
                service.set_dataset_status(
                    session,
                    dataset.id,
                    "active",
                    "Activate reviewed CALABARZON v2: eight supported in-demand links; retain manual/degree gaps and hard-to-fill links pending, reject scope/level mismatches. Original v1 retained retired for audit.",
                    actor,
                )
            session.commit()
        summary = dict(
            reviewed=len(reviewed),
            statuses=dict(Counter(r["review_status"] for r in reviewed)),
            decisions=dict(Counter(r["application_decision"] for r in reviewed)),
            applied_to_preview=args.apply,
            source_rows_reextracted=142,
            evidence_occurrences=len(evidence),
            original_files_unchanged=True,
        )
        (REVIEW / "summary.json").write_text(
            json.dumps(summary, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
