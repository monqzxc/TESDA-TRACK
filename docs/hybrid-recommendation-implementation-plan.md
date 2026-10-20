# Hybrid recommendation implementation plan

Date: 2026-10-13

Scope: improve the existing TESDA-TRACK application described in the supplied implementation prompt. This deliverable is a plan only; application code, configuration, databases, and models have not been changed.

## 1. Repository findings

This is an incremental project, not a new application. The current stack is FastAPI, SQLModel/SQLAlchemy, Alembic, PostgreSQL with PostGIS and pgvector, and Streamlit. Docker and Caddy support deployment. Dependencies are pinned, and pytest covers backend and frontend behavior.

| Capability | Current implementation | Remaining work |
| --- | --- | --- |
| Learner accounts | JWT authentication, ownership helpers, saved goals/sessions, readiness checks, certification records, export/deletion | Add a versioned structured assessment with equivalent ownership and lifecycle rules |
| Qualification matching | Keyword rules plus optional local embeddings in `services/analysis.py` and `services/recommendation_service.py` | Feed structured evidence into a documented scoring policy without duplicate matching logic |
| Training ranking | `services/ranking.py`: configurable semantic/proximity/assessment/schedule/preference weights, explanations, audit records | Separate mandatory checks; correct missing-data handling; add learner-based scoring and complete candidate evaluation |
| Assessment services | Separate center, schedule, application, and certification models | Add service-capability verification and assessment recommendation ranking |
| Geography | PostGIS distance/radius helpers and GiST indexes | Expose hard radius constraints in recommendation requests; clarify approximate locations and straight-line distances |
| Optional semantics | CPU-compatible E5/FastEmbed, lazy loading, content-hash embedding sync, keyword fallback | Evaluate reuse; fix score semantics when signals are absent; verify offline startup |
| Skills Bridge | Existing MCP/OAuth integration, bounded lookups, caching, rate limits; separate legacy REST adapter | Reuse its existing contract where useful, with provenance and bounded failure handling |
| Authoritative data | TESDA TR catalog ingestion; development delivery fixtures explicitly documented as unverified | Persist verification/freshness metadata and import approved provider/service records |
| Classification APIs | No PSOC/PSIC adapter found in inspected application code | Optional adapter only after API documentation, credentials, and permitted mappings are established |
| Health | Existing `/api/v1/health` checks database connectivity | Add a separate readiness contract without silently changing the existing health response |

No Typesense configuration was found in the inspected application. PostgreSQL, PostGIS, and pgvector should remain the storage/search stack.

Specific issues to address:

- `schedule_component()` gives a missing start date a score and describes it as “Open intake.” Missing dates do not establish availability.
- `rank_programs()` assigns semantic component `1.0` when semantic matching is unavailable or similarities do not vary. This is qualification membership, not measured semantic alignment.
- Training retrieval is capped at 100 candidates before scoring, which can hide stronger candidates outside the retrieved subset.
- Proximity without coordinates and preferences not supplied become zero-valued components without explicit missing/not-applicable metadata.
- Active flags and qualification links exist, but provider/service verification status, validity periods, and eligibility evidence are not modeled comprehensively.
- The ranker rounds learner coordinates before calculation to protect location privacy. Strict radius behavior must respect that existing boundary and identify the selected reference point as approximate.
- The README documents an existing fine-tuned model and two failing real-model guard cases. These are documented findings, not failures rerun during this planning audit.

## 2. Architecture and compatibility decisions

Retain one FastAPI backend and the existing Streamlit portal. Refactor the existing services behind a shared pipeline:

`normalized learner assessment -> candidate retrieval -> verification and mandatory checks -> deterministic scoring -> explanations -> optional saved snapshot`

Qualification matching and delivery-option ranking remain distinct stages: a suitable qualification does not establish that a provider can deliver it. Return separate training and assessment result collections when both are requested.

