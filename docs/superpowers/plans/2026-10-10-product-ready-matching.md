# Product-Ready Matching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make goal-to-qualification matching product-ready: measure it on every kind of goal learners type, and keep improving the model, its training data and the keyword rules until the gains stop, then adopt the best candidate only if it beats today's adopted model on a sealed test set.

**Architecture:** A scenario taxonomy (below) drives three independent data sets: a large tagged dev set for tuning, a sealed test set written by separate agents and opened once, and synthetic learner-style training queries written without seeing either. The offline harness from the previous plan gains per-scenario metrics, an error report and a sealed mode. Training rounds add synthetic queries, mined hard negatives and hyperparameter changes, each judged on dev at constrained calibration; a plateau rule ends the loop and, if targets are unmet, triggers an e5-base candidate. Product items (typo-tolerant keywords, guidance for non-goal inputs, privacy-safe no-match counts, a metrics-based regression test, a model card) close it out.

**Tech Stack:** Python 3.13; FastAPI/SQLModel/PostgreSQL+pgvector; fastembed 0.8.1 + onnxruntime on CPU (serving); torch 2.11.0+cu128 + sentence-transformers 6.1.0 in `.venv-train` (training, RTX 3050 4 GB); Streamlit 1.65 (frontend); pytest.

**Spec:** No separate spec. Binding: the user's requests of 2026-10-10 — "think of every scenario they might ask and keep fine tuning the model to the fullest as much as possible ... make it product ready"; model choice "Small first, base if it plateaus"; languages "English, Tagalog, Taglish". Plus the previous plan (`docs/superpowers/plans/2026-10-09-fine-tune-matching-model.md`) and its decision record (`docs/ml/2026-10-09-matching-model-evaluation.md`). Rulings made without a spec are provisional.

## Global Constraints

- Data: only TESDA catalog text (`backend/seed/qualifications.json`, `backend/seed/sources/keywords_tl.json`) and goals/queries written by agents from that catalog. Never learner, worker, T2MIS, TSP or CSV/BAK data. No real person's details.
- Languages: English (`en`), Tagalog (`tl`), Taglish (`taglish`) only.
- Serving stays CPU-only through fastembed ONNX; no cloud LLM or external inference at runtime; learner text never leaves the server, is never logged, and is never stored in clear (counts only).
- `backend/requirements.txt` gains no packages (stdlib only for new runtime code). Training packages stay in `backend/training/requirements.txt` / `.venv-train`.
- Model files never enter git. Every retrain uses a new folder and model name (`backend/models/tesda-e5-small-v2`, `-v3`, …); `training.finetune` refuses an existing finished folder.
- Embeddings stay 384-dimensional unless Task 9 (e5-base) is triggered and wins.
- The sealed test set (`backend/training/data/goals_v2/sealed/`) is read only by the agents that write it, the harness in `--final` mode, and the final task. Synthetic-data and dev-goal agents must not read it; training and calibration never use it.
- Calibration always uses `--min-rejection 0.9` on dev (rejection = share of goals with `accept == []` that get no match).
- Files LF; write from Python with `newline="\n"`; check `git ls-files --eol`. Stage explicit paths only; never `git add -A`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests from the repo root: `.venv/Scripts/python -m pytest -q ...`; never two pytest runs at once. Git Bash on Windows; use `MSYS_NO_PATHCONV=1` for docker commands with `/app/...` paths. The network is slow and drops: long jobs must checkpoint; use resumable downloads.

## Scenario Taxonomy (binding for Tasks 2–4)

Every goal carries `lang` and one or more `tags` from this closed set:

| Tag | Meaning | Example | Expected |
|---|---|---|---|
| `job_title` | names a job | "I want to be a welder" | the matching qualifications |
| `task` | describes the work, not the title | "nag-aayos ako ng aircon ng kapitbahay" | matching |
| `indirect` | pop-culture, metaphor, analogy | "I want to become Bob the Builder" | matching |
| `experience` | years/work history, often no NC | "5 taon na akong driver, wala pang NC" | matching |
| `certification` | holds or wants an NC/level | "may NC II na ako sa cookery, gusto ko NC III" | matching level |
| `abroad` | OFW/abroad framing | "gusto kong mag-caregiver sa Canada" | matching |
| `typo` | misspellings, text-speak, no spaces | "gusto q mging weldr", "karpentero" | matching |
| `short` | one to three words | "hilot", "barista" | matching |
| `long` | 40+ words, rambling | life story ending in a goal | matching |
| `multi` | two trades | "welding o kaya electrical" | both (either accepted) |
| `negation` | rules something out | "ayoko magluto, gusto ko mag-ayos ng sasakyan" | the non-negated trade |
| `near_tvet` | degree job with a TVET neighbour | "I want to be a nurse" | the counselor's TVET suggestion (e.g. Health Care Services NC II) |
| `no_tvet` | no TVET path | "gusto kong maging abogado" | `[]` |
| `vague` | no field named | "gusto ko ng stable na trabaho" | `[]` |
| `non_goal` | not a goal: greeting, question about schedules/fees, gibberish, emoji | "magkano ang assessment?", "hello", "asdfgh" | `[]` |

Goal file format (dev and sealed): a JSON list of `{"goal": str, "accept": [qualification names], "lang": "en"|"tl"|"taglish", "tags": [tag, ...], "group": "G1".."G6"|"X"}`. `accept` uses exact `name`s from the seed file; levels as a counselor would (beginners NC I/II). Synthetic file format: `{"<qualification name>": ["query", ...], ...}`.

