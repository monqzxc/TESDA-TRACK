# TESDA-TRACK Map-First Center Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** By the 2 December 2026 presentation, a learner opens one map page, types what they can do, and sees the TESDA qualifications that fit, the nearest assessment and training centers for each with distance and travel time, and the cities where jobs for those skills are in demand.

**Architecture:** A new map-first page replaces Training & Assessment at `/training`. It is served by four new endpoints under `/api/v1/explore`: nearby centers and jobs for a point, the skills read from a typed query, the search itself, and anonymous events. Skills come from a curated word list with the existing matcher as fallback. Job demand and scholarships come from new tables filled with labelled sample data. A labelled demonstration sign-in loads synthetic TSP profiles through the profile path the TSP WebView sign-in already uses.

**Tech Stack:** Python 3 / FastAPI / SQLModel / Alembic / PostgreSQL + PostGIS / pytest; React 19 / React Router / TanStack Query / zustand / react-aria-components / Tailwind / MapLibre and Leaflet / vitest / Playwright. No new dependency.

**Spec:** [TESDA-TRACK-Consolidated-Product-Document.md](TESDA-TRACK-Consolidated-Product-Document.md) (10 November 2026), the project manager's six revised screens in [screens/](screens/), and the validated decisions in section 1. Where they differ, section 1 wins, then the screens, then the document.

**Branch:** `mon-updates-11-2026` (at `3f1bd9e`, same commit as `main` on 11 November 2026).

**History:** The first version of this plan (11 November) described a step-by-step journey. The project manager then replaced that design with the six map-first screens, and the plan was rewritten for them on 12 November.

---

## 1. Validated decisions

| # | Question | Decision |
|---|---|---|
| 1 | December 2 setup | A plain website. Guests can use it. A sign-in uses **synthetic TSP profiles**; their credentials will be supplied separately. It is a labelled stand-in for TSP SSO, not TESDA-TRACK accounts. |
| 2 | Synthetic profiles | Seeded in TESDA-TRACK's own database in TSP's profile shape, as TSP-linked accounts. Sign-in reuses the existing session cookie. |
| 3 | Design | One map-first page, as the six revised screens show. It replaces the step-by-step journey. |
| 4 | Where it lives | It replaces Training & Assessment at `/training`. The landing page stays at `/` with a button that opens it. The step-by-step finder leaves the menu; its code and addresses stay. |
| 5 | Must-haves the screens dropped | Travel time is added after each distance, and a training center with an open scholarship gets a tag. There is no "How far can you go?" question: lists are nearest first, and the Demand tab's cities cover traveling farther or relocating. |
| 6 | Travel time | An estimate from distance for every center, labelled; modeled road time from the existing OSRM router for the first few, cached. By car only. |
| 7 | Demand | Job titles by city, with levels High demand, Growing and Low demand, from sample data. Wording avoids "openings" and "hiring". |
| 8 | Skills | A curated word list maps everyday Filipino and English phrases to named skills and their qualifications. The existing matcher is the fallback. |
| 9 | Sample data | In its own tables, marked `is_sample`, labelled on screen. |
| 10 | Existing screens | Kept, not removed. The old Training & Assessment page moves to `/training/browse`. |
| 11 | Data to build against | The real registry imported on the development machine, plus a small example fixture for tests and an offline demo. |

### 1A. The six screens

| # | Title | File | What it shows |
|---|---|---|---|
| 1 | Query of the learner | [1-query-of-the-learner.png](screens/1-query-of-the-learner.png) | Full-screen map. Search box "Type what you can do" with a menu button. Chips: Training centers, Assessment centers, In demand jobs. "Sign in with TSP". Map controls. |
| 2 | Default (location off) | [2-default-location-off.png](screens/2-default-location-off.png) | The open panel: "Share my location", off. "See what is near you." |
| 3 | Default (location on) | [3-default-location-on.png](screens/3-default-location-on.png) | "Near you · Quezon City": two nearest training centers, two nearest assessment centers, three jobs in demand in the city, each list with "See all". Pins on the map. |
| 4 | Query (typing) | [4-query-typing.png](screens/4-query-typing.png) | "Skills we found in your search" as chips, then rows: the query, Get certified, Train, Work, a recent search. |
| 5 | Result | [5-result.png](screens/5-result.png) | Tabs All, Assess, Train, Demand. Qualification cards with "Strong match" or "Good match", each with its nearest center. A demand notice. A card for the selected center with "Apply for assessment". |
| 6 | Result (click an item) | [6-result-click-an-item.png](screens/6-result-click-an-item.png) | The Demand tab: cities with job titles and a level. A card for the selected city with "Find jobs in Makati". |

**Where the build differs from the screens, on purpose:**

| Screen shows | Build does | Why |
|---|---|---|
| "2.8 km · Quezon City" | "2.8 km · about 10 min by car · Quezon City" | Decision 5 |
| No scholarship information on a center | "Scholarship open" tag on a training center that has one | Decision 5 |
| "Few openings for … here. These cities are hiring instead." | "Low demand for … here. Demand is higher in these cities." | Decision 7 |
| "Cities hiring for jobs that match what you can do." | "Cities where jobs that match your skills are in demand." | Decision 7 |
| "Sample data for design review. Schools, qualifications and demand levels come from live TSP data." | "Demand and scholarships are sample data for demonstration, not TESDA records." | The first sentence is a design note; the second is not true on 2 December |
| "Save city" | "Show centers there" | The document puts saving after 2 December. Showing that city's centers serves a learner willing to relocate |
| The tab reads "Job · 5" on screen 5 and "Demand · 5" on screen 6 | "Demand" | One name |
| Center card: Apply for assessment, Directions | Also Call, Email and Details | The document's must-have |

**Where the build differs from the 10 November document**, for the Product Owner to know:
- There is no "How far can you go?" question and no 25 km or 100 km choice. The two distances remain as settings: within 25 km a center counts as near; beyond 100 km no travel time is shown.
- Centers are ordered nearest first by travel time. Scholarships and demand are shown, but do not move a center up.
- Demand is by job title and city, with levels High demand, Growing and Low demand, not by qualification and area with high, medium and low.
- The learner is not asked to pick one qualification. Up to five that fit are shown, each labelled by how strongly it matches.

## 2. What the code already has

Found in the repository on 11 November 2026.

| Need | Found |
|---|---|
| Guest-only website | Already so (`frontend/src/auth/accounts.ts`). Staff sign in at `/sign-in`, which nothing links to. |
| TSP sign-in | Built behind `TSP_SIGN_IN_ENABLED` (off) for the WebView. Decision 1 replaces it for December 2. |
| Matching a query to qualifications | Working: goals and skill lists, with a word-matching fallback when the model is unavailable. It names qualifications, not skills, and its Filipino keyword list has nothing for washing, laundry or cleaning. |
| The map | `CenterMap` draws pins, clusters, popups and one route, in MapLibre with a Leaflet fallback. |
| Location sharing | A switch that rounds to about 1 km and keeps the point in memory only (`features/training/state.ts`). |
| Travel time | Directions for one center (`GET /api/v1/routes`) and a comparison of up to 8 sites (`POST /api/v1/recommendations/service-access`). The public router allows 1 request a second. |
| Demand, scholarships | No job demand by city. `training_program.scholarship_available` is a yes/no flag the registry import leaves false. |
| Privacy notice placeholder | Built (`FirstVisitNotice.tsx`). Its text needs the new statements (Task 21). |

**A gap the document does not list.** The registry import creates assessment centers with no link to the qualifications they assess: the accreditation rows stay in `registry_record` history, and the import creates no schedules. With registry data, no assessment center could be shown for a qualification. Task 1 closes this.

**This machine.** The development database holds 6 example providers and 6 example centers, and is at migration 0021 while the code is at 0028. The registry workbook is not on this machine.

## 3. Scope map

| Document item | Where it lands |
|---|---|
| Open from TSP; SSO | Replaced for December 2 by decision 1 (Tasks 19, 20). |
| Guest-only website | Already done. Guests can do everything on the page. |
| Privacy notice placeholder | Task 21 |
| Describe my goal | The search box (Tasks 9, 15). It takes skills, job titles and goals. |
| Pick the right qualification | Up to five matches, labelled Strong or Good (Tasks 9, 16). |
| How far can you go? | Dropped by decision 5. Near and far are settings (Task 6). |
| Recommended centers with reasons | Nearest first, each with distance, travel time and tags (Tasks 7, 9, 16). |
| Training and assessment side by side | The Assess and Train groups; which comes first follows what the learner wrote (Task 9). |
| Travel time | Tasks 6, 10 |
| Every center on the map | Task 1 (offerings); unmapped centers are counted on each card (Tasks 9, 16); geocoding in section 7. |
| Nothing in range | A card says when no center is within 25 km and shows the closest; related qualifications are offered (Tasks 9, 16). |
| Center details and directions | The center card (Task 16) |
| Official, labelled data | Source and date on each center card (Task 16) |
| Demand in the area | Jobs in demand in your city, and the Demand tab (Tasks 3, 8, 9, 17) |
| Open scholarships | Tasks 3, 9, 16 |
| Accurate wording | Task 21, and the softened copy in Task 12 |
| Works on laptops and phones | Task 22 |
| Add-ons: readiness, library, Skills Explorer | The menu, and a readiness link on each qualification card (Tasks 13, 16) |
| Add-on: TSP Find Jobs link | The city card (Task 17) |
| Add-on: Also in demand near you | "Jobs in demand in your city" (Tasks 8, 14) |
| Was this helpful? Report a wrong suggestion | Tasks 11, 18 |
| Theory-of-change measures | Task 11 |

---

## Global Constraints

- **Branch and commits.** Work on `mon-updates-11-2026`. Stage explicit paths only, never `git add -A`. Commit style follows the repository (`feat(scope): …`, `test(scope): …`, `docs: …`). End every message with `Co-Authored-By: Claude <noreply@anthropic.com>`.
- **Tests.** Backend tests share one database: never run two pytest processes at once. From the repository root: `./.venv/Scripts/python.exe -m pytest backend/tests/<file> -q`. Unit tests without a database: `./.venv/Scripts/python.exe -m pytest --confcutdir=backend/tests/unit backend/tests/unit/<file> -q`. Frontend, from `frontend/`: `npm test -- <path>`, `npm run lint`, `npx tsc -b`.
- **No new dependency**, Python or npm. No LLM. Reading skills and ordering centers are rules, not a model.
- **Location privacy.** A learner's point travels only in a POST body, never in a URL. Round it with `routing.round_origin` (2 decimals, about 1 km) before any query, cache key or network call. Never log it, never store it, never echo it in a response. In the browser it stays in memory: not in the address, not in `sessionStorage`. Location sharing is off until the learner turns it on.
- **What a learner types is not stored.** The page creates no recommendation session and saves no query on the server. The query never goes into the address. Recent searches live in this tab's `sessionStorage` only. Counters hold totals only: no text, no coordinates, no learner.
- **Sample data.** Rows with `is_sample = true` are written only by `sample-data load`. Wherever a sample value shows on screen, the sample label shows with it.
- **Copy.** All on-screen text lives in `frontend/src/copy/en.ts`. When an English string changes meaning, delete its override in every `frontend/src/i18n/locales/*.ts` so it falls back to English. The word "AI" does not appear on screen. Demand is never called openings, vacancies or hiring. What the page shows are suggestions.
- **Policy values** (distances, speed, match thresholds) are settings, never literals in the code that uses them. They are provisional until the Product Owner signs off (section 7).
- **Existing behaviour stays.** The old Training & Assessment page (now at `/training/browse`), the finder at `/find`, `/recommendations/training`, `/recommendations/assessments`, `/recommendations/service-access`, the MCP tools, the TSP WebView and their tests keep working, except where a task names the change.
- **Each task** follows the same steps: write the listed tests and see them fail, implement, run the task's tests with the named regression files, commit the listed paths.

## Review Focus

Five conditions the screens and the document imply but do not spell out. Each has a test in the task that owns the code.

1. **A word list phrase sits inside a longer word** ("cook" in "cookies"). Phrases match whole words only, so the learner is not told they have a skill they never named. Test: Task 2 `test_phrases_match_whole_words_only`.
2. **The query names no listed skill and the matcher finds nothing.** The page says there is no clear match and offers examples. It never shows centers for a guessed qualification. Test: Task 9 `test_no_match_returns_no_cards_and_says_so`.
3. **The learner shares no location and types no place.** Search still works: qualifications and centers are listed without distances or travel times, with a prompt to share a location or type a city. Tests: Task 9 `test_search_without_an_origin_has_no_distances`, Task 16 `prompts for a location when there is none`.
4. **A matched qualification has no center nearby, or only centers without a map point.** Its card says so, shows the closest, and counts the unmapped ones. It is not left out and not shown empty. Test: Task 9 `test_card_without_a_near_center_shows_its_closest_and_counts_unmapped`.
5. **The router is busy or down when modeled times are asked for.** The estimates stay, labelled as estimates, and the request still answers 200. Test: Task 10 `test_router_failure_keeps_estimates_and_answers_200`.

