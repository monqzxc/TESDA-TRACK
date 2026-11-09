"""Turn the Phase 3/4 research files into versioned import bundles for `python -m tesda_track.labor_market import`.

Run from the repository root:

    .venv/Scripts/python.exe scripts/prepare_labor_market.py

Reads data-review/phase3 and data-review/phase4 without changing them and writes one folder per dataset version under
backend/seed/sources/labor_market/: dataset.json (the source), evidence.csv (one row per source occurrence) and,
where the review proposed any, mappings.csv. It stops on any identity or reference problem rather than guessing.

Proposals keep the review's own words: high-confidence and needs-review rows import as pending, rejected rows as
rejected. Nothing is approved here; approval is a reviewer's decision (`labor_market review approve`).
"""
import csv
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PHASE3 = ROOT / "data-review" / "phase3" / "research-2026-11-05" / "datasets"
PHASE4 = ROOT / "data-review" / "phase4" / "datasets"
OUT = ROOT / "backend" / "seed" / "sources" / "labor_market"
CATALOG = ROOT / "backend" / "seed" / "qualifications.json"

EVIDENCE_COLUMNS = ["occurrence_key", "source_record_id", "occupation_title", "sector", "classification",
                    "geographic_scope", "region_code", "locality", "period_label", "observed_on", "page_pdf",
                    "page_printed", "source_table", "source_url", "verification", "provenance"]
MAPPING_COLUMNS = ["mapping_key", "occurrence_key", "qualification_code", "proposal", "evidence_tier",
                   "review_reason", "competencies", "training_regulation_url", "training_regulation_reference",
                   "cautions"]
PROPOSALS = {"High-confidence proposal": "high_confidence", "Needs manual review": "needs_review",
             "Rejected proposal": "rejected"}