Keep `/api/v1/analysis/*`, `/api/v1/recommendations/training`, recommendation sessions, readiness checks, and delivery search routes. Add the new workflow alongside those contracts. Use a versioned scoring policy; do not silently reinterpret existing component names or overwrite historical scores. Apply factual safety corrections to legacy results with regression coverage and release notes.

Reuse the existing embedding interface, database cache, Skills Bridge client, ownership checks, and API client. Do not add another model server, vector database, search engine, or LLM. Preserve existing training artifacts, but do not train or fine-tune models as part of this implementation.

## 3. Implementation sequence

### Phase 1 — Establish contracts and baseline

1. Capture current request/response examples and frontend dependencies for analysis, ranking, sessions, training, and assessment searches.
2. Run the current database-free tests, followed by integration tests against the designated disposable `_test` database. Record existing failures separately. The root fixture recreates the test schema; never point it at development or production data.
3. Measure candidate counts, query counts, latency, and memory for representative existing requests. Record hardware, catalog size, model state, and warm/cold conditions.
4. Define the assessment schema, recommendation result types, verification states, eligibility outcomes, missing-data policy, and scoring-policy version before migration work.

Primary files: existing schemas, routers, `config.py`, `tests/test_ranking.py`, `tests/test_analysis_api.py`, and frontend API client tests.

Exit condition: existing behavior is recorded and the new contract can be implemented without breaking the current finder.

### Phase 2 — Establish verified data and eligibility foundations

1. Add source identifiers, source/version metadata, retrieval/review timestamps, verification status, and validity dates where needed for qualifications, providers, centers, and service capabilities.
2. Model qualification-specific training and assessment authorization separately. An assessment schedule does not itself prove that a center is authorized for that qualification.
3. Represent availability independently from verification: available, unavailable, or unknown, with an observation timestamp. Represent expired verification explicitly.
4. Add source-backed prerequisites and explicit outcomes: satisfied, unsatisfied, or unknown. Evaluate only actual mandatory requirements; self-reported readiness is not formal competency evidence.
5. Migrate historical rows to unknown unless there is adequate source evidence. Do not convert `is_active=True` into verified status.
6. Preserve fixture/demo isolation. Build a validated, idempotent import path with dry-run reporting, duplicate handling, invalid-coordinate checks, and import summaries. Obtain an approved data source before a public rollout; do not assume the repository's `.bak` file is approved or safe to restore.

Primary files: `models/catalog.py`, `models/delivery.py`, delivery/catalog schemas, `seed.py`, admin services, and additive Alembic migrations after `0005` (confirm the current head when implementation starts).

Exit condition: each displayed service can explain its source and verification state. Unknown records cannot appear as confirmed service recommendations.

### Phase 3 — Structured learner assessment

1. Add learner-owned assessment records with questionnaire version, normalized answers, timestamps, and revision linkage. Reassessment creates a new revision so saved recommendation snapshots remain interpretable.
2. Support interests, activities/work environments, self-reported skills, education, relevant experience, career goals, and preferred pathways. Add optional location, maximum radius, budget, schedule, delivery, and accessibility preferences.
3. Keep verified certifications and self-reported competencies separately identifiable. Collect functional accessibility preferences only where useful; do not infer medical conditions or sensitive traits.
4. Separate hard constraints selected by the learner from soft preferences. Education or experience becomes an exclusion criterion only where an authoritative prerequisite requires it.
5. Allow anonymous, transient assessment input for the existing guest workflow. Require authentication and ownership checks for saved records. Include new records in export and deletion.
6. Extend the current finder with native Streamlit form controls and explicit submission. Keep answers through navigation and avoid API/model requests on every widget change. Formal personality testing is out of scope.

Proposed additions: learner-assessment models/schemas/services/router; changes to `frontend/app_pages/find.py`, `frontend/portal/session.py`, and `frontend/api_client.py`.

Exit condition: a learner can complete, save, revisit, and revise an assessment; another learner cannot read or modify it.

