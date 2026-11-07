"""Read existing audited cross-cutting/PSA metadata without labelling either as current occupation demand."""

import sys, csv, json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_labor_market import ROOT, PHASE3, write_bundle, derived_key


def read(name):
    with (PHASE3 / name).open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def main():
    cross = read("national_crosscutting_undisaggregated.csv")
    evidence = []
    for row in cross:
        evidence.append(
            dict(
                occurrence_key=derived_key(
                    "CROSS",
                    row["source_id"],
                    row["occupation_title_as_printed"],
                    row["industries_as_printed"],
                ),
                source_record_id="cross-" + str(len(evidence) + 1),
                occupation_title=row["occupation_title_as_printed"],
                sector=row["industries_as_printed"],
                classification="cross_cutting",
                geographic_scope="national",
                region_code="",
                locality="",
                period_label=row["period_label"],
                observed_on="",
                page_pdf=row["page_pdf"],
                page_printed=row["page_printed"],
                source_table=row["source_table"],
                source_url="",
                verification="previously_audited_PDF",
                provenance=json.dumps(
                    {
                        "original_classification": row["classification"],
                        "mapping_status": "not_disaggregated",
                    }
                ),
            )
        )
    print(
        write_bundle(
            "dole-ble-crosscutting-2025-2026-v1",
            dict(
                source_id="dole-ble-crosscutting-2025-2026",
                version=1,
                publisher="DOLE-BLE",
                title="National forecast cross-cutting groups — joint classification",
                evidence_class="national_forecast",
                geographic_scope="national",
                region_code=None,
                period_label="2025-2026",
                period_start_year=2025,
                period_end_year=2026,
                source_url="https://ble.dole.gov.ph/jobs-and-labor-market-forecast/",
                notes="In-demand versus hard-to-fill is not disaggregated. Never converted into either individual badge.",
            ),
            evidence,
            [],
        )
    )
    tables = read("historical_psa_shortage_tables.csv")
    print(
        write_bundle(
            "psa-shortage-metadata-v1",
            dict(
                source_id="psa-openstat-shortage-metadata",
                version=1,
                publisher="PSA OpenSTAT",
                title="Historical occupational-shortage table metadata (19 tables)",
                evidence_class="historical_statistics",
                geographic_scope="national",
                region_code=None,
                period_label="Historical observations through 2022",
                period_start_year=2013,
                period_end_year=2022,
                source_url="https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/1B/ISLE/OSS/",
                metadata={
                    "tables": tables,
                    "table_count": len(tables),
                    "numeric_statistics_imported": False,
                },
                notes="Table metadata only. No numerical observations or current demand statistics inferred.",
            ),
            [],
            [],
        )
    )


if __name__ == "__main__":
    main()
