# Import the training and assessment registries

The importer reads the supplied XLSX files directly, or a ZIP containing both. It does not require Excel or a new Python package. Run these PowerShell commands with the project's existing virtual environment and `.env` database configuration.

## Preview

```powershell
Set-Location D:\Projects\Laragon\TESDA-TRACK\backend

$registryArguments = @(
  '--source', 'C:\Users\Esteves\Downloads\drive-download-20261014T064140Z-1-001.zip',
  '--training-snapshot', '2026-09-30',
  '--assessment-snapshot', '2026-10-07',
  '--as-of', '2026-10-14'
)

..\.venv\Scripts\python.exe -m tesda_track.registry_import @registryArguments --dry-run --report ..\reports\registry-import\preview.json
```

`--dry-run` is also the default when neither mode is specified. Preview reads the active qualification catalog and regions from the configured database, but does not write to it or require the new import tables. Snapshot dates are explicit because filenames do not prove a document's authoritative date. Use the actual inspection date for `--as-of`; if omitted it defaults to today. A future snapshot date is rejected.

The initial preview of the supplied archive, using the existing 319-qualification catalog on October 14, 2026, found:

| Registry | Source rows | Accepted registration/accreditation rows | Historical | Review | Rejected | Identical duplicate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Training | 22,568 | 14,455 | 93 | 8,019 | 1 | 0 |
| Assessment | 57,345 | 11,168 | 43,763 | 2,401 | 0 | 13 |

Accepted rows are candidates for database listings, not verified recommendations. Their respective composite site keys identify 4,486 training institutions/branches and 2,699 assessment centers/branches in this preview. The raw-cell reader produces different date/duplicate diagnostics from the initial Excel-library inspection because it does not reinterpret wrongly styled numeric values. Treat the current importer report as the import decision record. The inspection report remains historical evidence of the first review.

## Apply

After examining the preview, use the same source and arguments:

```powershell
..\.venv\Scripts\python.exe -m alembic upgrade head
if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }

..\.venv\Scripts\python.exe -m tesda_track.registry_import @registryArguments --apply --report ..\reports\registry-import\applied.json
if ($LASTEXITCODE -ne 0) { throw 'Registry import failed. Read the command output.' }

..\.venv\Scripts\python.exe -m tesda_track.embeddings sync
```

The migration adds source-history/link tables and an explicit `unknown` training delivery mode. Apply writes all supplied batches in one transaction. A failed batch rolls back the complete operation. The importer does not migrate the application database automatically and does not run embeddings during preview or import. No reseeding or model training is necessary.

## What is written

- `registry_batch` records the source filename, workbook SHA-256, worksheet, declared snapshot date, inspection date, mapping/catalog policy hash, the actual mapping/catalog policy, and summary.
- `registry_record` preserves the selected operational source fields, resolved qualification ID, normalized site key and outcome for every nonempty source row, including expired, rejected, duplicated and unresolved entries. The site key joins to importer-owned site links when a site was accepted. Trainer identities, trainer certificate numbers and center-manager names are excluded. Workbook bytes remain in your original files; keep them for reproducibility.
- `registry_link` records durable links to importer-owned providers, programs and centers. Training programs use the CTPR number as their external identity. Sites use a normalized combination of registry kind, region, province, city, institution name and address. Same-name branches with different addresses remain separate. This is a conservative source-derived identity; it is not an authoritative institution identifier.
- Accepted training records create providers and catalog-linked programs. Duration is parsed only for simple positive whole-hour values. Delivery mode is `unknown`. Fees, start/end dates and seats remain null. Scholarship flags retain the schema default and must not be treated as proof of current scholarship availability.
- Accepted assessment records create centers. Accreditation evidence remains in history. No assessment schedules, seats, fees, applications, or new qualifications are manufactured.

The importer never sets a service to verified, never marks prerequisites reviewed, and never sets availability to available. The files establish registry evidence that administrators can review through the existing verification workflow. Current authorizations, entry requirements, and operational availability still require confirmation before recommendations or applications can succeed.

## Mapping unresolved names

Exact qualification names are matched after Unicode, whitespace and case normalization. No fuzzy matching, NC-level removal or automatic stripping of amended/mobile names is performed. Unmatched names remain in review. Qualification labels alone cannot supply the competencies, jobs and keywords required to add new catalog qualifications.

Copy `backend/seed/sources/registry_aliases.example.json` to an ignored local JSON file, for example `reports/registry-import/aliases.json`. Add only mappings you have reviewed:

```json
{
  "qualifications": {
    "Exact source qualification label": "EXISTING-CATALOG-CODE"
  },
  "regions": {
    "Exact source region label": "EXISTING-REGION-CODE"
  }
}
```

The names/codes above are placeholders. Unknown targets, conflicting normalized aliases and attempts to override an exact qualification match are rejected. Add `--mapping ..\reports\registry-import\aliases.json` to both preview and apply. Built-in region aliases cover current region labels; historical ARMM, CO and Overseas entries remain unresolved unless explicitly reviewed. Regional boundary changes are not inferred from province names.

## Duplicate, location and refresh behavior

Identical registration duplicates retain separate history rows and create one operational record. Conflicting rows with the same registration ID remain in review. Expiry on the inspection date remains in review; a correctly ordered authorization that expired before that date is historical. Bad, reversed, missing, conflicting or geographically suspect coordinates become null, with an issue in the report. The importer never silently swaps coordinates or substitutes a regional center point for a site.

The same source, policy, snapshot and inspection date produce the same batch fingerprint. Repeating an apply skips that batch. Updated mappings or source files create a new history batch while existing operational links prevent duplication. Only newer declared snapshots refresh importer-owned source metadata. Operational dates, seats, fees, availability, active flags and confirmed delivery modes are preserved. Imported history never deletes or archives unrelated application records.

If a training registration appears to move to a different institution/branch or qualification, apply stops and rolls back. Reconcile that identity before retrying. An assessment center name/address change may produce a separate conservative identity; do not assume cross-snapshot name changes have been automatically resolved. The importer does not currently join the separate UIID worksheet or perform geocoding.

Report JSON contains counts, unmapped labels and row flags, without contact details. Source history in PostgreSQL contains business contacts from the selected source fields and should receive the same database access controls and backup handling as provider/center contact records. Generated reports are ignored by Git.

## Verification

```powershell
Set-Location D:\Projects\Laragon\TESDA-TRACK
.\.venv\Scripts\python.exe -m pytest backend/tests/test_registry_import.py backend/tests/test_migration_release.py -q
```

The database tests use the isolated `_test` database and roll back each case. They exercise default preview behavior, source history, repeated apply, qualification aliases, conflicting duplicates, branch identity, raw numeric phone recovery, invalid dates/coordinates, protected operational fields and atomic rollback. The existing qualification/model evaluation is independent of these import checks.

Validation on October 14, 2026: the final importer/migration suite passed 42 tests, including Alembic metadata drift and 1,201-row history preservation. The broader compatibility run passed 216 tests across the importer, seeders, training and assessment APIs, ranking, and frontend portals. After the final provenance/rollback additions, the importer suite was rerun successfully. A separate Streamlit AppTest passed for a registry program with unknown delivery mode, dates, fees and seats. The final dry run read all 79,913 source rows and made no application database writes. The new migration and actual dataset import have not been applied to the application database.
