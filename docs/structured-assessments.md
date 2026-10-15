# Structured assessments and scoring

Implemented on 2026-10-14. This extends the current goal-only finder and the verification/eligibility pipeline. Questionnaire answers are optional, self-reported information; they are not psychological findings, verified competencies, or evidence of formal eligibility.

## Learner workflow

In **Find my pathway**, expand **Personalize with an assessment (optional)**. Enter interests, occupational fields, activities, skills, career goals, preferred qualifications, and relevant experience. Optional practical fields include region, maximum straight-line distance, delivery, budget, scholarship, a start window, and accessibility preferences. Existing readiness answers can be included explicitly as self-reported competency evidence.

Submitting the form applies the answers together. Opening the panel does not run matching, and editing individual fields does not trigger inference or writes. Guests use transient answers. Signed-in learners can choose whether to save; unchecking **Save this assessment to my account** keeps the assessment and its personalized results transient.

Use **Browse saved assessments** to retrieve and select a saved revision. Reassessment creates a new revision and starts a new finder result; earlier saved sessions retain their original assessment reference. **Use the goal-only workflow** clears the current personalization and derived results. Signing out clears the questionnaire and score caches.

## Storage and API

Migration `0007` adds `learner_assessment`, an optional assessment reference on saved recommendation sessions, and an optional assessment reference on ranking audits. Each assessment stores a questionnaire version, immutable normalized answers, a series identifier, revision number, previous revision identifier, and creation timestamp.

Endpoints follow existing JWT and ownership rules:

- `POST /api/v1/learner-assessments`: create a saved assessment from `{ "answers": { ... } }`.
- `GET /api/v1/learner-assessments`: list the learner's revisions with bounded pagination.
- `GET /api/v1/learner-assessments/{id}`: retrieve one owned revision.
- `PATCH /api/v1/learner-assessments/{id}`: replace answers in a **new** revision, returning HTTP 201. Updating an old revision after a newer one exists returns HTTP 409.
- `DELETE /api/v1/learner-assessments/{id}`: delete that assessment's entire series and linked recommendation sessions. Ranking audits lose the assessment reference but retain their existing minimal scoring audit.
- `POST /api/v1/recommendations/qualifications`: structured qualification recommendations from transient `assessment` answers or an owned `assessment_id`, with optional `goal` and bounded `limit`.
- Existing `/api/v1/analysis/matches` and `/api/v1/recommendations/training` accept those same optional assessment sources.

An assessment request cannot supply both transient answers and a saved identifier. Saved identifiers require sign-in and ownership checks. Unknown qualification codes, sectors, competency identifiers, versions, and unsupported fields are rejected. Coordinates are rounded to one decimal before being saved or used in scoring; radius constraints refer to that approximate location or the selected region's center.

Assessments are included in account exports and deleted with the account. Raw questionnaire answers are not stored in ranking audits or forwarded to Skills Bridge or another external model. Saved finder sessions still contain their existing learner-owned profile and matching snapshot. Deleting an assessment series deletes its linked saved sessions as well.

## Structured scoring policy

Policy identifier: `structured-assessment-v1`.

| Component | Configured weight | Evidence |
| --- | ---: | --- |
| Interest | 35% | Existing catalog keyword rules applied to stated interests/activities, plus exact preferred-sector alignment |
| Skill | 25% | Stated skill alignment and explicit competency answers; confident = 100, some experience = 50, unfamiliar = 0 |
| Career | 15% | Explicit preferred qualifications, or the stated career goal matched using existing catalog rules |
| Location | 15% | PostGIS straight-line distance, declining linearly to zero at the selected maximum radius or configured proximity radius |
| Preference | 10% | Share of stated delivery, budget, scholarship and start-window preferences met; unsupported accessibility details remain unknown |

These weights and competency values are provisional engineering choices, not validated scientific parameters. Configure them through `PERSONALIZATION_WEIGHTS__INTEREST`, `__SKILL`, `__CAREER`, `__LOCATION`, and `__PREFERENCE`; weights must be nonnegative and sum to one.

Qualification matching uses the interest, skill and career dimensions. Location and practical preferences are evaluated against individual programs, since qualification titles do not establish local availability or cost. Structured matching reuses existing keyword/negation/typo rules and works without loading a model.

An omitted learner dimension is **not applicable** and is removed from the denominator consistently across candidates in that request. A supplied preference with missing candidate evidence remains **unknown**, receives no positive credit for that missing check, and keeps its weight. Known and unknown checks within practical preferences share a fixed denominator, so missing cost cannot inflate the score.

Responses include configured and effective weights, component scores/states, weighted contributions, evidence coverage, explanations, and limitations. The displayed score is the rounded sum of the returned contributions. Evidence coverage is the effective weight backed by fully observed components; it is not a confidence or accuracy probability.