### Phase 4 — Deterministic recommendation pipeline

1. Retrieve qualification candidates using existing keyword/semantic services and relevant explicit catalog selections. Retrieve linked training offerings and assessment capabilities separately.
2. Apply qualification status, service verification, validity, mandatory prerequisites, confirmed availability constraints, and user-designated hard limits before ranking.
3. Exclude failed mandatory checks. Put unresolved checks in a separately labeled `requires_verification` collection, never among confirmed eligible options. A verified service with unknown intake can be shown only with that limitation, and cannot satisfy a request requiring confirmed current availability.
4. Implement the provisional learner-based weights: interests 35%, skills/pathway fit 25%, career goals 15%, location 15%, practical preferences 10%. Validate configuration totals and version the policy independently of the existing training weights.
5. Document each component's evidence: explicit interest/category overlap; competency and pathway appropriateness; career-to-qualification relationships; PostGIS proximity; and individual practical-preference checks. Skills/pathway fit must preserve suitable beginner routes rather than merely rewarding existing expertise.
6. Use normalized 0–100 component scores. For supplied dimensions, missing candidate evidence contributes no positive evidence and is marked unknown. Omitted learner dimensions are not applicable and are removed from the denominator consistently for all candidates in that request. Publish configured/effective weights, evidence coverage, component contributions, and limitations; never renormalize away candidate-specific unknowns to inflate a result. If no useful evidence exists, request more input instead of presenting an arbitrary match score.
7. Assign each evidence signal to one defined component. Free-text semantic similarity may augment an alignment component; it must not add an extra bonus for the same evidence or establish equivalence/eligibility.
8. Reuse PostGIS filtering and indexes. Express radius relative to the user-selected approximate point or regional reference and label distances as straight-line. Do not infer travel time or precise residence.
9. Remove silent first-100 truncation. Score the full eligible set with bounded memory/queries at current scale, or implement a measured retrieval strategy that reports limits. Apply stable ordering and pagination after ranking; deduplicate equivalent offerings.
10. Generate explanations directly from actual checks and score contributions. Include policy version, data snapshot/version, model identity when used, and evaluation timestamp. Freeze the clock and data version for reproducibility tests; schedules legitimately change with time.

Primary files: existing ranking/recommendation/analysis services, new shared eligibility/scoring helpers, `geo.py`, `training.py`, assessment services, ranking schemas, and audit models.

Exit condition: training and assessment recommendations are reproducible, explainable, and cannot bypass mandatory constraints.

### Phase 5 — API and portal integration

Proposed API additions, subject to the Phase 1 compatibility review:

- `POST /api/v1/learner-assessments`: save a versioned assessment.
- `GET /api/v1/learner-assessments/{id}`: retrieve the owner's assessment.
- `PATCH /api/v1/learner-assessments/{id}`: create a revised assessment and return its new revision identifier.
- `POST /api/v1/recommendations`: accept an assessment reference or transient assessment, service type, constraints, result limits, and explanation options.
- Reuse recommendation sessions for saved snapshots; add a retrieval route only if their existing contract cannot represent the new result. Do not create parallel persistence unnecessarily.
- `GET /api/v1/ready`: check required database/schema/extensions; report optional integration degradation without making optional AI a readiness requirement.

Responses expose type-specific program/center identifiers, qualification, score details, eligibility outcomes, verification/freshness metadata, missing information, and ranking version. Bind pagination to a stable result snapshot or data/policy context so successive pages do not silently rerank.

Update the finder and training views to show distinct training/assessment choices, alternatives, prerequisites, costs/schedules when known, and clear verification labels. Preserve the current goal-only workflow and existing saved records. Keep location and raw assessment answers out of URLs and logs. Apply request-size, result-count, and rate/concurrency bounds using existing conventions.

Exit condition: the complete learner journey works through the portal with authentication, validation, empty states, and useful failures.

### Phase 6 — Optional integrations and semantic evaluation

