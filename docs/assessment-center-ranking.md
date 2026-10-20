# Assessment-center ranking and portal integration

The assessment route completes the existing qualification → center comparison → application → administrator approval → result/certificate workflow. It reuses the catalog, authoritative service verification, learner certificate checks, PostGIS distances, and existing application records. It does not require an embedding model or an additional service.

## Portal workflow

In **Training & Assessment**, open **Compare assessment centers**, choose a qualification, and submit **Compare assessments**. The form accepts an optional assessment region, maximum distance, fee limit, and assessment date window. Fee and date constraints can be marked mandatory. Inputs are submitted together; merely opening or editing the form does not generate a ranking.

The comparison uses the active learner assessment, including an owned saved revision when selected. Training budgets, scholarships, delivery modes, and training start windows remain training preferences. Explicit assessment fee/date controls apply to exam schedules. Geographic and accessibility preferences can be shared.

Confirmed alternatives show center, assessment date in Philippine time, fee (or an explicit unknown label), open seats, approximate distance, fit out of 100, and component explanations. **Show center** opens that center in the existing map and details view. **Apply for assessment** submits to the existing application API; the result can be tracked and withdrawn in **My Progress**. Pending applications do not reserve seats; approved/completed applications do.

Guest comparisons are allowed. Application submission and saved assessment references require sign-in. Comparisons are bound to the learner/profile/location context and expire after 60 seconds; resubmit to refresh. Application and withdrawal invalidate the comparison. Browser geolocation is not forwarded into ranking audits; explicit place choices and submitted questionnaire coordinates are rounded before use. The alternate learner portal also uses assessment ranking instead of treating every public schedule as a recommendation.

Unconfirmed listings have reasons, no fit score, and no application button in the comparison. Ordinary schedule cards with certificate prerequisites require a current comparison's satisfied eligibility decision before enabling Apply. The server checks eligibility again on submission and approval.

## API

`POST /api/v1/recommendations/assessments` accepts:

| Field | Meaning |
| --- | --- |
| `qualification_code` | One active catalog qualification |
| `assessment` or `assessment_id` | Optional transient answers or an owned saved assessment revision; mutually exclusive |
| `goal` | Optional free-text career alignment, sent in the body |
| `near_lat`, `near_lon` | Optional complete coordinate pair, rounded to one decimal before ranking/auditing |
| `region_code` | Optional hard region filter; uses the region center for proximity if no explicit coordinates are given |
| `maximum_distance_km` | Optional hard straight-line distance limit; requires an explicit or assessment location |
| `maximum_fee`, `fee_is_mandatory` | Optional exam fee limit, including zero; unknown mandatory fees are unconfirmed |
| `scheduled_after`, `scheduled_before`, `schedule_is_mandatory` | Inclusive Philippine-calendar date window |
| `limit`, `offset` | Ranked-page size 1–50 (default 10), offset 0–10000 |

Minimal example, without pretending demo records are verified:

```json
{
  "qualification_code": "MMAW-NC-II",
  "assessment": {"interests": ["welding"]},
  "region_code": "NCR",
  "maximum_fee": "1500.00",
  "fee_is_mandatory": true,
  "limit": 10
}
```

Response discriminator `result_type` is `assessment`. Each confirmed result contains `schedule`, `eligibility`, `score`, `personalization` (weights, component states, contributions, evidence coverage, limitations), `explanation`, and the signed-in learner's `application_status`. It also returns `checked_at`, `total`, `unconfirmed_total`, `limit`, `offset`, `audit_id`, and a separately paginated `requires_verification` list.

The ranker evaluates all candidate batches before applying ranked pagination. Ties use assessment datetime, then schedule ID. Rankings are reproducible for unchanged input, time-sensitive evidence and data. Pagination is live: changes to seats, dates or verification can change subsequent pages; it is not a reservation or immutable search session.