Exact repeated terms across interests, skills, and career goals are counted in one alignment dimension. Skill terms repeated verbatim as interests or career goals do not add a second weighted bonus. Distinct related terms may still be correlated; expert evaluation is needed before interpreting these parameters as a calibrated model.

No skills supplied does not automatically exclude a beginner or award full skill credit: that component becomes not applicable. Explicitly reported beginners receive lower qualification levels first **only when evidence scores tie within a qualification family**. This does not change scores or override authoritative prerequisites. Blank questionnaires with no useful alignment return no qualification matches and explain what information is needed.

Education, experience, career purpose, preferred route, and work environment are preserved as context. Experience and certification reports can refine the existing pathway discussion. Unsupported occupational/work-environment or purpose mappings do not add score bonuses. Provider accessibility capability data is currently absent, so accessibility preferences require confirmation.

## Mandatory constraints remain separate

Maximum distance is a hard geographic constraint when supplied. Budget, delivery, scholarship, and schedule can be designated mandatory explicitly. Known violations exclude a candidate; missing mandatory details move it to `requires_verification` without a fit score. Soft preferences only affect ranking.

Assessment answers cannot bypass current provider authorization, service validity, actual availability requirements, or verified-certificate prerequisites. Reporting a certification in this questionnaire never creates a verified certification record.

Explicit legacy location/delivery/scholarship request fields can override corresponding assessment preferences, but an override conflicting with a mandatory constraint is rejected. The portal only sends those overrides when the learner actually selects them.

## Corrections to the existing program ranker

The goal-only program ranker keeps its existing component names and configured 50/20/15/10/5 weights, with policy identifier `verified-services-v2`:

- A missing or disabled embedding model no longer yields semantic component 1. Its weight is omitted for the request, and its component is marked not applicable.
- A requested model signal with absent or identical program embeddings is unknown and receives zero semantic credit. It is not described as a perfect match.
- Missing location input and unstated practical preferences are not applicable. Missing provider coordinates or start dates remain unknown without candidate-specific weight redistribution.
- The response exposes effective weights, component states, and evidence coverage. Scores use those effective weights, so current numbers can differ from historical scores.
- Ranking audit weights now distinguish configured and effective values. Old audit records and saved scores are left intact.
- Program badges say `Fit N/100`; the score is not an enrollment or assessment-success probability.

## Setup and validation

Apply the migration before restarting the updated backend:

```powershell
Set-Location backend
../.venv/Scripts/python.exe -m alembic upgrade head
```

The local development database was upgraded to `0007`. No model training, model download, new vector database, or additional inference service is required for this feature. The usual API on port 8000 was not running during validation; a temporary API on port 8011 was used for a model-disabled smoke test.

Run the following against the configured disposable `_test` database; the existing test fixture recreates that schema:

```powershell
.venv/Scripts/python.exe -m pytest backend/tests/test_learner_assessments.py backend/tests/test_ranking.py backend/tests/test_verification.py backend/tests/test_recommendation_sessions.py -q --tb=short
.venv/Scripts/python.exe -m pytest --confcutdir=frontend/tests frontend/tests/test_assessment_view.py frontend/tests/test_training_centers.py frontend/tests/test_frontend_states.py -q --tb=short
```

Tests cover immutable revisions, stale-update conflicts, ownership, invalid input, transient guest handling, export/deletion, explicit personalization, beginner ties, repeated evidence, score arithmetic, missing program details, mandatory constraints, and absent/degenerate model signals. UI checks cover lazy loading, batched submission, saved reassessment/loading, optional persistence, cache invalidation, and the existing goal-only workflow.

Recommendation quality still needs expert review and a representative held-out evaluation set. Passing these tests establishes behavior, not measured occupational matching accuracy.

## Validation results

- Full backend regression run: **487 passed, one optional real-model test skipped**.
- Assessment-panel, center-finder, and frontend state run: **95 passed**.
- Final combined assessment/ranking/finder/API-client run: **69 passed**; its remaining training/application case was updated to use explicit test-only verification evidence and passed on rerun.
- Final form submission/revision-loading checks: **four passed**. The final beginner tie rule passed in the combined targeted run, and the configurable-weight behavior check passed separately after that run.
- Migration `0007` was applied to the local development database. A temporary model-disabled API returned HTTP 200 for health, training listings, assessment listings, and structured guest matching, then was shut down.

The full backend run preceded the last beginner tie rule and its additional test. Affected assessment behavior was checked afterward; unrelated backend tests were not repeated. The opt-in model quality check, expert-reviewed relevance evaluation, and comprehensive performance benchmark were not run.