def read(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def derived_key(prefix: str, *parts: str) -> str:
    """A stable key for sources that printed no unique id: the same row always gets the same key."""
    return f"{prefix}-" + hashlib.sha256("\x1f".join(parts).encode()).hexdigest()[:16]


def fail(message: str) -> None:
    sys.exit(f"prepare_labor_market: {message}")


def write_bundle(name: str, dataset: dict, evidence: list[dict], mappings: list[dict]) -> dict:
    keys = Counter(row["occurrence_key"] for row in evidence)
    if duplicates := [key for key, count in keys.items() if count > 1]:
        fail(f"{name}: occurrence keys repeat: {duplicates[:5]}")
    known = set(keys)
    if stray := [m["mapping_key"] for m in mappings if m["occurrence_key"] not in known]:
        fail(f"{name}: mappings point to no evidence row: {stray[:5]}")
    if len({m["mapping_key"] for m in mappings}) != len(mappings):
        fail(f"{name}: mapping keys repeat")
    folder = OUT / name
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "dataset.json").write_text(json.dumps(dataset, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for file_name, columns, rows in (("evidence.csv", EVIDENCE_COLUMNS, evidence),
                                     ("mappings.csv", MAPPING_COLUMNS, mappings)):
        if file_name == "mappings.csv" and not rows:
            (folder / file_name).unlink(missing_ok=True)
            continue
        with (folder / file_name).open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=columns, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
    return {"evidence": len(evidence), "mappings": len(mappings),
            "classifications": dict(Counter(row["classification"] for row in evidence)),
            "proposals": dict(Counter(m["proposal"] for m in mappings))}


def mapping_rows(reviewed: list[dict], cohort: str, codes: set[str]) -> list[dict]:
    rows = []
    for row in reviewed:
        if row["cohort"] != cohort:
            continue
        if row["qualification_code"] not in codes:
            fail(f"{row['mapping_review_id']}: qualification {row['qualification_code']} is not in the catalog")
        if row["confidence_assessment"] not in PROPOSALS:
            fail(f"{row['mapping_review_id']}: unknown assessment {row['confidence_assessment']!r}")
        rows.append({
            "mapping_key": row["mapping_review_id"], "occurrence_key": row["source_occurrence_key"],
            "qualification_code": row["qualification_code"], "proposal": PROPOSALS[row["confidence_assessment"]],
            "evidence_tier": row["evidence_tier"], "review_reason": row["review_reason"],
            "competencies": row["relevant_core_competencies"] or "[]",
            "training_regulation_url": row["training_regulation_url"],
            "training_regulation_reference": row["training_regulation_reference"], "cautions": row["cautions"]})
    return rows


def main() -> None:
    codes = {item["code"] for item in json.loads(CATALOG.read_text(encoding="utf-8"))}
    reviewed = read(PHASE4 / "reviewed_mapping_dataset.csv")
    report = {}

    # 1. DOLE-BLE national forecast 2025-2026: the occurrence keys come from the Phase 4 coverage file, which
    # carries every one of the 442 printed occurrences; the source's own record_id repeats across sectors.
    forecast = read(PHASE4 / "forecast_occupation_coverage.csv")
    raw = read(PHASE3 / "verified_national_2025_2026_forecast.csv")
    if len(forecast) != len(raw):
        fail(f"coverage has {len(forecast)} rows but the verified forecast has {len(raw)}")
    pdf_hashes = {row["pdf_sha256"] for row in raw}
    evidence = [{
        "occurrence_key": row["source_occurrence_key"], "source_record_id": row["record_id"],
        "occupation_title": row["occupation_title_as_printed"], "sector": row["sector_as_printed"],
        "classification": row["classification"], "geographic_scope": "national", "region_code": "",
        "locality": "", "period_label": row["period_label"], "observed_on": "", "page_pdf": row["page_pdf"],
        "page_printed": row["page_printed"], "source_table": row["source_table"], "source_url": "",
        "verification": row["source_verification"],
        "provenance": json.dumps({"evidence_basis": row["evidence_basis"], "source_order_in_cell":
                                  row["source_order_in_cell"], "web_verification": row["web_verification"],
                                  "retrieved_date": row["retrieved_date"]}, ensure_ascii=False)}
        for row in forecast]
    report["dole-ble-national-jlmf-2025-2026-v1"] = write_bundle("dole-ble-national-jlmf-2025-2026-v1", {
        "source_id": "dole-ble-national-jlmf-2025-2026", "version": 1, "publisher": "DOLE-BLE",
        "title": "National Jobs and Labor Market Forecast 2025-2026 Report", "publication_label": "May 2025",
        "publication_date": None, "evidence_class": "national_forecast", "geographic_scope": "national",
        "region_code": None, "period_label": "2025-2026", "period_start_year": 2025, "period_end_year": 2026,
        "source_url": "https://ble.dole.gov.ph/jobs-and-labor-market-forecast/",
        "source_url_kind": "publication_index_not_verified_pdf_download",
        "file_sha256": pdf_hashes.pop() if len(pdf_hashes) == 1 else None,
        "notes": "Table 2, PDF pp. 38-45 (printed 27-34). Lists come from DOLE regional consultations aggregated "
                 "nationally; they are not regional lists.",
        "research": {"evidence": "data-review/phase4/datasets/forecast_occupation_coverage.csv",
                     "mappings": "data-review/phase4/datasets/reviewed_mapping_dataset.csv"}},
        evidence, mapping_rows(reviewed, "national_2025_2026_forecast", codes))

    # 2. Pasay City's official job portal, October 2026: dated postings, not in-demand classifications.
    postings = read(PHASE3 / "observed_2026_vacancies.csv")
    keys = {row["record_id"]: row["source_occurrence_key"] for row in reviewed
            if row["cohort"] == "observed_2026_pasay_posting"}
    evidence = [{
        "occurrence_key": keys.get(row["record_id"]) or derived_key("OBS", row["source_id"], row["record_id"]),
        "source_record_id": row["record_id"], "occupation_title": row["occupation_title_as_printed"],
        "sector": "", "classification": "observed_posting", "geographic_scope": "local",
        "region_code": "NCR", "locality": row["publisher_city"], "period_label": row["source_date_as_printed"],
        "observed_on": row["source_date"], "page_pdf": "", "page_printed": "",
        "source_table": row["document_reference"], "source_url": row["source_url"],
        "verification": row["source_verification"],
        "provenance": json.dumps({"employer": row["employer"], "work_region": row["work_region"],
                                  "work_location_basis": row["work_location_basis"],
                                  "count_status": row["count_status"], "current_open_status":
                                  row["current_open_status"], "retrieved_date": row["retrieved_date"]},
                                 ensure_ascii=False)}
        for row in postings]
    report["pasay-official-job-portal-2026-10"] = write_bundle("pasay-official-job-portal-2026-10", {
        "source_id": "pasay-official-job-portal", "version": 202610, "publisher": "Pasay City PESO",
        "title": "Pasay City official job openings", "publication_label": "Postings dated 14 and 22 October 2026",
        "publication_date": None, "evidence_class": "observed_posting", "geographic_scope": "local",
        "region_code": "NCR", "period_label": "October 2026", "period_start_year": 2026, "period_end_year": 2026,
        "source_url": "https://pasay.gov.ph/job-openings/", "source_url_kind": "official_listing_page",
        "file_sha256": None,
        "notes": "Dated postings only: no vacancy counts are published, and they are not an in-demand list.",
        "research": {"evidence": "data-review/phase3/research-2026-11-05/datasets/observed_2026_vacancies.csv"}},
        evidence, mapping_rows(reviewed, "observed_2026_pasay_posting", codes))

    # 3 and 4. Historical forecasts, kept for the record and never shown as current demand.
    for name, file_name, dataset in (
            ("dole-ble-jlmf-2023-2024-v1", "historical_national_2023_2025.csv", {
                "source_id": "dole-ble-jlmf-2023-2024", "version": 1, "publisher": "DOLE-BLE",
                "title": "Jobs and Labor Market Forecast 2023-2024 Updates", "publication_label": "January 2024",
                "publication_date": None, "evidence_class": "historical_forecast", "geographic_scope": "national",
                "region_code": None, "period_label": "2023-2025", "period_start_year": 2023, "period_end_year": 2025,
                "source_url": "https://www.ble.dole.gov.ph/wp-content/uploads/2024/06/Job-Labor-Market-Forecast-2023-2024.pdf",
                "source_url_kind": "pdf", "file_sha256": "d28b5ff5f2c081955f9a1ea7dc4e952ea3ce81d743de6d3db4c321a11b4cb27c",
                "notes": "Tables 3 and 5, titled Philippines: 2023-2025."}),
            ("dole-ble-jobsfit-2022-regional-v1", "historical_ncr_jobsfit_2022.csv", {
                "source_id": "dole-ble-jobsfit-2022-regional", "version": 1, "publisher": "DOLE-BLE",
                "title": "JobsFit 2022 Regional Reports", "publication_label": None, "publication_date": None,
                "evidence_class": "historical_forecast", "geographic_scope": "regional", "region_code": "NCR",
                "period_label": "JobsFit 2022 cycle", "period_start_year": None, "period_end_year": 2022,
                "source_url": "https://ble.dole.gov.ph/wp-content/uploads/2022/06/JobsFit-2022-Regional-Reports.pdf",
                "source_url_kind": "pdf", "file_sha256": "7850981e1554d2626bfc4e883da371aeedff2fd0d02062dbe728c5b5707f5c0e",
                "notes": "NCR section 7, Jobs of the Future, PDF pp. 57-58; its figures cite 2013-2017 data."})):
        rows = read(PHASE3 / file_name)
        scope = dataset["geographic_scope"]
        evidence = [{
            "occurrence_key": derived_key("HIS", row["source_id"], row["region_code"], row["classification"],
                                          row["list_no"], row["occupation_title"]),
            "source_record_id": f"{row['source_id']}:{row['classification']}:{row['list_no']}",
            "occupation_title": row["occupation_title"], "sector": row["sector"],
            "classification": row["classification"], "geographic_scope": scope,
            "region_code": "" if scope == "national" else row["region_code"], "locality": "",
            "period_label": row["period_label"], "observed_on": "", "page_pdf": row["page_pdf"],
            "page_printed": row["page_printed"], "source_table": "", "source_url": "",
            "verification": row["source_verification"],
            "provenance": json.dumps({"skills_as_printed": row["skills_as_printed"], "notes": row["notes"]},
                                     ensure_ascii=False)}
            for row in rows]
        dataset["research"] = {"evidence": f"data-review/phase3/research-2026-11-05/datasets/{file_name}"}
        report[name] = write_bundle(name, dataset, evidence, [])

    (OUT / "prepare_report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
