# Validated national demand activation

The user's instruction to validate and activate authorized this local review batch:
`national-validation-2026-11-06`. Review decisions were applied through the existing
permission-checked reviewer account and audited decision service, in one transaction.
The target was **tesda_track_phase5_preview**, served by API 8018 and frontend 5187/5188.
Development and production databases were not changed.

## Validation and decisions

All 80 high-confidence national proposals were checked against:

- The exact original DOLE National Jobs and Labor Market Forecast 2025–2026 PDF,
  SHA-256 `04d0b32dca7889e312e28d126de5a879b9c3c3210da9b8b80cf9e7c94181cc52`.
- The title's presence in its stated in-demand or hard-to-fill column on the
  recorded PDF page. All 80 title/classification checks passed; the older 2024
  posted-vacancy column was not used as current demand evidence.
- Original sector, unique source occurrence, active dataset fingerprint, current
  active qualification identity and the cited Core competencies in the database.
- The recorded qualification scope and occupation relationship. For independent
  TR evidence, the local PDF hash and extracted Section 1 evidence were checked.
  Other relationships remain explicitly catalog-supported, not independently
  certified as the latest operative TR revision.

**77 mappings were approved and activated**, covering 75 unique source occurrences,
64 distinct occupation title labels and 51 TESDA qualifications. Of these mapping
rows, 70 are in-demand and seven hard-to-fill. Twenty-two have independently
retrieved official TR PDF evidence; 55 rely on the TR-derived catalog's roles and
competencies. Counts describe associations, not vacancies or employment totals.

Three mappings remain pending because Trainers Methodology establishes only a
component of trainer preparation, not the complete domain qualification and
trainer credentials:

- `PH4-C224`: TESDA Cookery Trainer → Trainers Methodology Level I.
- `PH4-C226`: TESDA Housekeeping Trainer → Trainers Methodology Level I.
- `PH4-C227`: TESDA Trainer → Trainers Methodology Level I.

The hold reasons are recorded in the admin decision history. The two high-confidence
Pasay posting proposals remain pending and are not treated as national forecasts.
The 187 manual-review mappings and six rejected mappings were not activated.

The resulting real-research statuses are **77 approved, 192 pending, six rejected**.
The original Phase 3/4 files are unchanged; application decisions live separately
in the database audit trail. This is a user-authorized application review, not an
approval or endorsement of our crosswalk by DOLE/TESDA.

## Learner output

The demonstration dataset `phase5-isolated-demo@1` was retired, so its badge no
longer appears. Real approved forecast occupations appear first in Related
Occupations, followed by remaining catalog associations. That display order does
not change qualification ranking logic. Approved titles also become retrieval
evidence through the existing US-20 matching path, so results can improve without
changing score formulas, model weights or readiness calculations.

Demand cards show national scope, 2025–2026 forecast period, classification,
publisher, reported sectors, document references and relationship scope notes.
Selecting NCR retains the **Philippines — National** label. No current NCR-specific
forecast or live vacancy count is inferred.

Examples verified through the public API:

- Web Development NC III: five approved source mappings for Web Developer,
  Web Designer and Website Developer. Website Developer retains the report's
  hard-to-fill classification and original spelling.
- EIM NC II: one approved Construction Electrician mapping.
- Contact Center Services NC II: five approved mappings across applicable source
  occurrences/titles.
- Domestic Work NC II: **zero** approved demand mappings. The catalog jobs remain
  visible without a demand claim; none of the relevant domestic-worker titles was
  found in the imported national forecast evidence.

Training relevance does not establish licensing, hiring eligibility, current open
vacancies or coverage of every employer duty. Scope-specific cases such as building
electrical work, supported-type scaffolding, optical support and trainer preparation
must retain these boundaries.

## Reproduction, audit and rollback

From the repository root:

```powershell
.\.venv\Scripts\python.exe scripts/activate_validated_mappings.py
.\.venv\Scripts\python.exe scripts/activate_validated_mappings.py --apply
node scripts/validated_demand_browser_smoke.cjs
```

The first command is a dry run. The second targets only the named isolated preview,
requires the existing active review-permitted account, verifies source fingerprints
and current records before writing, preserves rejected decisions and skips mappings
already approved. A repeat application added zero approvals. The private credential
file supplies the existing account identity; no password is printed or new account
created. The original authorization and per-row evidence are in audit notes.

Use `/admin?section=labor-market` for per-mapping decision history and revocation.
Rejecting/returning a mapping to pending removes its public indicator and retrieval
title on the next API call. Retiring the national dataset removes the batch's
public indicators without deleting evidence or decisions. No destructive migration
or database reset is required. Already-open pages may need a refresh/refetch.

This dataset activation supersedes earlier reports saying all real mappings were
pending. Use the validated-demand browser smoke for the current dataset; the
original Phase 5 fixture workflow documents the pre-activation demonstration state.

## Checks and artifacts

- 17 targeted backend tests pass for approval restrictions, scope/year filtering,
  revocation, goal ownership and raw-score tie behavior.
- 15 focused frontend tests, targeted lint and production TypeScript/build pass.
- Playwright completes real regular, TSP and signed-in journeys at port 5187 on
  desktop/mobile, checks national fallback for NCR, real source/classification/page
  labels, retirement of the fixture, readiness preservation and training links.
  Selecting the newly sourced Website Developer goal is also verified, including
  account persistence. Scoped axe scans show no violations.

`reports/activation-20261106/` contains validation decisions, original and repeat
activation logs, public API verification, test results and desktop/mobile screenshots.
No commits, pushes, merges or deployment were performed.

Learner UI simplification: the dedicated labor-market region selector, expandable
source/document-reference list and detailed demand write-ups were removed at the
user's request. Cards retain compact In demand / Hard to fill badges and geographic
coverage. Full period, publisher and scope provenance remain in the API and admin
review; demand still uses the journey's existing region when available. Current
desktop/mobile smoke screenshots are under `reports/compact-badge-verified-20261106/`.

The portable approval/hold record is in
`data-review/activation-2026-11-06/national-review-decisions.json`. It records the
validated decisions; a Git checkout/import does not automatically approve mappings
or transport the local database's current state. Raw captures, original PDFs,
duplicate archives and private reviewer credentials remain local.
