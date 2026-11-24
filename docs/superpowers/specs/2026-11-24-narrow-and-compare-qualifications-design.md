# Narrow and compare qualifications on Explore — design

Date: 2026-11-24 · Status: draft for approval · Target: prototype presentation (~2026-11-28)

## Intent

A learner types a goal ("gusto ko magdrive", "driver"). Driving alone has several qualifications (Driving NC II,
passenger bus / articulated vehicle NC III, …), automotive has many more. Today Explore puts the centers for all
matched qualifications on the map at once and the learner can't easily tell which one is for them.

The PM wants: after the query, a list of the matched qualifications under the search box. Picking from it is
**optional** — it narrows the recommendation, it never blocks it. Picked qualifications are **compared side by side
with their details**, and their centers show on the map. The point is to help the learner see which qualification
best fits **their skills (Skill Passport) and what they like (what they typed)**.

## Goals

- Show the search's matched qualifications as selectable chips under the search box.
- Picking chips (a) narrows the map and the results list to those qualifications' centers and (b) opens a
  side-by-side comparison of the picked ones.
- The comparison leads with **personal fit** when the learner is signed in with a Skill Passport (score, CORE-unit
  coverage, next step: held / renew / assess now / gap training / full training).
- Everyone, signed in or not, sees the **course facts** columns, so nobody hits an empty comparison.

## Non-goals

- No backend changes, no new endpoint, no new grouping of qualification "families" (option C, rejected for time).
- Not showing qualifications the search didn't match.
- Not removing the "which vehicle?" clarify question on Find my pathway (`finder/MatchesStep.tsx`) this round.
- No model retraining or ranking changes.

## Anti-goals (a failure even if it works)

- Making the learner answer before they see the map. With nothing picked, Explore behaves exactly as today.
- Presenting fit as a promise. Fit is "how your passport lines up", not an assessment result (keep the existing
  `NextStepNote` wording rules: self-declared skills never make someone "ready").
- Fabricating facts. A missing value shows "—" / "not listed", never a guess or sample data presented as real.

## Constraints

- Frontend only (React + TanStack Query + zustand), in `frontend/src/features/explore/`.
- All copy goes through `useCopy()`: English in `copy/en.ts`, plus the 8 locales in `i18n/locales/`
  (bcl, ceb, hil, ilo, pag, pam, tl, war) — best-effort translations, flagged for native review as before.
- Works on a phone (results sheet rises from the bottom) and tablet-up (side panel) — see `ExplorePage.tsx` layout.
- Existing tests in `features/explore/*.test.tsx` keep passing; new behavior gets tests.

## Approaches considered

- **A. Chips under the search box + comparison in the results panel — chosen.** Optional by construction, map reacts
  to each pick, reuses the results sheet and the existing map center filtering, fits the deadline.
- B. A guided "Which of these?" step before results. Clearer for first-timers but gates the map, contradicting "not
  required"; a new screen.
- C. Backend-grouped qualification families (incl. unmatched ones). Needs new data and an endpoint; out of time.

Comparison content: the user chose **personal fit (B) with course facts for everyone (option 2)** over facts-only or
a sign-in prompt.

## Design

### Data (all already available)

| Column | Source |
|---|---|
| Name, sector | `search.result.matches[].qualification` |
| Your fit (score, next step, CORE coverage, experience/licenses) | `explore.fits` — `useQueries` over `qualificationFitQuery` already runs for every matched code when a passport exists (`useExplore.ts` ~L433) |
| Possible jobs, number of CORE units | catalog `qualificationsQuery` (`QualificationPublic.possible_jobs`, `.competencies`). Today it is only enabled when `outOfRange`; enable it when a comparison is open |
| Training hours | `duration_hours` on the matched programs in range (show the range, e.g. "118–160 h", or "not listed") |
| Scholarship | any program in range with `scholarship_available` (respect `scholarship_is_sample` the way the cards already do) |
| Centers near you | counts of training / assessment centers within `rangeKm`, from the existing `cardsFor`/centers data |
| Demand in your region | existing `regionalDemand` / outlook for the region, when present; otherwise omit the row |

### State

- New field in `useExploreStore`: `picked: string[]` (qualification codes), persisted to sessionStorage with the rest.
- Cleared when the search changes (`setSearch`) and on `reset`.
- Max 3 picked; a 4th tap is disabled with a short hint ("Compare up to 3").
- `picked` empty ⇒ everything behaves exactly as today.

