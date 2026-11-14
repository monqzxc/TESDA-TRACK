# Docker React root cutover

## Intent

Make the React app the canonical production app at `/` when deploying the full Docker stack, rather than exposing it under `/beta/`. Keep `/beta/...` bookmarks working through redirects and retain the current Streamlit app at `/classic/` during the observation period.

## Approaches

- **Use the documented Vercel production path:** pushes to `main` already deploy React at `/`; EC2 serves only the API. This does not change the full Docker stack the user wants to use.
- **Activate the existing Docker overlay (chosen):** combine `docker-compose.yml` with `docker-compose.react.yml`. It builds React for `/`, routes Streamlit under `/classic/`, and temporarily redirects `/beta/...` to matching root paths. This matches the requested full-Docker behavior and retains a rollback path.
- **Make the overlay the unconditional Compose default:** rejected for now because the repository stages this cutover behind parity and release approvals, and the base stack is the documented rollback configuration.

## Goals and non-goals

- Goal: after an approved Docker cutover, React serves at `/` with no `/beta` in canonical links; old `/beta/...` URLs redirect while preserving query filters.
- Goal: preserve API/MCP routes, security headers, readiness checks, and Streamlit at `/classic/` through the observation period.
- Non-goals: remove Streamlit, skip the existing TASK-103/TASK-076/TASK-077/TASK-084 release gates, merge or push this working branch, or change the documented Vercel deployment.

## Constraints and rollout

The Compose overlay and Caddy routes already implement this behavior. Before activation, staff must complete and record the parity checklist on staging and accept the data, accessibility, and release gates listed in `docs/react-cutover.md`. Preserve the current images for rollback, smoke-test the cutover routes and app flows, and observe for 14 days before considering Streamlit removal. Rollback uses the base Compose stack and does not downgrade the database.

## Acceptance

On the approved deployment, `/` and refreshed React deep links load; `/beta/training?q=manila` redirects to `/training?q=manila`; `/classic/` and its assets/WebSocket work; API readiness and MCP discovery remain healthy; and existing CSP/security headers remain in place.
