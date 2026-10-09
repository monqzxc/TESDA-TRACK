# Fine-Tune and Calibrate the Matching Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure how well TESDA-TRACK matches learner goals to qualifications, fine-tune the local embedding model on TESDA catalog text, calibrate the hybrid score for it, and adopt it only if it beats today's model on held-out goals.

**Architecture:** A labelled set of hand-written learner goals (English, Filipino, Taglish, and goals with no TVET equivalent) is split into dev and test halves. An offline harness rebuilds the catalog from `backend/seed/qualifications.json` in memory, embeds it with any model, and runs the same pure scoring function the API uses, so a grid search over the score parameters runs in seconds. A dev-only training environment fine-tunes `intfloat/multilingual-e5-small` on (query, qualification-text) pairs built from the catalog, exports ONNX, and the API serves it through fastembed from a local folder that also carries its calibrated parameters.

**Tech Stack:** Python 3.13, FastAPI/SQLModel/PostgreSQL+pgvector (existing), fastembed 0.8.1 + onnxruntime (runtime, CPU), sentence-transformers + PyTorch CUDA + optimum (training only, RTX 3050 4 GB), numpy, pytest.

**Spec:** No separate spec document. The binding requirements are the user's decisions in this session (2026-10-09): "Fine-tune + calibrate (Recommended): fine-tune multilingual-e5-small on catalog-derived pairs on the RTX 3050, export it to ONNX for fastembed, re-tune the score thresholds, and adopt it only if it beats today's model on held-out goals. Needs a separate ~3 GB training env (torch, sentence-transformers); the ~470 MB model stays out of git and is copied into the Docker image." Plus the project rules in Global Constraints. Rulings made without a spec are provisional.

## Global Constraints

- Training and evaluation use only TESDA catalog text (`backend/seed/qualifications.json`, `backend/seed/sources/keywords_tl.json`) and hand-written example goals. Never learner, worker, T2MIS or TSP rows; never the CSV/BAK files in the repo root.
- No cloud LLM or external inference API. Learner text never leaves the server. Production inference stays CPU-only through fastembed's ONNX runtime.
- `backend/requirements.txt` gains no new packages. torch, sentence-transformers, optimum, datasets and accelerate go only in `backend/training/requirements.txt` and a separate virtual environment `.venv-train/` at the repository root (git-ignored).
- Model files never enter git. The fine-tuned model lives in `backend/models/<name>/` (git-ignored except `backend/models/README.md`).
- The default runtime model stays `intfloat/multilingual-e5-small` until Task 7 decides, from test-split numbers, to adopt the fine-tuned model.
- Embeddings stay 384-dimensional (`EMBEDDING_DIMENSIONS = 384` in `backend/tesda_track/models/semantic.py`); no migration.
- Files use LF line endings. On Windows, write files from Python with `Path.write_text(..., encoding="utf-8", newline="\n")`; if you use an editor tool, convert CRLF back to LF before committing (`git ls-files --eol <file>` must show `w/lf`).
- Stage explicit paths only (`git add <paths>`), never `git add -A` or `git add .`; other sessions may share this checkout. Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run tests from the repository root with `.venv/Scripts/python -m pytest ...` (Git Bash) — the test database `tesda_track_test` is rebuilt every run, so never run two pytest processes at once.
- Match the surrounding code: short docstrings that say why, sparse comments, lines up to about 120 characters, plain names.

## Review Focus

1. A configured fine-tuned model folder that is missing or broken at API start-up: the API must keep serving with keyword matching only and log one error (`get_embedder` already falls back; Task 6 adds a test that a missing `EMBEDDING_MODEL_PATH` yields `None` from `get_embedder` without raising).
2. Switching models without re-syncing embeddings: `qualification_similarities` filters by model name, so a switch before `python -m tesda_track.embeddings sync` yields no semantic signal. Expected: matching still returns keyword results without errors (Task 6 test), and the README's deploy steps run `sync` after a model change (Task 6).
3. Filipino and Taglish goals must not get worse after fine-tuning: the harness reports metrics per language, and Task 7 refuses adoption if any language's test-split top-1 drops by more than 0.05.
4. Goals with no TVET equivalent (astronaut, lawyer, police officer) must still get no matches: the harness reports the rejection rate and Task 7 refuses adoption if test-split rejection is below 0.8.
5. A `calibration.json` with invalid values (ceiling not above floor, weight outside 0..1): loading must ignore it, log a warning and use the settings' values (Task 6 test).

---

## File Structure

| Path | Responsibility | Task |
|---|---|---|
| `backend/tesda_track/services/analysis.py` | `MatchParams`, pure `score_matches(...)`; `match()`/`analyze_goal()` use them | 2 |
| `backend/tesda_track/services/catalog.py` | `catalog_item(q)` builds one `CatalogItem` (used by `snapshot`) | 2 |
| `backend/training/__init__.py` | makes `training` importable (tests run with `pythonpath = backend frontend`) | 3 |
| `backend/training/data/eval_goals.json` | labelled goals with dev/test split | 3 |
| `backend/training/catalog.py` | in-memory catalog from the seed JSON: transient ORM objects + `CatalogItem`s | 4 |
| `backend/training/evaluate.py` | metrics, offline evaluation, grid-search calibration, CLI | 4 |
| `backend/training/pairs.py` | (query, passage) training pairs from the catalog | 5 |
| `backend/training/finetune.py` | fine-tune + ONNX export + parity check (training env only) | 5 |
| `backend/training/requirements.txt`, `backend/training/README.md` | training environment and how to retrain | 5 |
| `backend/tesda_track/config.py`, `services/embeddings.py`, `embeddings.py` | `embedding_model_path`, loading a local ONNX model, `calibration.json` | 6 |
| `backend/models/README.md`, `.gitignore`, `backend/Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md` | shipping the fine-tuned model | 6 |
| `docs/ml/2026-10-09-matching-model-evaluation.md` | before/after report | 7 |
| `backend/tests/test_training_*.py`, `backend/tests/test_semantic.py`, `backend/tests/test_analysis_api.py` | tests | 2–7 |

