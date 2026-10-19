# Service verification and eligibility

Training recommendations now distinguish confirmed services from records that require verification. An active provider, a linked qualification, or a scheduled date alone does not establish service authorization, learner eligibility, or current intake availability.

## Database upgrade

From the repository root in PowerShell:

```powershell
Set-Location backend
../.venv/Scripts/python.exe -m alembic upgrade head
```

Migration `0006` adds `service_verification` and availability fields on training programs and assessment schedules. It preserves existing records and gives them unknown availability. Existing services have no verification evidence until an administrator reviews and records it. The local development database was upgraded to `0006` during this implementation.

Run the migration before starting/reloading the updated API. Code using the new columns against revision `0005` returns errors on program and schedule endpoints even when `/health` succeeds.

## What can be confirmed

Service evidence is keyed by **site, qualification, and service type**. Training authorization for a qualification does not authorize an assessment center, or a different qualification.

An administrator must provide a source name and reference, a review timestamp, and a review expiry date to record `verified` status. Optional fields hold official source record identifiers, classification/source versions, and authorization validity dates. The source may be an official public page or an approved internal document reference; do not put credentials or private learner documents in these fields.

The application validates the shape and dates of evidence. It does not contact TESDA to authenticate an administrator's source reference. Administrators remain responsible for reviewing authoritative records and refreshing them. No live directory integration or official registration numbers are fabricated.

| Effective status | Behavior |
| --- | --- |
| `verified` | Current, complete, non-synthetic source evidence; still subject to prerequisite and availability checks |
| `unknown` | No evidence, incomplete evidence, synthetic data, future authorization, or future review |
| `expired` | Explicit expiry, elapsed review period, or elapsed authorization validity |
| `unavailable` | Administrator-confirmed service unavailability |

Synthetic records cannot be written as verified through the administrative API. Seed and demo loaders never automatically verify delivery services. The demo generator creates fictional reporting activity directly and never issues verified certificates for that activity.

## Administrative API

Use the existing administrator JWT and `/api/docs`:

- `PUT /api/v1/admin/service-verifications/{kind}/{site_id}/{qualification_code}` replaces evidence for one service. `kind` is `training` or `assessment`.
- `GET` on the same route retrieves effective evidence, including automatic expiry.
- `POST /api/v1/admin/service-verifications/import` imports up to 500 records atomically. It defaults to `dry_run: true`, rejects duplicate service keys, and rolls back the entire batch on an invalid reference. Repeated committed imports update existing service keys rather than duplicating records.

Each import record has this structure:

```json
{
  "kind": "training",
  "site_id": 123,
  "qualification_code": "REPLACE-WITH-EXISTING-CODE",
  "evidence": {
    "status": "unknown",
    "requirements_reviewed": false,
    "requirements": []
  }
}
```

The example is structural only and contains no verified service evidence. Replace identifiers with existing database records. To confirm a service, provide actual reviewed source evidence and timestamps through the documented request schema; do not copy fictional test evidence into the development or production catalog.

## Mandatory prerequisites

`requirements_reviewed: true` means the source's mandatory entry requirements were checked. An empty list with that flag explicitly records that the reviewed source imposes no modeled prerequisites. An unreviewed empty list remains unknown.

Supported prerequisite records have a description and source reference:

- `verified_certification`: requires an existing official qualification code and a current verified certificate belonging to the requesting learner. Self-reported certifications, another learner's records, missing issue dates, and absent evidence cannot satisfy it. Expired/not-yet-valid recorded certificates fail the check.
- `manual_review`: records an authoritative requirement that cannot currently be checked automatically. It stays unknown. This release does not include a learner-document review workflow to satisfy it.

Missing certificates remain unknown because an account's missing record is not proof that the learner lacks the credential. Limited skills or self-reported readiness do not become mandatory exclusions unless the authoritative requirements establish a relevant prerequisite.

Eligibility responses show `satisfied`, `unsatisfied`, or `unknown`, with the actual checks. Certificate numbers and unrelated learner details are not included.

## Availability is independent

Training-program and assessment-schedule create/update schemas accept:

- `availability_status`: `unknown`, `available`, or `unavailable`.
- `availability_source`: the reviewed source of the observation.
- `availability_checked_at`: an aware observation timestamp.
- `availability_valid_until`: the observation's expiry timestamp.

Available/unavailable claims require all evidence fields and a valid observation period. Stale observations become unknown. These dates bound how long an observation may be trusted; they are separate from the program or assessment's scheduled date.

Material changes to dates, seats, fees, status, or program details invalidate an old observation unless the update supplies all four availability fields again. A missing start date is shown as “Start date not confirmed.”

## Recommendation and application behavior

`POST /api/v1/recommendations/training` retains its existing score components and request fields, with an additive `require_confirmed_availability` flag.

- `results` contains only services with current verification and satisfied prerequisites.
- `requires_verification` contains relevant records with unresolved service evidence, prerequisites, or required availability. These have reasons and no fit score.
- Expired/unavailable services, failed prerequisites, unavailable intakes, and finished programs are excluded.
- By default, a verified eligible service with unknown intake can appear with a warning. Set `require_confirmed_availability: true` to keep such records out of confirmed results.
- The nearby-assessment score only credits verified, eligible, currently available assessments with open seats.
- Retrieval continues beyond the first 100 candidates so unverified records cannot hide a later valid candidate.
- Ranking audits include a policy identifier and the evidence used for confirmed results. The initial verification policy was `verified-services-v1`; subsequent [scoring corrections](structured-assessments.md) use `verified-services-v2` or `structured-assessment-v1`.

Training and assessment listing endpoints retain records for discovery and expose `verification` and `availability` metadata. Listing a record is not a confirmed recommendation. The portal labels unresolved records, suppresses their fit badges, and disables application actions without current evidence. Cached evidence is checked for expiry in the frontend.

Assessment application and approval endpoints both recheck active site/qualification status, current qualification-specific authorization, observed availability, and the learner's mandatory prerequisites. Public application checks have no demo bypass.

When dates are published, authorization must cover the assessment date or the training's published date range. A current certificate prerequisite must remain valid at the scheduled assessment or training start. A training offering outside the recorded authorization period requires renewed evidence before it can be confirmed.

## Verification commands

The backend test fixture drops and recreates only the database named by `TEST_DATABASE_URL`, which must end in `_test`. Never run it against a development or production database.

```powershell
.venv/Scripts/python.exe -m pytest backend/tests/test_verification.py backend/tests/test_ranking.py backend/tests/test_assessments.py backend/tests/test_training.py -q --tb=short
.venv/Scripts/python.exe -m pytest --confcutdir=classic/tests classic/tests/test_training_centers.py classic/tests/test_portal.py classic/tests/test_centers.py classic/tests/test_service_evidence.py -q --tb=short
```

Coverage includes unknown/expired/unavailable evidence, future authorization, service/qualification separation, owned verified certificates, manual requirements, unavailable/stale intakes, administrator-only writes, atomic imports, migration downgrade/upgrade, and candidates beyond position 100. Frontend coverage includes unverified application actions, stale cached evidence, missing metadata, and suppression of misleading fit badges.

Known external dependency: approved provider/service evidence and authoritative prerequisite mappings must be supplied by an administrator before the system can return confirmed services. The code and tests establish the checks; they do not establish live TESDA coverage.

## Implementation validation — 2026-10-13

- Full backend regression run: 454 passed, one opt-in real-model test skipped.
- After adding service-date validity checks: 83 targeted backend tests passed.
- Portal, center-finder, center utilities, and initial evidence display checks: 117 passed.
- Final evidence display checks, including service-date expiry and manual prerequisites: four passed.
- Migration downgrade/reapply was tested on the disposable test schema. Migration `0006` was then applied to the local development database.
- Live local training-program, assessment-schedule, and training-recommendation requests returned HTTP 200 after the upgrade. Existing development services correctly remained unknown; none were promoted to verified.

The full regression run preceded the final service-date boundary additions; the affected backend and frontend tests were rerun after those changes. Optional embedding quality and live authoritative directory coverage were not evaluated in this work.