### UI

```
[ gusto ko magdrive                          🔍 ]
 Narrow it down (optional)
 (Driving NC II) (Passenger Bus NC III) (Articulated NC III) (Automotive NC I)

 ┌ Compare ────────────── Driving NC II ── Bus NC III ─┐
 │ Your fit               82 · Assess now   40 · Gap    │  ← passport holders only
 │ CORE units you have    5 of 6            2 of 7      │  ← passport holders only
 │ Training hours         118               160         │
 │ Centers near you       6 train · 3 assess  2 · 1     │
 │ Scholarship            Yes               —           │
 │ Possible jobs          Taxi, delivery…   Bus driver… │
 └──────────────────────────────────────────────────────┘
 [ ranked centers for the picked qualifications, as today ]
```

- **Chips** sit in the search area (below the box, distinct from the existing view chips "Training / Assessment /
  Jobs" in `Chips()`), as a toggle group; each chip shows the qualification name. Hidden when the search matched
  fewer than 2 qualifications, or when the search was opened from the library for one qualification (`chosen`).
- **Comparison** renders at the top of `ResultsPanel` when ≥1 picked (one picked = a single-column detail card).
  On a phone it scrolls horizontally inside the sheet with the row labels pinned; no page-level horizontal scroll.
- **Not signed in / no passport**: fit rows replaced by one line: "Sign in and add your Skill Passport to see which
  fits you" linking to the existing sign-in / passport flow.
- **Fit loading / none**: "Checking…" while loading; "Nothing on your passport points to this yet" when fit is null.
- **Map and results list**: when picked is non-empty, `matches` used for centers/cards is filtered to the picked codes,
  so markers, `RankedCenters` and `cardsFor` all narrow together.
- **Which matches become chips (user's decision):** the top 5 Explore already uses (`MAX_QUALIFICATIONS`). Narrowing
  is a filter over data the page already loads; no extra listings or fit fetches. A broad search may leave lower
  matches out of the chip row — accepted for this round.
- **Focus vs. the Demand panel (builder's call):** tapping a chip sets the demand focus (`useDemandStore.setCode`) to
  that chip's code, overriding an earlier Demand-panel choice. Choosing in the Demand panel afterwards leaves the
  chips as they are. Chips and comparison also show in the Demand view.
- **"Nothing near you" help (builder's call):** the range prompt, no-center help and related-qualification suggestion
  work from the picked qualifications (what's on screen); related suggestions exclude codes already in the chip row.

### Part 2: route on click, other centers hidden (added by the user)

Independent of the chips; can ship first.

- Today: `select()` in `ExplorePage.tsx` opens the card only; the route draws after "Get route"
  (`useTrainingStore.showRoute`), and `CenterMap` always receives every pin.
- **Auto-route:** selecting a center (map pin, list, ranked list) also calls `showRoute(id)` when `canRoute`
  (routing enabled and an origin — the learner's location, or the typed place). Without an origin it behaves as
  today (Google Maps link).
- **Hide others:** while `route` is non-null, `CenterMap` gets only the selected center as `centers` (the reference
  point stays); the map frames the route.
- **Restore:** "Hide route" or going back to the list clears `routeTo` and the other pins return. Switching centers
  replaces the route.
- Tests: selecting with an origin sets `routeTo`; without one it doesn't; pins narrow to one while routed and return
  on back / hide.

### Copy

New keys under `explore.compare` (title, chip hint, row labels, next-step labels reuse the existing
NextStepNote copy where it fits, sign-in line, max-3 hint) in `en.ts` and all 8 locales.

### Tests

- Store: picking/unpicking, max 3, cleared on new search.
- Chips hidden with <2 matches and for `chosen` searches.
- Map/results narrow to picked codes; with none picked, output is unchanged.
- Comparison: signed-out shows facts + sign-in line; with passport shows fit rows; missing values show "—".

## Left to the builder

- Exact component split (e.g. `QualificationChips.tsx`, `ComparePanel.tsx`) and where the filtered `matches` is
  derived (in `useExplore` is the natural spot).
- Visual styling, following the existing Explore tokens/classes.
- Whether demand gets a row, depending on how reliably the region's numbers are present in the demo data.
