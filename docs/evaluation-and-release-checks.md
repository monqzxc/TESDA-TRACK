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

The GitHub workflow in `.github/workflows/release-check.yml` repeats these checks on an isolated CI database with semantic search disabled. It uploads reports even when a gate fails and never deploys. On pushes and pull requests it runs with `--review-warns`: a pending expert relevance review shows as a warning instead of failing the run, so the workflow fails only on broken checks. The report still lists the review among its `blockers` and says `release_ready: false`; `failing` lists the blockers that failed the run. Before a release, run the workflow by hand (**Actions → Recommendation release checks → Run workflow**), which enforces every gate, the review included. Do not mark the cases reviewed to imply production readiness.

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

The [full database-copy rehearsal](migration-rehearsal.md) additionally upgrades a copy of the local `0017`
database to `0018`, attempts the downgrade to `0004`, and verifies backup restoration by row counts and
complete-content fingerprints. The current staff-role guard intentionally refuses the downgrade at `0015`;
the backup restoration succeeds, the restored copy upgrades to head, and the source remains unchanged.

## Profile-only suggestions

The TSP webview's "Suggested for you" (`POST /api/v1/analysis/suggestions`) ranks qualifications from a Skill
Passport profile with no goal behind it. It is **off by default** (`TSP_SUGGESTIONS_ENABLED=false`): the endpoint
answers 404, client-config reports `tsp_suggestions: false`, and the webview shows only the goal box. Turn it on only
once the gates below pass.

### What is measured

`backend/evaluation/suggestions.py` ranks every case with `analysis.rank_suggestions`, the function the API calls
(two parity tests hold the offline ranking to the endpoint, with and without a model), and compares `suggest()` with
keyword-only, semantic-only, a keyword-weight sweep (0.0 to 1.0), a most-popular list and random picks. It reports
Recall@3, MRR@3 and nDCG@3 from `evaluation.metrics`, abstention where nothing should be suggested, catalog
coverage, normalised entropy and top-five share of what is shown (collapse), per-sector recall, slices by kind,
language, profile size, region and origin, and 95% paired-bootstrap intervals for `suggest()` minus each baseline.
`--calibrate` tunes suggestion parameters on half the labeled goal-set cases and compares them with the inherited
ones on the other half.

Cases come from separate sources, reported separately:

| Source | What it is | Labels |
| --- | --- | --- |
| `goal_sets` | The team's labeled dev goals used as skills (held out of v6 training): short searches, job titles, typos and near-TVET goals as single skills, composed multi-skill and mixed profiles, and no-TVET/vague/non-goals that should get nothing | Engineering draft |
| `adversarial` | `evaluation/data/suggestion_adversarial_v1.json`: empty, generic soft skills, Filipino/Taglish, typos, no-fit, multi-skill, mixed. Checked against all training and goal data for overlap | Engineering draft |
| `file:suggestion_assessor_v1` | TESDA assessors' grades from the labeling sheet (below) | Expert reviewed |
| `real` | `--from-db`: the TSP profiles stored on a server. No answers, so distribution and abstention, plus recall where a learner's own credential maps to the catalog (a weak label: what they hold, not what to train in next). Aggregates only; slices under `--k` are suppressed | Weak or none |

The goal-set and adversarial cases are written by the team, not TSP payloads. Until the census below shows what real
Skill Passport skills look like, they say how `suggest()` handles skill-like text, not how it handles real profiles.

### Run it

In CI, `.github/workflows/suggestion-evaluation.yml` downloads the public `Nyanta19/tesda-e5-small-v6-colab`
(checksum-verified), calibrates it for goal matching the usual way, and evaluates suggestions three ways: with the
settings' defaults (what the model gets today, having no `calibration.json`), with the inherited matching
calibration, and without a model. It uses only committed cases and needs no secrets, so anyone can rerun it.

On the server, where the real profiles are (read-only; nothing a learner wrote leaves the server):

```bash
# 1. What real Skill Passport profiles look like: shape, empties, length, language, free text vs catalog terms
docker compose exec -T api python - --k 5 < scripts/tsp_profile_census.py > tsp-census.json
# 2. The model, once (public; about 470 MB)
hf download Nyanta19/tesda-e5-small-v6-colab --local-dir backend/models/tesda-e5-small-v6-colab
# 3. The evaluation with real profiles added: the evaluation code is mounted into a one-off API container
mkdir -p reports
docker compose run --rm --user root -v "$PWD/backend/evaluation:/app/evaluation" \
  -v "$PWD/backend/training:/app/training" -v "$PWD/backend/models:/app/eval-models" -v "$PWD/reports:/app/reports" \
  api python -m evaluation.suggestions --model-path /app/eval-models/tesda-e5-small-v6-colab \
  --from-db --k 5 --output /app/reports/suggestion-evaluation-real.json
```

`--since YYYY-MM-DD` keeps only learners linked after a date (for example after a staging reset), and
`--exclude-subjects FILE` leaves out known TSP test accounts.

### Assessor labels and agreement

`backend/evaluation/labeling.py sheet` makes a blind, stratified sheet: profiles sampled by whether `suggest()`
showed anything, profile size and region, each with every qualification any system would show, in random order and
without system names, plus "no TESDA qualification fits" and "something better" rows. `INSTRUCTIONS.md` beside it
explains the 0-3 grades. With `--from-db` the sheet shows assessors learners' skills (no names or identifiers), which
needs `--allow-learner-text`: confirm the data-use approval first. Each assessor fills in their own copy without
discussing it; `labeling.py agreement` then reports Krippendorff's alpha (ordinal), Fleiss' kappa (relevant or not)
and pairwise quadratic-weighted Cohen's kappa, and `labeling.py cases` writes
`evaluation/data/suggestion_assessor_v1.json` with the reviewers named.

### Gates

`evaluation/data/suggestion_gates_v1.json` holds the proposed gates. They were set before any model result was seen,
for the release owner to approve; do not loosen one after seeing a failure. In short, with assessor labels: `suggest()`
beats every baseline on Recall@3 (bootstrap interval above zero), at least 80% of shown suggestions are rated relevant,
at most 5% irrelevant, a relevant one is in the three for at least 70% of profiles, and passport-present and
hints-only learners are within 0.10. Without labels: no suggestion for an empty profile, at least 90% abstention for
generic soft skills, no-fit skills and the goal sets' no-TVET goals. On real profiles: the five most-shown
qualifications take at most 40% of what is shown, no single one more than 15%, and every reportable region is within
0.10 of the overall abstention. Assessors must reach alpha 0.667 before their labels count, with at least 150 profiles
and two raters each.

`scripts/release_check.py` applies the gates only when Docker Compose turns suggestions on. It then needs
`--suggestion-report` and `--suggestion-agreement`: a failed gate or agreement below the minimum blocks; gates that
cannot be measured yet are `suggestion_review_pending`, a warning on routine runs and a blocker for a release.

### Pilot: typed goals against tapped suggestions

The webview says where each goal came from: typed there, or a tapped suggestion. `funnel_daily_stat` counts per day,
by origin, suggestion lists shown and empty, goals started and readiness checks (totals only); feedback answers and
saved sessions keep the origin too. The main finder sends none, so these are the webview's numbers alone. The
recommendation analytics report (`goal_origins`, `suggestions`) compares how often suggestions are taken and how far
each kind of goal gets. Counts are of requests, not learners.

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
