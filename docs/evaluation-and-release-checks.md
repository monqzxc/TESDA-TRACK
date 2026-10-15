# Evaluation and release checks

This release adds a repeatable evaluation of structured qualification matching, service constraints, ranking repeatability, latency and the existing portal workflow. The evaluation calls the production scoring function and actual API routes. It does not train a model or fabricate authoritative records for production.

## Run the checks

From the repository root with the configured development database running:

```powershell
.venv/Scripts/python.exe scripts/release_check.py --build-images
```

The runner checks pinned dependency consistency and whitespace, runs the complete backend/frontend regression suite, checks Alembic schema drift, evaluates the full committed qualification catalog, runs the existing optional real-model guard with Hugging Face offline mode, builds separate `:release-check` images, and smoke-tests those images against the disposable database. Container tests use ephemeral localhost ports and remove their own containers. They do not replace running services, migrate the live database, or deploy a release.

Tests drop/rebuild **only `TEST_DATABASE_URL`**, which the existing fixture requires to end in `_test`. Database test processes run sequentially. The service evaluation creates source/availability fixtures inside a rolled-back test transaction. Do not point this setting at a database whose data you need.

Reports are written to ignored `reports/`:

- `release-check.json`: source fingerprint, checks, test totals, measured evaluation results and blockers.
- `qualification-evaluation.json`: catalog/dataset hashes, configured policy, language breakdowns, ranked qualification codes and latency.
- `service-evaluation.json`: independent safety checks, logistics relevance, repeatability and candidate-scaling measurements.
- JUnit XML: local regression/model diagnostics. The CI workflow uploads only sanitized JSON reports, not expanded environment data or raw test output.

The runner exits nonzero when release gates are not met. A failed gate still produces the report. Docker Compose contains credentials after interpolation; the runner keeps that document in memory and reports only policy/build metadata. No goal text or learner questionnaire answers are exported into the evaluation reports. The default datasets contain synthetic scenarios, not learner records.

The GitHub workflow in `.github/workflows/release-check.yml` repeats these checks on an isolated CI database with semantic search disabled. It uploads reports even when a gate fails and never deploys. Current draft relevance/expert-review gates can keep this workflow red; do not bypass them to imply production readiness.

## Qualification relevance

```powershell
Set-Location backend
../.venv/Scripts/python.exe -m evaluation.qualifications --output ../reports/qualification-evaluation.json
```

The dataset is `backend/evaluation/data/qualification_cases_v1.json`: 24 engineering cases across English, Filipino, Taglish and missing-input scenarios. Eighteen have graded positive expectations and six should abstain. Judgments use catalog codes and grades 0 (irrelevant), 1 (partly relevant), 2 (relevant), 3 (strongly relevant). They were specified before the initial evaluation run and are **engineering drafts pending expert review**.

The API and offline evaluator share `analysis.structured_matches`; there is no separately reimplemented matcher. The evaluator validates catalog references, rejects database-specific competency IDs, records the first call separately, and repeats each case five times by default. Reported warm latency excludes catalog loading, HTTP and database calls.

Metrics include top-one relevance (grade at least one), precision/recall at three, graded nDCG at three, MRR at three, abstention on negative cases, unjudged results, constraint violations and instability. Precision at three uses denominator three even when fewer results are returned. Unjudged results receive zero numerical relevance credit and are counted explicitly; they are not silently declared irrelevant. Undefined relevance metrics remain null.

The provisional engineering relevance floor is 80% top-one relevance (`--min-top1`), with a local warm p95 budget of 1000 ms (`--max-p95-ms`). These are engineering gates, not scientifically validated quality targets. Set evaluation targets before comparing candidates; do not weaken them after seeing a failure. Relevance and engineering safety/performance gates are recorded separately.

The 80% floor was added after the initial diagnostic run and does not turn its 77.8% result into a pass. Before subsequent candidate comparisons, the release owner should approve appropriate quality targets and independent held-out judgments.

An expert can review the existing grades and add representative, independently judged cases using the same schema. `review_status: expert_reviewed` requires named reviewers. This field records declared provenance; the release owner must verify it. Once these cases guide improvements, they are regression/development cases, not a held-out quality benchmark. Create a separate held-out set before claiming general matching accuracy.

## Service reliability

`backend/tests/test_release_evaluation.py` evaluates actual training and assessment endpoints using independent expected candidates and `evaluation.services.constraint_violations`, which does not call the ranker's filtering helpers.

The checks cover current source reviews, authorization across service dates, qualification identity, synthetic/unverified sources, availability evidence, formal prerequisites, future schedules/seats, maximum distance, mandatory fees/budgets/windows/delivery/scholarship, score arithmetic, and unscored unconfirmed listings. Missing fee evidence cannot gain credit. Self-reported experience/certifications cannot satisfy formal certificate prerequisites.

Nine logistics/failure scenarios are repeated. Scaling checks add 250 assessment schedules and verify ranking/pagination across 253 eligible candidates, beyond the API's 100-row candidate batch. The provisional local in-process API budget is 1500 ms warm p95 and 3000 ms for these scaling requests. These are sequential measurements using a real local database and an in-process HTTP adapter; they do not establish a concurrent-user production SLA.

The regression suite also exercises immutable reassessment, ownership, export/deletion, guest behavior, model failure, complete application/approval/result/certificate flow, portal selection/application/export/withdrawal over real HTTP, and expired cached comparisons. Training fit caches now expire after 60 seconds as well.

`test_migration_release.py` rehearses `0006` → `0007` in the isolated test transaction and verifies that legacy owned sessions/audits survive and new assessment creation works afterward. Fresh schema installation is exercised by the normal test fixture. A production downgrade of `0007` drops assessment data; use a tested backup/restore or forward repair if rollback is required rather than assuming a lossless downgrade.

## Deployment configuration

Docker Compose now passes personalization/training weights, proximity radius and the semantic-search toggle to both API and migration services. `DOCKER_EMBEDDING_MODEL_PATH` allows the Docker path to differ from the host path:

```dotenv
EMBEDDING_MODEL_PATH=backend/models/tesda-e5-small-v2
DOCKER_EMBEDDING_MODEL_PATH=/app/finetuned/tesda-e5-small-v2
```

The release check rejects a host-relative model path in the container environment. Image build and runtime settings must agree. A model-disabled image build skips model warmup/download; the baseline service does not need the optional model. The smoke images deliberately test this baseline profile. The configured model remains subject to its separate real-model guard before an enabled-model release.

Before promotion, review the generated blockers, confirm authoritative source and availability coverage for the actual services being offered, review expert relevance judgments, and verify the chosen deployment profile's model/container checks. Test fixtures establish behavior and must never be imported as production service evidence.

## Initial findings

The first 24-case draft run returned a relevant top result for **14/18 positive cases (77.8%)**, correctly abstained on **6/6 negative cases**, and produced no unstable rankings or constraint violations. Four English free-text goals returned no structured match: elderly care, solar-panel installation, call-center work and bread/cake-making. These are visible failures, not evidence of acceptable general matching quality. Weights were not tuned against this set.

The migration preservation rehearsal, independent API evaluation and training-cache-expiry checks passed. The live read-only inventory found **173 active training listings and 101 upcoming assessment schedules**, with **zero current verified services and zero confirmed availability records**. Safe abstention works, but useful confirmed service recommendations require actual source evidence.

Final regression counts, latency, Docker results and the optional model outcome are recorded in the generated release report and the dated validation report beside this document. This implementation prepares a reviewable candidate; it does not claim a production release while material gates remain unmet.
