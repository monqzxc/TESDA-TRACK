# React Frontend Migration Plan

> Steps use checkbox (`- [ ]`) syntax for tracking. Each task lists its files, what it produces, and when it's done.

**Goal:** Replace the Streamlit learner app (`frontend/`) with a React single-page app (`web/`) that keeps every
feature, the current look (light, dark and system themes included), and the FastAPI backend as it is. Learners get
real page addresses, a faster app on phones, and a landing page search engines can read. The team stops working
around Streamlit's limits.

**Recommendation:** React 19 with Vite and TypeScript, built as static files that Caddy serves. No server-side
rendering: the app is self-hosted, and only the landing page needs to be found by search engines.

**Architecture:** The browser loads the React app from Caddy and calls the existing API at `/api/v1/...` on the same
domain, so there is no CORS setup. FastAPI stays the only component that touches the database. Three pieces of logic
that run in Streamlit today move into the API first: road directions and flight estimates (`directions.py`,
`flights.py`) and pulling skill terms out of a sentence for Skills Explorer (`skills_bridge_view.py`). Both
frontends run side by side until the React app matches the Streamlit one, then the React app takes over `/`.

**Tech stack:** Node 24 LTS (build only), React 19, Vite, TypeScript (strict), React Router 7, TanStack Query 5,
`openapi-typescript` and `openapi-fetch` (an API client generated from FastAPI's schema), React Aria Components
(accessible, unstyled widgets), Leaflet with `react-leaflet` and marker clustering, CSS Modules on top of the
existing design tokens, Zustand for the finder's state, Vitest with Testing Library and MSW, Playwright with axe.

**Status:** Proposed on 2026-10-13. Settle the decisions below before Task 1.

## Why move

Building on Streamlit has meant working around it: CSS that targets Streamlit's internal class names and test ids,
fonts declared in `config.toml` because they can't load inside a component's shadow root, a script that copies the
active theme onto the page (`THEME_SYNC`), scripts that reset the scroll position between pages, icons that carry
their own dark color, and tests that send component events through AppTest internals. Every click also goes to the
server and reruns the page. React removes these, and gives pages their own addresses, so links, bookmarks and the
back button work.

The cost is a second language and a build step, and owning what Streamlit does for us today: state, forms,
validation and accessible widgets.

## What stays and what moves

| Today (Streamlit, `frontend/`) | After (React, `web/`) |
|---|---|
| Pages in `app.py`, `training_view.py`, `skills_bridge_view.py`, `presentation.py` (about 8,500 lines with CSS) | React components and pages in `web/src/` |
| `api_client.py`: 37 endpoint calls through httpx | Generated, typed client from `/api/openapi.json` (41 of 52 routes already declare response models) |
| `directions.py` (road routes from OSRM, one shared rate limit) and `flights.py` | New API endpoint `GET /api/v1/routes`, keeping the shared rate limit and cache on the server |
| `_extract_skill_terms`, `_classify_terms` in `skills_bridge_view.py` | New API endpoint `POST /api/v1/skills-bridge/explore`. Only extracted terms still reach Skills Bridge. |
| `centers.py` (distances, map points), `portal/journey.py` (filters, paging) | Small TypeScript helpers with unit tests |
| `styles.css` `--track-*` tokens, light and dark | `web/src/styles/tokens.css`, the same tokens |
| Theme from Streamlit's ⋮ menu, mirrored by `THEME_SYNC` | The app's own System / Light / Dark switch in the header |
| Icons drawn as images with a dark color baked in (`DARK_INK`) | An `<Icon>` component that draws in `currentColor` |
| Landing page component (`landing.html/.css/.js`) | Home page components; the reveal and road-drawing code moves into hooks |
| Sign-in token kept in Streamlit's server session | A secure cookie (Decision 1) |
| AppTest suites: `test_frontend_states.py`, `test_training_centers.py`, `test_ui.py`, `test_portal.py`, `test_skills_bridge_ui.py` | Vitest component tests and Playwright journeys. Logic tests move with their logic. |
| `web` container: Streamlit on port 8501 | `web` container: Caddy serving the built files, with a fallback to `index.html` |
| `portal_app.py` and `app_pages/` (Streamlit redesign in progress) | Retired. Its agreed copy and flows feed the React pages. |

## Decisions to make first

1. **Where the sign-in token lives.** Recommended: a session cookie the browser's scripts can't read (`HttpOnly`,
   `Secure`, `SameSite=Strict`), set by a new `POST /api/v1/auth/session`. The API keeps accepting bearer tokens
   for `/api/docs` and scripts. Writes signed in by cookie must also carry an `X-Requested-With` header, which other
   sites can't add. The alternative needs no backend change: keep the bearer token in `sessionStorage`. That's
   simpler, but any script injected into the page could read it, and the app holds learners' personal data
   (RA 10173).
2. **Accessible widgets.** Recommended: React Aria Components, for dialogs, menus, tabs, radio groups, selects,
   comboboxes and switches with keyboard and screen-reader support built in. Radix Primitives is the main
   alternative.
3. **Freeze the Streamlit app.** Recommended: from Task 1, `frontend/` gets bug fixes only, and new features go
   into `web/`. Otherwise the two apps drift apart and parity keeps moving.
4. **The redesign in `portal_app.py`.** Recommended: stop it, and carry its agreed copy and flows into the React
   pages.
5. **Filipino copy (US-15).** Recommended: keep every piece of interface copy in one place from the start
   (`web/src/copy/en.ts`), so a Filipino version can be added later without hunting through components. No
   translation library yet.

## Design

### Pages and addresses

| Page | Address | Notes |
|---|---|---|
| Home (landing page) | `/` | Works without the API, as today |
| Find my pathway | `/find`, `/find/matches`, `/find/readiness`, `/find/pathway` | Step in the address; the goal itself never is |
| Qualifications Library | `/qualifications?q=&sector=&page=` | Filters in the address, so a search can be shared |
| Training & Assessment | `/training?…` | Filters in the address; a learner's location never is |
| My Progress | `/progress` | Asks to sign in when signed out |
| Skills Explorer | `/skills` | |
| Reports | `/reports` | Administrators only |
| Sign in, create account | A dialog, with `/sign-in` as a fallback address | Returns the learner to where they were |

### State and data

- **Server data** goes through TanStack Query with the generated client. Cache times follow today's: the catalog
  for 5 minutes and regions for an hour.
- **Finder state** (the goal, answers, chosen qualification, readiness answers) lives in one Zustand store saved to
  `sessionStorage`. A refresh keeps the learner's work (US-14), and closing the tab clears it, which suits shared
  computers. Signed-in learners keep syncing their session to `/api/v1/me/recommendations`, as today.
- **Small preferences** (theme choice, map layer, collapsed filters) go in `localStorage`. Reads and writes are
  wrapped, so a private window still works.
- **Runtime settings** (CARTO key, whether routing and Skills Bridge are on) come from a new
  `GET /api/v1/client-config`, so one build runs in every deployment.

### Look and themes

- Carry `styles.css` tokens over unchanged: light values on `:root`, dark values on `:root[data-theme="dark"]`.
  `test_theme.py`'s check (every color has a value in both themes) becomes a Vitest test.
- Fonts (Bricolage Grotesque, Figtree) are served from `web/public/fonts` with ordinary `@font-face` rules.
- A `ThemeProvider` reads the saved choice (system by default), follows `prefers-color-scheme` for System, and sets
  `data-theme` on `<html>` before the first paint (a small inline script in `index.html`), so there's no flash of
  the wrong theme. The switch sits in the header on every page.
- Maps darken their tiles with the same `--track-map-tiles` filter as today.

### Accessibility, privacy and security

- Every page is usable with a keyboard and at 390 px wide (US-13). Focus moves to the page heading on navigation.
  axe runs on every page in CI.
- Learner text is rendered as text. `dangerouslySetInnerHTML` is not allowed (an ESLint rule enforces it).
- Goals and learner locations never go into addresses, analytics or logs. The goal reaches the API only in request
  bodies, as today.
- Caddy sends a Content Security Policy for the app: scripts only from the app itself, images from the app and the
  map tile hosts, connections only to the same domain.

## Directory layout

```
web/
  index.html               theme script before paint, root element
  vite.config.ts           /api proxied to http://127.0.0.1:8000 in development
  package.json             scripts: dev, build, test, e2e, lint, api:types
  public/fonts/  public/img/
  src/
    main.tsx  App.tsx  routes.tsx
    api/       schema.d.ts (generated), client.ts, queries.ts, errors.ts
    auth/      AuthProvider.tsx, SignInDialog.tsx, RegisterForm.tsx
    copy/      en.ts
    styles/    tokens.css, base.css
    theme/     ThemeProvider.tsx, ThemeSwitch.tsx
    components/ Icon.tsx, Layout.tsx, Nav.tsx, EmptyState.tsx, ServiceUnavailable.tsx, ...
    features/
      home/  finder/  library/  training/  progress/  skills/  reports/  account/
    lib/       centers.ts, paging.ts, storage.ts
  tests/e2e/               Playwright journeys
  Dockerfile               Node build stage, then Caddy serving dist/
```

## Global constraints

- Work in small pull requests to `main`. Until Task 19, `web/` is only served at `/beta/`, so `main` stays
  deployable and learners keep using Streamlit at `/`.
- Backend changes are additive: new endpoints, and cookie sign-in alongside bearer tokens. The Streamlit app must
  keep working until it's removed.
- Each backend change comes with pytest tests in `backend/tests/`. Each page comes with Vitest tests and at least one
  Playwright journey.
- TypeScript runs in strict mode, with no `any` in feature code. `npm run lint`, `npm test` and `npm run build`
  pass on every pull request, and the generated API types match the API (`npm run api:types -- --check`).
- Copy follows the current rules: sentence case, plain words, no all-caps labels except the existing eyebrows.
- Commits made with Claude end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review focus

1. **Sign-in security:** the cookie flags, the CSRF header check, sign-out clearing the cookie, and an expired
   session returning the learner to sign in without losing their finder work.
2. **Learner text:** goals and names show exactly as typed and can never inject markup.
3. **Privacy:** no goal text or location in addresses, page titles, logs or error reports.
4. **Parity:** each page against its Streamlit version and the stories in `docs/user-stories.md`.
5. **Phones:** the initial JavaScript stays under 200 KB gzipped, and Leaflet loads only on pages with a map.
6. **Themes:** every page reviewed in light and dark.

---

## Phase 0: Foundations

### Task 1: Scaffold `web/`

**Files:** `web/` (Vite React TypeScript template), `web/.nvmrc` (24), `.github/workflows/web.yml` or the CI the
team uses, README "Local development" section.

- [ ] Create the app with the Vite React TypeScript template; turn on `strict`.
- [ ] Add ESLint (typescript-eslint, react-hooks, jsx-a11y, a rule banning `dangerouslySetInnerHTML`) and Prettier.
- [ ] Add Vitest with Testing Library and MSW, and Playwright with `@axe-core/playwright`.
- [ ] Proxy `/api` to `http://127.0.0.1:8000` in `vite.config.ts`.
- [ ] Document `npm install`, `npm run dev` (http://localhost:5173) next to the existing Streamlit steps.

**Done when** `npm run dev` shows a page that calls `/api/v1/qualifications` through the proxy, and lint, test and
build pass in CI.

### Task 2: Typed API client

**Files:** `web/src/api/schema.d.ts` (generated), `client.ts`, `errors.ts`, `queries.ts`.

- [ ] `npm run api:types` generates `schema.d.ts` from `/api/openapi.json`; `--check` fails when it's out of date.
- [ ] `client.ts` wraps `openapi-fetch` with base URL `/api`, sends credentials, and adds `X-Requested-With`.
- [ ] `errors.ts` turns failures into the same messages `api_client.py` shows today, including
      "We can't reach the TESDA-TRACK service right now. Please try again shortly." for network errors.
- [ ] `queries.ts` holds query keys and hooks for the catalog and regions, with today's cache times.

**Done when** a test calling `useQualifications()` against MSW returns typed data, and a network failure shows the
service message.

### Task 3: Design tokens, fonts, themes and icons

**Files:** `web/src/styles/tokens.css`, `base.css`, `web/src/theme/*`, `web/src/components/Icon.tsx`,
`web/public/fonts/*`.

- [ ] Copy the `--track-*` tokens from `frontend/styles.css`, light and dark, unchanged.
- [ ] Add the fonts and their licenses from `frontend/static/fonts/`.
- [ ] Build `ThemeProvider` and `ThemeSwitch` (System, Light, Dark), with the inline script in `index.html`.
- [ ] Port the icon paths from `presentation.icon()` into `<Icon name>`, drawn with `currentColor`.
- [ ] Port the token check from `frontend/tests/test_theme.py` to Vitest.

**Done when** a test page shows every token and icon in both themes, and switching theme has no flash on reload.

### Task 4: App shell

**Files:** `web/src/App.tsx`, `routes.tsx`, `components/Layout.tsx`, `Nav.tsx`, `ServiceUnavailable.tsx`.

- [ ] Routes for every page in the table above, each loaded on demand.
- [ ] The layout: the landing page's own header on Home, and the sidebar navigation (collapsing on phones)
      elsewhere, matching today.
- [ ] Page titles, scroll restored on Back and reset on new pages, focus moved to the page heading.
- [ ] An error boundary and the "We can't load TESDA Track right now" state, with a Retry button.

**Done when** every address renders a placeholder page in both themes, at 390 px and on desktop, and Playwright
with axe passes on each.

## Phase 1: Backend preparation

### Task 5: Cookie sign-in (if Decision 1 is the cookie)

**Files:** `backend/tesda_track/routers/auth.py`, `deps.py`, `security.py`, `backend/tests/test_auth_cookie.py`.

- [ ] `POST /api/v1/auth/session` takes the same form as `/auth/token`, and sets the session cookie with
      `HttpOnly`, `Secure` (outside local development), `SameSite=Strict`, `Path=/api`, lasting
      `access_token_expire_minutes`.
- [ ] `DELETE /api/v1/auth/session` clears it.
- [ ] `get_current_user` accepts the cookie or a bearer token. When signed in by cookie, `POST`, `PATCH` and
      `DELETE` requests without `X-Requested-With` are refused with 403.
- [ ] Lockout after five failed attempts, and token revocation on a password change, work the same for cookies.

**Done when** tests cover sign-in, sign-out, an expired cookie, a write without the header, and bearer tokens still
working.

### Task 6: Directions and flight estimates in the API

**Files:** `backend/tesda_track/services/routing.py`, `routers/routes.py`, the airport data from
`frontend/data/airports_ph.json`, tests ported from `frontend/tests/test_directions.py` and `test_flights.py`.

- [ ] Move `RouteClient` (shared rate limit, cache, OSRM calls) and the flight estimate into the backend.
- [ ] `GET /api/v1/routes?origin=lat,lon&destination=lat,lon` returns each travel mode with a route (car, bike,
      foot, plus a flight estimate for long trips), as `training_view._routes` does today. `ROUTING_URL` moves to
      the backend's settings.
- [ ] Round the origin the same way the ranking audit does, and never log it.

**Done when** the ported tests pass in the backend suite.

### Task 7: Skills Explorer in one request

**Files:** `backend/tesda_track/services/skills_terms.py`, `routers/skills_bridge.py`, tests ported from
`frontend/tests/test_skills_bridge_ui.py` (term extraction cases).

- [ ] Move `_extract_skill_terms` and `_classify_terms` into the backend.
- [ ] `POST /api/v1/skills-bridge/explore` takes `{ "text": … }` (500 characters at most), extracts the terms, and
      returns the occupation and skill matches, using the existing rate limits and cache. Only the extracted terms
      go to Skills Bridge.

**Done when** the extraction tests and an endpoint test pass.

### Task 8: Client settings and response models

**Files:** `backend/tesda_track/routers/meta.py` (or the existing health router), schemas for any route the app
reads that has no response model.

- [ ] `GET /api/v1/client-config` returns `{ carto_key, routing_enabled, skills_bridge_enabled }`.
- [ ] Add response models where the React app reads a body that isn't typed yet, so `schema.d.ts` has no `unknown`
      the app relies on.

**Done when** `npm run api:types` produces types for every endpoint the app calls.

## Phase 2: Pages

Each task: the route, its components and data hooks, the copy in `copy/en.ts`, Vitest tests with MSW, and a
Playwright journey. Check each page against the Streamlit version and the matching user stories.

### Task 9: Home

Port `frontend/landing.html`, `landing.css` and `landing.js` into `features/home/`: Hero, GoalConsole, Track (the
road drawn on scroll), ReadinessDemo, Archipelago, Catalog, ProgressPreview, ClosingGoal.

- [ ] `useReveal` (IntersectionObserver) and `useRoute` (the road's path and scroll progress) hooks, both turned off
      with reduced motion.
- [ ] Links become router links. The closing goal box opens `/find` with the goal passed in the finder store, not
      in the address.
- [ ] The figures (319 qualifications, 27 sectors, and the rest) stay written into the page, as today.

### Task 10: Account

- [ ] Sign-in dialog, account creation with the privacy notice and consent, the account menu, sign out.
- [ ] Download my data (a JSON file) and delete my account, with a confirmation step inside the page.
- [ ] Actions that need an account (follow a pathway, apply, save) open the dialog and return the learner to the
      same place with their work intact (US-02).

### Task 11: Qualifications Library (US-04)

- [ ] Search and sector filter in the address, 12 cards a page, sector tiles and trade photos, competencies by
      group, and "Explore this pathway" opening the finder with that goal.

### Task 12: Find my pathway (US-01, US-03, US-05, US-06, US-14)

- [ ] Goal: example and sample goals, the goal box (500 characters), "Use again" and "Change goal".
- [ ] Matches: the starting point, the follow-up questions, match cards with score rings and notes, the view-all
      link.
- [ ] Readiness: Basic, Common, then Core, each in its own part, with progress and the result. The 80% and 50%
      bands pick the verdict, as `VERDICTS` does in `app.py` today.
- [ ] Pathway: the verdict, the curated steps, following the pathway, and opening Training with the qualification
      chosen.
- [ ] Session sync for signed-in learners, through `/me/recommendations`.

### Task 13: Training & Assessment (US-07, US-08, US-09)

- [ ] Filters (type, location, region, province, qualification, mode, availability, scholarship) in the address.
- [ ] Results, featured center, program details dialog, and applying for an assessment.
- [ ] Map: clustered pins, popups, layers, my location, routes with travel modes from `GET /api/v1/routes`, saved
      centers, night tiles. Port the Leaflet code from `training_view.py` before restyling it.
- [ ] A complete list without the map, for keyboard and screen-reader users (US-08).

### Task 14: My Progress (US-10, US-11)

- [ ] Saved recommendations, readiness checks, followed pathways with step status, applications (with withdraw),
      goals and certifications, each with its empty state.

### Task 15: Skills Explorer

- [ ] The sentence box calling `/skills-bridge/explore`, the results, occupation details, and the delivery map.

### Task 16: Reports (administrators)

- [ ] Overview, funnel, qualification demand, skill gaps (with a qualification picker) and supply, with the date
      range checked before any request. Tables first; charts only where today's page has them.

## Phase 3: Ship

### Task 17: Accessibility and performance

- [ ] axe passes on every page in both themes. Keyboard-only runs of the main journeys pass (US-13).
- [ ] The initial JavaScript is under 200 KB gzipped. Leaflet is in its own chunk.
- [ ] Lighthouse on a mid-range phone profile: performance 85 or more on Home, the finder and the Library.

### Task 18: Container and deployment

**Files:** `web/Dockerfile`, `docker-compose.yml`, `deploy/Caddyfile`, README "Deployment".

- [ ] A two-stage `web/Dockerfile`: Node 24 builds `dist/`, then `caddy:2-alpine` serves it on port 8080, falling
      back to `index.html` for app addresses, with long cache times for hashed files and none for `index.html`.
- [ ] During the parallel run, Caddy serves the React app at `/beta/` (Vite `base: '/beta/'`) and Streamlit at `/`.
- [ ] Add the Content Security Policy header for the React app.

### Task 19: Parallel run and switch-over

- [ ] Staff test `/beta/` against a parity checklist built from `docs/user-stories.md` and the Streamlit pages.
- [ ] Switch: the React app at `/`, Streamlit at `/classic/` (`STREAMLIT_SERVER_BASE_URL_PATH=classic`) for two
      weeks. Learners sign in once more, because the two apps keep sign-in separately.
- [ ] Remove Streamlit: `frontend/`, its tests, its Python dependencies, the `/classic/` route, and the Streamlit
      sections of the README.

## Effort

For one developer experienced with React and TypeScript. The pages in Phase 2 can be split between two developers
once Phases 0 and 1 are done.

| Phase | Tasks | Developer-days |
|---|---|---|
| 0. Foundations | 1–4 | 4–6 |
| 1. Backend preparation | 5–8 | 5–7 |
| 2. Pages | 9–16 | 28–38 (Training & Assessment and the finder are about half of it) |
| 3. Ship | 17–19 | 5–7, plus two to four weeks of parallel running |
| Total | | 42–58 days: about 8–12 weeks alone, 5–7 weeks with two developers |

## Risks

| Risk | What reduces it |
|---|---|
| The Streamlit app keeps changing and parity keeps moving | Decision 3: freeze it to bug fixes |
| Sign-in or CSRF mistakes expose learner data | Task 5's tests, and a security review before the switch |
| The map takes longer than planned | Port the working Leaflet code first, then restyle |
| A Python team maintaining TypeScript | Strict types, lint in CI, small reviewed pull requests, generated API types |
| Accessibility gets worse after leaving Streamlit's widgets | React Aria Components, axe in CI, keyboard journeys in Playwright |
| Slow on low-end phones | Pages loaded on demand, the size budget in Task 17 |
| Learners confused by two apps | `/beta/` for staff only; one switch date announced in the app |