1. Reuse Skills Bridge only for its documented skill/occupation relationships. Preserve explicit user-triggered lookups, minimal extracted terms, caching, authentication, timeouts, and bounded retries. Do not forward entire learner assessments.
2. Preserve official identifiers and make any mapping into the local qualification catalog explicit and reviewable. Provider verification remains independent.
3. Add a PSA classification adapter only after confirming the official API contract and access. Store code, label, classification version, source, and many-to-many mappings. When access is unavailable, use a clearly labeled mock exclusively in tests/demos and keep the feature disabled in production.
4. Compare deterministic-only and existing pretrained semantic matching on reviewed English, Filipino, and Taglish cases. Compare the existing fine-tuned artifact as a separate candidate without retraining or silently replacing deployment settings.
5. Reuse content-hash embedding sync and the single existing model interface. Test missing weights, failed loading, empty/stale embeddings, and offline operation. Core API startup must not depend on a download or GPU.
6. Keep LLM explanations deferred unless later evaluation identifies a concrete benefit. Template explanations satisfy the initial requirement.

Exit condition: optional services improve measured behavior or remain disabled; their failure cannot prevent baseline recommendations.

### Phase 7 — Evaluation, release, and documentation

Automated coverage must include structured relevance, stable tie-breaking, failed/unknown eligibility, expired verification, separate service capabilities, geographic boundaries, missing coordinates, empty results, unavailable upstreams/models, ownership violations, safe exports/deletion/logging, candidates beyond position 100, stable pagination, and explanation arithmetic.

Use existing pytest, database/PostGIS fixtures, and Streamlit AppTest. Add synthetic records only to isolated test/demo datasets. Test migration/backfill behavior and legacy request/response compatibility.

Build a small expert-reviewed evaluation set covering beginners, experienced learners, rural/urban locations, multilingual goals, absent preferences, accessibility requirements, and no suitable results. Keep tuning and held-out cases separate. Compare current behavior, deterministic baseline, and optional semantic mode using top-k relevance, NDCG@k, mandatory-constraint violations, coverage/unknown rate, and latency/memory. Unit-test success is not evidence of recommendation accuracy.

Release gates:

- Zero known mandatory-constraint violations in the reviewed evaluation set.
- No unverified or synthetic service represented as verified.
- Correct ownership, export/deletion, and privacy behavior.
- Baseline works without optional services or model files.
- No unexplained regressions in existing workflows or reviewed relevance cases.
- Measured performance meets a budget fixed after Phase 1 profiling; a provisional target is warm deterministic p95 below one second for the pilot catalog on documented hardware, subject to measurement.
- Migrations and rollback procedure rehearsed on a database copy. Roll back policy/application flags without deleting new learner records.

Update README, `.env.example`, architecture/API examples, data import instructions, evaluation reports, and operational guidance. Report exact tests run and limitations at implementation delivery; preserve the developer's `.env`.

## 4. Delivery order and boundaries

Deliver in reviewable increments: (1) baseline/contracts, (2) verification and prerequisites, (3) learner assessment, (4) shared engine, (5) API/portal integration, (6) optional adapters and semantic comparison, (7) release evidence/documentation. Tests accompany each increment rather than being deferred to the last phase.

The minimum useful release is Phases 1–5 plus Phase 7 validation with deterministic matching. Skills Bridge and existing embeddings can be reused opportunistically without becoming blockers. PSA access and a new LLM are not prerequisites.

External dependencies that remain unresolved: approved and sufficiently current provider/service data, authoritative prerequisite mappings, expert reviewers, and any PSA API credentials/documentation. Continue implementation and synthetic testing independently, but do not claim live verified coverage until those sources exist.

Planning validation: inspected repository code, schemas, models, migrations inventory, requirements, test definitions, deployment documentation, and the attached prompt. No application tests, live-service checks, database inspections, or model benchmarks were run for this planning-only request.
