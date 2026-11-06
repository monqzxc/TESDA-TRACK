# Labor-market evidence and occupation mapping review

For the final US-20 branch state, dataset imports, portable approvals and deployment
checks, use [US-20 setup](us20-setup.md). Sections below also retain the earlier
phase-by-phase research/preview record. Final job-card training links and nested
qualification details have since been removed; training navigation remains in
Training & Assessment. The reviewed IV-A v2 supersedes its pending v1 proposals.

This layer enriches Related Occupations. It does not participate in E5 matching,
ranking, readiness calculations, or the qualification competency catalog.

## Local review environment

The Phase 5 review application runs at **http://127.0.0.1:5188** with API
**http://127.0.0.1:8018**. After the US-20 correction, frontend 5187 also proxies
to this isolated API. The original API 8017 and development database are unchanged.
Both servers bind to localhost. The preview uses `tesda_track_phase5_preview`, a
copy of the local development database; destructive tests use
`tesda_track_phase5_test`. Neither migration nor test resets target the development
database `tesda_track`.

From the repository root in PowerShell:

```powershell
.\.venv\Scripts\python.exe scripts/phase5_local.py setup
.\.venv\Scripts\python.exe scripts/phase5_local.py import
.\.venv\Scripts\python.exe scripts/phase5_local.py serve
```

In another terminal:

```powershell
Set-Location frontend
$env:API_PROXY = 'http://127.0.0.1:8018'
npm run dev -- --host 127.0.0.1 --port 5188 --strictPort
```

`setup` requires the existing `tesda-track-dev-db-1` Docker PostgreSQL service.
It creates two explicitly named local databases, clones development only when
the preview has no migration revision, and upgrades only that preview. It does
not change `.env`. Do not point this bootstrap script at a shared environment.

The existing admin workspace was suitable: the new review section is at
`/admin?section=labor-market`. It requires an active account with
`labor-market:review`; anonymous requests return 401 and ordinary learners 403.
Migration 0025 adds that permission to the existing built-in admin role. Custom
roles must receive it explicitly through existing role management.

For the isolated preview only, `scripts/phase5_demo.py` creates a least-privilege
reviewer with a random password saved outside the repository at
`C:\Users\Administrator\.codex\private\tesda-track-phase5-reviewer.json`.
Sign in normally using that file. The script also imports a clearly labeled
`phase5-isolated-demo@1` fixture. Browser checks approve/reject this fixture only;
its public badge says **LOCAL TEST FIXTURE**. It is not approval of a Phase 4
proposal. Retire this fixture in the review page to remove the demonstration.

## Imported evidence

Original research under `data-review/phase3/` and `data-review/phase4/` is read-only.
Prepared bundles live under `backend/seed/sources/labor_market/`.

| Bundle evidence | Records | Public forecast eligibility |
| --- | ---: | --- |
| DOLE national forecast 2025–2026 | 442 source occurrences | Only after explicit mapping approval |
| DOLE cross-cutting groups 2025–2026 | 15 | Never inferred as separate in-demand or hard-to-fill classes |
| Historical national forecast 2023–2024 | 155 | Excluded |
| Historical NCR JobsFit 2022 | 7 | Excluded |
| Dated Pasay postings observed in 2026 | 20 | Excluded; not a regional forecast |
| PSA historical shortage metadata | 19 table descriptions, zero occupation records | Excluded; no numeric observations inferred |

There are 639 research evidence occurrences and 275 mapping proposals: 82 high
confidence, 187 needing review, and six rejected. The first two groups import as
pending; the last imports as rejected. **No research mapping is auto-approved.**
All 18 existing Region records are supported. Selecting a region retains clearly
labeled national evidence. The imported files do not establish a verified current
regional forecast; historical NCR evidence and Pasay postings cannot fill that gap.

## Data contracts and maintenance

A bundle contains `dataset.json`, `evidence.csv`, and optional `mappings.csv`.
The preparation commands are reproducible and do not write research files:

```powershell
.\.venv\Scripts\python.exe scripts/prepare_labor_market.py
.\.venv\Scripts\python.exe scripts/prepare_labor_market_supplement.py
```

The first command reproduces the four original bundles; the supplemental command
adds cross-cutting evidence and PSA metadata separately. Edit a future bundle,
not an existing imported version or the original research.

For an explicitly configured target database, the backend maintenance command is:

```powershell
$env:PYTHONPATH = 'backend'
# Set DATABASE_URL to the intended database through your normal local secret configuration.
.\.venv\Scripts\python.exe -m tesda_track.labor_market import path/to/bundle --dry-run
.\.venv\Scripts\python.exe -m tesda_track.labor_market import path/to/bundle
```

The local preview helper above is the safer option for the six supplied bundles.
Import validates references, qualification codes, geography, reporting years,
classifications, duplicate keys, dates and URLs before inserting any records. A
transaction commits one complete bundle or rolls it back. Errors identify CSV rows.
Concurrent imports serialize per source.

Dataset identity is `source_id@version`; a fingerprint covers the exact input files.
Reimporting identical bytes is a no-op and preserves decisions. Changing an existing
version is rejected: increment the version instead. Evidence identity is
`(dataset_id, occurrence_key)`, using Phase 4 unique occurrence identifiers rather
than the original repeated forecast IDs. Original IDs and provenance remain intact.
Mapping keys are namespaced by dataset version.

The first version of a source becomes active; later versions start retired. Review
new mappings before activating a replacement. Activation retires other versions of
the same source without copying or deleting any decisions. Restore an earlier
version to roll back. Both transitions require an audit note in the admin page.

Equivalent secure CLI actions require an existing active, authorized account:

```powershell
.\.venv\Scripts\python.exe -m tesda_track.labor_market review 123 --decision approved --expected pending --note 'Reviewed occupation scope and TESDA TR section 1.' --actor-email reviewer@example.com
.\.venv\Scripts\python.exe -m tesda_track.labor_market dataset-status 2 --status active --note 'Activate reviewed replacement version.' --actor-email reviewer@example.com
```

Approval is limited to high-confidence proposals. Ambiguous/rejected research must
receive new evidence review and a new dataset version before it becomes eligible.
The review page shows DOLE and TESDA references, competencies, research reasoning,
cautions, original and unique IDs, filters and decision history. A stale decision
returns 409 instead of overwriting another reviewer. Required notes and actor/time
are recorded in an append-only application audit table. Account deletion clears the
reviewer foreign key while retaining the decision history.

## APIs and learner behavior

- `GET /api/v1/labor-market/indicators?qualification_code=EIM-NC-II&region_code=NCR`
  is public. Results require an approved high-confidence mapping, an active
  qualification and dataset, a forecast period containing the current Manila year,
  and an in-demand/hard-to-fill forecast classification. Regional results must
  match the requested region; national results retain national labels.
- `/api/v1/admin/labor-market/mappings`, mapping `/{id}/review`, `/datasets` and
  dataset `/{id}/status` enforce the review permission server-side. Cookie writes
  use existing authentication and CSRF protections.
- `PUT /api/v1/me/goals/career-selection/{journey_uuid}` reuses the account Goal
  service and validates catalog/approved occupation associations. Each account and
  journey updates one owned goal, including after switching occupations.

Related Occupations shows the original catalog jobs and associated qualifications,
core competencies, readiness guidance and training links. Demand evidence identifies
the approved qualification and exact source/document references. Occupations with
no approved evidence have no badge. Region selection does not change fit scores.
Account learners save goal choices to their account; guests and TSP retain them in
the current browser journey. Goal switching does not rerun analysis or readiness.
Account records are durable, while cross-device journey restoration continues to
use the existing My Progress/account workflows rather than adding automatic finder
restoration. Already-open pages may refresh indicators on the next query/refetch;
the public API revokes rejected/retired evidence immediately.

## Verification

### Combined latest-main snapshot (6 November 2026)

`scripts/combine_prince_demand.py` preserves the exact CSV bytes from main commit
`884a3897d38287e8331ae99645bfe683cebd5fdc` under `backend/seed/sources/labor_demand/`.
It prepares versioned bundles and defaults to a dry run. `--apply` is restricted
to `tesda_track_phase5_preview` on localhost, uses the existing authorized reviewer,
and records decisions through the existing audit service. Reimporting identical
bundles is idempotent. No model training, development-data migration or main merge
is involved.

The snapshot contains 4,237 postings: 3,884 domestic postings import into separate
regional bundles, including 1,954 NCR records. The 338 overseas/other and 15
unspecified-region records remain in the preserved source CSV, outside public
regional evidence. Counts describe posting records, never worker headcounts.
342 posting-to-qualification links inherit exact normalized titles and qualification
scope from previously approved mappings. Fuzzy matches, new inferred job titles,
and unmatched postings do not activate. These links cover 316 posting occurrences;
the database retains the complete domestic snapshot for further review.

The 142 CALABARZON rows expand to 218 classified forecast occurrences (some rows
carry both classifications), with 25 candidate links held pending manual scope
review. They do not become NCR or national evidence. The 124 undated Career Info
profiles are preserved as context only, outside the current-demand layer. The
derived region/title CSV is not imported as additional posting observations.

The public indicators response preserves its existing `items` forecast array and
adds a separate `postings` array, requiring approved high-confidence links to active
qualifications and active posting datasets. Observations must fall within the
current Manila calendar year and not in the future. Results aggregate duplicate
occupation/region/snapshot combinations with `posting_count`, `observed_on` and
source references. They are not live vacancy claims. Explicit in-demand searches
use approved in-demand forecasts, excluding hard-to-fill-only evidence and postings.

Final career cards combine catalog associations, approved in-demand forecast jobs
and approved dated posting associations. Hard-to-fill-only occupations are excluded;
the underlying forecast and admin review records are retained. The repeated
qualification/competencies panel is removed from final job cards, while direct
training-center links and career-goal selection remain. Readiness detail elsewhere
in the journey is unchanged.

Run preparation or preview activation:

```powershell
.\.venv\Scripts\python.exe scripts/combine_prince_demand.py
.\.venv\Scripts\python.exe scripts/combine_prince_demand.py --apply
```

Local review outputs are in `reports/combined-demand-20261106/`.

```powershell
.\.venv\Scripts\python.exe scripts/phase5_local.py test backend/tests/test_labor_market.py -q --tb=short
Set-Location frontend
$env:NODE_OPTIONS = '--max-old-space-size=512'
npm test -- src/features/finder/store.test.ts src/features/finder/occupations.test.ts
npm run build
Set-Location ..
node scripts/phase5_browser_smoke.cjs
```

The browser script requires the local preview, its private reviewer credential
file, and Playwright Chromium. It exercises normal sign-in, fixture decisions,
regular and TSP readiness journeys, region labels, goal switching, account saving,
training links, desktop/mobile layouts and scoped axe checks. It never approves
real research mappings. Results and screenshots are under
`reports/phase5-20261106/` (local report artifacts may be Git-ignored).

Migrations 0024–0025 were upgraded on isolated databases. Use dataset activation for
data rollback; a schema downgrade would remove the new audit/selection tables and
can refuse to restore global occurrence uniqueness if parallel versions exist.
Do not run schema downgrades against the review data as a routine rollback.
