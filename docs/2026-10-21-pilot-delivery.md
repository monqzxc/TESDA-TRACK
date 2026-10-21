# Pilot work and release evidence — 21 October 2026

**Decision: candidate code is ready for staging deployment; production release is not approved.**
The work is on `feature/postgresql-backend`. This report covers the eleven original cards listed below,
not similarly numbered cards in Grooming. The existing profile, analytics and guided-help work was
preserved and included with the remaining implementation.

## Card status

| Card | Delivered in code | Still required |
| --- | --- | --- |
| [TASK-111 Profile](https://trello.com/c/MUcTCrmf) | Profile route, account navigation, guest prompt and tests; included in the candidate commit | Deploy and check the new revision on staging; human QA approval |
| [TASK-110 Analytics](https://trello.com/c/B2Nt60di) | Aggregate analytics API, Reports/Admin views and tests; no learner text or identifiers returned | Backend/frontend staging deployment and QA approval |
| [TASK-085 Model decision](https://trello.com/c/AuEMcPbO) | Adopted v3; private local model settings, example settings, README, model guide and Compose aligned; v3/v4 rounds recorded; fixed acceptance thresholds and explicit ownership/rejection goals | Deploy v3, sync its embeddings and check matching on staging |
| [TASK-075 Guest save](https://trello.com/c/yYJJEtEs) | Integration test proves the partial-save wording, retry, retained journey and reuse of write receipts without duplicate sessions | For Staging Dev after push; staging and QA |
| [TASK-062 Readiness](https://trello.com/c/YdCVR0jW) | `/api/v1/ready` checks DB, actual Alembic head, PostGIS and pgvector; optional integrations degrade without failing readiness; Docker/Caddy use it | Apply migration `0018`, deploy and check staging |
| [TASK-078 Recovery](https://trello.com/c/EUA8YHpq) | Distinct readiness/save/list errors, retained drafts and filters, local retry, explicit last-loaded-result warning, first-load filter layout and region-fetch recovery tests | Staging and QA |
| [TASK-076 Provenance](https://trello.com/c/QRDcaRUg) | Migration `0018`; source/reference/link/date fields; incomplete/example/verified labels; qualification, center and offering source details; strict evidence validation | Upgrade then seed on staging; actual approved source/review evidence remains a people/data dependency |
| [TASK-103 React root](https://trello.com/c/ONtekla3) | Validated opt-in Caddy/Compose cutover and rollback guide, React at `/`, Streamlit at `/classic/`, compatibility redirects | Staff parity sign-off, activate overlay, observe for 14 days from the real switch, then remove Streamlit separately |
| [TASK-077 Accessibility](https://trello.com/c/bjMhgut5) | Automated phone/desktop, keyboard and contrast checks; 200% text-enlargement checks; screenshots and audit notes | Actual 200% browser zoom, manual keyboard and screen-reader audit, deployed-revision review and QA approval |
| [TASK-084 Release gates](https://trello.com/c/QF2zsR9A) | Fresh evaluations, model gate, images/smoke checks, migration-copy backup/restore rehearsal and this report | Expert-reviewed set (TASK-082), approved performance budget, acceptance of the rollback approach, report linked/attached in Trello |
| [TASK-079 Pilot deployment](https://trello.com/c/plSJOkUz) | Deployment configuration and runbooks prepared | Provisioned server/access, production secrets, real backups, deployment/smoke checks and all release/P0 approvals |

## Verification

| Check | Evidence |
| --- | --- |
| Full backend/classic suite | 1,231 passed, one skipped, three failures from exact response expectations missing the new provenance field |
| Backend follow-up | All 124 affected tests passed after those expectations were updated; includes provenance, readiness, MCP/catalog compatibility, migration preservation, registry import and rehearsal guards |
| Additional safety checks | 20 provenance-validation/rehearsal-guard cases passed |
| Frontend unit suite | 470 passed; one new recovery test assertion needed adjustment for its open/collapsed filter section. All 18 training tests then passed, including that case |
| Browser suite | 117 selected Chromium cases passed; two additional real-browser region-failure recovery cases passed at phone and desktop widths |
| Frontend artifacts | TypeScript/production build, ESLint and generated OpenAPI consistency passed |
| Real v3 model | Fixed metrics on 120 reusable goals plus eight must-match and five must-reject examples passed offline |
| Schema/configuration | Alembic drift, dependency consistency, Compose policy and whitespace checks passed; opt-in cutover Compose/Caddy validation passed |
| Docker | Backend and classic images built; isolated API/assessment/qualification/web smoke passed. A follow-up smoke used `/api/v1/ready` successfully |

The original machine release report keeps its three initial failures. Follow-up evidence is separate;
no failed full run was rewritten as a clean full run. Local raw files are in ignored
`reports/pilot-2026-10-21/`; the committed [check summary](evidence/2026-10-21-pilot-checks.json)
contains only sanitized results. [Accessibility notes and screenshots](audits/2026-10-21/accessibility.md)
record the audit's actual scope.

The 24-case engineering qualification evaluation returned relevant top results for 18/18 positive cases,
abstained on 6/6 negative cases, and found zero constraint violations or unstable rankings. Nine synthetic
service scenarios also had zero constraint violations and unstable rankings. Neither dataset has completed
expert review; these results do not establish general recommendation accuracy or real service accreditation.

Warm sequential p95 was 162.3 ms for the qualification evaluator and 26.4 ms for the in-process service
evaluator. Hardware: Windows, Intel Core i5-11300H (eight logical processors), 16 GiB RAM, Python 3.13;
the PostgreSQL service runs locally in Docker. These measurements satisfy the existing provisional local
budgets. The release owner still needs to approve a performance budget and representative production load.

## Migration and rollback

The rehearsal copied the local development database at `0017` and upgraded its copy to `0018`.
Downgrade toward `0004` stopped at the intentional `0015` staff-role guard. The refused transaction left
the copy unchanged; no roles were rewritten. Backup restoration matched full-table content fingerprints
and row counts, and the restored copy upgraded to `0018`. The source was unchanged and the disposable
copy was removed. Thus `backup_restore_passed=true`, `downgrade_success=false` and the overall downgrade
rehearsal remains failed. See [the rehearsal report](migration-rehearsal.md).

Before deployment, upgrade to head and sync the catalog source metadata:

```powershell
cd backend
../.venv/Scripts/python.exe -m alembic upgrade head
../.venv/Scripts/python.exe -m tesda_track.seed
../.venv/Scripts/python.exe -m tesda_track.embeddings sync
```

Use the production container equivalents on the actual server. Newer tables/columns and new records must
not be assumed to survive a downgrade. Production backup retention and recovery of writes made after a
backup require an approved operational plan on the target server.

## Staging and external status

Read-only checks of [the supplied staging site](https://tesda-track.vercel.app/) found:

- `/profile` displayed **Page not found**.
- `/api/v1/ready` returned 404.
- Its published API schema lacked readiness and recommendation analytics.

That deployment therefore does not yet contain this candidate. The repo's Railway configuration deploys
from `main`; this work remains on the feature branch. No merge, production deployment, account creation,
expert sign-off, parity sign-off or QA approval was performed.

Trello was read to verify the exact cards and acceptance criteria. Its connection became unavailable before
updates could be applied; no checklists, card positions, assignments or attachments were changed. This report
and its card-specific status table are ready to attach once that connection is restored.