---

## Before you start (once, on this machine)

Run in Git Bash. Node is not on its PATH: `export PATH="/c/Program Files/nodejs:$PATH"`.

1. Check the database container is up: `docker ps` lists `tesda-track-dev-db-1`.
2. Bring the development database to the code's schema. From `backend/`: `../.venv/Scripts/python.exe -m alembic upgrade head`, then `../.venv/Scripts/python.exe -m tesda_track.seed`.
3. Record the baseline before changing anything: `./.venv/Scripts/python.exe -m pytest -q` from the root, then `npm test`, `npm run lint` and `npx tsc -b` from `frontend/`. Note any failure that is already there.
4. When the registry ZIP arrives, import it with the commands in `docs/registry-import.md`, then run Task 1's backfill.

## File map

**Backend, new**

| File | Responsibility |
|---|---|
| `backend/migrations/versions/0029_assessment_offering.py` | Which center assesses which qualification |
| `backend/migrations/versions/0030_job_demand_and_scholarships.py` | Job demand by city; scholarship windows |
| `backend/migrations/versions/0031_explore_daily_stat.py` | Anonymous counters |
| `backend/seed/sources/skills_lexicon.json` | The skill word list |
| `backend/seed/sample/jobs.json` | Sample job titles and the demo's demand levels |
| `backend/tesda_track/models/demand.py` | `JobDemand`, `ScholarshipWindow` |
| `backend/tesda_track/services/offerings.py` | Backfill offerings from registry history |
| `backend/tesda_track/services/skills_lexicon.py` | Read skills from text |
| `backend/tesda_track/services/areas.py` | A site's city, province and region as keys and labels |
| `backend/tesda_track/services/job_demand.py` | Read job demand and open scholarships |
| `backend/tesda_track/sample_data.py` | Deterministic sample demand and scholarships |
| `backend/tesda_track/services/places.py` | A typed place to a point; a point to its area |
| `backend/tesda_track/services/explore_policy.py` | Estimates, near and far, match strength, as pure functions |
| `backend/tesda_track/services/center_candidates.py` | The sites that offer a qualification, and the sites nearest a point |
| `backend/tesda_track/services/explore.py` | Nearby, skills and search answers |
| `backend/tesda_track/services/explore_stats.py` | Counts events |
| `backend/tesda_track/services/demo_tsp_profiles.py` | Seeds synthetic TSP-linked accounts |
| `backend/tesda_track/schemas/explore.py`, `backend/tesda_track/routers/explore.py` | Shapes and endpoints |

**Frontend, new** (under `frontend/src/features/explore/` unless a path is given)

| File | Responsibility |
|---|---|
| `ExplorePage.tsx` | The page: map, panel, chips, account button, card |
| `exploreApi.ts`, `exploreStore.ts`, `origin.ts` | Requests; this tab's state; the starting point, in memory only |
| `SearchBox.tsx`, `SuggestList.tsx` | The box and what shows while typing (screens 1, 4) |
| `DefaultPanel.tsx` | Location off and on (screens 2, 3) |
| `ResultsPanel.tsx`, `QualificationCard.tsx`, `DemandList.tsx`, `DemandNotice.tsx` | Results (screens 5, 6) |
| `MapCard.tsx` | The selected center's or city's card |
| `PanelNotes.tsx`, `ExploreFeedback.tsx` | The standing notes; feedback |
| `format.ts` | Trip lines, skill lists, map ids |
| `frontend/src/features/tsp/TspAccount.tsx` | "Sign in with TSP" and the signed-in button |

---

## Phase A: Data foundation

### Task 1: Assessment offerings

**Files:**
- Create: `backend/migrations/versions/0029_assessment_offering.py`, `backend/tesda_track/services/offerings.py`
- Modify: `backend/tesda_track/models/delivery.py`, `backend/tesda_track/models/__init__.py`, `backend/tesda_track/registry_import.py` (`apply_plans`), `backend/tesda_track/cli.py`
- Test: `backend/tests/test_assessment_offerings.py`, `backend/tests/test_registry_import.py`

**Interfaces:**
- Produces `AssessmentOffering(ProvenanceFields, table=True)`, table `assessment_offering`: `id`, `center_id` (FK `assessment_center.id`, CASCADE, indexed), `qualification_id` (FK `qualification.id`, RESTRICT, indexed), unique `(center_id, qualification_id)`, and the same `data_status` check as `AssessmentCenter`.
- Produces `offerings.backfill_assessment_offerings(session: Session) -> int`: the number of rows created.
- Produces CLI `python -m tesda_track.cli backfill-assessment-offerings`.

**Rules:**
- `apply_plans` upserts one offering for each accepted assessment row whose qualification is in the catalog, with the importer's own provenance (`data_status="incomplete"`, the plan's name, sheet and row, snapshot date).
- The backfill joins `registry_record` (outcome `accepted`, `qualification_id` not null) to `registry_batch` (`kind="assessment"`) and to `registry_link` (`entity_kind="center"`, `external_key = site_key`). It is idempotent.
- An offering says the registry lists the center for the qualification. It is not verification, a schedule or a seat.

- [ ] **Step 1: Write the failing tests.** `test_accepted_assessment_row_creates_offering`; `test_reapplying_the_same_batch_creates_no_duplicate`; `test_review_and_historical_rows_create_no_offering`; `test_backfill_from_history_is_idempotent` (insert one batch, record and link by hand: the first run returns 1, the second 0).
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** Write the migration in the style of `0028_goal_origin.py`.
- [ ] **Step 4: Run them, with `test_registry_import.py` and `test_migration_release.py`.**
- [ ] **Step 5: Commit:** `feat(registry): record which centers assess which qualifications`.

### Task 2: The skill word list

**Files:**
- Create: `backend/seed/sources/skills_lexicon.json`, `backend/tesda_track/services/skills_lexicon.py`
- Test: `backend/tests/unit/test_skills_lexicon.py`

**Interfaces:**
- `Skill` (frozen dataclass): `key: str`, `name: str`, `phrases: tuple[str, ...]`, `qualifications: tuple[str, ...]`.
- `Lexicon` (frozen dataclass): `skills: tuple[Skill, ...]`, `learn_phrases: tuple[str, ...]`.
- `MAX_SKILLS = 6`
- `load(path: Path = LEXICON_FILE) -> Lexicon`, cached.
- `normalise(text: str) -> str`: casefolded; every character that is not a letter or digit becomes a space; spaces collapsed.
- `find_skills(text: str, lexicon: Lexicon | None = None) -> list[Skill]`
- `wants_to_learn(text: str, lexicon: Lexicon | None = None) -> bool`
- `by_keys(keys: Sequence[str], lexicon: Lexicon | None = None) -> list[Skill]`: in the given order; unknown keys are dropped.
- `qualification_links(skills: Sequence[Skill]) -> dict[str, list[Skill]]`: qualification code to the skills that name it.
- `skills_for_qualifications(codes: Collection[str], lexicon: Lexicon | None = None) -> list[Skill]`

**Rules:**
- The file is `{"learn_phrases": [...], "skills": [{"key", "name", "phrases", "qualifications"}]}`.
- A phrase matches when its normalised words appear in the normalised text as whole words, in order.
- `find_skills` returns skills by where their first phrase starts in the text, then by file order, at most `MAX_SKILLS`.
- The file has at least 40 skills. Keys are unique and kebab-case. Every qualification code is in `backend/seed/qualifications.json`. One phrase may belong to several skills.
- It includes these entries, which the demo and the tests use:

| key | name | phrases include | qualifications |
|---|---|---|---|
| `dishwashing` | Dishwashing | maghugas, naghuhugas, hugas ng pinggan, maghugas ng plato, dishwashing, wash dishes | `FBS-NC-II` |
| `laundry` | Laundry | maghugas, maglaba, naglalaba, labada, laundry, wash clothes | `HOUSEKEEPING-NC-II` |
| `cleaning` | Cleaning | maghugas, maglinis, naglilinis, paglilinis, cleaning, clean rooms | `HOUSEKEEPING-NC-II` |
| `cooking` | Cooking | magluto, nagluluto, pagluluto, cooking, cook | `COOKERY-NC-II` |
| `driving` | Driving | magmaneho, nagmamaneho, pagmamaneho, driving, drive | `DRIVING-NC-II`, `DRIVING-NC-III-2`, `DRIVING-NC-III` |
| `welding` | Welding | maghinang, hinang, welding, weld | `MMAW-NC-II` |
| `computer-repair` | Computer repair | mag-ayos ng computer, computer repair, fix computers | `CSS-NC-II` |
| `electrical-wiring` | Electrical wiring | mag-wiring, electrical wiring, wiring | `EIM-NC-II` |
| `caregiving` | Caregiving | mag-alaga, nag-aalaga, caregiving | `CAREGIVING-NC-II-5` |
| `customer-service` | Customer service | customer service, sumagot ng tawag, call center | `CONTACT-CENTER-SERVICES-NC-II`, `CUSTOMER-SERVICES-NC-II` |

- `learn_phrases` include: gusto kong matuto, gustong matuto, matuto, mag-aral, gusto kong maging, want to learn, want to become, learn how, how to.
- "maghugas" under Laundry and Cleaning follows screen 4. The whole list is a placeholder for TESDA experts to review (section 7).

- [ ] **Step 1: Write the failing tests.**

```python
def test_reads_the_screens_example():
    assert [s.name for s in find_skills("Marunong ako maghugas")] == ["Dishwashing", "Laundry", "Cleaning"]

def test_phrases_match_whole_words_only():
    assert find_skills("I like cookies") == []

def test_skills_come_in_the_order_they_are_written():
    assert [s.key for s in find_skills("marunong ako magluto at magmaneho")] == ["cooking", "driving"]

def test_case_and_punctuation_do_not_matter():
    assert [s.key for s in find_skills("MAGLUTO!")] == ["cooking"]

def test_hyphenated_phrase_matches_with_or_without_the_hyphen():   # "mag-alaga" and "mag alaga"

def test_wants_to_learn():
    assert wants_to_learn("Gusto kong matuto magluto") and not wants_to_learn("Marunong ako magluto")

def test_at_most_six_skills():
def test_file_is_valid():        # at least 40 skills; unique kebab-case keys; every code in the catalog seed; no empty phrase
def test_qualification_links():  # Dishwashing, Laundry, Cleaning -> {"FBS-NC-II": [Dishwashing], "HOUSEKEEPING-NC-II": [Laundry, Cleaning]}
```

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Write the file and the module.** Pick the other skills from the catalog's most common trades, each with Filipino and English phrases.
- [ ] **Step 4: Run them.**
- [ ] **Step 5: Commit:** `feat(skills): a curated word list that reads skills from what a learner types`.

### Task 3: Job demand by city and scholarship windows, with a sample loader

**Files:**
- Create: `backend/migrations/versions/0030_job_demand_and_scholarships.py`, `backend/tesda_track/models/demand.py`, `backend/tesda_track/services/areas.py`, `backend/tesda_track/services/job_demand.py`, `backend/tesda_track/sample_data.py`, `backend/seed/sample/jobs.json`
- Modify: `backend/tesda_track/models/__init__.py`, `backend/tesda_track/cli.py`
- Test: `backend/tests/unit/test_areas.py`, `backend/tests/test_job_demand.py`, `backend/tests/test_sample_data.py`

**Interfaces:**
- `areas.Area` (frozen dataclass): `kind: Literal["city", "province", "region"]`, `key: str`, `label: str`, `region_code: str`.
- `areas.area_key(kind, region_code: str, province: str | None = None, city: str | None = None) -> str`: `"region:NCR"`, `"province:III|bulacan"`, `"city:NCR|metro manila|quezon city"`. Names are folded with `" ".join(name.split()).casefold()`; a missing province is an empty part.
- `areas.site_areas(region_code: str, region_name: str, province: str | None, city: str | None) -> list[Area]`: city, then province, then region. A missing city or province is skipped. A city's label is `"City, Province"`, except when the province is missing or is `Metro Manila`.
- `DEMAND_LEVELS = ("high", "growing", "low")`
- `JobDemand`, table `job_demand`: `id`, `job_title` (120), `setting: str | None` (120), `skill_keys: list[str]` (text array), `area_key` (200, indexed), `city` (100), `province: str | None` (100), `region_code` (FK `region.code`), `latitude`, `longitude`, `level` (checked against `DEMAND_LEVELS`), `period_label: str | None`, `source_name: str`, `is_sample: bool`; unique `(job_title, area_key)`.
- `ScholarshipWindow`, table `scholarship_window`: `id`, `program_id` (FK `training_program.id`, CASCADE, indexed), `scheme: str` (60), `opens_on: date`, `closes_on: date` (check `closes_on >= opens_on`), `source_name: str`, `is_sample: bool`.
- `job_demand.manila_today(now: datetime | None = None) -> date`: the date in `Asia/Manila`.
- `job_demand.in_area(session, area_key: str, limit: int = 3) -> list[JobDemand]`: levels `high` and `growing` only; high first, then by title.
- `job_demand.for_skills(session, skill_keys: Collection[str]) -> list[JobDemand]`: rows whose `skill_keys` share a key, at any level.
- `job_demand.open_scholarships(session, program_ids: Collection[int], today: date) -> dict[int, ScholarshipWindow]`: windows with `opens_on <= today <= closes_on`; for a program with several, the one closing last.
- `sample_data.SOURCE = "Sample data for demonstration (not TESDA records)"`
- `sample_data.sample_level(job_title: str, area_key: str) -> str | None`
- `sample_data.load(session, *, today: date, jobs_file: Path = JOBS) -> dict[str, int]`, returning `{"demand": n, "scholarships": n, "curated_unmatched": n}`; `sample_data.clear(session) -> int`.
- CLI `python -m tesda_track.cli sample-data load` and `sample-data clear`.