`GET /api/v1/recommendations/{audit_id}` returns a signed-in learner's owned historical training or assessment scoring snapshot. Unknown or another learner's records return 404; anonymous access returns 401. These records describe historical decisions, not current permission to apply. Generate a fresh ranking and use the application endpoint for current checks.

Account exports separate `training_rankings` and `assessment_rankings`. Both use the existing `ranking_audit` table; assessment rows carry `preferences.service_kind = "assessment"`. Historical rows without that discriminator remain training rankings. No new migration beyond the structured-assessment migration `0007` is needed. Raw questionnaire answers and goal text are not copied into audit rows; learner text is not sent to an external model. Existing account deletion anonymizes these audit links, while deleting owned assessments and application records.

## Eligibility and availability

Before scoring, require an active qualification and center, an open future assessment, remaining approved-seat capacity, current verified authority for this qualification, authorization covering the exam date, satisfied authoritative prerequisites, and current confirmed availability. Missing or expired certificate evidence cannot be replaced by self-reported experience, readiness, or a high fit score.

Unknown authority, prerequisite checks, availability, or mandatory logistics appear only under `requires_verification`. Known unavailable/expired services, failed prerequisites, full/past/closed schedules, and known hard-constraint violations are excluded. Unknown mandatory distance with missing coordinates remains unconfirmed. A new application to an already full schedule is rejected; administrator approval retains its existing locking/capacity safeguards.

## Scoring

Policy identifier: `assessment-center-v1`. It reuses configurable `PERSONALIZATION_WEIGHTS__INTEREST/SKILL/CAREER/LOCATION/PREFERENCE` (defaults 35/25/15/15/10%). Occupational dimensions are qualification alignment and are identical across schedules for the same qualification. They do not establish exam readiness. Distance and assessment logistics distinguish centers and schedules.

Location falls linearly from 100 to zero at the maximum distance, or configured proximity radius. Preference is the fraction of explicit fee/date checks met. Missing fee or accessibility capability data gets no credit and retains its share of the denominator. Omitted dimensions have zero effective weight; missing evidence in a stated dimension remains unknown and does not redistribute that candidate's weights. With no scoring inputs, fit is zero and schedules sort by date/ID rather than receiving fabricated perfect fit.

Scores are rounded sums of returned weighted contributions. Observed evidence coverage measures the weight supported by fully observed components; it is not an accuracy probability. These remain provisional engineering weights pending expert and held-out relevance evaluation.

## Validation

Run API/application checks against the configured disposable `_test` database:

```powershell
.venv/Scripts/python.exe -m pytest backend/tests/test_assessment_ranking.py backend/tests/test_assessments.py backend/tests/test_verification.py backend/tests/test_ranking.py -q --tb=short
.venv/Scripts/python.exe -m pytest --confcutdir=classic/tests classic/tests/test_training_centers.py classic/tests/test_service_evidence.py classic/tests/test_api_client.py classic/tests/test_portal.py -q --tb=short
```

All authority and availability evidence in tests is explicitly synthetic and isolated from production/seed data. Checks cover current service evidence, certificate ownership and exam-date expiry, constraints, missing details, rounding, more than 100 candidates, stable pagination, score arithmetic, history ownership/export separation, stale comparisons, map selection, and application → approval → completion → verified certificate.

Validation on 2026-10-14: full backend regression **528 passed**, one optional real-model check skipped; headless center/form/client/alternate-portal checks **101 passed**. Final assessment ranking checks passed with the real-HTTP UI suite (the new export/withdrawal test passed after correcting its client method name). The live API on port 8000 and portal on 8501 respond; a comparison using the development catalog's `MMAW-NC-II` code returned HTTP 200, zero confirmed schedules and six requiring verification. The disposable backend test catalog still uses `SMAW-NC-II`; production requests must use a code returned by their own catalog API.

Expert relevance evaluation, opt-in real-model evaluation and a comprehensive performance benchmark were not run. Test counts establish behavior, not calibrated matching accuracy. No source verification records were fabricated for the live smoke test.
