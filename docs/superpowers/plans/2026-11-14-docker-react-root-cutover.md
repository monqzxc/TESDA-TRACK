# Docker React Root Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After release approval, serve React at `/` in the full Docker deployment, preserve `/beta/...` bookmarks with redirects, and keep Streamlit at `/classic/` during observation.

**Architecture:** Use the existing `docker-compose.react.yml` overlay and `deploy/Caddyfile.react`; do not change the default Compose stack or remove Streamlit. Activate only after the staging parity and release gates documented in `docs/react-cutover.md` are recorded as accepted.

**Tech Stack:** Docker Compose, Caddy, React/Vite, Streamlit.

**Spec:** `docs/superpowers/specs/2026-11-14-docker-react-root-cutover-design.md`

## Global Constraints

- React is canonical at `/`; `/beta/...` requests redirect to their equivalent root paths while preserving query filters.
- Keep Streamlit available at `/classic/` through the observation period.
- Preserve API/MCP routes, security headers, readiness checks, and existing CSP headers.
- Do not activate before TASK-103 parity approval and acceptance of TASK-076, TASK-077, and TASK-084 release gates.
- Preserve the current release images for rollback; wait 14 full days after the actual switch before considering Streamlit removal.
- Do not merge or push the current working branch as part of this cutover.

## Review Focus

- `/beta` without a trailing slash must redirect to `/` without a malformed or cross-origin `Location` header.
- Nested `/beta/...` paths and query strings must map to the same root path and filters.
- Direct loads and refreshes of React deep links must return the React app and resolve the intended route.
- `/classic/` assets and Streamlit WebSocket interactions must continue working under the prefix.
- API readiness, MCP discovery, and CSP/security headers must remain available after the proxy switch.

---

### Task 1: Release Gate and Preflight

**Files:**
- Read: `docs/react-cutover.md`
- Read: `docs/parity-checklist.md`
- Read: `docs/2026-10-21-pilot-delivery.md`

**Interfaces:**
- Consumes: the accepted staging evidence and release approvals recorded by staff on TASK-103, TASK-076, TASK-077, and TASK-084.
- Produces: a go/no-go decision. If any approval or evidence is missing, stop without activating the overlay.

- [ ] **Step 1: Confirm staff recorded parity and release approvals**

  Verify the dated staging parity results and acceptance of TASK-076, TASK-077, and TASK-084. Do not infer acceptance from the presence of the overlay or this plan.

- [ ] **Step 2: Confirm rollback images and deployment target**

  Record the current frontend and classic image identifiers and confirm the intended production checkout is clean and on its approved release commit.

- [ ] **Step 3: Validate merged Compose configuration**

  Run: `docker compose -f docker-compose.yml -f docker-compose.react.yml config --quiet`

  Expected: exit 0.

- [ ] **Step 4: Validate the Caddy configuration**

  Run: `docker compose -f docker-compose.yml -f docker-compose.react.yml run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`

  Expected: Caddy reports the configuration is valid. If either validation fails, stop and fix it before deployment.

### Task 2: Activate the Approved Root Cutover

**Files:**
- Uses: `docker-compose.yml`
- Uses: `docker-compose.react.yml`
- Uses: `deploy/Caddyfile.react`

**Interfaces:**
- Consumes: Task 1's go decision and verified rollback image identifiers.
- Produces: the full Docker stack serving React at `/`, Streamlit at `/classic/`, and temporary redirects from `/beta/...`.

- [ ] **Step 1: Activate the overlay without rebuilding unrelated services**

  Run: `docker compose -f docker-compose.yml -f docker-compose.react.yml up -d --no-deps --build app web caddy`

  Expected: Compose targets the app, web, and Caddy services; `--no-deps` prevents restarting their dependencies.

- [ ] **Step 2: Confirm service and API health**

  Run: `docker compose -f docker-compose.yml -f docker-compose.react.yml ps`

  Run: `docker compose exec -T api python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/api/v1/ready', timeout=3).status)"`

  Expected: services are running and readiness prints `200`.

### Task 3: Verify Public Routes and Record Rollout

**Files:**
- Read: `docs/react-cutover.md`
- Record: TASK-103 release evidence

**Interfaces:**
- Consumes: Task 2's active deployment.
- Produces: route, flow, and rollback evidence tied to the tested commit and image identifiers.

- [ ] **Step 1: Verify canonical and compatibility routes**

  Check `/`, a refreshed React deep link such as `/find/readiness`, `/beta/training?q=manila`, and `/classic/`.

  Expected: React loads at `/` and deep links; `/beta/training?q=manila` redirects to `/training?q=manila`; Streamlit loads at `/classic/`.

- [ ] **Step 2: Verify app flows and preserved services**

  Smoke-test sign-in/sign-out, profile, guest saving, training, administrator analytics, a Streamlit form interaction (including its WebSocket), API readiness, MCP discovery, and existing CSP/security headers. Use test accounts only.

- [ ] **Step 3: Record cutover evidence and observation period**

  Record the actual switch timestamp with timezone, operator, tested commit, image identifiers, smoke-test results, and rollback image identifiers on TASK-103. Calculate Streamlit's earliest removal date as 14 full days after the actual switch.

- [ ] **Step 4: Roll back if a critical check fails**

  Run: `docker compose -f docker-compose.yml up -d --no-deps --build app web caddy`

  Expected: the base stack restores Streamlit at `/` and React at `/beta/`. Verify `/`, `/beta/`, sign-in, and API readiness; do not downgrade the database.