**Rules:**
- `jobs.json` is `{"jobs": [{"title", "setting", "skills": [keys]}], "curated": [{"title", "city", "province", "region_code", "level", "latitude", "longitude"}]}`. Every skill key is in the word list. At least 20 jobs. A curated entry's coordinates are optional.
- It includes these jobs: Kitchen Steward (Restaurants and hotels; `dishwashing`, `cleaning`), Laundry Attendant (Hotels and laundry shops; `laundry`), Room Attendant (Hotels and resorts; `cleaning`, `laundry`), Cook (Restaurants and hotels; `cooking`), Electrician (Construction and building maintenance; `electrical-wiring`), Customer Service Associate (Offices and contact centers; `customer-service`).
- `sample_level`: `h = int(sha256(f"demand|{job_title}|{area_key}".encode()).hexdigest()[:8], 16) % 100`. Below 20 is `high`, below 40 is `growing`, below 60 is `low`, otherwise `None` (no row).
- `load` writes rows for every job in every city that has an active mapped site of either kind. A city's point is the mean of its sites' coordinates, rounded to 2 decimals.
- A curated entry's level replaces the rule's. One with coordinates is written even when no site is in that city. One without coordinates in a city with no site is skipped and counted in `curated_unmatched`.
- Curated rows, so the demo matches screens 3, 5 and 6 (each with its city's coordinates): Quezon City (NCR, Metro Manila): Customer Service Associate `high`, Electrician `high`, Cook `growing`, Kitchen Steward `low`, Laundry Attendant `low`. Makati City: Kitchen Steward `high`, Room Attendant `high`. Pasay City: Room Attendant `high`, Laundry Attendant `high`. Taguig City: Kitchen Steward `growing`. Cebu City (VII, Cebu): Kitchen Steward `high`, Room Attendant `high`. Malay (VI, Aklan): Room Attendant `high`, Laundry Attendant `high`.
- Scholarships: for each active program at an active provider, `h` is the same hash over `f"scholarship|{provider.name}|{qualification.code}"`. Below 20 the program gets an open window (first day of `today`'s month to the last day of the next month). From 20 to 24 it gets a closed one (the three months before, ending on the last day of the previous month). `scheme` is `("TWSP", "STEP", "PESFA")[h % 3]`.
- `load` deletes every `is_sample` row first, then inserts. It never changes a row with `is_sample = false`, and writes no sample row for a job and city that has a real one.

- [ ] **Step 1: Write the failing tests.**

```python
def test_area_key_folds_case_and_spaces():
    assert area_key("city", "NCR", "Metro  Manila", "Quezon City") == "city:NCR|metro manila|quezon city"

def test_site_areas_most_specific_first_and_skip_missing():
    # ("NCR", "National Capital Region", "Metro Manila", "Quezon City") -> labels ["Quezon City", "Metro Manila", "National Capital Region"]
    # ("IV-A", "Region IV-A (CALABARZON)", "Laguna", "Calamba") -> first label "Calamba, Laguna"

def test_sample_level_is_deterministic_and_uses_every_outcome():
    assert sample_level("Cook", "city:NCR||manila") == sample_level("Cook", "city:NCR||manila")
    assert {sample_level(f"Job {n}", "city:NCR||manila") for n in range(200)} == {"high", "growing", "low", None}

def test_manila_today_uses_philippine_time():
    assert manila_today(datetime(2026, 12, 31, 17, 0, tzinfo=timezone.utc)) == date(2027, 1, 1)

def test_in_area_lists_high_then_growing_and_leaves_out_low(...)
def test_for_skills_finds_jobs_sharing_a_skill(...)
def test_scholarship_is_open_on_its_closing_day_and_closed_the_next(...)   # closes_on 2026-12-31
def test_future_and_past_windows_are_not_open(...)
def test_load_replaces_only_sample_rows(...)          # a row with is_sample False survives a load and a clear
def test_real_row_is_never_overwritten_by_sample(...)
def test_curated_level_replaces_the_rule(...)
def test_curated_city_without_sites_needs_coordinates(...)   # with them: written; without: counted unmatched
def test_jobs_file_is_valid()                                # at least 20 jobs; every skill key in the word list
```

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them, with `test_migration_release.py` and `test_cli.py`.**
- [ ] **Step 5: Commit:** `feat(demand): job demand by city and scholarship windows, with a labelled sample loader`.

### Task 4: Places: a typed place to a point, a point to its area

**Files:**
- Create: `backend/tesda_track/services/places.py`
- Test: `backend/tests/test_places.py`

**Interfaces:**
- Consumes `areas.Area`, `areas.site_areas` (Task 3).
- `Place` (frozen dataclass): `label: str`, `kind: Literal["city", "province", "region"]`, `region_code: str`, `latitude: float`, `longitude: float`.
- `places.search(session, text: str, limit: int = 5) -> list[Place]`
- `places.region_of(session, latitude: float, longitude: float) -> str | None`
- `places.areas_at(session, latitude: float, longitude: float) -> list[Area]`: the city and province of the nearest active mapped site within 10 km, then the region from `region_of`. Empty when there is no region.

**Rules** (a server-side port of `findPlace` in `frontend/src/features/training/centers.ts`, with no outside geocoder):
- A city or province is known from the active, mapped providers and centers in it. Its point is the mean of their coordinates. Labels follow `site_areas`.
- A region matches by name, code, `"Region {code}"` or its center city, and resolves to the region's stored center.
- Matching ignores case. Text shorter than 3 characters matches nothing. Exact matches come first, then names that start with the text; names that merely contain it are not matched, so a skill word is not mistaken for a place. Within each, city before province before region, then the place with more sites.
- Cities with the same name in different provinces are separate results.
- A city also matches its name followed by its province ("Quezon City, Metro Manila"), which is how a TSP profile's home area arrives (Task 20).
- Coordinates are rounded to 2 decimals.
- `region_of`: the region of the nearest active mapped site within 50 km, otherwise the region whose center is nearest.

- [ ] **Step 1: Write the failing tests.** `test_city_resolves_to_the_mean_of_its_sites`; `test_city_with_its_province_resolves_to_that_city_alone`; `test_same_city_name_in_two_provinces_returns_both`; `test_region_name_and_code_resolve_to_its_center`; `test_short_or_unknown_text_returns_nothing`; `test_a_word_inside_a_place_name_is_not_a_match`; `test_region_of_uses_nearest_site_then_nearest_center`; `test_areas_at_gives_city_province_and_region`; `test_areas_at_far_from_any_site_gives_the_region_only`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.**
- [ ] **Step 5: Commit:** `feat(places): resolve a typed place and a learner's area without an outside geocoder`.

### Task 5: Example sites for the demo

**Files:**
- Modify: `backend/seed/delivery_sites.json`
- Test: `backend/tests/unit/test_delivery_seed.py`

**Rules:**
- Add 10 `[Seed]` sites, each a provider with its assessment center, in the fixture's existing format, each with its `province` and `city`. Six within 25 km of Quezon City (14.65, 121.05): Quezon City, San Juan, Marikina, Pasig, Manila, Makati. Two between 25 and 100 km: Malolos (III, Bulacan) and Calamba (IV-A, Laguna). Two beyond 100 km: Cebu City (VII, Cebu) and Davao City (XI, Davao del Sur).
- Each offers `HOUSEKEEPING-NC-II`. At least five offer `FBS-NC-II` and four `COOKERY-NC-II`.
- `DRIVING-NC-III` is offered only by sites beyond 25 km (at least three), so a search for it from Quezon City shows the no-center-nearby case.
- Keep the existing six sites. The fixture stays skipped in production, as `seed_all` already does.
- These rows have `data_status = "example"`. They appear on the new page only with `EXPLORE_INCLUDE_EXAMPLE_SITES=true` (Task 6), which belongs in a development `.env` and never on staging.

- [ ] **Step 1: Write the failing test.** `test_fixture_has_housekeeping_sites_near_between_and_beyond_quezon_city`: by great-circle distance from (14.65, 121.05), at least 6 within 25 km, 2 between 25 and 100 km, and 2 beyond 100 km; and no `DRIVING-NC-III` site within 25 km.
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Add the sites.** Then `../.venv/Scripts/python.exe -m tesda_track.seed` from `backend/`.
- [ ] **Step 4: Run the test, with `test_seed.py`.**
- [ ] **Step 5: Commit:** `test(seed): example sites around Quezon City for the map-first page`.

---

## Phase B: The explore endpoints

### Task 6: Policy and settings

**Files:**
- Create: `backend/tesda_track/services/explore_policy.py`
- Modify: `backend/tesda_track/config.py`, `.env.example`, `docker-compose.yml` (pass the new keys the way `MAPTILER_KEY` is passed)
- Test: `backend/tests/unit/test_explore_policy.py`

**Interfaces:**
- `Settings` adds, under a comment naming this plan:

| Setting | Default | Bounds |
|---|---|---|
| `explore_near_km` | `25` | above 0, up to 500 |
| `explore_far_km` | `100` | above `explore_near_km`, up to 2000 |
| `travel_estimate_speed_kmh` | `30` | above 0 |
| `travel_estimate_detour_factor` | `1.4` | 1 or more |
| `explore_modeled_top_n` | `4` | 0 to 4 |
| `explore_strong_score` | `60` | 0 to 100 |
| `explore_include_example_sites` | `False` | |

- `explore_policy.VERSION = "nearest-first-v1"`
- `estimate_minutes(distance_km: float, settings) -> int`: `max(1, round(distance_km * detour / speed * 60))`.
- `is_near(distance_km: float | None, settings) -> bool`: within `explore_near_km`.
- `shows_travel_time(distance_km: float | None, settings) -> bool`: within `explore_far_km`.
- `strength_from_skills(count: int) -> Literal["strong", "good"]`: `strong` for 2 or more.
- `strength_from_score(score: int, settings) -> Literal["strong", "good"]`: `strong` at or above `explore_strong_score`.
- `center_order(minutes: int | None, distance_km: float | None, name: str, site_id: int) -> tuple`: by minutes, then distance, then name, then id; unknown values last.

- [ ] **Step 1: Write the failing tests.**

```python
def test_estimate_minutes():        # 10 km -> 28; 0.1 km -> 1
def test_near_and_far():            # 25 km is near; 25.1 is not; 100 km shows a travel time; 100.1 and None do not
def test_strength_from_skills():    # 1 -> "good"; 2 -> "strong"
def test_strength_from_score():     # 60 -> "strong"; 59 -> "good"
def test_centers_order_by_time_then_distance_with_unknown_last():
def test_far_must_exceed_near():    # Settings(explore_near_km=100, explore_far_km=50) raises
```

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** The module docstring says the values are provisional engineering defaults awaiting Product Owner sign-off. Add `EXPLORE_INCLUDE_EXAMPLE_SITES=true` to the local `.env` so the example fixture shows in development.
- [ ] **Step 4: Run them, with `backend/tests/test_client_config.py`.**
- [ ] **Step 5: Commit:** `feat(explore): the nearest-first policy as configurable rules`.

### Task 7: Centers that offer a qualification, and centers nearest a point

**Files:**
- Create: `backend/tesda_track/services/center_candidates.py`
- Test: `backend/tests/test_center_candidates.py`

**Interfaces:**
- `Candidate` (frozen dataclass): `kind`, `site_id`, `name`, `region_code`, `province`, `city`, `address`, `latitude`, `longitude`, `contact_phone`, `contact_email`, `website` (None for assessment), `provenance: dict`, `distance_km: float | None`, `program_ids: tuple[int, ...]` (empty for assessment).
- `training_sites(session, qualification_id: int, origin: dict | None, *, include_examples: bool) -> list[Candidate]`
- `assessment_sites(session, qualification_id: int, origin: dict | None, *, include_examples: bool) -> list[Candidate]`
- `nearest_sites(session, kind: str, origin: dict, limit: int, *, include_examples: bool) -> list[tuple[Candidate, int, Qualification | None]]`: the nearest mapped sites of a kind that offer anything, each with how many qualifications it offers and one of them (the first by name).
- `related_near(session, qualification: Qualification, origin: dict, near_km: float, *, include_examples: bool, limit: int = 3) -> list[tuple[Qualification, int, float]]`: qualification, mapped sites within `near_km`, nearest distance.

**Rules:**
- Training: an active provider with at least one active program for the qualification. `program_ids` are those programs.
- Assessment: an active center with an `AssessmentOffering` for the qualification, or an open schedule in the future for it.
- Rows whose `data_status` is `example` are left out unless `include_examples`.
- With an origin, distance is PostGIS `ST_Distance` over `geo.point(model)` and `geo.point_at(...)`, in kilometres, and results come nearest first, unmapped last, then by id. Without an origin, every distance is `None` and results come by name. One `Candidate` per site.
- `related_near`: active qualifications in the same sector, other than the one given, with a mapped site of either kind within `near_km`. Order: names sharing the given qualification's first word first, then nearest, then name.

- [ ] **Step 1: Write the failing tests.** `test_training_site_needs_an_active_program_for_the_qualification`; `test_assessment_site_from_a_registry_offering_without_a_schedule`; `test_assessment_site_from_an_open_schedule`; `test_closed_or_past_schedule_alone_is_not_an_offering`; `test_example_sites_are_left_out_unless_included`; `test_unmapped_site_has_no_distance_and_sorts_last`; `test_without_an_origin_sites_come_by_name_with_no_distance`; `test_inactive_site_or_program_is_left_out`; `test_nearest_sites_gives_a_count_and_one_qualification`; `test_related_prefers_the_same_first_word_then_nearest`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** Use the `make_provider`, `make_program`, `make_center` and `make_schedule` fixtures; add offerings through the `session` fixture.
- [ ] **Step 4: Run them, with `test_training.py` and `test_assessments.py`.**
- [ ] **Step 5: Commit:** `feat(explore): find the sites that offer a qualification, and the sites nearest a point`.

### Task 8: Nearby: the default panel's data (screen 3)

**Files:**
- Create: `backend/tesda_track/schemas/explore.py`, `backend/tesda_track/services/explore.py`, `backend/tesda_track/routers/explore.py`
- Modify: `backend/tesda_track/main.py`
- Test: `backend/tests/test_explore_nearby.py`

**Interfaces:**
- Consumes Tasks 3, 4, 6, 7; `TravelOrigin` and `ServiceKind` from `schemas/service_access.py`; `QualificationSummary`, `ProvenancePublic`.
- Produces, in `schemas/explore.py` (Task 9 adds the search shapes to the same file):

```python
DemandLevel = Literal["high", "growing", "low"]
SampleKind = Literal["demand", "scholarship"]

class TravelTime(BaseModel):     minutes: int; basis: Literal["estimated", "modeled"]; mode: Literal["car"] = "car"
class ScholarshipTag(BaseModel): scheme: str; closes_on: date; is_sample: bool
class AreaLabel(BaseModel):      label: str; kind: Literal["city", "province", "region"]; region_code: str
class CenterOption(BaseModel):
    kind: ServiceKind; site_id: int; name: str; region_code: str
    province: str | None; city: str | None; address: str | None
    latitude: float | None; longitude: float | None
    contact_phone: str | None; contact_email: str | None; website: str | None
    provenance: ProvenancePublic
    distance_km: float | None; travel: TravelTime | None
    scholarship: ScholarshipTag | None                 # training only
class NearbyCenter(CenterOption): offers: int; example: QualificationSummary | None
class JobInDemand(BaseModel):    title: str; setting: str | None; level: DemandLevel; area_label: str; is_sample: bool
class NearbyRequest(BaseModel):  origin: TravelOrigin; limit: int = 2      # extra="forbid"; limit 1 to 25
class NearbyResult(BaseModel):
    area: AreaLabel | None
    training: list[NearbyCenter]; assessment: list[NearbyCenter]; jobs: list[JobInDemand]
    sample_data: list[SampleKind]
```

- `explore.nearby(session, request: NearbyRequest, *, settings: Settings, now: datetime | None = None) -> NearbyResult`
- `explore.center_option(candidate: Candidate, *, scholarships: Mapping[int, ScholarshipWindow], settings: Settings) -> CenterOption`: used again by Task 9.
- `POST /api/v1/explore/nearby`, no sign-in.

**Rules:**
1. Round the origin with `routing.round_origin`. Nothing after this line sees the unrounded point.
2. `training` and `assessment` are `nearest_sites(...)` for each kind, with `settings.explore_include_example_sites`.
3. `center_option`: `distance_km` rounded to 1 decimal; `travel` is `TravelTime(estimate_minutes(distance), "estimated")` when `shows_travel_time`, otherwise `None`; `scholarship` is the open window of any of a training site's programs (the one closing last).
4. `area` is the most specific of `places.areas_at(...)`, or `None`.
5. `jobs` is `job_demand.in_area(...)` for the city area, at most 3; empty when the area is not a city.
6. `sample_data` names what in the answer has `is_sample`.
7. The response holds no origin.

- [ ] **Step 1: Write the failing tests.** `test_lists_the_two_nearest_of_each_kind_with_a_qualification`; `test_limit_raises_the_lists_to_see_all`; `test_area_names_the_city`; `test_jobs_are_high_then_growing_for_the_city`; `test_no_jobs_far_from_any_city`; `test_travel_time_only_within_the_far_distance`; `test_open_scholarship_shows_on_a_training_center`; `test_same_answer_for_points_that_round_alike` (and the body holds no latitude of the origin); `test_origin_outside_the_philippines_is_422`; `test_sample_data_names_what_is_sample`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them, with `backend/tests/unit/test_openapi_schema.py`.**
- [ ] **Step 5: Commit:** `feat(explore): the nearest centers and jobs in demand around a point`.

### Task 9: Skills and search (screens 4, 5, 6)

**Files:**
- Modify: `backend/tesda_track/schemas/explore.py`, `backend/tesda_track/services/explore.py`, `backend/tesda_track/routers/explore.py`
- Test: `backend/tests/test_explore_search.py`

**Interfaces:**
- Consumes Tasks 2 to 8; `analysis.match_evidence`, `pathway_input.matching_mode`, `GoalText` from `schemas/analysis.py`; `tsp_sign_in.linked_profile` and `profile_labels`; `OptionalLearner`.
- Adds to `schemas/explore.py`:

```python
class Skill(BaseModel):          key: str; name: str
class PlaceMatch(BaseModel):     label: str; kind: Literal["city", "province", "region"]; region_code: str; latitude: float; longitude: float
class SkillsRequest(BaseModel):  query: GoalText                      # extra="forbid"
class SkillsResult(BaseModel):   skills: list[Skill]; places: list[PlaceMatch]    # at most 6 and 2

class SearchRequest(BaseModel):                                       # extra="forbid"; at least one of the first three
    query: GoalText | None = None
    skills: list[str] | None = None                                   # word-list keys, at most 6: the chips after "Edit skills"
    qualification_code: str | None = None                             # a link from another page
    origin: TravelOrigin | None = None
    travel_detail: Literal["estimate", "modeled"] = "estimate"

class QualificationCard(BaseModel):
    qualification: QualificationSummary
    strength: Literal["strong", "good"]
    skills: list[str]                                                 # the found skills' names that point to it
    reason: str | None                                                # the matcher's reason, when matched by words
    centers: list[CenterOption]                                       # at most 5, nearest first
    near: int; unmapped: int                                          # mapped centers within the near distance; centers with no map point
class RelatedQualification(BaseModel): qualification: QualificationSummary; centers_near: int; nearest_km: float
class ServiceGroup(BaseModel):   kind: ServiceKind; cards: list[QualificationCard]; related: list[RelatedQualification]
class CityDemand(BaseModel):
    area_label: str; sub_label: str | None; region_code: str; latitude: float; longitude: float
    level: DemandLevel; jobs: list[str]; distance_km: float | None; is_sample: bool
class DemandResult(BaseModel):   here: CityDemand | None; cities: list[CityDemand]
class SearchResult(BaseModel):
    skills: list[Skill]
    matched_by: Literal["skills", "words", "qualification", "none"]
    first: ServiceKind
    first_basis: Literal["stated_skill", "profile_skill", "wants_to_learn", "default"]
    area: AreaLabel | None
    assessment: ServiceGroup; training: ServiceGroup; demand: DemandResult
    sample_data: list[SampleKind]
    travel_detail: Literal["estimate", "modeled"]; policy_version: str; checked_at: datetime
```

- `explore.read_skills(session, query: str) -> SkillsResult`
- `explore.search(session, request: SearchRequest, *, linked_profile: dict | None, embedder, client: routing.RouteClient | None, routes_cache: routing.RouteCache, settings: Settings, now: datetime | None = None) -> SearchResult`
- `POST /api/v1/explore/skills` and `POST /api/v1/explore/search`, no sign-in needed.

**Rules for `read_skills`:** `skills` from `skills_lexicon.find_skills`; `places` from `places.search(query, limit=2)`.

**Rules for `search`:**
1. **Which qualifications.** In this order:
   - `qualification_code` given: that one, `strong`, `matched_by="qualification"`. Unknown or inactive: 404.
   - Skills (the `skills` keys when given, otherwise `find_skills(query)`): the qualifications they link to. Strength is `strength_from_skills` of how many found skills point to each. `matched_by="skills"`.
   - Otherwise the existing matcher on the query: `analysis.match_evidence(session, query, Profile(), embedder, limit=5, mode=pathway_input.matching_mode(query))`. Strength is `strength_from_score`; `reason` is the match's reason. `matched_by="words"`.
   - Nothing found: `matched_by="none"`, no cards, no demand.
   - At most 5 qualifications: strong before good, then more skills first, then the matcher's order.
2. **Centers.** For each qualification and each kind, the candidates of Task 7 with the rounded origin, each built with `center_option`, ordered by `center_order`. A card keeps the first 5 and counts `near` (`is_near`) and `unmapped`. A qualification with no candidate of a kind has no card in that group.
3. **Related.** A group whose cards have `near == 0` throughout, with an origin, gets `related_near` for its first card's qualification.
4. **Which group first.**
   - The query has a learn phrase (`wants_to_learn`): `training`, `wants_to_learn`.
   - Otherwise, skills were found or given: `assessment`, `stated_skill`.
   - Otherwise, a signed-in learner's linked TSP profile names a skill that points to a shown qualification (`find_skills` over its `skills`, `experience`, `qualifications` and `credentials` labels): `assessment`, `profile_skill`.
   - Otherwise: `training`, `default`.
5. **Demand.** The skill keys are the found skills'; when matched by words or by qualification, `skills_for_qualifications` of the shown ones. Take `job_demand.for_skills(...)` and group it by city. A city's level is its highest; its jobs are its titles at that level, at most 3; `sub_label` is the province, or the region's name without one. `here` is the learner's city (from `areas_at`), at any level, or `None`. `cities` are the other cities at `high` or `growing`: with an origin, those within `explore_far_km` first, then high before growing, then nearest; without one, high before growing, then by name. At most 5.
6. `area`, `sample_data` and the rounding of the origin are as in Task 8. Without an origin there are no distances, no travel times, no `area` and no `here`.
7. `travel_detail` answers `estimate` until Task 10.

- [ ] **Step 1: Write the failing tests.** `test_skills_route_reads_skills_and_places`; `test_screens_example_gives_housekeeping_strong_and_food_service_good`; `test_edited_skills_replace_the_ones_read_from_the_query`; `test_words_fall_back_to_the_matcher_with_its_reason`; `test_no_match_returns_no_cards_and_says_so`; `test_qualification_link_shows_that_qualification_alone`; `test_unknown_qualification_is_404`; `test_request_needs_a_query_skills_or_a_qualification` (422); `test_each_card_lists_its_centers_nearest_first`; `test_card_without_a_near_center_shows_its_closest_and_counts_unmapped`; `test_group_with_nothing_near_offers_related_qualifications`; `test_stated_skill_puts_assessment_first`; `test_wanting_to_learn_puts_training_first`; `test_signed_in_profile_skill_puts_assessment_first_for_a_qualification_link`; `test_guest_request_ignores_other_learners_profiles`; `test_both_groups_are_returned_whichever_is_first`; `test_demand_here_can_be_low_and_cities_are_high_or_growing`; `test_cities_within_reach_come_before_far_ones`; `test_search_without_an_origin_has_no_distances`; `test_open_scholarship_shows_on_a_training_center`; `test_response_holds_no_origin_and_no_query`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them, with `test_explore_nearby.py`, `test_analysis_api.py`, `test_tsp_auth_api.py` and `backend/tests/unit/test_openapi_schema.py`.**
- [ ] **Step 5: Commit:** `feat(explore): search by what a learner can do: qualifications, nearest centers and demand`.

### Task 10: Modeled travel time for the first centers

**Files:**
- Modify: `backend/tesda_track/services/explore.py`, `backend/tesda_track/routers/explore.py`
- Test: `backend/tests/test_explore_travel.py`

**Interfaces:**
- Consumes `service_access.compare(request, sites, client, routes_cache)` and `AccessSite`; `routes.route_client`, `routes.route_cache`, `request.app.state.route_limits`.

**Rules:**
- Only when `travel_detail == "modeled"`, there is an origin, and a router is configured.
- Take the first center of each of the first `settings.explore_modeled_top_n` cards in each group, leaving out any beyond `explore_far_km` (8 sites at most, the comparison's own bound), and compare them in one call, by car. Co-located sites share one router request, as `compare` already does.
- A result with status `modeled_route` replaces that center's minutes with `round(duration_min)` and its basis with `modeled`. Every other status leaves the estimate. Then each card's centers are re-ordered with `center_order`.
- The response's `travel_detail` is `modeled` when at least one center has a modeled time, otherwise `estimate`.
- The modeled path counts against the per-address route limit and answers 429 with `Retry-After`, as `/recommendations/service-access` does. The estimate path sends nothing to the router and has no route limit.

- [ ] **Step 1: Write the failing tests.** Override `routes.route_client` with a `RouteClient` on an `httpx.MockTransport`, as `test_service_access_api.py` does. `test_modeled_time_replaces_the_estimate_and_can_reorder_a_card`; `test_router_failure_keeps_estimates_and_answers_200`; `test_only_the_first_center_of_the_first_cards_is_routed` (count the transport's requests); `test_centers_beyond_the_far_distance_are_not_routed`; `test_no_router_configured_answers_estimates`; `test_estimate_detail_sends_nothing_to_the_router`; `test_router_sees_the_rounded_origin_only`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them, with `test_explore_search.py` and `backend/tests/unit/test_service_access.py`.**
- [ ] **Step 5: Commit:** `feat(explore): modeled road times for the first centers, estimates for the rest`.

### Task 11: Anonymous counters, events and a report

**Files:**
- Create: `backend/migrations/versions/0031_explore_daily_stat.py`, `backend/tesda_track/services/explore_stats.py`
- Modify: `backend/tesda_track/models/stats.py`, `backend/tesda_track/models/__init__.py`, `backend/tesda_track/schemas/explore.py`, `backend/tesda_track/routers/explore.py`, `backend/tesda_track/routers/reports.py`, `backend/tesda_track/schemas/reports.py`
- Test: `backend/tests/test_explore_stats.py`

**Interfaces:**
- `EXPLORE_EVENTS = ("search", "no_match", "shown", "none_near", "call", "email", "directions", "apply", "find_jobs", "helpful_yes", "helpful_no", "report_qualification", "report_center", "report_location", "report_other")`
- `ExploreDailyStat`, table `explore_daily_stat`: primary key `(date, qualification_code, region_code, event)`, `count`. A missing qualification or region is stored as `"-"`. `event` is checked against `EXPLORE_EVENTS`.
- `explore_stats.count(event: str, qualification_code: str | None, region_code: str | None) -> None`: one upsert on its own short session, best effort, in the style of `match_stats.count`.
- `ExploreEventRequest(event, qualification_code: str | None = None, region_code: str | None = None)`, `extra="forbid"`.
- `POST /api/v1/explore/events`, answers 204. It accepts every event except `search`, `no_match`, `shown` and `none_near`. It is limited per address with `app.state.feedback_limits` and `settings.feedback_rate_limit_per_minute`.
- `GET /api/v1/admin/reports/explore` (the existing `reports:read` permission and `DateRange`): `{totals: dict[str, int], near_share: float | None, by_qualification_region: [{qualification_code, region_code, shown, none_near}]}`, the 50 busiest pairs.

**Rules:**
- `search` counts on the estimate path only, under the learner's region: one `search`, or one `no_match` when nothing matched; then, for each shown qualification, one `shown`, and one `none_near` when none of its cards has a near center.
- `near_share = 1 - none_near / shown`, or `None` when `shown` is 0.
- The table holds dates, codes and counts. No text, no coordinates, no learner.

- [ ] **Step 1: Write the failing tests.** `test_a_search_counts_once_and_each_qualification_shown`; `test_modeled_follow_up_is_not_counted_again`; `test_no_match_is_counted_as_such`; `test_qualification_with_nothing_near_is_counted`; `test_event_route_accepts_taps_and_feedback`; `test_event_route_refuses_server_only_events` (422); `test_missing_region_is_stored_as_dash`; `test_report_needs_permission_and_gives_the_near_share`; `test_counter_failure_never_breaks_a_search`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** Follow how `test_goal_origin.py` tests the existing counters.
- [ ] **Step 4: Run them, with `test_reports.py` and `test_migration_release.py`.**
- [ ] **Step 5: Commit:** `feat(stats): count searches, qualifications shown, centers found nearby, and actions`.

---

## Phase C: The map page (screens 1 to 6)

Build each state to its screen in section 1A, with the differences listed there.

### Task 12: API types, this tab's state, and copy

**Files:**
- Regenerate: `frontend/openapi.json`, `frontend/src/api/schema.d.ts` (`npm run api:types` in `frontend/`)
- Create: `frontend/src/features/explore/exploreApi.ts`, `exploreStore.ts`, `origin.ts`, `format.ts`
- Modify: `frontend/src/copy/en.ts`
- Test: `exploreApi.test.ts`, `exploreStore.test.ts`, `origin.test.ts`, `format.test.ts`

**Interfaces:**

```ts
// origin.ts: never persisted
export interface Origin { latitude: number; longitude: number; label: string; source: 'device' | 'place' | 'profile' }
export const useOriginStore: UseBoundStore<StoreApi<{ origin: Origin | null; setOrigin: (origin: Origin | null) => void }>>
export type DeviceError = 'denied' | 'unavailable' | 'unsupported'
export function devicePoint(): Promise<{ latitude: number; longitude: number }>   // rounded to 2 decimals; rejects with a DeviceError

// exploreApi.ts
export type NearbyResult = components['schemas']['NearbyResult']
export type SearchResult = components['schemas']['SearchResult']
export type SkillsResult = components['schemas']['SkillsResult']
export type CenterOption = components['schemas']['CenterOption']
export type QualificationCardData = components['schemas']['QualificationCard']
export type CityDemand = components['schemas']['CityDemand']
export type ExploreEvent = components['schemas']['ExploreEventRequest']['event']
export interface Asked { query: string | null; skills: string[] | null; qualification: string | null }
export const nearbyQuery: (origin: Origin, limit: number) => UseQueryOptions<NearbyResult, ApiError>
export const skillsQuery: (query: string) => UseQueryOptions<SkillsResult, ApiError>
export const searchQuery: (asked: Asked, origin: Origin | null, detail: 'estimate' | 'modeled', learnerId: string | null) => UseQueryOptions<SearchResult, ApiError>
export function recordEvent(event: ExploreEvent, qualification: string | null, region: string | null): void   // failures are ignored

// exploreStore.ts: sessionStorage, key 'tesda-track.explore'
export type View = 'all' | 'assess' | 'train' | 'demand'
interface ExploreState {
  draft: string                    // the box's text
  asked: Asked | null              // the search on screen
  recent: string[]                 // at most 3, newest first, without repeats
  setDraft(text: string): void
  ask(asked: Asked): void          // a typed query also goes to `recent`
  clear(): void                    // back to the default panel; `recent` stays
  reset(): void                    // everything, e.g. on sign-out
}

// format.ts
export function mapId(center: Pick<CenterOption, 'kind' | 'site_id'>): string          // "training-12"
export function tripLine(center: CenterOption, copy): string                           // "2.8 km · about 10 min by car · Quezon City"
export function skillWords(names: readonly string[], copy): string                     // "dishwashing and cleaning": the first two, lower case
export function toMapCenter(center: CenterOption, regions): Center                     // the old page's Center, for CenterMap
```

**Rules:**
- `searchQuery` and `nearbyQuery` send the origin in the body only; `staleTime` one minute; no retry on 422.
- `skillsQuery` is used with a 250 ms debounce and at least 2 characters.
- The view (`all`, `assess`, `train`, `demand`) and the selected item live in the address (Task 13), not here.
- `tripLine`: without a distance, the city alone; without a travel time, "{km} km · {city}"; an estimated time reads "about {n} min by car"; the estimate is explained once by the times note, not on every line.
- Copy, in a new `en.explore`. Wording from the screens is used as drawn except where section 1A says otherwise; all of it is for the Product Owner to approve. Later tasks use these keys.

```ts
search: {
  placeholder: 'Type what you can do', label: 'What can you do?', menu: 'Menu', clear: 'Clear search',
  hint: 'Type in Filipino or English. Describe what you can do, not a job title.',
  skillsFound: 'Skills we found in your search',
  showAll: 'Show trainings and jobs on the map',
  certify: (skills: string) => `Get certified: assessment for ${skills}`,
  certifyHint: 'You already have the skill · assessment centers near you',
  train: (skills: string) => `Train: qualifications for ${skills}`,
  trainHint: 'Want to learn first? · training centers and scholarships',
  work: (skills: string) => `Work: where ${skills} jobs are in demand`,
  workHint: 'Cities where your skills are in demand',
  place: 'Go to this place', recent: 'Recent search',
},
chips: { training: 'Training centers', assessment: 'Assessment centers', demand: 'In demand jobs' },
location: {
  share: 'Share my location',
  off: 'Off. Nothing is shared until you turn this on.',
  on: (place: string) => `On · Near ${place} (approximate)`, onNoPlace: 'On · approximate',
  fromPlace: (place: string) => `Near ${place}`, fromProfile: (place: string) => `Near ${place} (from your TSP profile)`,
  emptyHeading: 'See what is near you',
  emptyBody: 'Turn on location sharing to see the nearest training and assessment centers, and the jobs in demand in your area.',
  emptyNote: 'Location stays off until you turn it on. You can still search without it, or type a city.',
  rounded: 'Your location is rounded to about 1 km and is not saved.',
  errors: { denied: …, unavailable: …, unsupported: … },   // reuse the wording of en.training.filters.locationErrors
},
nearby: {
  eyebrow: (place: string) => `Near you · ${place}`,
  training: 'Nearest training centers', assessment: 'Nearest assessment centers',
  jobs: 'Jobs in demand in your city', seeAll: 'See all',
  offers: (name: string, more: number) => (more > 0 ? `${name} +${more} more` : name),
  area: (place: string) => `${place} area`,
},
levels: { high: 'High demand', growing: 'Growing', low: 'Low demand' },
results: {
  readAs: 'We read your search as these skills', editSkills: 'Edit skills',
  tabs: { all: 'All', assess: (n: number) => `Assess · ${n}`, train: (n: number) => `Train · ${n}`, demand: (n: number) => `Demand · ${n}` },
  noMatch: 'We couldn’t find a clear match. Try describing something you can do, like “marunong ako magluto”.',
  certifyFirst: { heading: 'Get certified: you already have the skill',
                  body: 'Apply at an assessment center to test your skill and earn a National Certificate (NC).' },
  trainSecond: { heading: 'Want to learn first? Training centers',
                 body: 'New to this, or want to improve? Train at a center. Scholarships may cover the fee.' },
  trainFirst: { heading: 'Train: build the skill', body: 'Train at a center. Scholarships may cover the fee.' },
  certifySecond: { heading: 'Already have the skill? Get certified',
                   body: 'An assessment center tests your skill for a National Certificate (NC).' },
  strength: { strong: 'Strong match', good: 'Good match' },
  tests: (skills: string) => `Tests ${skills} skills`, uses: (skills: string) => `Uses your ${skills} skills`,
  scholarship: 'Scholarship open',
  moreNear: (n: number, km: number) => `${n} more within ${km} km`,
  noneNear: (km: number, closest: number) => `No center within ${km} km. The closest is ${closest} km away.`,
  unmapped: (n: number) => `${n} more ${n === 1 ? 'center has' : 'centers have'} no map location yet.`,
  related: 'Related qualifications offered nearby', readiness: 'Check my readiness (optional)',
  needPlace: 'Share your location or type a city to see what is nearest.',
},
card: {
  assessment: 'Assessment center · Get certified', training: 'Training center · Train', demand: 'Job demand · Work',
  from: (km: number) => `${km} km from you`, about: (km: number) => `about ${km} km from you`,
  leadsToNc: 'Leads to a National Certificate (NC)',
  apply: 'Apply for assessment', applyNote: 'Opens Assessment in TSP. You sign in with your TESDA Skills Passport.',
  directions: 'Directions', call: 'Call', email: 'Email', details: 'Details', close: 'Close',
  findJobs: (city: string) => `Find jobs in ${city}`, findJobsNote: 'Opens Find Jobs in TSP. You sign in with your TESDA Skills Passport.',
  showCenters: 'Show centers there',
},
demand: {
  heading: 'Work: where your skills are in demand', body: 'Cities where jobs that match your skills are in demand.',
  lowHere: (place: string) => `Near you (${place}): low demand`,
  lowBody: (jobs: string) => `Low demand for ${jobs} here. Demand is higher in these cities.`,
  noneHere: (place: string) => `No demand information for ${place} yet.`,
  outside: 'outside this map',
  notJobs: 'Demand shows how much a skill is needed in an area. It is not a list of job openings.',
},
notes: {
  sample: 'Demand and scholarships are sample data for demonstration, not TESDA records.',
  times: 'Travel times for the first centers follow the road network; the rest are estimated from distance. None include traffic.',
  automatic: 'These results come from automatic matching.',
  confirm: 'This is a suggestion. Confirm with the center or your TESDA office.',
},
feedback: {
  question: 'Was this helpful?', yes: 'Yes', no: 'No', thanks: 'Thank you. This helps us improve.',
  report: 'Report a wrong suggestion',
  reasons: { qualification: 'Wrong qualification', center: 'A center is wrong or closed',
             location: 'Distance or travel time is wrong', other: 'Something else' },
},
```

- [ ] **Step 1: Write the failing tests.** `sends the origin in the body, never the address`; `keeps estimate and modeled answers apart in the cache`; `rounds a device location to two decimals`; `turns a refused location into "denied"`; `ignores a failed event`; `keeps three recent searches, newest first, without repeats`; `never persists the origin`; `builds "2.8 km · about 10 min by car · Quezon City"`; `builds the trip line without a time, and without a distance`; `joins the first two skills as "dishwashing and cleaning"`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Regenerate the types, then implement.**
- [ ] **Step 4: Run them, with `npx tsc -b` and `npm run api:types -- --check`.**
- [ ] **Step 5: Commit:** `feat(explore): requests, this tab's state and copy for the map-first page`.

### Task 13: The page at `/training`, and the map's new options (screen 1)

**Files:**
- Create: `frontend/src/features/explore/ExplorePage.tsx`, `SearchBox.tsx`
- Modify: `frontend/src/components/Layout.tsx` (add `MapLayout`), `frontend/src/paths.ts`, `frontend/src/routes.tsx`, `frontend/src/components/Nav.tsx`, `frontend/src/copy/en.ts`, `frontend/src/features/help/tours.ts`, `frontend/src/features/training/CenterMapTypes.ts`, `CenterMapLibre.tsx`, `CenterMapLeaflet.tsx`, `maplibre/layers.ts`, `maplibre/markers.ts`
- Test: `ExplorePage.test.tsx`, `frontend/src/components/Nav.test.tsx`, `Layout.test.tsx`, `frontend/src/features/training/CenterMapLibre.test.tsx`, `CenterMap.test.tsx`, `maplibre/layers.test.ts`; and every test that opens the old page at `/training` (`TrainingPage.test.tsx`, `tests/e2e/training.spec.ts`, `recommendations.spec.ts`, `skills.spec.ts`, `account.spec.ts`, `help.spec.ts`, `shell.spec.ts`, `finder.spec.ts`)

**Interfaces:**
- `paths.trainingBrowse = '/training/browse'`: the old `TrainingPage`, in `AppLayout`, page key `trainingBrowse` (`title: 'Browse all centers · TESDA-TRACK'`, `heading: 'Browse all centers'`).
- `paths.training` (`/training`) now renders `ExplorePage` in `MapLayout`. Its page copy becomes `title: 'Find training and assessment centers · TESDA-TRACK'`, `heading: 'Find training and assessment centers'` (the `h1`, visually hidden).
- `/tsp/webview/training` keeps the old page, unchanged.
- `MapLayout`: the full viewport, no sidebar and no footer. It keeps the skip link, `useFocusOnNavigation`, the notices and the first-visit privacy notice.
- The address holds `type` (`assessment`, `training` or `demand`; absent is All), `center` (`training-12`), `area` (a selected city's key), and reads `qualification` and `q` once on arrival. It never holds the learner's query or location.
- `CenterMapProps` adds, all optional, so the old page and Skills Explorer don't change:

```ts
/** false: the map shows no popup of its own; the page shows its own card for `selectedId`. Default true. */
popup?: boolean
/** Each pin's name beside it. */
pinLabels?: boolean
/** Cities to mark with a demand chip. */
areas?: readonly { id: string; label: string; level: 'high' | 'growing' | 'low'; latitude: number; longitude: number }[]
selectedAreaId?: string | null
onPickArea?: (id: string) => void
```

**Rules:**
- **Layout (screen 1):** the map fills the page. Over it: the search box top left (400 px wide), the three chips beside it, the account button top right (Task 20; empty until then), the map's own controls bottom right. On a phone: the box and a row of chips that scrolls inside itself across the top, the map 45% of the screen's height, the panel's content below it.
- **The box:** a menu button, the input with `en.explore.search.placeholder`, and a clear button when there is text. The menu button opens the existing `MobileMenuDrawer` at every width.
- **The chips** are three toggle buttons tied to the address's `type`: pressing one shows that kind (its list and its pins); pressing it again returns to All.
- **Arriving with a link:** `?qualification=CODE` runs a search for that qualification; `?q=words` puts catalog words (never a learner's) in the box and runs them; both are then removed from the address. `?center=` selects that center once results hold it.
- **The map:** `CenterMap` with `popup={false}`, `pinLabels`, and the panel's width as `--map-overlay-inset` so pins and the camera keep clear of it. With no origin and no results it shows the whole Philippines and no pins.
- **Map options:** with `pinLabels`, MapLibre draws labels as a symbol layer (overlapping ones hide, the selected one stays) and Leaflet as permanent tooltips. With `areas`, both draw a warm chip at each city reading its label and level ("Taguig · Growing"), reachable with Tab and named "Makati City, High demand"; picking one calls `onPickArea`. With `popup={false}`, selecting a pin opens no popup. A map without these props renders as before.
- **Menu:** `Nav` lists Find centers (`/training`), Qualifications Library and Skills Explorer, then Browse all centers (`/training/browse`). Find my pathway and My Progress leave the menu; their pages and addresses stay. `en.nav.training` becomes `'Find centers'`, and `en.nav.trainingBrowse` is `'Browse all centers'`.
- Tours: the old page's tour moves with it to `/training/browse`; the new page has none.

- [ ] **Step 1: Write the failing tests.** `the map page has no sidebar and one h1`; `the menu button opens the menu`; `a chip sets the type in the address, and unsets it when pressed again`; `?qualification= searches for it and leaves the address`; `the learner's query never appears in the address`; `/training/browse shows the old page with its filters`; `the menu has Find centers and Browse all centers, and no Find my pathway or My Progress`; map tests: `draws a label for each pin with pinLabels`; `draws a chip per area and reports a pick`; `opens no popup with popup false`; `a map without the new props renders as before`. Move the old page's tests to `/training/browse`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** The panel's states are Tasks 14 to 17; until then the box alone shows.
- [ ] **Step 4: Run `npm test`, `npm run lint`, `npx tsc -b`, and `npx playwright test tests/e2e/training.spec.ts tests/e2e/shell.spec.ts`.**
- [ ] **Step 5: Commit:** `feat(explore): a map-first page at /training; the filter page moves to /training/browse`.

### Task 14: The default panel: location off and on (screens 2, 3)

**Files:**
- Create: `frontend/src/features/explore/DefaultPanel.tsx`
- Modify: `ExplorePage.tsx`
- Test: `DefaultPanel.test.tsx`, `ExplorePage.test.tsx`

**Interfaces:**
- `DefaultPanel({ onSearch, onSelectCenter }: { onSearch: (asked: Asked) => void; onSelectCenter: (id: string) => void })`
- Consumes `useOriginStore`, `devicePoint`, `nearbyQuery`.

**Rules:**
- The panel opens when the box takes focus with no text, and closes on Escape or a press outside it.
- **The location row** is always first: a switch "Share my location" with its state line. Turning it on asks the browser once, rounds the point, and sets the origin with source `device` and an empty label; the row then reads `on(place)` with the area's label from the nearby answer, or `onNoPlace` without one. Turning it off removes the origin, the nearby lists and their pins at once.
- The page never asks the browser for a location by itself. A refusal shows its reason and leaves the switch off.
- An origin from a typed place or a profile (Tasks 15, 20) shows as `fromPlace` or `fromProfile` with the switch off; turning the switch on replaces it.
- **No origin (screen 2):** the empty state, with the rounding note.
- **With an origin (screen 3):** the eyebrow, then three lists from `nearbyQuery(origin, 2)`: nearest training centers, nearest assessment centers, and jobs in demand in your city. A center row shows its name and "{km} km · about {n} min by car · {offers}". A job row shows its title, setting, area and level badge. A list with nothing is left out.
- "See all" on a center list asks for 25 and sets the matching chip. "See all" on jobs lists the city's jobs.
- Pressing a center selects its pin and opens its card (Task 16). Pressing a job searches for its title.
- The nearby centers are the map's pins while this panel is the state on screen.
- The sample note shows under the lists when the answer has sample data.

- [ ] **Step 1: Write the failing tests.** `location is off at first and nothing is asked of the browser`; `turning it on shows the three lists and the area's name`; `turning it off removes the lists, the pins and the origin`; `a refused location explains and stays off`; `a center row reads "2.1 km · about 8 min by car · Housekeeping NC II +3 more"`; `See all asks for more and sets the chip`; `pressing a job searches for its title`; `shows the sample note with sample data`; `leaves out an empty list`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test -- src/features/explore`, lint and `tsc`.**
- [ ] **Step 5: Commit:** `feat(explore): share a location to see the nearest centers and jobs in demand`.

### Task 15: Typing: skills found and shortcuts (screen 4)

**Files:**
- Create: `frontend/src/features/explore/SuggestList.tsx`
- Modify: `SearchBox.tsx`, `ExplorePage.tsx`
- Test: `SuggestList.test.tsx`, `ExplorePage.test.tsx`

**Interfaces:**
- `SuggestList({ query, result, recent, onAsk, onPlace }: { query: string; result: SkillsResult | undefined; recent: readonly string[]; onAsk: (asked: Asked, view: View) => void; onPlace: (place: PlaceMatch) => void })`

**Rules:**
- With text in the box, the panel shows, in order:
  1. "Skills we found in your search" and a chip per skill, when any were found.
  2. The query itself with `showAll`: searches, view All.
  3. Only with skills found, three shortcuts built with `skillWords`: Get certified (view Assess), Train (view Train), Work (view Demand).
  4. A row per matching place with `place`: sets the origin to it (source `place`), moves the map there and empties the box.
  5. Up to three recent searches that differ from the text.
  6. The hint line.
- Enter runs row 2. The rows form one list reachable with the arrow keys from the input, with the active row announced (a react-aria `ComboBox` that allows any text, or the same behavior).
- Suggestions are asked 250 ms after the last keystroke, from 2 characters. While they load, rows 2, 5 and 6 already show. A failed request leaves them usable.
- Running a search closes the list, keeps the text in the box, and records it in this tab's recent searches.

- [ ] **Step 1: Write the failing tests.** `shows the skills found as chips`; `Enter searches for the text and shows All`; `the Get certified shortcut opens the Assess view`; `shortcuts appear only with skills found`; `a place row moves the starting point there and never searches`; `lists recent searches, without the current text`; `arrow keys move through the rows`; `waits 250 ms after typing before asking`; `a failed suggestion request leaves search usable`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test -- src/features/explore`, lint and `tsc`.**
- [ ] **Step 5: Commit:** `feat(explore): read skills as the learner types, with shortcuts to certify, train or work`.

### Task 16: Results: Assess and Train, and the center card (screen 5)

**Files:**
- Create: `frontend/src/features/explore/ResultsPanel.tsx`, `QualificationCard.tsx`, `MapCard.tsx`, `frontend/src/components/SampleDataNote.tsx`
- Modify: `ExplorePage.tsx`, `backend/tesda_track/config.py`, `schemas/meta.py`, `routers/meta.py`, `.env.example`, `docker-compose.yml`; regenerate the API types
- Test: `ResultsPanel.test.tsx`, `QualificationCard.test.tsx`, `MapCard.test.tsx`, `backend/tests/unit/test_client_config_api.py`

**Interfaces:**
- `Settings.tsp_assessment_url: str = ""` (`TSP_ASSESSMENT_URL`), a template with `{qualification}`. `ClientConfig` gains `tsp_assessment_url: str = ""`, `explore_near_km: float = 25` and `explore_far_km: float = 100`.
- `ResultsPanel({ result, view, onView, onSelectCenter, onSelectArea, onEditSkills })`
- `QualificationCard({ card, kind, selectedId, nearKm, onSelectCenter })`
- `MapCard({ item, onClose })`, where `item` is `{ type: 'center'; center: CenterOption; qualifications: string[] }` or `{ type: 'area'; city: CityDemand }` (the second is Task 17).
- `tspLink(template: string, values: Record<string, string>): string | null` in `MapCard.tsx`: null for an empty template; values are URL-encoded.

**Rules:**
- Two requests: the estimate first, then, when `config.routing_enabled` and there is an origin, the modeled one. The panel shows the modeled answer once it arrives and the estimate until then. A failed modeled request changes nothing on screen.
- **Top:** "We read your search as these skills", the chips, and "Edit skills": each chip gains a remove button, and removing one searches again with the remaining keys. With `matched_by` other than `skills`, this block is left out.
- **Tabs:** All, Assess · n, Train · n, Demand · n, where n is each group's cards and the demand cities. The tabs and the top chips are the same choice (the address's `type`).
- **Sections:** the group named by `first` comes first, under `certifyFirst` or `trainFirst`; the other follows under `trainSecond` or `certifySecond`. All shows both and the demand notice (Task 17). Neither group is ever hidden from All.
- **A card:** the qualification's name, its strength badge, a line (`tests(skillWords)` for assessment, `uses(skillWords)` for training; the matcher's `reason` when matched by words), then its nearest center as a row: the kind's icon, the name, `tripLine`, and the "Scholarship open" tag. "{n} more within 25 km" opens up to four more rows. When `near` is 0 and there is an origin, `noneNear` shows above the closest. `unmapped` shows when above 0. "Check my readiness (optional)" starts the finder with the qualification's name as the goal, as the Library's card does today.
- A group with `related` lists them under the cards; choosing one searches for that qualification.
- **No origin:** `needPlace` shows above the groups; rows show the city alone.
- **No match:** `noMatch` and the search hint replace the groups.
- **Pins:** every center in the shown groups. Selecting a row selects its pin, and the reverse; the address's `center` follows.
- **The center card (bottom of the map, clear of the panel; above the list on a phone):** the eyebrow by kind; the name; "{city} · {km} km from you · about {n} min by car"; chips for the qualifications it was listed under, then "Leads to a National Certificate (NC)" for assessment or "Scholarship open" for training; a small source and date line (the existing `DataProvenance`).
- **Its actions:** for assessment, "Apply for assessment" opens `tspLink(config.tsp_assessment_url, …)` in a new tab with `applyNote`, only when the template is set. Then Directions (draws the route when routing is on and the origin is the learner's shared location; otherwise opens `googleMapsDirections`), Call (`tel:`), Email (`mailto:`), and Details (`/training/browse` filtered to that center and qualification). An action without its data is left out. Escape and the close button close the card.
- While the first answer loads, show a status line. A failed request offers a retry and keeps the query.

- [ ] **Step 1: Write the failing tests.** `puts Get certified first for a stated skill, and Train first for someone who wants to learn`; `shows both groups under All`; `a card shows its strength, its line and its nearest center`; `"3 more within 25 km" opens more rows`; `says when no center is within 25 km and shows the closest`; `shows the unmapped line`; `tags a training center with an open scholarship`; `prompts for a location when there is none`; `says there is no clear match`; `removing a skill chip searches again without it`; `selecting a row opens the center's card and sets the address`; `the card hides Apply for assessment without a TSP address, and encodes the qualification in it`; `the card leaves out Call when there is no phone`; `the card shows the center's source and date`; `shows the estimate first, then the modeled answer`; `keeps the estimate when the modeled request fails`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the frontend tests, the client-config test, lint and `tsc`.**
- [ ] **Step 5: Commit:** `feat(explore): qualifications that fit, each with its nearest centers, and a card for the one chosen`.

### Task 17: Demand: cities, the notice and the city card (screen 6)

**Files:**
- Create: `frontend/src/features/explore/DemandList.tsx`, `DemandNotice.tsx`
- Modify: `ResultsPanel.tsx`, `MapCard.tsx`, `ExplorePage.tsx`, `backend/tesda_track/config.py`, `schemas/meta.py`, `routers/meta.py`, `.env.example`, `docker-compose.yml`; regenerate the API types
- Test: `DemandList.test.tsx`, `DemandNotice.test.tsx`, `MapCard.test.tsx`, `backend/tests/unit/test_client_config_api.py`

**Interfaces:**
- `Settings.tsp_find_jobs_url: str = ""` (`TSP_FIND_JOBS_URL`), a template with `{city}` and `{jobs}`. `ClientConfig.tsp_find_jobs_url: str = ""`.
- `DemandList({ demand, selectedId, onSelect, inView })`, where `inView: (city: CityDemand) => boolean` says whether the city is on the map now.
- `DemandNotice({ here })`

**Rules:**
- **The Demand view:** the heading and body, the notice, then a row per city: its name, its jobs joined with " · ", its `sub_label` (with "· outside this map" when the city is not in the map's view), and its level badge. Then `notJobs` and the sample note.
- **The notice:** when `here` is `low`: `lowHere` and `lowBody` with its jobs. When there is an origin and no `here`: `noneHere`. Otherwise nothing. It also shows once at the top right of the map in the All view, and can be dismissed.
- **Pins:** the cities as the map's `areas`. In the Demand view the center pins are hidden; in All both show.
- Selecting a city selects its chip, moves the map to it when it is outside the view, and opens its card; the address's `area` follows.
- **The city card:** the eyebrow; the city; "{sub_label} · about {km} km from you" (the sub-label alone without an origin); chips for its level and its jobs; the sample tag.
- **Its actions:** "Find jobs in {city}" opens `tspLink(config.tsp_find_jobs_url, …)` in a new tab with `findJobsNote`, only when the template is set. "Show centers there" sets the origin to the city (source `place`), returns to the All view and keeps the search. TESDA-TRACK lists no jobs itself.

- [ ] **Step 1: Write the failing tests.** `lists cities with their jobs and level`; `marks a city outside the map's view`; `the notice says demand is low here and names the jobs, without the words "openings" or "hiring"`; `no notice when demand here is high`; `selecting a city opens its card and sets the address`; `the Demand view hides center pins`; `"Show centers there" moves the starting point and returns to All`; `hides Find jobs without a TSP address, and encodes the city in it`; `shows the sample tag and the not-jobs line`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the frontend tests, the client-config test, lint and `tsc`.**
- [ ] **Step 5: Commit:** `feat(explore): cities where a learner's skills are in demand, with a link to TSP Find Jobs`.

### Task 18: Standing notes, feedback and counted actions

**Files:**
- Create: `frontend/src/features/explore/PanelNotes.tsx`, `ExploreFeedback.tsx`
- Modify: `ResultsPanel.tsx`, `MapCard.tsx`
- Test: `PanelNotes.test.tsx`, `ExploreFeedback.test.tsx`, `MapCard.test.tsx`

**Rules:**
- Under every result list: the sample note when the answer has sample data, the times note when any center has a travel time, the automatic-matching line, the confirm line and the rounding note.
- Then "Was this helpful?" with Yes and No. One answer per search; then a thank-you line.
- "Report a wrong suggestion" opens four reasons. Choosing one sends it. There is no free-text box, so nothing a learner types is kept.
- Apply for assessment, Directions, Call, Email and Find jobs each send their event when pressed, with the card's qualification and the area's region.
- Events are fire-and-forget. A failed event never blocks the action or shows an error.

- [ ] **Step 1: Write the failing tests.** `shows the sample note only with sample data`; `always shows the automatic and confirm lines`; `sends helpful_yes once, then thanks`; `sends the chosen report reason`; `Call sends "call" and still opens the dialer link`; `a failed event shows no error`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test -- src/features/explore`, lint and `tsc`.**
- [ ] **Step 5: Commit:** `feat(explore): standing notes, "Was this helpful?", report a wrong suggestion, and counted actions`.

---

## Phase D: Demonstration sign-in with synthetic TSP profiles

### Task 19: Synthetic profiles in the database

**Files:**
- Create: `backend/tesda_track/services/demo_tsp_profiles.py`, `backend/seed/sample_tsp_profiles.example.json`
- Modify: `backend/tesda_track/config.py`, `backend/tesda_track/cli.py`, `backend/tesda_track/services/tsp_sign_in.py`, `backend/tesda_track/routers/tsp_auth.py`, `backend/tesda_track/schemas/tsp_auth.py`, `schemas/meta.py`, `routers/meta.py`, `.env.example`, `docker-compose.yml`, `.gitignore` (add `backend/seed/sample_tsp_profiles.json`)
- Test: `backend/tests/test_demo_tsp_profiles.py`, `backend/tests/unit/test_client_config_api.py`

**Interfaces:**
- `Settings.demo_tsp_profiles_enabled: bool = False` (`DEMO_TSP_PROFILES_ENABLED`). `ClientConfig.demo_tsp_sign_in: bool = False`.
- `SampleTspProfile(email: NormalizedEmail, password: NewPassword, profile: TrackerProfile)`, `extra="forbid"`.
- `demo_tsp_profiles.SUBJECT_PREFIX = "synthetic:"`
- `demo_tsp_profiles.seed(session, entries: list[SampleTspProfile]) -> dict[str, int]`, returning `{"created": n, "skipped": n}`.
- CLI `python -m tesda_track.cli seed-tsp-profiles --file PATH`. It refuses to run unless `demo_tsp_profiles_enabled`.
- `tsp_sign_in.linked_identity(session, learner) -> LearnerIdentity | None`.
- `TspProfile` adds `home_area: str | None` and `is_sample: bool = False`.

**Rules:**
- Each entry becomes a `Learner` (role `learner`, the email and a hashed password, the name from the profile) and a `LearnerIdentity` with provider `tsp`, subject `synthetic:{sso_id}`, and `profile = tsp_sign_in.kept_profile(entry.profile)`. So a synthetic profile keeps exactly what a real TSP sign-in would keep.
- An existing email is skipped, never changed. Duplicate emails or `sso_id`s in the file are an error before anything is written.
- Sign-in is the existing `POST /api/v1/auth/session`. No new sign-in route.
- `GET /api/v1/auth/tsp/profile` answers when `tsp_sign_in_enabled` or `demo_tsp_profiles_enabled`. `home_area` is the kept municipality and province, joined with ", ". `is_sample` is true when the identity's subject starts with `synthetic:`.
- The example file holds one made-up profile (skills such as Cooking and Cleaning, a home in Quezon City, Metro Manila, NCR). The real file is not committed.

- [ ] **Step 1: Write the failing tests.** `test_seeded_profile_signs_in_with_its_password`; `test_profile_route_gives_home_area_and_marks_it_sample`; `test_only_kept_fields_are_stored` (a mobile number and birth date in the file are absent from the stored profile); `test_existing_email_is_skipped_not_changed`; `test_duplicate_entries_are_refused_before_writing`; `test_command_refuses_when_the_flag_is_off`; `test_profile_route_is_404_with_both_flags_off`; `test_client_config_reports_the_demo_sign_in`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them, with `test_tsp_auth_api.py`, `test_tsp_accounts.py`, `test_auth_cookie.py` and `test_cli.py`.**
- [ ] **Step 5: Commit:** `feat(tsp): synthetic TSP profiles for a demonstration sign-in`.

### Task 20: "Sign in with TSP" on the map page

**Files:**
- Create: `frontend/src/features/tsp/TspAccount.tsx`
- Modify: `frontend/src/auth/AuthProvider.tsx`, `useAuth.ts`, `AccountForms.tsx`, `frontend/src/features/account/AccountMenu.tsx`, `frontend/src/features/tsp/passport.ts`, `frontend/src/features/explore/ExplorePage.tsx`, `DefaultPanel.tsx`, `frontend/src/copy/en.ts`
- Test: `frontend/src/auth/AuthProvider.test.tsx`, `frontend/src/auth/guestOnly.test.tsx`, `frontend/src/features/account/AccountMenu.test.tsx`, `frontend/src/features/explore/DefaultPanel.test.tsx`, `frontend/tests/e2e/tsp-demo-sign-in.spec.ts`

**Interfaces:**
- `Auth.offersAccounts` becomes `learnerAccounts() || (learner !== null && learner.role !== 'learner')`.
- `Auth` adds `offersDemoSignIn: boolean`: the client config's `demo_tsp_sign_in`, while nobody is signed in.
- `useTspProfile()` in `passport.ts`: the signed-in learner's profile when their role is `learner` and the config has `tsp_sign_in` or `demo_tsp_sign_in`; idle otherwise.
- `TspAccount()`: the map page's top-right button.
- Copy, in `en.account.demo`: `signIn: 'Sign in with TSP'`; `note: 'Demonstration sign-in using sample TSP profiles. Real sign-in will come from the TSP app.'`; `tag: 'Sample TSP profile'`; `fromProfile: 'From your TSP profile'`.

**Rules:**
- **Signed out:** with `offersDemoSignIn`, the "Sign in with TSP" pill of screen 1. It opens the existing sign-in dialog with the demo note at its top. The dialog offers no way to create an account, as today. Without the flag, no button: guests just use the page.
- **Signed in with a sample profile:** the round "TSP" button of screen 5. It opens a small menu with the learner's name, the "Sample TSP profile" tag and Sign out.
- **The default panel, signed in:** when the profile's `home_area` resolves to exactly one place (through the skills request's `places`), it becomes the origin with source `profile`, unless the learner is sharing a location. Under the location row, "From your TSP profile" lists up to four of the profile's skills as chips; pressing one searches for it.
- Search already uses the signed-in learner's profile to decide which group comes first (Task 9).
- A signed-in learner with role `learner` is offered nothing that saves: no My Progress, no profile page, no "Save to profile".
- Staff sign-in at `/sign-in` and everything staff see are unchanged.
- Signing out clears this tab's explore state, the finder's work and the in-memory origin.

- [ ] **Step 1: Write the failing tests.** `offers Sign in with TSP only when the server turns it on`; `a signed-in sample profile shows the TSP button, its name and the sample tag, and no account menu`; `staff still get the account menu`; `the profile's home area becomes the starting point`; `sharing a location takes over from the profile's home area`; `profile skills show as chips that search`; `signing out clears the starting point and the search`; `a guest searches and opens a center without signing in` (end to end).
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test`, lint, `tsc`, and `npx playwright test tests/e2e/tsp-demo-sign-in.spec.ts tests/e2e/account.spec.ts tests/e2e/tsp-sign-in.spec.ts`.**
- [ ] **Step 5: Commit:** `feat(tsp): sign in with a sample TSP profile on the map page, labelled as a demonstration`.

---

## Phase E: Wording, checks and release

### Task 21: Home page, privacy notice and wording

**Files:**
- Modify: `frontend/src/copy/en.ts`, `frontend/src/copy/help.ts`, `frontend/src/features/home/Hero.tsx`, `ClosingGoal.tsx`, `data.ts`, `frontend/src/features/privacy/notice.ts`, `frontend/src/i18n/locales/*.ts` (remove overrides of changed strings)
- Test: `frontend/src/copy/wording.test.ts` (new), `frontend/tests/e2e/home.spec.ts`, `privacy.spec.ts`

**Rules:**
- Home says what the product now does, and its main button opens `/training`. Proposed hero, for the Product Owner to approve: title `['Find the TESDA center', 'near you.']`, lead `'Type what you can do. TESDA-TRACK shows the qualifications that fit, the nearest training and assessment centers, and where your skills are in demand.'`, button `'Find centers'`. The example console's steps become `['What you can do', 'Qualification', 'Centers', 'Demand']`, and the "four stops" section is rewritten to match. Home's closing goal box puts its text in the map page's box (`exploreStore.setDraft`) and opens `/training`. Nothing on Home promises a career plan, a readiness result or saved progress.
- The privacy notice gains: the location is off until turned on, rounded to about 1 km and not saved; what is typed is not stored, and recent searches stay in this tab; results come from automatic matching; demand and scholarships are sample data until TESDA's own are connected; signing in with a sample profile is a demonstration. `PRIVACY_NOTICE_VERSION` gets a new date, so the notice shows once more. The full policy remains a placeholder until legal review after December 2.
- "AI" appears nowhere on screen. The privacy text's "outside AI service" becomes "outside service".
- The words "openings", "vacancies" and "hiring" appear nowhere in `en.explore`.
- Every claim on screen is one the product supports: no job guarantee, no seat or schedule the data doesn't hold. The Product Owner approves the final list.

- [ ] **Step 1: Write the failing tests.** `no visible string says "AI"` (every string in `en.ts`, `help.ts` and each locale file, including what the copy functions return for sample arguments); `the explore copy never says openings, vacancies or hiring`; `the home hero names centers, and its button opens the map page`; `the privacy notice mentions rounding, automatic matching and sample data`; `a visitor who saw the old notice sees the new one once`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test`, lint, `tsc`, and the home and privacy end-to-end tests.**
- [ ] **Step 5: Commit:** `docs(copy): say what the product does now, and nothing it can't support`.

### Task 22: The whole page on a laptop and a phone, and the documents

**Files:**
- Create: `frontend/tests/e2e/explore.spec.ts`, `docs/map-first-center-finder.md`
- Modify: `README.md`, `docs/center-map.md` (the map's new options), `docs/superpowers/plans/2026-11-09-ai-driven-center-recommendation.md` (a note at the top: Tasks 5 to 8 are superseded by this plan), `docs/ai-driven-center-recommendation-spec.md` (a note: sample job demand now follows the 10 November document and the revised screens)

**Rules for the end-to-end test** (follow `recommendations.spec.ts` for how the API is prepared; the API it runs against needs `EXPLORE_INCLUDE_EXAMPLE_SITES=true` and the sample data loaded), at 1280×800 and at 390×844, one test per screen in section 1A:
1. The map page opens with the box, three chips, and no pins. Nothing has asked for a location.
2. The open panel says location is off.
3. With a granted location at Quezon City (Playwright's geolocation): the three lists and their pins; the area reads Quezon City.
4. Typing "Marunong ako maghugas": the chips Dishwashing, Laundry and Cleaning, and the three shortcuts.
5. Results: Get certified first; Housekeeping NC II as a strong match with its nearest assessment center, distance and travel time; selecting it opens the center's card with Directions.
6. The Demand view: the low-demand notice for Quezon City, Makati City at high demand, and its card with "Show centers there".
- Also: a search with no location lists cards without distances and the prompt; "Gusto kong matuto magluto" puts Train first; a search for `DRIVING-NC-III` by link says no center is within 25 km and shows the closest; words with no match say so.
- The page never scrolls sideways. There is one `h1`. axe finds no serious or critical issue in each state.
- With the map's script blocked, the panel still searches and lists.
- On a slowed connection (Playwright route delay), each state shows its status line and then its content.
- A reload keeps the search (this tab) and drops the location: the results show without distances.

**The document** covers: the page and its six states; the four endpoints with one request and response each; the word list and how to add to it; the policy and its settings; where sample data comes from and how it is labelled; the synthetic sign-in; the privacy behaviour; and the staging runbook (section 6).

- [ ] **Step 1: Write the end-to-end tests and see them fail where behaviour is missing.**
- [ ] **Step 2: Fix what they find.**
- [ ] **Step 3: Write the document and the notes.**
- [ ] **Step 4: Run everything once:** `./.venv/Scripts/python.exe -m pytest -q`; in `frontend/`, `npm test`, `npm run lint`, `npm run build`, `npm run api:types -- --check`, `npx playwright test`.
- [ ] **Step 5: Commit:** `test(e2e): the map-first page on a laptop and a phone`, then `docs: the map-first center finder and its runbook`.

---

## 4. Schedule and cut order

Thirteen working days remain, counting 12 November and treating 30 November (Bonifacio Day) as a holiday. The redesign made the page work larger than in the first plan, so this is tight.

| Dates | Work | Result |
|---|---|---|
| Thu 12 to Fri 13 Nov | Setup; Tasks 1 to 4 | Offerings, the word list, sample demand, places; sign-off requests sent |
| Mon 16 to Wed 18 Nov | Tasks 5 to 9 | Nearby and search answer for the demo's examples |
| Thu 19 to Fri 20 Nov | Tasks 10 to 13 | Modeled times, counters, the page shell at `/training` |
| Mon 23 to Wed 25 Nov | Tasks 14 to 17 | Screens 1 to 6 work for a guest |
| Thu 26 to Fri 27 Nov | Tasks 18 to 22; staging data load | Notes, feedback, sample sign-in, wording; end-to-end tests pass |
| Tue 1 Dec | Rehearsal on staging; fixes; freeze | Demo script passes on staging |

The only slack is 1 December. If time runs short, cut in this order; each cut leaves a working page:

1. The report endpoint in Task 11 (keep the counters).
2. Modeled travel times (Task 10). Estimates remain, explained by the times note.
3. Recent searches and place rows in the suggestions (Task 15).
4. "Edit skills" (Task 16).
5. Related qualifications (Tasks 7, 9, 16).
6. The Leaflet version of pin labels and city chips (Task 13): on the fallback map, cities are listed in the panel only.

## 5. Definition of done

On staging, with sample data loaded, this script passes on a laptop and on a phone, and each state matches its screen in section 1A except for the differences listed there:

1. Open the website and press Find centers. The map page opens; the privacy notice appears once. Location is off.
2. Turn on "Share my location". The nearest training centers, the nearest assessment centers and the jobs in demand in the city appear, with pins.
3. Type "Marunong ako maghugas". The skills Dishwashing, Laundry and Cleaning appear, with the three shortcuts.
4. Press Enter. Get certified comes first: Housekeeping NC II, strong match, with its nearest assessment center reading like `2.8 km · about 10 min by car · Quezon City`. Training centers follow, one tagged "Scholarship open".
5. Select the center. Its card shows Directions, Call and Email, and "Apply for assessment" when TSP's address is set.
6. Open Demand. The notice says demand is low near you, and cities with higher demand are listed and marked on the map. Select Makati City: its card offers "Show centers there", and "Find jobs in Makati" when TSP's address is set.
7. The sample note, the automatic-matching line and the confirm line are visible. "Was this helpful?" records an answer.
8. Sign in with a sample TSP profile. Its home area becomes the starting point and its skills show as chips.
9. Sign out. Turn location off: the lists and pins go. Search again: results show without distances, with the prompt.
10. Type something with no match: the page says so and suggests what to type.

## 6. Staging runbook

1. Deploy the branch. Add the new keys to the server's `.env`: `DEMO_TSP_PROFILES_ENABLED=true`; `TSP_ASSESSMENT_URL` and `TSP_FIND_JOBS_URL` when known; any distance the Product Owner changes. Leave `EXPLORE_INCLUDE_EXAMPLE_SITES` unset.
2. `python -m alembic upgrade head` (migrations 0029 to 0031).
3. `python -m tesda_track.cli backfill-assessment-offerings`. Check the count against the registry's accepted assessment rows.
4. `python -m tesda_track.cli sample-data load`. Read `curated_unmatched` in its output: above 0 means a demo city is spelled differently in the registry.
5. `python -m tesda_track.cli seed-tsp-profiles --file <the supplied file>`. Keep the file off the repository.
6. For demo day, set `ROUTING_CACHE_TTL_SECONDS=86400` and run the demo script once that morning, so the modeled times are cached.
7. Run the script in section 5.

## 7. Waiting on others

| Item | Needed from | Blocks | Until then |
|---|---|---|---|
| Synthetic TSP profiles and their credentials | You | Task 19's real file | The example profile |
| Review of the skill word list, including "maghugas" under Laundry and Cleaning | TESDA experts | Calling the skill reading reviewed | The list is a labelled placeholder |
| Sign-off on 25 and 100 km, 30 km/h and 1.4, and the strong-match threshold | Product Owner | Nothing; they are settings | The defaults in Task 6 |
| Approval of the copy (Tasks 12, 21), including the softened demand wording | Product Owner | Task 21's finish | The proposed wording |
| Acceptance of the differences from the document listed in section 1A | Product Owner | Nothing | Built as listed |
| TSP addresses for Assessment and Find Jobs | TSP team | The two buttons | Both are hidden |
| Registry ZIP on this machine | The teammate who ran the import | Trying the page at real density locally | The example fixture (Task 5) |
| TESDA approval of the center lists | TESDA data office | Calling listings "official" | Each center card shows its source and date |
| Map points for about 670 centers | A Google Maps key, and TESDA's view on Google's terms for stored coordinates (`docs/registry-import.md`) | "Every center on the map" | Unmapped centers are counted on each card |
| Hosting and an official domain | TESDA ICT and the Sponsor | A fixed address | `tesda-track.vercel.app` |

## 8. Not in this plan

- The TSP WebView (`/tsp/webview/...`) keeps its current pages. Moving it to the map page is the first job after December 2, when TESDA-TRACK becomes a TSP feature.
- Real ABDD demand and live scholarship data. The tables take them without a screen change: load rows with `is_sample = false`.
- A Planning Office dashboard. Task 11 only collects the counts.
- "Save city" and any other saving; seat counts, schedules and capacity; public-transport and walking times; Filipino screens.
- The document's governance actions that are not code: naming the AI owner, the one-page fact sheet, starting with a limited group or one region, the weekly review and the stop rule. They belong to the Product Owner. The counts they need exist: `match_daily_stat` for goals with no match, and Task 11's.
- The `service-logistics-v1` policy of the 9 November plan (its Tasks 5 to 8), and the step-by-step journey of this plan's first version. This plan's `nearest-first-v1` and map page replace them.
