# Narrow, Compare and Route-on-Click Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Explore, clicking a center draws its route and hides the other pins; matched qualifications appear as optional chips that narrow the map/results and open a side-by-side comparison with personal fit.

**Architecture:** Frontend only. Route-on-click lives in `ExplorePage.tsx`'s `select()` and the `pins` passed to `CenterMap`. Picks are a new `picked: string[]` in `useExploreStore`; `useExplore` derives a narrowed `matches` from it, so every consumer (map, cards, ranked centers, out-of-range help) narrows together. A pure `compareRows()` builds the comparison data; `QualificationChips` and `ComparePanel` render it.

**Tech Stack:** React 19, TypeScript, TanStack Query, zustand (persist → sessionStorage), react-aria-components, Tailwind, Vitest + Testing Library + MSW.

**Spec:** `docs/superpowers/specs/2026-11-24-narrow-and-compare-qualifications-design.md`

## Global Constraints

- No backend changes; no new endpoints.
- Chips come from the top 5 matches only (`MAX_QUALIFICATIONS` in `explore.ts`); no extra listings/fit fetches for lower matches.
- Max 3 picked. Nothing picked ⇒ Explore behaves exactly as today.
- Missing values show "—" / "not listed"; never guessed, never sample data presented as real.
- Fit is "how your passport lines up", not an assessment; self-declared skills never make a learner ready.
- All copy via `useCopy()`: English in `copy/en.ts`, plus `i18n/locales/{bcl,ceb,hil,ilo,pag,pam,tl,war}.ts` (best effort, flagged for native review).
- Works on phone (bottom sheet) and tablet-up (side panel); no page-level horizontal scroll.
- Run frontend commands with Node from nvm: `source ~/.nvm/nvm.sh` first, from `frontend/`.
- After code changes: `graphify update .` from the repo root.

## Review Focus

1. Learner with location **off** and no typed place clicks a center → no route request, card opens as today, Google Maps link still shown. (Task 1 test)
2. Learner picks chips, then types a **new search** → picks cleared, map shows all new matches. (Task 2 test)
3. A picked code that is **no longer in the matches** (stale sessionStorage after a refresh with a different result) → ignored; if none remain, behave as unpicked. (Task 2 test)
4. Learner picks a qualification with **no center in range** → the "nothing near you" help appears for it, and the related suggestion doesn't offer another chip's qualification. (Task 3 test)
5. Signed in **without** a passport, or fit returns `null` → facts rows render, fit area shows the sign-in line / "Nothing on your passport points to this yet"; never a blank column. (Task 4 test)

---

### Task 1: Route on click, other centers hidden

**Files:**
- Modify: `frontend/src/features/explore/ExplorePage.tsx` (`select()` ~L342, `back()` ~L355, `pins` ~L301, `<CenterMap centers=…>` ~L523)
- Test: `frontend/src/features/explore/RouteOnClick.test.tsx` (new)

**Interfaces:**
- Consumes: `useTrainingStore.showRoute(id: string | null)`, `canRoute`, `route` (already computed in `ExplorePage`).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing tests** in `RouteOnClick.test.tsx`. Reuse the setup pattern from `CenterCard.test.tsx` (mock `../training/CenterMap.tsx` to render `props.centers` names in `data-testid="map"` and expose `props.route` as `data-route={props.route ? 'on' : 'off'}`), use `serveTrainingApi({ routingEnabled: true })` from `test/training.ts`, and set `useTrainingStore.setState({ placeText: 'Makati', placePoint: { latitude: 14.55, longitude: 121.02, label: 'Makati' } })` (check the `PlacePoint` type in `training/state.ts` for the exact fields) for an origin.
  - `it('draws the route as soon as a center is opened')` — click a center in the results list → `useTrainingStore.getState().routeTo === <that id>` and the map has `data-route="on"`.
  - `it('shows only the routed center on the map')` — after opening it, `within(map).getAllByRole('listitem')` has length 1 with that center's name.
  - `it('brings the other centers back when going back or hiding the route')` — press Back → all centers listed again and `routeTo === null`; reopen, press "Hide route" → all centers back.
  - `it('does not route without a starting point')` — no `placePoint`, `useLocation: false` → opening a center leaves `routeTo === null`, every center still on the map.

