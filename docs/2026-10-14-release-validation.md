# Release validation — 2026-10-14

**Decision: do not promote to production yet.** Operational checks pass in the tested scope; structured free-text relevance and real service evidence remain incomplete. Nothing was deployed.

## Measured outcomes

| Check | Result | Scope |
| --- | --- | --- |
| Clean final regression | 806 passed, one skipped, zero failures | 807 tests across backend and both portals |
| Follow-up after fixing the helper and release-counting logic | 13 passed | All changed evaluator/gate checks; the original full-run failure remains visible in the machine report |
| Structured qualification relevance | 14/18 positive top results relevant (77.8%) | 24 synthetic engineering cases, grades pending expert review |
| Negative qualification cases | 6/6 correctly abstained | Astronaut/lawyer/politician and missing-input cases |
| Qualification ranking quality | nDCG@3 0.678, MRR@3 0.778 | Unjudged results explicitly counted; none in this run |
| Qualification latency | Warm p50 240.1 ms, p95 455.1 ms | 120 sequential repetitions; 319-qualification committed catalog; excludes HTTP/DB/load time |
| Service constraints | Zero violations; zero unstable cases | Nine actual API scenarios using independent checks and isolated synthetic source evidence |
| Service relevance | nDCG@3 and MRR@3 1.0 | Narrow synthetic logistics scenarios, not general recommendation accuracy |
| Service latency | Warm p50 72.6 ms, p95 83.0 ms | 27 sequential in-process HTTP-adapter repetitions with real PostgreSQL |
| Scaling | 253 eligible candidates; 321–357 ms | Page sizes 5/50 and offset 100, after evaluating all candidate batches |
| Schema | Drift check passed; `0006` → `0007` legacy preservation passed | Fresh test schema and existing development schema; no live schema modification |
| Dependencies/format | `pip check`, syntax and whitespace checks passed | Installed pinned runtime |
| Optional model | Existing 13-goal guard passed | Cached configured `tesda-e5-small-v2`; no download or training |
| Docker | Backend and web images built; isolated health/API smoke passed | Separate `:release-check` images, model disabled, disposable DB, ephemeral ports |
| Model in Docker | Existing ONNX model loaded and inferred successfully | Network disabled; validates container path/loading, not additional matching quality |

The initial full run had 803 passes, one skip and an evaluator-only variable-shadowing failure. That error was fixed and retested. A reporting bug could also confuse a positive test count with a gate's boolean result; this was fixed and covered by a regression test. A clean final full run then passed all 806 executed tests. The original failure, successful targeted follow-up and clean final result are preserved separately.

## Changes verified

- Added versioned qualification cases, graded relevance metrics, independent service-evidence/constraint checks, repeatability measurements, and candidate-scaling checks.
- Shared the production structured matcher with offline evaluation so reported relevance comes from the actual policy.
- Added a release runner and GitHub workflow with sanitized JSON artifacts and explicit failed gates.
- Passed scoring weights, proximity radius and semantic-search settings through Docker Compose.
- Added a Docker-specific model-path setting; local `.env` now keeps `backend/models/tesda-e5-small-v2` for the host and `/app/finetuned/tesda-e5-small-v2` for Docker. Credentials were preserved.
- Verified model-disabled builds avoid model warmup/download, while the copied local model can still load offline.
- Expired training fit caches after 60 seconds to recheck eligibility. Existing theme work was preserved.

## Remaining release blockers

1. **Structured free-text coverage:** elderly care, solar-panel installation, call-center work and bread/cake-making returned no structured matches. The measured 77.8% top-one relevance falls below the provisional 80% floor. Improve supported interpretation without weakening authoritative constraints, then evaluate on separately reviewed cases.
2. **Expert relevance review:** current grades are engineering expectations. Obtain verified review provenance and a representative held-out set before making general accuracy claims.
3. **Live source evidence:** the read-only inventory found 173 active training listings and 101 upcoming assessment schedules, with zero currently verified services and zero confirmed availability records. Actual authority/prerequisite and intake evidence must be reviewed before confirmed service recommendations can appear.

Latency measurements are local and sequential. Concurrent production load, rendered browser/map JavaScript behavior and disaster-recovery rehearsal were not established by these checks. This report makes no occupational-matching, enrollment or exam-success guarantee.

## Artifacts

Local generated artifacts are ignored by Git:

- `reports/final/release-check.json` — clean final run.
- `reports/release-check.json` — original run and follow-up evidence, retained for traceability.
- `reports/final/qualification-evaluation.json` — final per-case qualification results, hashes, weights and language metrics.
- `reports/final/service-evaluation.json` — final API safety/scaling results.
- `reports/live-service-inventory.json` — aggregate evidence coverage, without contact or learner data.
- `reports/final/regression.xml`, `reports/final/model.xml`, `reports/evaluation-follow-up.xml` — local test diagnostics.

The evidence and code are ready for review. Production readiness remains false until the relevant release gates are met.
