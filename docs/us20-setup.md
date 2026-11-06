# US-20: setup after checking out the branch

Branch: `US-20-Related-Occupations`. Pushing this branch does not create a PR,
merge main, deploy the application or copy a database. The existing model stays
`tesda-e5-small-v3`; no retraining is needed. Keep each environment's own secrets,
database and model configuration.

## What is included

- Unified career/skills input and existing readiness workflow.
- Final Related Occupations: catalog jobs, approved in-demand forecast jobs and
  dated posting associations, with deduplicated titles and career-goal selection.
- Hard-to-fill-only jobs and repeated qualification panels are excluded from final
  cards. Training navigation remains in Training & Assessment's See all options.
- Migrations 0024–0026, protected admin review and public evidence APIs.
- Original latest-main CSVs in `backend/seed/sources/labor_demand/`; prepared,
  versioned import bundles in `backend/seed/sources/labor_market/`.
- Portable review decisions in
  `data-review/activation-2026-11-06/release-reviewed-decisions.json`:
  **427 approvals** (77 national forecast, 342 posting links, 8 reviewed IV-A
  in-demand links), **11 rejections**, and 25 dataset version/status records.
  These are links, not counts of distinct jobs or workers. Pending proposals are
  not approved by the handoff. The original IV-A v1 is retired; v2 is active.

## Existing development environment (PowerShell)

Back up the database first. Do not drop/recreate its schema, restore our local
database over it, or use a test command against a development/production database.
Review migration heads with the latest target branch before merging; resolve any
new revision-number collision rather than applying incompatible migrations.

Use the repository's normal dependency setup (`backend/requirements.txt`,
`requirements-dev.txt` for developer tests, and `npm ci` in `frontend`). Then,
from the repository root with the intended DATABASE_URL configured normally:

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m alembic heads
..\.venv\Scripts\python.exe -m alembic upgrade head
..\.venv\Scripts\python.exe -m alembic current
```

The branch head is 0026. Normal full Docker/Railway pre-deploy jobs already apply
migrations, seed the catalog and sync embeddings; verify that those jobs succeed.
They do **not** import or approve the labor-market bundles. A fresh environment
also needs the existing catalog seed/model setup from README.md. Preserve the
existing catalog and embedding configuration when they are already initialized.

While still inside `backend`, import the prepared bundles in version order:

```powershell
Get-ChildItem seed/sources/labor_market -Directory |
    Sort-Object Name |
    ForEach-Object {
        ..\.venv\Scripts\python.exe -m tesda_track.labor_market import $_.FullName
        if ($LASTEXITCODE -ne 0) { throw "Dataset import failed: $($_.Name)" }
    }
```

All prepared bundles are versioned and fingerprinted. Reimporting identical bytes
is a no-op. Do not edit an imported version; use a new version. Dataset attributes
preserve exact import bytes across Windows/Linux checkouts. If an existing
database reports a fingerprint conflict, inspect that version and stop; do not
overwrite its review state or alter hashes to force acceptance.

## Apply the recorded reviews, not every candidate

Use an existing active account with `labor-market:review`. Migration 0025 grants
the permission to the built-in admin role; custom reviewer roles need the same
permission through normal role administration. No reviewer password or account is
included in Git. Replace the example email with the actual authorized reviewer.

```powershell
$reviewerEmail = 'your-authorized-reviewer@example.com'
$manifest = '../data-review/activation-2026-11-06/release-reviewed-decisions.json'

# Verify the imported versions, mapping identities and existing decisions first.
..\.venv\Scripts\python.exe -m tesda_track.labor_market_release $manifest --actor-email $reviewerEmail

# Run only after inspecting the dry-run result.
..\.venv\Scripts\python.exe -m tesda_track.labor_market_release $manifest --actor-email $reviewerEmail --apply
```

The release command verifies all dataset fingerprints and mapping identities
before writing. It refuses ambiguous approvals, conflicting existing decisions,
missing datasets or unreviewed active replacement versions. It reuses the existing
audited decision/status services in one transaction. Repeating the same handoff
does not create duplicate decisions. Pending proposals and unrelated sources stay
unchanged. The general release command uses the configured database; double-check
the environment before `--apply`.

Admin `/admin?section=labor-market` remains available for individual reviews.
Do not approve all pending proposals: ten reviewed IV-A links still need context
or credentials review, and two supported hard-to-fill links intentionally remain
pending. Forecasts, postings, undated profiles and historical material remain
separate; CALABARZON is not NCR. Source references stay in API/admin data.

For containers, run these maintenance modules in the backend environment, using
the same application database configuration. The backend image already includes
the prepared bundles and module. Copy the reviewed manifest into the maintenance
container, or run from the checked-out repository with the intended environment;
the root `data-review/` directory is not automatically baked into the backend image.

The local `scripts/phase5_local.py`, `combine_prince_demand.py --apply` and
`review_calabarzon_mappings.py --apply` commands target the isolated preview and
must not be substituted for deployment setup. Do not run the demo fixture script
on a shared/deployed environment.

## Frontend and verification

Restart/redeploy the backend and build the frontend with its normal API routing.
Never point a deployed frontend at our localhost port 8018. No external paid API
or PhilJobNet API key is required: posting data is an imported 4 November 2026
snapshot, not a live vacancy feed.

From `frontend`:

```powershell
npm ci
npm run api:types -- --check
npm run build
```

Verify regular Find My Pathways and TSP against the real backend: career/skills
matching, irrelevant-input rejection, readiness, final related jobs and badges,
goal switching, and See all options navigation. An ordinary query retains catalog
discovery; an explicit in-demand query uses approved in-demand forecasts. Regional
evidence must match the selected region and national fallback must remain labeled
national. Dated posting observations must never be described as live openings.

Run backend tests only against a dedicated `*_test` database: test fixtures rebuild
that database's schema. Targeted checks used for this work and their limitations
are recorded in docs/labor-market.md and the review records. Existing older
unified-input UI tests may still require updates to their example-button selectors;
the complete historical suite is not claimed to pass.

## Intentionally excluded from the branch

Environment files, passwords/tokens, local reviewer credentials, PostgreSQL Docker
disks/volumes, database backups, downloaded model weights, raw PDF/HTML captures,
duplicate research archives, and local browser screenshots/logs. These files remain
on the developer's machine. Prepared evidence, review reasons, source URLs/hashes
and reproduction scripts provide the portable handoff.