- [ ] **Step 2: Run to verify they fail**
  Run: `cd frontend && source ~/.nvm/nvm.sh && npx vitest run src/features/explore/RouteOnClick.test.tsx`
  Expected: the first three FAIL (`routeTo` null / several pins); the last PASSES.

- [ ] **Step 3: Implement**
  - In `select()`: after `setSelectedId(id)`, call `store().showRoute(canRoute ? id : null)`. The map's `onRoute` stays as is.
  - In `back()`: call `store().showRoute(null)`.
  - When computing what goes to `<CenterMap centers=…>`: `route && selected ? [selected] : pins`. Leave `pins` itself untouched (the list still uses it).
  - "Hide route" in `CenterDetail` already calls `showRoute(null)`; `route` becomes null and all pins return with no extra code.

- [ ] **Step 4: Run tests** — the same command, all PASS; then `npx vitest run src/features/explore src/features/training`, all PASS (existing tests that assert `routeTo` stays null after a click must be updated only if they set an origin with routing enabled; say which in the commit).

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/features/explore/ExplorePage.tsx frontend/src/features/explore/RouteOnClick.test.tsx
  git commit -m "feat(explore): route on center click and hide other centers while routed"
  ```

### Task 2: Picked qualifications in the store and narrowed matches

**Files:**
- Modify: `frontend/src/features/explore/useExplore.ts` (`ExploreState`, `EMPTY`, `setSearch`, `partialize`, `matches` memo ~L169, returned object ~L506)
- Modify: `frontend/src/features/explore/explore.ts` (add `MAX_PICKED`, `narrowMatches`)
- Test: `frontend/src/features/explore/explore.test.ts`, `frontend/src/features/explore/picked.test.ts` (new)

**Interfaces:**
- Produces:
  - `export const MAX_PICKED = 3` (explore.ts)
  - `export function narrowMatches(matches: readonly Match[], picked: readonly string[]): Match[]` — matches whose code is in `picked`, in match order; if none of `picked` is in `matches`, returns `matches` unchanged.
  - `useExploreStore`: `picked: string[]`, `togglePicked(code: string): void` (adds when `< MAX_PICKED`, removes if present, ignores a 4th add). Persisted; `setSearch` and `reset` set `picked: []`.
  - `useExplore()` returns `allMatches: Match[]` (the top 5, for the chips) and `matches: Match[]` (= `narrowMatches(allMatches, picked)`, used everywhere `matches` was before, including `codes`, `outOfRange`, `demandCode`'s fallback).
  - `togglePicked` adding a code also calls `useDemandStore.getState().setCode(code)` (focus follows the tapped chip); removing does not change the demand focus.

- [ ] **Step 1: Write failing tests**
  - `explore.test.ts`: `narrowMatches` — `([a,b,c], ['c','a'])` → `[a,c]`; `([a,b], [])` → `[a,b]`; `([a,b], ['zzz'])` → `[a,b]`.
  - `picked.test.ts`: `togglePicked('A')`,`('B')`,`('C')`,`('D')` → `picked` equals `['A','B','C']`; `togglePicked('B')` → `['A','C']`; `setSearch(newSearch)` → `[]`; `togglePicked('A')` → `useDemandStore.getState().code === 'A'`.

- [ ] **Step 2: Run** `npx vitest run src/features/explore/explore.test.ts src/features/explore/picked.test.ts` — Expected FAIL (`narrowMatches`/`togglePicked` not defined).

- [ ] **Step 3: Implement** as in Interfaces. Do not bump the store `version`; a missing `picked` from old sessionStorage defaults to `[]` via `EMPTY`.

- [ ] **Step 4: Run** the two files, then `npx vitest run src/features/explore` — all PASS (with nothing picked `matches === allMatches`, so the existing tests are unchanged).

- [ ] **Step 5: Commit** `feat(explore): store picked qualifications and narrow matches to them`

### Task 3: Qualification chips under the search box

**Files:**
- Create: `frontend/src/features/explore/QualificationChips.tsx`
- Modify: `frontend/src/features/explore/ExplorePage.tsx` (render under the goal box, in both the phone and tablet layouts where the goal box is)
- Modify: `frontend/src/copy/en.ts` (`explore.compare` keys used here, see Task 5) and `frontend/src/features/explore/explore.ts` `relatedWithin` callers
- Test: `frontend/src/features/explore/QualificationChips.test.tsx` (new)

**Interfaces:**
- Consumes: `allMatches`, `useExploreStore.picked/togglePicked`, `MAX_PICKED` (Task 2).
- Produces: `export function QualificationChips({ matches, chosen }: { matches: readonly Match[]; chosen?: boolean }): JSX.Element | null`

- [ ] **Step 1: Write failing tests**
  - `renders nothing with fewer than 2 matches` and `renders nothing for a search chosen from the library` (`chosen: true`).
  - `toggles a chip and narrows the map` — render `ExplorePage` with 3 matches (cookery, bread, welding fixtures from `test/training.ts`), click the "Cookery NC II" chip → it has `aria-pressed`/selected state, and the mocked map lists only Cookery centers.
  - `disables a 4th pick with the hint` — 4 matches, pick 3 → the 4th chip is disabled and `copy.explore.compare.maxHint` ("Compare up to 3") is visible.
  - Review Focus 4: `related suggestions skip qualifications already in the chips` — pick one with no center in range; the related suggestion's name is not any other chip's name.

- [ ] **Step 2: Run** `npx vitest run src/features/explore/QualificationChips.test.tsx` — FAIL (module not found).

- [ ] **Step 3: Implement** with react-aria `ToggleButtonGroup` + `ToggleButton` (`selectionMode="multiple"`), matching the existing `Chips()` styling in `ExplorePage.tsx`, label `copy.explore.compare.narrowLabel`. Where `relatedWithin` is called (`ResultsPanel`'s `relatedFor`), filter out results whose code is in `allMatches`.

- [ ] **Step 4: Run** the file and `npx vitest run src/features/explore` — PASS.

- [ ] **Step 5: Commit** `feat(explore): optional qualification chips to narrow a search`

### Task 4: Comparison rows and panel

**Files:**
- Create: `frontend/src/features/explore/compare.ts` (pure data)
- Create: `frontend/src/features/explore/ComparePanel.tsx`
- Modify: `frontend/src/features/explore/useExplore.ts` (enable `catalog` query when `picked.length > 0`, not only `outOfRange`)
- Modify: `frontend/src/features/explore/Panels.tsx` (`ResultsPanel`: render `<ComparePanel>` at the top when `picked.length > 0`, in every view including `demand`)
- Test: `frontend/src/features/explore/compare.test.ts`, `frontend/src/features/explore/ComparePanel.test.tsx` (new)

**Interfaces:**
- Consumes: `matches` (narrowed), `centers`, `rangeKm`, `fits: Map<string, QualificationFit | null>`, `catalog: QualificationPublic[]`, `passport` (from `useExplore`), `regionalDemand()` from `recommend.ts`.
- Produces:
  ```ts
  export interface CompareColumn {
    code: string
    name: string
    fit: QualificationFit | null | undefined   // undefined = loading or no passport
    coreHave: number | null                    // covered CORE units from fit.coverage
    coreTotal: number | null
    hours: { min: number; max: number } | null // duration_hours over programs in range
    scholarship: boolean | null                // null = no program in range; ignores scholarship_is_sample=true
    trainNear: number | null                   // null = no reference point
    assessNear: number | null
    jobs: string[]                             // possible_jobs, first 3
    demand: number | null                      // region's relative demand, null = no data
  }
  export function compareColumns(input: {
    matches: readonly Match[]; centers: readonly Center[]; rangeKm: number; hasReference: boolean
    fits: ReadonlyMap<string, QualificationFit | null>; catalog: readonly QualificationPublic[]
    demand: ReadonlyMap<string, number> | null
  }): CompareColumn[]
  export function ComparePanel({ explore }: { explore: Explore }): JSX.Element | null
  ```

- [ ] **Step 1: Write failing tests**
  - `compare.test.ts`: hours range across two in-range programs `118` and `160` → `{min:118,max:160}`; no `duration_hours` → `null`; a scholarship only on a `scholarship_is_sample` program → `false`; `hasReference:false` → `trainNear/assessNear === null`; a fit with coverage → `coreHave/coreTotal` from it; jobs capped at 3.
  - `ComparePanel.test.tsx`:
    - `signed out: shows facts and the sign-in line, no fit rows` (Review Focus 5)
    - `with a passport: shows fit score and next step per column` (mock `GET */api/v1/auth/tsp/fit` returning `next_step: 'assessment'` for one code and `'gap_training'` for another; assert the existing next-step labels)
    - `fit null: shows copy.explore.compare.noFit`
    - `missing values show —`
    - `one pick renders a single column`

- [ ] **Step 2: Run** both files — FAIL (modules not found).

- [ ] **Step 3: Implement** `compareColumns` per the interface (in-range = the same rule `cardsFor` uses with `rangeKm`). `ComparePanel` renders a `<table>` with row labels in a sticky first column inside an `overflow-x-auto` wrapper, so a phone scrolls inside the sheet. Fit rows: a passport with `fit` → score + next step (reuse `NextStepNote` labels from `Panels.tsx`); `fit === null` → `noFit`; no learner/passport → one row spanning the columns with `copy.explore.compare.signIn` linking to the existing sign-in / passport route. Omit the demand row when every column's `demand` is null.

- [ ] **Step 4: Run** both files, then `npx vitest run src/features/explore` — PASS.

- [ ] **Step 5: Commit** `feat(explore): compare picked qualifications with personal fit and course facts`

### Task 5: Copy in all languages, full check, graph update

**Files:**
- Modify: `frontend/src/copy/en.ts` (`explore.compare` block, near `explore.chips` ~L2322)
- Modify: `frontend/src/i18n/locales/{bcl,ceb,hil,ilo,pag,pam,tl,war}.ts`
- Test: existing `frontend/src/i18n/translate.test.ts` / `Language.test.tsx` (key parity)

**Interfaces:**
- Produces `explore.compare` keys (English text fixed here): `narrowLabel: 'Narrow it down (optional)'`, `maxHint: 'Compare up to 3'`, `title: 'Compare'`, `rowFit: 'Your fit'`, `rowCore: 'CORE units you have'`, `coreOf: '{have} of {total}'`, `rowHours: 'Training hours'`, `rowCenters: 'Centers near you'`, `centersValue: '{train} train · {assess} assess'`, `rowScholarship: 'Scholarship'`, `rowJobs: 'Possible jobs'`, `rowDemand: 'Demand in your region'`, `yes: 'Yes'`, `none: '—'`, `notListed: 'not listed'`, `checking: 'Checking…'`, `noFit: 'Nothing on your passport points to this yet'`, `signIn: 'Sign in and add your Skill Passport to see which fits you'`.
  (Tasks 3–4 add the keys they use to `en.ts` as they go; this task completes the locales.)

- [ ] **Step 1:** Add the 8 locale translations (best effort; add a `// TODO(native review)` comment above each block as the existing NextStepNote translations do).
- [ ] **Step 2: Run** `npx vitest run src/i18n` — PASS (no missing keys).
- [ ] **Step 3: Full check:** `npx tsc -b && npx eslint src/features/explore && npx vitest run` — all PASS.
- [ ] **Step 4:** From the repo root: `graphify update .`
- [ ] **Step 5: Commit** `feat(i18n): compare and narrow copy in all languages` (include `graphify-out/` if it changed).