Sector groups (families = qualification names without the NC level; 262 in all):
- **G1** Construction, Utilities, Furniture and Fixtures, Decorative Crafts (46 families)
- **G2** Agriculture, Forestry and Fishery, Processed Food and Beverages, Chemical/Plastic/Petrochemicals, Pyrotechnics Manufacturing (39)
- **G3** Metals and Engineering, Automotive and Land Transportation, Automotive Manufacturing, Automotive Industry (manufacturing (51)
- **G4** Health, Social and Other Community Development Services, Human Health/Health Care (41)
- **G5** Tourism, Maritime, Transport and Logistics, Wholesale and Retail Trading, Garments, Other, TVET (39)
- **G6** Information and Communication Technology, Electrical and Electronics, HVAC/R, Creative, Media, Visual Arts (46)
- **X** cross-cutting goals not tied to one group (`no_tvet`, `vague`, `non_goal`, `near_tvet`, `multi` across groups, `negation`)

## Targets (product-ready bar, judged on the sealed set)

Top-1 ≥ 0.60, top-3 ≥ 0.80, rejection (all `accept == []` goals) ≥ 0.90, top-1 ≥ 0.50 in each language, and no scenario tag with top-3 below 0.60. These steer the loop; adoption is decided by the rule in Task 10.

## Review Focus

1. ALL-CAPS goals, emoji and stray punctuation ("GUSTO KO MAG WELDER!!! 🔥"): must match like the plain version — Task 2 includes such goals under `typo`; Task 6 tests the keyword path on them.
2. Very long goals beyond the model's 512-token window: must not crash and should still match on the stated goal — Task 2 includes `long` goals; Task 5's harness test runs one 600-word goal end to end.
3. Fuzzy keywords matching ordinary words ("cook"↔"book", "nurse"↔"nurses", "mason"↔"reason"): must not create matches for `no_tvet`/`vague` goals — Task 6 tests a list of near-word pairs and the harness gates rejection.
4. Leakage: a synthetic or dev-goal agent copying sealed goals, or synthetic queries equal to any goal — Task 5's pairs exclude any normalised goal and a test asserts zero overlap with all goal files.
5. Questions about schedules, fees or centres typed into the goal box: must get no match and a pointer to the right page, not a random qualification — Task 7.

---

## File Structure

| Path | Responsibility | Task |
|---|---|---|
| `backend/training/goals.py` | load v1 + v2 goal sets by split (`dev`, `test_v1`, `sealed`), validate the format | 1 |
| `backend/training/evaluate.py` | per-tag/per-language metrics, error report, `--set`, `--final` | 1 |
| `backend/training/data/goals_v2/dev/G1..G6.json, X.json` | tagged dev goals | 2 |
| `backend/training/data/goals_v2/sealed/S1..S3.json` | sealed test goals | 3 |
| `backend/training/data/synthetic/G1..G6.json` | synthetic training queries | 4 |
| `backend/training/pairs.py`, `mine.py`, `finetune.py` | synthetic queries in pairs, hard-negative mining, triplet training | 5 |
| `backend/tesda_track/services/recommendation_service.py`, `utils/helpers.py` | typo-tolerant keyword hits | 6 |
| `frontend/app.py`, `backend/tesda_track/...` (stats model, migration 0005, report) | non-goal guidance, no-match counts | 7 |
| `docs/ml/rounds.md` | round-by-round log | 8 |
| (conditional) migration + config for 768 dims | e5-base | 9 |
| `docs/ml/model-card.md`, `backend/tests/test_semantic.py`, READMEs | final decision, regression test, card | 10 |

---

### Task 1: Harness v2 — goal sets, per-scenario metrics, error report, sealed mode

**Files:** Create `backend/training/goals.py`; modify `backend/training/evaluate.py`, `backend/training/README.md`; test `backend/tests/test_training_goals.py`, `backend/tests/test_training_evaluate.py`.

**Interfaces:**
- Consumes: today's `evaluate.prepare/evaluate/metrics/calibrate` (with `min_rejection`), `training.catalog.load_catalog`, the v1 file `backend/training/data/eval_goals.json` (`split` dev/test, no tags).
- Produces:
  - `training.goals.load(split: str) -> list[dict]` where `split` ∈ {`dev`, `test_v1`, `sealed`}: `dev` = v1 dev goals + every file in `goals_v2/dev/`; `test_v1` = v1 test goals; `sealed` = every file in `goals_v2/sealed/`. Each returned goal has `goal, accept, lang, tags, group, source` (v1 goals get `tags = ["v1"]`, `group = "v1"`). Validation: unknown tag/lang → `ValueError` naming the goal; unknown qualification name → `ValueError`; duplicate normalised goal across all sets → `ValueError` (the sealed set wins: the error names the dev duplicate to delete). Missing directories mean empty sets.
  - `Metrics` gains `by_tag: dict[str, dict]` — for each tag: `n`, `top1`, `top3` (related goals) or `rejection` (goals with `accept == []`).
  - `training.evaluate.errors(results) -> list[dict]` — misses on related goals and false matches on `accept == []` goals: `{goal, lang, tags, accept, shown}`; written to the `--json` file under `"errors"` only for `dev`.
  - CLI: `--set dev|test_v1|sealed` replaces `--split` (keep `--split` working as an alias: dev→dev, test→test_v1, all→dev+test_v1). `--set sealed` requires `--final` and prints a one-line warning that the sealed set must be evaluated once per candidate at the end. `--calibrate` always calibrates on `dev` and then reports the requested set (default `test_v1`).

- [ ] **Step 1: Write failing tests.** In `backend/tests/test_training_goals.py`: loading with a temporary `goals_v2` tree (monkeypatch the module's directory constant) — dev merges v1 dev + v2 files; an unknown tag raises; a duplicate goal between dev and sealed raises naming the dev one; sealed is empty when the directory is missing. In `backend/tests/test_training_evaluate.py`: `metrics` returns `by_tag` with the right counts on a hand-built result list (one `typo` hit, one `typo` miss, one `non_goal` rejected); `errors` lists exactly the miss and a false match; `--set sealed` without `--final` exits non-zero (call `main` with argv, catch `SystemExit`).
- [ ] **Step 2: Run** `.venv/Scripts/python -m pytest -q backend/tests/test_training_goals.py backend/tests/test_training_evaluate.py` — expected FAIL (ModuleNotFoundError `training.goals`).
- [ ] **Step 3: Implement** to the interfaces. Keep the scoring path unchanged (it is the API's).
- [ ] **Step 4: Run** the two test files — PASS; then `cd backend && ../.venv/Scripts/python -m training.evaluate --set test_v1` must print the same numbers as today's `--split test` for the adopted configuration (test top-1 0.475, rejection 0.952, objective 0.672); paste the output in the report. Run the backend suite once.
- [ ] **Step 5: Commit** `goals.py`, `evaluate.py`, `README.md`, both test files.

### Task 2: Tagged dev goals (parallel data agents G1–G6 + X)

**Files:** Create `backend/training/data/goals_v2/dev/<group>.json` (one per agent).

Per sector-group agent (G1–G6): at least 2 goals for every family in the group (≥ 2.5 × families in total), covering all three languages (≥ 30% `tl`, ≥ 25% `taglish`), and each of `job_title`, `task`, `typo` on ≥ 10% of the file, `experience`, `certification`, `abroad`, `short` on ≥ 5% each, `indirect` and `long` on ≥ 3% each; some ALL-CAPS/emoji goals tagged `typo`. Labels: every accepted name must be justified by that qualification's possible_jobs/competencies in the seed file; list every equally correct first suggestion (sibling levels a counselor would accept, sibling trades only when truly equal). The X agent writes ≥ 60 `no_tvet`, ≥ 40 `vague`, ≥ 40 `non_goal`, ≥ 25 `near_tvet` (with accepts), ≥ 25 `multi`, ≥ 25 `negation`, in all three languages. Agents must not read `goals_v2/sealed/`, `synthetic/`, or `training/pairs.py`; they may read the seed catalog, `keywords_tl.json`, the v1 `eval_goals.json` (to avoid duplicates) and this taxonomy.

- [ ] Each agent: write its file with Python (`json.dump(..., ensure_ascii=False, indent=1)`, LF), validate it with `training.goals.load("dev")` once Task 1 has landed (or a local format check before then), self-check 20 labels against the seed, report counts by lang/tag and doubtful labels.
- [ ] Controller: commit each file by explicit path after its review.

### Task 3: Sealed test goals (separate agents S1–S3)

**Files:** Create `backend/training/data/goals_v2/sealed/S1.json` (G1+G2 families), `S2.json` (G3+G4), `S3.json` (G5+G6+X).

Written by agents that never read `goals_v2/dev/`, `synthetic/`, the v1 `eval_goals.json`, or any training code. ~1 goal per family plus, in S3, ≥ 30 `no_tvet`, ≥ 20 `vague`, ≥ 20 `non_goal`, ≥ 12 each of `near_tvet`, `multi`, `negation`; same language and tag mix rules as Task 2 (scaled). Same label rules. After writing, the controller runs the duplicate check (`training.goals.load("dev")` and `load("sealed")` together via Task 1's validation) and removes dev duplicates, never sealed ones.

- [ ] Each agent writes its file, self-checks labels, reports counts. Controller commits after review.

### Task 4: Synthetic training queries (parallel agents G1–G6)

**Files:** Create `backend/training/data/synthetic/<group>.json`.

For every qualification (not family) in the group: 12–20 learner-style queries in all three languages: job titles and everyday names for the job, tasks drawn from the qualification's Core competencies in plain words, experience/certification/abroad phrasings, ~15% typos/text-speak, a few short ones; for NC III/IV, supervisory/advanced phrasings that separate the level from NC II. Do not copy competency titles verbatim more than twice per qualification. Agents must not read any goal file (`eval_goals.json`, `goals_v2/`), so the evaluation stays independent.

- [ ] Each agent writes its file with Python (LF), reports per-qualification counts and language mix. Controller commits after review.

### Task 5: Training v2 — synthetic queries, hard negatives, triplets

**Files:** Modify `backend/training/pairs.py`, `backend/training/finetune.py`, `backend/training/README.md`; create `backend/training/mine.py`; tests `backend/tests/test_training_pairs.py`, `backend/tests/test_training_mine.py`.

**Interfaces:**
- `training.pairs.training_pairs(qualifications, exclude, synthetic: dict[str, list[str]] | None = None)` — adds each synthetic query (as written and lower-cased, deduplicated, excluded like the others) for its qualification; `training.pairs.load_synthetic() -> dict[str, list[str]]` merges `data/synthetic/*.json` and raises on unknown qualification names; `eval_exclusions()` now covers v1 + `goals_v2/dev` + `goals_v2/sealed` (normalised).
- `python -m training.mine --model-path models/<current> --output training/runs/hard-negatives.json [--k 2]` (main env, CPU, fastembed): for every training query, the top-k qualifications by similarity that are not among the query's own qualifications (a query belonging to several qualifications excludes all of them) → `[{"query", "positive_name", "negative_name"}]`.
- `training.finetune ... --hard-negatives training/runs/hard-negatives.json` trains on (anchor, positive, negative) triplets with the same cached MNRL loss (other pairs keep in-batch negatives only); `training.json` records the synthetic count and hard-negative file hash.

- [ ] **Step 1: Failing tests:** synthetic queries appear in pairs for their qualification and are dropped when equal to any dev or sealed goal; `load_synthetic` rejects an unknown name; a leakage test asserts zero overlap between all pair queries and all goal files (normalised); `mine` on a toy embedder never picks a query's own qualification as its negative.
- [ ] **Step 2–4:** RED → implement → GREEN; GPU smoke run with `--hard-negatives` (`--max-steps 6`, then delete the smoke folder).
- [ ] **Step 5: Commit.**

### Task 6: Typo-tolerant keywords

**Files:** Modify `backend/tesda_track/utils/helpers.py`, `backend/tesda_track/services/recommendation_service.py` (and `intent_service.py` if it shares the hit logic); test `backend/tests/test_rules.py`.

- Single-word keywords of ≥ 5 letters also hit when a word of the goal is within one edit (insert/delete/substitute/transpose), or two edits for ≥ 9 letters, of the keyword; multi-word keywords stay exact. Fuzzy hits count like exact hits; the reason says "Matched your words: weldr (welder)". Precompute a deletion index once per catalog snapshot (stdlib only) so the added cost per goal is under 2 ms (measure).
- Tests: "weldr", "karpentero", "CAREGIVR" hit; a list of near-word false pairs does not create matches on no-TVET/vague dev goals ("book" vs "cook", "reason" vs "mason", "nurses" vs "nurse" is fine); ALL-CAPS and emoji goals match like plain ones.
- [ ] TDD; then `cd backend && ../.venv/Scripts/python -m training.evaluate --set dev` before/after — report per-tag changes; rejection must not drop. Commit.

### Task 7: Non-goal guidance and privacy-safe no-match counts

**Files:** `frontend/app.py` (+ test in `frontend/tests/test_ui.py`); backend: a `MatchDailyStat` model (`date`, `requests`, `no_match`) with migration `0005`, increment in the `/analysis/matches` path (counts only — no text, no hash, no learner id), an admin report `GET /api/v1/admin/reports/matching` (date range, totals, no-match rate), tests in `backend/tests/test_reports.py`.

- When a goal gets no match, the finder shows a message by kind: a question about schedules/fees/centres (contains "?", or starts with saan/kailan/magkano/paano/where/when/how much/how do i) → point to Training & assessment; very short or vague → two example goals; otherwise today's message. Pure frontend rules; no learner text stored.
- [ ] TDD both sides; full suite; commit.

### Task 8: Training rounds (controller runs training; subagents analyse)

**Files:** `docs/ml/rounds.md` (round log); new model folders (git-ignored).

Each round: train a new folder (`tesda-e5-small-v2`, `-v3`, …) with `--mini-batch-size 4`, from the reviewed HEAD; evaluate on `dev` with `--calibrate --min-rejection 0.9`; record dev objective, top-1/top-3, rejection, per-language and per-tag numbers, and the 30 largest error clusters from the error report. Round plan:
- **R1:** catalog + synthetic pairs.
- **R2:** R1 data + hard negatives mined with the R1 model.
- **R3:** best of R1/R2 with one hyperparameter change chosen from the R1/R2 curves (epochs 2 or 4, or lr 1e-5/3e-5).
- **R4+:** targeted synthetic additions for the error clusters (written by an agent that sees only the dev error report and the catalog — never sealed), then retrain.
Plateau rule: stop when two consecutive rounds each improve the dev objective by < 0.01. If the targets look unreachable on dev at that point (dev top-1 < 0.65 or dev top-3 < 0.85), Task 9 runs; otherwise skip it.

- [ ] Log every round in `docs/ml/rounds.md` (aggregates only) and commit the log after each round.

### Task 8a: Colab training path (added 2026-10-10)

Windows Smart App Control (On) blocks PyTorch's DLLs on the dev laptop (WinError 4551), so training moves to Google Colab (user's choice); serving, evaluation, calibration and mining stay local (onnxruntime is unaffected).

**Files:** Create `backend/training/bundle.py`, `backend/training/colab/train_colab.ipynb`; modify `backend/training/pairs.py` (exclusions from hashes), `backend/training/README.md`; tests `backend/tests/test_training_bundle.py`.

- `python -m training.bundle --output training/runs/colab-bundle.zip [--hard-negatives training/runs/<file>.json]` (main env) packs exactly what training needs: `backend/tesda_track/` (no `__pycache__`), `backend/seed/qualifications.json`, `backend/training/*.py`, `backend/training/data/synthetic/*.json`, `backend/training/requirements.txt`, the optional hard-negative file, and `exclusions.json` = sorted sha256 hex digests of `normalize(goal)` for every v1, dev and sealed goal. No goal files, no `.env`, no models. Prints the zip size.
- `training.pairs.eval_exclusions()` uses `data/exclusions.json` (hashes) when the goal files are absent, and drops a query when `sha256(normalize(query))` is in it; locally it keeps reading the goal files. Tests: the bundle contains no file under `data/goals_v2/` or `eval_goals.json`; every goal's hash is in `exclusions.json`; pairs built from the hashes equal pairs built from the goal files.
- Notebook (Colab, T4): check the GPU; upload the bundle (`google.colab.files.upload`) or read it from Drive; unzip; `pip install` the pinned training requirements that Colab lacks (keep Colab's preinstalled CUDA torch; pin sentence-transformers 6.1.0, transformers 5.19.0, fastembed 0.8.1, onnx, and backend/requirements.txt minus psycopg extras if they fail); set dummy `DATABASE_URL`/`SECRET_KEY` env vars for `tesda_track.config`; a parameter cell (`ROUND = "v2"`, `EPOCHS = 3`, `LR = 2e-5`, `HARD_NEGATIVES = True/False`, `MINI_BATCH = 16`); run `python -m training.finetune --output models/tesda-e5-small-<ROUND> ...` with checkpoints written to Drive when mounted (so a Colab disconnect can `--resume`); zip only the serving files (`onnx/`, tokenizer/config files, `training.json`; never `model.safetensors`, `checkpoints/`) and download it. Markdown cells explain each step for a non-ML user.
- Locally after download: unzip into `backend/models/tesda-e5-small-<ROUND>/`, then `training.evaluate --model tesda-track/tesda-e5-small-<ROUND> --model-path models/tesda-e5-small-<ROUND> --set dev --calibrate --min-rejection 0.9`.

### Task 9 (conditional): e5-base candidate

Runs only if Task 8 ends at a plateau below the dev targets. Download `intfloat/multilingual-e5-base` (resumable), train with the best R-config, evaluate the same way. If it beats the best small model on dev objective by > 0.02, write a sub-plan for the 768-dimension migration (embedding columns, config, Docker) before implementing it; otherwise record the result and stop.

### Task 10: Final decision, regression test, model card

**Files:** `docs/ml/model-card.md`, `docs/ml/2026-10-10-product-ready-evaluation.md`, `backend/tests/test_semantic.py`, `README.md`, `backend/training/README.md`, `.env` (local only), `backend/models/<winner>/calibration.json`.

- [ ] **Step 1:** Choose the candidate on dev only (best constrained-calibrated dev objective). Then, once, run `--set sealed --final` for (a) today's adopted model `tesda-track/tesda-e5-small-v1` with its calibration and (b) the candidate with its dev calibration.
- [ ] **Step 2: Adopt** the candidate iff its sealed objective > (a)'s + 0.02, sealed rejection ≥ 0.9, and no language's sealed top-1 is more than 0.03 below (a)'s. Otherwise keep (a). Record the numbers against the Targets.
- [ ] **Step 3:** Replace the opt-in real-model test's 13 exact goals with: dev metrics thresholds for the adopted configuration (0.02 below its measured dev numbers) plus a short "golden" list that must always match (welder, karpintero, caregiver abroad, Bob the Builder, call center, solar panels, a Taglish aircon goal) and must always reject (astronaut, abogado, "magkano ang assessment?").
- [ ] **Step 4:** Model card (data sources, languages, metrics by language and tag on sealed, known limitations and failure scenarios, retraining runbook, rollback) and the evaluation doc.
- [ ] **Step 5:** If adopting: `calibration.json`, local `.env`, `embeddings sync`, check the running API; full suite; commit tracked files.