---

### Task 1: Make the frontend test suite green

Nine frontend tests already fail on a clean checkout of HEAD (verified 2026-10-09 in a fresh worktree). They are unrelated to the matching model but block a clean signal for every later task.

**Files:**
- Modify: whichever of `frontend/app.py`, `frontend/portal_app.py`, `frontend/app_pages/*.py`, `frontend/skills_bridge_view.py`, `frontend/tests/test_portal.py`, `frontend/tests/test_skills_bridge_ui.py` the diagnosis points to.

Failing tests:
```
frontend/tests/test_portal.py::test_reports_page_is_registered_only_for_administrators
frontend/tests/test_portal.py::test_learner_pages_have_no_sign_in_form[skills_bridge]
frontend/tests/test_portal.py::test_report_date_range_is_checked_before_asking_the_api
frontend/tests/test_skills_bridge_ui.py::test_delivery_map_contract_sorts_and_deduplicates_sites
frontend/tests/test_skills_bridge_ui.py::test_natural_language_search_sends_meaningful_terms
frontend/tests/test_skills_bridge_ui.py::test_matches_details_gap_review_and_tab_switch_preserve_state
frontend/tests/test_skills_bridge_ui.py::test_new_lookup_clears_previous_results_when_service_fails_and_can_retry
frontend/tests/test_skills_bridge_ui.py::test_empty_matches_and_partial_details_remain_usable
frontend/tests/test_skills_bridge_ui.py::test_bridge_available_without_local_catalog
```

Context: `frontend/app.py` is the live app (`streamlit run app.py`), redesigned with a left sidebar; `frontend/portal_app.py` + `app_pages/` is an older top-navigation portal. Commit 2c0fba2 fixed a similar failure in `test_ui.py`: a test set `app.session_state["main_tabs"]` and clicked a button before re-running, which the sidebar navigation no longer supports, and a button keyed `follow_<id>` crashed because `main()` re-assigns every `follow_*` key (button state can't be assigned).

- [ ] **Step 1: Reproduce.** Run `.venv/Scripts/python -m pytest -q frontend/tests/test_portal.py frontend/tests/test_skills_bridge_ui.py` and read each traceback.
- [ ] **Step 2: Diagnose each failure** with superpowers:systematic-debugging: decide per test whether the app is wrong (a real learner would hit the error) or the test encodes behaviour the redesign deliberately changed. Fix the app when a learner would hit the bug; fix the test only when the redesign changed the intended behaviour, and say which in the commit message.
- [ ] **Step 3: Run the whole frontend suite:** `.venv/Scripts/python -m pytest -q frontend/tests` — expected: all pass.
- [ ] **Step 4: Run the backend suite** to confirm nothing else moved: `.venv/Scripts/python -m pytest -q backend/tests` — expected: all pass, 1 skipped.
- [ ] **Step 5: Commit** the changed files by explicit path, message explaining each root cause.

---

### Task 2: Pure match scoring with explicit parameters

Behaviour must not change; the point is that the evaluation harness (Task 4) can call the exact scoring code the API uses, with any parameters, without a database.

**Files:**
- Modify: `backend/tesda_track/services/analysis.py`
- Modify: `backend/tesda_track/services/catalog.py`
- Test: `backend/tests/test_semantic.py`

**Interfaces:**
- Produces (in `tesda_track.services.analysis`):
  - `@dataclass(frozen=True) class MatchParams: z_floor: float; z_ceiling: float; keyword_weight: float; min_score: int` with `@classmethod from_settings(cls, settings) -> MatchParams` reading `semantic_z_floor`, `semantic_z_ceiling`, `match_weight_keyword`, `match_min_score`.
  - `def strengths(similarities: dict[int, float], params: MatchParams) -> dict[int, float]` — z-scores mapped onto the band (today's `_semantic_strengths` body minus the database call).
  - `def score_matches(items: Sequence[CatalogItem], keyword: dict[str, dict], similarities: dict[int, float], params: MatchParams, limit: int = 3) -> list[Match]` — `keyword` maps qualification code → the result dict from `score_qualifications` (`{"qualification", "score", "reason"}`).
- Produces (in `tesda_track.services.catalog`): `def catalog_item(qualification: Qualification) -> CatalogItem` (the constructor body currently inline in `snapshot`).

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_semantic.py` (append):

```python
def _item(id, code):
    from tesda_track.schemas.catalog import QualificationPublic, QualificationSummary
    from tesda_track.services.catalog import CatalogItem

    summary = QualificationSummary(code=code, name=code.title(), sector="Sector")
    return CatalogItem(id=id, code=code, sector="Sector", possible_jobs=("Job",), rules={}, summary=summary,
                       public=QualificationPublic(**summary.model_dump(), possible_jobs=["Job"], competencies=[]))


def test_score_matches_blends_keyword_evidence_and_semantic_strength():
    from tesda_track.services.analysis import MatchParams, score_matches

    items = [_item(1, "A"), _item(2, "B"), _item(3, "C"), _item(4, "D")]
    keyword = {"B": {"score": 95, "reason": "Matched your words: b"}}
    similarities = {1: 0.9, 2: 0.5, 3: 0.5, 4: 0.5}  # z-scores 1.732 for A, -0.577 for the rest
    params = MatchParams(z_floor=0.0, z_ceiling=1.0, keyword_weight=0.5, min_score=20)
    matches = score_matches(items, keyword, similarities, params)
    assert [(m.qualification.code, m.score) for m in matches] == [("A", 50), ("B", 50)]
    assert matches[1].reason == "Matched your words: b" and matches[0].reason == "Similar in meaning to your goal."
    assert (matches[0].components.keyword, matches[0].components.semantic) == (0, 1.0)


def test_score_matches_drops_weak_matches_and_keeps_the_best_three():
    from tesda_track.services.analysis import MatchParams, score_matches

    items = [_item(i, f"Q{i}") for i in range(1, 6)]
    keyword = {f"Q{i}": {"score": 55 + 10 * i, "reason": "r"} for i in range(1, 6)}
    params = MatchParams(z_floor=3.0, z_ceiling=5.0, keyword_weight=0.5, min_score=35)
    codes = [m.qualification.code for m in score_matches(items, keyword, {}, params)]
    assert codes == ["Q5", "Q4", "Q3"], "Q1 scores 34, under the minimum"


def test_match_params_come_from_settings():
    from tesda_track.config import get_settings
    from tesda_track.services.analysis import MatchParams

    assert MatchParams.from_settings(get_settings()) == MatchParams(3.0, 5.0, 0.5, 20)
```

Arithmetic for the second test: with `keyword_weight=0.5` and no similarities, score = round(100 × 0.5 × kw / 95), so the keyword scores 65, 75, 85, 95, 105 give 34, 39, 45, 50, 55. Sorting is by score descending; ties keep catalog order (first test: A before B).

- [ ] **Step 2: Run** `.venv/Scripts/python -m pytest -q backend/tests/test_semantic.py -k "score_matches or match_params"` — expected: FAIL (ImportError: cannot import name 'MatchParams').

- [ ] **Step 3: Implement.** In `analysis.py` add `MatchParams`, `strengths`, `score_matches`; rewrite `_semantic_strengths(session, embedder, query, params)` as `strengths(embeddings.qualification_similarities(session, embedder, query), params)`; in `analyze_goal` and `match` build `params = MatchParams.from_settings(get_settings())` once and use `params.min_score`/`params.keyword_weight` instead of `settings.*`; the semantic branch of `match` becomes:

```python
    similarities = embeddings.qualification_similarities(session, embedder, query)
    return refined, score_matches(current.items, keyword, similarities, params)
```

and `score_matches` holds today's loop:

```python
def score_matches(items: Sequence[CatalogItem], keyword: dict[str, dict], similarities: dict[int, float],
                  params: MatchParams, limit: int = 3) -> list[Match]:
    """The hybrid score for every qualification, strongest first; the API and the offline evaluation share it."""
    semantic_by_id = strengths(similarities, params)
    matches = []
    for item in items:
        evidence = keyword.get(item.code)
        keyword_score = evidence["score"] if evidence else 0
        semantic = semantic_by_id.get(item.id, 0.0)
        score = hybrid_score(keyword_score, semantic, params.keyword_weight)
        if score >= params.min_score:
            matches.append(Match(qualification=item.summary, score=score,
                                 reason=evidence["reason"] if evidence else SEMANTIC_REASON,
                                 components=MatchComponents(keyword=round(keyword_score / KEYWORD_SCALE, 3),
                                                            semantic=round(semantic, 3))))
    matches.sort(key=lambda m: m.score, reverse=True)
    return matches[:limit]
```

In `catalog.py` move the `CatalogItem(...)` construction from `snapshot` into `catalog_item(qualification)` and call it from `snapshot`.

- [ ] **Step 4: Run** `.venv/Scripts/python -m pytest -q backend/tests` — expected: all pass, 1 skipped. Then the real-model guard: `TESDA_MODEL_TESTS=1 .venv/Scripts/python -m pytest -q backend/tests/test_semantic.py -k real_model` — expected: PASS (behaviour unchanged).
- [ ] **Step 5: Commit** `analysis.py`, `catalog.py`, `test_semantic.py`.

---

### Task 3: Labelled evaluation goals

**Files:**
- Create: `backend/training/__init__.py` (one-line docstring: `"""Offline evaluation and fine-tuning of the matching model. Not part of the API image's runtime."""`)
- Create: `backend/training/data/eval_goals.json`
- Test: `backend/tests/test_training_eval_goals.py`

**Interfaces:**
- Produces: `eval_goals.json`, a JSON list of objects `{"goal": str, "accept": [str, ...], "lang": "en" | "tl" | "taglish", "split": "dev" | "test"}`. `accept` holds exact qualification `name`s from `backend/seed/qualifications.json` that a TESDA guidance counselor would accept as the first suggestion; an empty `accept` means the goal has no TVET equivalent and the right answer is "no match".

Content requirements:
- At least 120 related goals and at least 30 no-TVET goals.
- Related goals span at least 15 sectors of the catalog; no single qualification is the first `accept` of more than 4 goals.
- Languages among related goals: at least 30 `tl`, at least 25 `taglish`, the rest `en`. No-TVET goals: at least 8 `tl`/`taglish`.
- Write goals the way learners talk: first person, everyday words, often naming tasks rather than job titles ("nag-aayos ako ng aircon ng kapitbahay"), some mentioning years of experience or certificates, some vague. Avoid copying catalog keywords or job titles verbatim into most goals — at most a third may contain a qualification's exact job title.
- `accept` lists every qualification that would be a correct first suggestion (e.g. both "Caregiving (Elderly) NC II" and "Caregiving NC II" for elderly care); keep it tight — not every loosely related one.
- Include, in the `dev` split, the 13 goals from `RELATED_GOALS` and `NO_TVET_MATCH` in `backend/tests/test_semantic.py` with their current expected answers (the current z-band was calibrated on them).
- Split: assign `dev`/`test` so each half has about half of each language and of the no-TVET goals (deterministic: hand-assigned, not random at load time).
- No real person's data; invent nothing that looks like a real person's record.

- [ ] **Step 1: Write the failing test** `backend/tests/test_training_eval_goals.py`:

```python
"""The labelled goals the matching model is evaluated and calibrated on."""
import json
from collections import Counter
from pathlib import Path

from tesda_track.seed import SEED_DIR
from tesda_track.utils.helpers import normalize

GOALS_FILE = Path(__file__).resolve().parents[1] / "training" / "data" / "eval_goals.json"


def load():
    return json.loads(GOALS_FILE.read_text(encoding="utf-8"))


def test_every_goal_is_well_formed_and_names_real_qualifications():
    names = {q["name"] for q in json.loads((SEED_DIR / "qualifications.json").read_text(encoding="utf-8"))}
    goals = load()
    for goal in goals:
        assert set(goal) == {"goal", "accept", "lang", "split"}, goal
        assert goal["lang"] in {"en", "tl", "taglish"} and goal["split"] in {"dev", "test"}, goal
        assert set(goal["accept"]) <= names, goal
    assert len({normalize(g["goal"]) for g in goals}) == len(goals), "goals are unique"


def test_the_set_is_big_and_varied_enough():
    goals = load()
    related = [g for g in goals if g["accept"]]
    unrelated = [g for g in goals if not g["accept"]]
    assert len(related) >= 120 and len(unrelated) >= 30
    languages = Counter(g["lang"] for g in related)
    assert languages["tl"] >= 30 and languages["taglish"] >= 25
    assert sum(g["lang"] != "en" for g in unrelated) >= 8
    assert max(Counter(g["accept"][0] for g in related).values()) <= 4


def test_dev_and_test_halves_are_balanced():
    goals = load()
    for kind in (lambda g: bool(g["accept"]), lambda g: not g["accept"]):
        chosen = [g for g in goals if kind(g)]
        dev = sum(g["split"] == "dev" for g in chosen)
        assert abs(dev - len(chosen) / 2) <= max(2, len(chosen) * 0.1)


def test_the_unit_test_goals_are_in_the_dev_half():
    import importlib.util

    spec = importlib.util.spec_from_file_location("semantic_goals", Path(__file__).with_name("test_semantic.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    by_goal = {g["goal"]: g for g in load()}
    for goal, name in module.RELATED_GOALS.items():
        assert by_goal[goal]["split"] == "dev" and name in by_goal[goal]["accept"]
    for goal in module.NO_TVET_MATCH:
        assert by_goal[goal]["split"] == "dev" and by_goal[goal]["accept"] == []
```

- [ ] **Step 2: Run** `.venv/Scripts/python -m pytest -q backend/tests/test_training_eval_goals.py` — expected: FAIL (file not found).
- [ ] **Step 3: Write the data.** Read the catalog (`backend/seed/qualifications.json`: names, sectors, possible_jobs) and `backend/seed/sources/keywords_tl.json`, then write `eval_goals.json` by hand to the requirements above (indent 1, `ensure_ascii=False`, trailing newline).
- [ ] **Step 4: Run** the test file — expected: PASS.
- [ ] **Step 5: Commit** `backend/training/__init__.py`, `backend/training/data/eval_goals.json`, `backend/tests/test_training_eval_goals.py`.

---

### Task 4: Offline evaluation and calibration harness

**Files:**
- Create: `backend/training/catalog.py`
- Create: `backend/training/evaluate.py`
- Modify: `.gitignore` (add `backend/training/runs/`, where `--json` outputs go by convention)
- Test: `backend/tests/test_training_evaluate.py`

**Interfaces:**
- Consumes: `MatchParams`, `score_matches` (Task 2, `tesda_track.services.analysis`); `catalog_item` (Task 2); `score_qualifications` (`tesda_track.services.recommendation_service`); `qualification_text` (`tesda_track.services.embeddings`); `parse_catalog` (`tesda_track.seed`); the goal format of Task 3.
- Produces:
  - `training.catalog.load_catalog(path: Path = SEED_DIR / "qualifications.json") -> tuple[list[Qualification], list[CatalogItem]]` — transient (never added to a session) `Qualification` objects with `id` 1..N in file order, their `Sector` and active `Competency` objects, and `catalog_item(q)` for each.
  - `training.evaluate.GoalResult` dataclass: `goal: dict`, `shown: list[str]` (names, best first).
  - `training.evaluate.Metrics` dataclass: `top1: float, top3: float, mrr: float, rejection: float, objective: float, by_lang: dict[str, float]` (top-1 per language over related goals); `objective = 0.4 * top1 + 0.2 * top3 + 0.4 * rejection`.
  - `training.evaluate.metrics(results: list[GoalResult]) -> Metrics`.
  - `training.evaluate.Prepared` dataclass holding, per goal, the keyword results and similarities (they don't depend on the score parameters).
  - `training.evaluate.prepare(goals: list[dict], items: list[CatalogItem], passages: list[list[float]], embed_queries: Callable[[list[str]], list[list[float]]]) -> list[Prepared]` — cosine similarity with numpy over L2-normalised vectors (equivalent to pgvector's `1 - cosine_distance`).
  - `training.evaluate.evaluate(prepared: list[Prepared], items, params: MatchParams) -> list[GoalResult]`.
  - `training.evaluate.calibrate(prepared, items, grid: dict[str, list]) -> tuple[MatchParams, Metrics]` — best `objective` on the given goals; ties go to the parameters listed first in grid order.
  - `DEFAULT_GRID = {"z_floor": [1.5, 2.0, 2.5, 3.0, 3.5, 4.0], "z_span": [1.0, 1.5, 2.0, 3.0], "keyword_weight": [0.3, 0.4, 0.5, 0.6, 0.7], "min_score": [15, 20, 25, 30, 35]}` (`z_ceiling = z_floor + z_span`).
  - CLI: `python -m training.evaluate [--model NAME] [--model-path DIR] [--split dev|test|all] [--calibrate] [--params FLOOR CEILING WEIGHT MIN] [--json OUT]`, run from `backend/`. Prints a table: overall top-1/top-3/MRR/rejection/objective and top-1 per language, for the chosen split; with `--calibrate` it calibrates on `dev` and then prints dev and test metrics for the best parameters. `--json` writes the same numbers plus the parameters to a file. It embeds passages with `E5Embedder(model, cache_dir, model_path)` from Task 6 when `--model-path` is given; until Task 6 exists, `--model-path` raises `SystemExit("needs Task 6")` — Task 6 removes that guard.

Keyword evidence must be computed exactly as the API does with semantic search on: `score_qualifications(goal, {}, [item.rules for item in items])`, keyed by `result["qualification"]["code"]`. Passages are `embed_passages([qualification_text(q) for q in qualifications])` once per model; queries are `embed_queries(goals)` in one batch.

- [ ] **Step 1: Write the failing tests** `backend/tests/test_training_evaluate.py`:

```python
"""Offline evaluation: the API's scoring on an in-memory catalog, plus the metrics and calibration."""
import pytest

from tesda_track.services.analysis import MatchParams
from training import evaluate
from training.catalog import load_catalog


def test_catalog_loads_from_the_seed_without_a_database():
    qualifications, items = load_catalog()
    assert len(items) == len(qualifications) >= 300
    assert [item.id for item in items[:3]] == [1, 2, 3]
    assert items[0].rules["career_keywords"] and qualifications[0].sector.name == items[0].sector


def result(accept, shown, lang="en"):
    return evaluate.GoalResult(goal={"goal": "g", "accept": accept, "lang": lang, "split": "dev"}, shown=shown)


def test_metrics_reward_right_answers_and_empty_results_for_unrelated_goals():
    m = evaluate.metrics([
        result(["A"], ["A", "B"]),            # top-1 hit
        result(["B"], ["A", "B", "C"]),       # top-3 hit at rank 2
        result(["Z"], ["A"], lang="tl"),      # miss
        result([], []),                       # unrelated, rejected
        result([], ["A"]),                    # unrelated, wrongly matched
    ])
    assert (m.top1, m.top3, m.mrr, m.rejection) == pytest.approx((1 / 3, 2 / 3, 0.5, 0.5))
    assert m.objective == pytest.approx(0.4 / 3 + 0.2 * 2 / 3 + 0.2)
    assert m.by_lang == pytest.approx({"en": 0.5, "tl": 0.0})


class Bag:
    """Same idea as the backend tests' WordEmbedder: shared words make texts similar. A text with none of the
    words points along its own axis, so it resembles only the many catalog names that share none either."""
    def __init__(self, vocabulary):
        self.vocabulary = vocabulary

    def __call__(self, texts):
        vectors = []
        for text in texts:
            counts = [float(word in text.lower()) for word in self.vocabulary]
            vectors.append(counts + [0.0 if any(counts) else 1.0])
        return vectors


def test_evaluation_and_calibration_run_the_api_scoring_offline():
    qualifications, items = load_catalog()
    mmaw = next(i for i, q in enumerate(qualifications) if q.name == "Manual Metal Arc Welding (MMAW) NC II")
    bag = Bag(["weld", "metal", "arc"])
    passages = bag([q.name for q in qualifications])
    goals = [{"goal": "I want to weld metal", "accept": [qualifications[mmaw].name], "lang": "en", "split": "dev"},
             {"goal": "I want to be an astronaut", "accept": [], "lang": "en", "split": "dev"}]
    prepared = evaluate.prepare(goals, items, passages, bag)
    results = evaluate.evaluate(prepared, items, MatchParams(3.0, 5.0, 0.5, 20))
    assert results[1].shown == []
    params, best = evaluate.calibrate(prepared, items, {"z_floor": [1.0, 3.0], "z_span": [1.0],
                                                        "keyword_weight": [0.5], "min_score": [20]})
    assert best.rejection == 1.0 and isinstance(params, MatchParams)
    assert results[0].shown and "Welding" in results[0].shown[0]
```

(The real catalog names SMAW "Manual Metal Arc Welding (MMAW) NC II"; the backend test catalog still says SMAW.)

- [ ] **Step 2: Run** `.venv/Scripts/python -m pytest -q backend/tests/test_training_evaluate.py` — expected: FAIL (ModuleNotFoundError: training.evaluate).
- [ ] **Step 3: Implement** `training/catalog.py` and `training/evaluate.py` to the interfaces above. `load_catalog` uses `parse_catalog(json.loads(...))` and builds `Sector(name=...)`, `Qualification(id=i, code=..., name=..., sector=sector, skill_label=..., career_keywords=..., possible_jobs=..., is_active=True)` and `Competency(id=..., position=c.id, name=c.name, category=c.category, is_active=True)`; give competencies ids unique across the catalog. Keep everything in memory — no session, no engine.
- [ ] **Step 4: Run** the test file — expected: PASS. Then the real baseline: `cd backend && ../.venv/Scripts/python -m training.evaluate --split all` and `../.venv/Scripts/python -m training.evaluate --calibrate` — both must finish (calibration in under 3 minutes); paste their output into the task report.
- [ ] **Step 5: Commit** `backend/training/catalog.py`, `backend/training/evaluate.py`, `.gitignore`, `backend/tests/test_training_evaluate.py`.

---

### Task 5: Training pairs and the fine-tuning script

**Files:**
- Create: `backend/training/pairs.py`
- Create: `backend/training/finetune.py`
- Create: `backend/training/requirements.txt`
- Create: `backend/training/README.md`
- Modify: `.gitignore` (add `.venv-train/` and `backend/models/*` with `!backend/models/README.md`)
- Test: `backend/tests/test_training_pairs.py`

**Interfaces:**
- Consumes: `training.catalog.load_catalog` (Task 4); `qualification_text` (`tesda_track.services.embeddings`); `normalize` (`tesda_track.utils.helpers`); `eval_goals.json` (Task 3).
- Produces:
  - `training.pairs.training_pairs(qualifications: list[Qualification], exclude: set[str]) -> list[tuple[str, str]]` — `(query, passage)`; `passage = qualification_text(q)`; queries per qualification: its name, `skill_label`, each `possible_jobs` entry, each `career_keywords` entry, active competency names, and these templates over each job title and keyword: `"I want to be a {x}"`, `"I want to work as a {x}"`, `"gusto kong maging {x}"`, `"may karanasan ako bilang {x}"`, `"marunong ako sa {x}"`. Lower-case and deduplicate queries per qualification; drop any query whose `normalize(query)` is in `exclude`.
  - `training.pairs.eval_exclusions() -> set[str]` — `normalize(goal)` for every goal in `eval_goals.json`.
  - `python -m training.finetune --output models/<name> [--epochs 3] [--batch-size 64] [--mini-batch-size 8] [--lr 2e-5] [--seed 42]`, run from `backend/` inside `.venv-train`. It loads `intfloat/multilingual-e5-small` with sentence-transformers, prefixes `"query: "` / `"passage: "` (E5's convention, same as `E5Embedder`), sets `max_seq_length = 512`, trains with `CachedMultipleNegativesRankingLoss(mini_batch_size=...)` and `BatchSamplers.NO_DUPLICATES`, fp16 on CUDA, holds out 5% of qualifications' pairs as an evaluation loss, saves the model, exports ONNX to `<output>/onnx/model.onnx` (sentence-transformers' ONNX backend via optimum), writes `<output>/training.json` (base model, seed, epochs, pair count, date, git commit), and checks parity: fastembed loading the folder (`TextEmbedding(<name>, specific_model_path=<output>)` after registering it like `CUSTOM_MODELS`) must give cosine ≥ 0.999 against the sentence-transformers embeddings on 10 catalog texts, else exit non-zero.

- [ ] **Step 1: Write the failing tests** `backend/tests/test_training_pairs.py`:

```python
from tesda_track.utils.helpers import normalize
from training.catalog import load_catalog
from training.pairs import eval_exclusions, training_pairs


def test_pairs_cover_jobs_keywords_and_templates_for_every_qualification():
    qualifications, _ = load_catalog()
    pairs = training_pairs(qualifications, exclude=set())
    passages = {passage for _, passage in pairs}
    assert len(passages) == len(qualifications)
    queries = {query for query, passage in pairs if passage.startswith("Cookery NC II.")}
    assert {"karinderya", "cook", "gusto kong maging cook", "i want to work as a chef"} <= queries


def test_evaluation_goals_never_become_training_queries():
    qualifications, _ = load_catalog()
    exclude = eval_exclusions()
    assert exclude, "the evaluation set is loaded"
    assert not {normalize(query) for query, _ in training_pairs(qualifications, exclude)} & exclude
```

("Cookery NC II" has possible_jobs Chef, Cook, Kitchen Assistant and the Filipino keyword "karinderya".)

- [ ] **Step 2: Run** `.venv/Scripts/python -m pytest -q backend/tests/test_training_pairs.py` — expected: FAIL (ModuleNotFoundError: training.pairs).
- [ ] **Step 3: Implement** `pairs.py` (no torch import) and `finetune.py` (imports torch/sentence-transformers inside `main()` so the module imports without them).
- [ ] **Step 4: Run** the test file — expected: PASS.
- [ ] **Step 5: Set up the training environment.** `requirements.txt` starts with `-r ../requirements.txt`, then pins exact versions that install on Python 3.13 / Windows: `sentence-transformers`, `optimum[onnxruntime]` (or the extra sentence-transformers documents for ONNX export), `datasets`, `accelerate`; torch is installed first from the CUDA index (document the exact command, e.g. `pip install torch==<ver> --index-url https://download.pytorch.org/whl/cu128`). Create `.venv-train` with `python -m venv .venv-train` (the interpreter at `C:\laragon\bin\python\python-3.13\python.exe` or the one `.venv` was built from), install, and confirm `.venv-train/Scripts/python -c "import torch; print(torch.cuda.is_available())"` prints `True`.
- [ ] **Step 6: Smoke-train.** From `backend/`: `../.venv-train/Scripts/python -m training.finetune --output models/smoke --epochs 1 --max-steps 20` (add `--max-steps` for this) — expected: finishes, writes `models/smoke/onnx/model.onnx`, parity check passes. Delete `models/smoke` afterwards.
- [ ] **Step 7: Write `backend/training/README.md`**: what the folder is, that it never runs in the API image, how to create `.venv-train`, how to evaluate (`python -m training.evaluate ...`), train, and calibrate, and that only catalog text and the hand-written goals are used.
- [ ] **Step 8: Commit** `pairs.py`, `finetune.py`, `requirements.txt`, `README.md`, `.gitignore`, the test file.

---

### Task 6: Serve a fine-tuned model from a local folder

**Files:**
- Modify: `backend/tesda_track/config.py` (add `embedding_model_path: str | None = None`, resolved against the repository root like `embedding_cache_dir`)
- Modify: `backend/tesda_track/services/embeddings.py`
- Modify: `backend/tesda_track/embeddings.py` (`download` honours `EMBEDDING_MODEL_PATH`)
- Modify: `backend/tesda_track/services/analysis.py` (parameters come from the embedder's calibration when present)
- Modify: `backend/training/evaluate.py` (remove the Task 4 `--model-path` guard)
- Create: `backend/models/README.md`
- Modify: `backend/Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md`
- Test: `backend/tests/test_semantic.py`, `backend/tests/test_analysis_api.py`

**Interfaces:**
- Consumes: `MatchParams` (Task 2); the folder layout written by `training.finetune` (Task 5): `onnx/model.onnx`, tokenizer files, `training.json`, optional `calibration.json`.
- Produces:
  - `E5Embedder(model_name: str, cache_dir: str | None = None, model_path: str | None = None)` with attribute `calibration: MatchParams | None`. With `model_path`, it registers `model_name` as a fastembed custom model (384 dims, mean pooling, normalised, `onnx/model.onnx`) and loads `TextEmbedding(model_name, cache_dir=cache_dir, specific_model_path=model_path)`; it reads `<model_path>/calibration.json` (`{"z_floor": float, "z_ceiling": float, "keyword_weight": float, "min_score": int}`), and on invalid content (missing keys, ceiling ≤ floor, weight outside 0..1, min_score outside 0..100) logs a warning and sets `calibration = None`. A `model_path` without `onnx/model.onnx` raises `FileNotFoundError` before fastembed is called, so a missing folder never triggers a download attempt.
  - `def match_params(embedder: Embedder | None) -> MatchParams` in `analysis.py`: `getattr(embedder, "calibration", None) or MatchParams.from_settings(get_settings())`; `match` and `analyze_goal` use it.
  - `get_embedder()` passes `settings.embedding_model_path`.
  - Docker: the build context `backend/` contains `models/` (README always present); the image copies it to `/app/finetuned/`; `EMBEDDING_MODEL_PATH` (e.g. `/app/finetuned/tesda-e5-small-v1`) and `EMBEDDING_MODEL` come from the environment (compose passes them through from `.env`); with neither set, the image behaves exactly as today. The `download` step only warms up a local model instead of downloading when `EMBEDDING_MODEL_PATH` is set.

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/test_semantic.py`):

```python
def test_calibration_travels_with_a_fine_tuned_model(tmp_path):
    import json

    from tesda_track.services.analysis import MatchParams
    from tesda_track.services.embeddings import read_calibration

    (tmp_path / "calibration.json").write_text(json.dumps(
        {"z_floor": 2.0, "z_ceiling": 3.5, "keyword_weight": 0.4, "min_score": 25}))
    assert read_calibration(str(tmp_path)) == MatchParams(2.0, 3.5, 0.4, 25)


@pytest.mark.parametrize("content", ['{"z_floor": 3, "z_ceiling": 2, "keyword_weight": 0.5, "min_score": 20}',
                                     '{"z_floor": 2}', "not json"])
def test_invalid_calibration_is_ignored(tmp_path, content):
    from tesda_track.services.embeddings import read_calibration

    (tmp_path / "calibration.json").write_text(content)
    assert read_calibration(str(tmp_path)) is None
    assert read_calibration(str(tmp_path / "missing")) is None


def test_a_missing_model_folder_leaves_keyword_matching_on(monkeypatch, tmp_path):
    from tesda_track.config import get_settings
    from tesda_track.services import embeddings

    monkeypatch.setattr(get_settings(), "semantic_search_enabled", True)
    monkeypatch.setattr(get_settings(), "embedding_model", "tesda-track/test-missing")
    monkeypatch.setattr(get_settings(), "embedding_model_path", str(tmp_path / "missing"))
    monkeypatch.setattr(embeddings, "_embedder", None)
    monkeypatch.setattr(embeddings, "_load_failed", False)
    assert embeddings.get_embedder() is None


def test_an_embedder_calibration_overrides_the_settings(client, semantic):
    from tesda_track.config import get_settings
    from tesda_track.services.analysis import MatchParams, match_params

    assert match_params(semantic) == MatchParams.from_settings(get_settings())
    semantic.calibration = MatchParams(0.0, 1.0, 0.5, 101)
    matches = client.post("/api/v1/analysis/matches", json={"query": "I want to be a welder.", "profile": {
        "career_goal": None, "possible_sector": None, "existing_skills": [], "experience_years": None,
        "has_certification": None, "intent": "unknown"}}).json()["matches"]
    assert matches == [], "a minimum score above 100 hides everything"
```

And in `backend/tests/test_analysis_api.py` add a test that, with the `semantic` fixture on but the embeddings deleted for its model (`session.exec(delete(QualificationEmbedding))`, then `session.flush()`), `POST /api/v1/analysis/matches` for "I want to be a welder." still returns SMAW-NC-II from keywords with status 200 (Review Focus 2).

- [ ] **Step 2: Run** `.venv/Scripts/python -m pytest -q backend/tests/test_semantic.py backend/tests/test_analysis_api.py` — expected: FAIL (ImportError: read_calibration / match_params).
- [ ] **Step 3: Implement** to the interfaces above, including `read_calibration(model_path: str | None) -> MatchParams | None` in `services/embeddings.py`; update the Dockerfile, compose, `.env.example` (commented `EMBEDDING_MODEL`/`EMBEDDING_MODEL_PATH` with one line of explanation), `backend/models/README.md` (what goes here, that it is git-ignored, how Docker picks it up), and the root `README.md` (after changing the model: `python -m tesda_track.embeddings sync`).
- [ ] **Step 4: Run** `.venv/Scripts/python -m pytest -q backend/tests` — expected: all pass, 1 skipped; and `TESDA_MODEL_TESTS=1 ... -k real_model` — expected: PASS.
- [ ] **Step 5: Commit** every file listed above by explicit path.

---

### Task 7: Train, calibrate, compare, decide

**Files:**
- Create: `docs/ml/2026-10-09-matching-model-evaluation.md`
- Modify (only if adopting): `backend/tesda_track/config.py` defaults for the base model's band if recalibration improved it, `.env.example`, `backend/tests/test_semantic.py` (the real-model test builds its embedder like `get_embedder`, so it exercises the configured model and calibration)
- Create (git-ignored, not committed): `backend/models/tesda-e5-small-v1/` including `calibration.json`

**Interfaces:**
- Consumes: everything from Tasks 2–6.

- [ ] **Step 1: Baseline.** From `backend/`: `../.venv/Scripts/python -m training.evaluate --split test --json training/runs/baseline-test.json` (current model, current parameters) and `--calibrate --json training/runs/baseline-calibrated.json`.
- [ ] **Step 2: Train.** `../.venv-train/Scripts/python -m training.finetune --output models/tesda-e5-small-v1` with the defaults (3 epochs). If the evaluation loss rises after epoch 1, retrain with `--epochs 1` and record both.
- [ ] **Step 3: Evaluate and calibrate the fine-tuned model:** `../.venv/Scripts/python -m training.evaluate --model tesda-track/multilingual-e5-small-tesda-v1 --model-path models/tesda-e5-small-v1 --calibrate --json training/runs/finetuned-calibrated.json`.
- [ ] **Step 4: Decide, on the test split only.** Adopt the fine-tuned model if and only if, with each model at its own dev-calibrated parameters: fine-tuned objective > baseline objective + 0.02, fine-tuned rejection ≥ 0.8, and no language's top-1 is more than 0.05 below the baseline's. Otherwise keep the base model and, if the base model's calibrated parameters beat its current ones on test by > 0.02 objective, update the defaults in `config.py` (and the comment above them with the new calibration evidence).
- [ ] **Step 5: If adopting:** write `models/tesda-e5-small-v1/calibration.json` with the fine-tuned model's calibrated parameters; set `EMBEDDING_MODEL=tesda-track/multilingual-e5-small-tesda-v1` and `EMBEDDING_MODEL_PATH=backend/models/tesda-e5-small-v1` in the local `.env` (never committed) and document them in `.env.example`; run `cd backend && PYTHONPATH=. ../.venv/Scripts/python -m tesda_track.embeddings sync`; make the real-model test build its embedder from the configured model, path and calibration and run `TESDA_MODEL_TESTS=1 .venv/Scripts/python -m pytest -q backend/tests/test_semantic.py -k real_model` — expected: PASS (if a `RELATED_GOALS` case fails with the adopted model, report it rather than editing the expectation).
- [ ] **Step 6: Write the report** `docs/ml/2026-10-09-matching-model-evaluation.md`: data (pair counts, goal counts by split/language), training settings and duration, a table of dev and test metrics (top-1, top-3, MRR, rejection, objective, top-1 per language) for baseline-current, baseline-calibrated and fine-tuned-calibrated, the parameters chosen, the decision and why, latency of one query embedding for both models on CPU, and how to retrain. Aggregates only.
- [ ] **Step 7: Run the whole suite** `.venv/Scripts/python -m pytest -q` — expected: all pass, 1 skipped.
- [ ] **Step 8: Commit** the report and any changed tracked files by explicit path (never the model folder or `.env`).
