# React cutover (TASK-103)

The default stack still serves Streamlit at `/` and React at `/beta/`. The opt-in
`docker-compose.react.yml` overlay rebuilds React for `/`, serves Streamlit at `/classic/`,
and redirects bookmarked `/beta/...` paths to their React equivalents, keeping query filters.
It retains API/MCP routing, security headers and API readiness checks.
The redirect retains the request origin, including its port, so a double slash in a
legacy path cannot become a redirect to another host.

## Before activating

Staff must complete [the parity checklist](parity-checklist.md) on the intended staging
deployment and attach their dated approval and critical-issue results to TASK-103. TASK-076
data evidence, TASK-077 accessibility and TASK-084 release gates must also be accepted.
Record the tested Git commit, image identifiers and release report. Preserve the current
release's frontend and classic images so rollback does not depend on a fresh build.

This configuration is prepared for review; its presence does not record parity approval or
activate the switch. No Streamlit files are removed by this change.

## Validate on the server

Run from the checkout root with the deployment's existing private `.env`:

```sh
docker compose -f docker-compose.yml -f docker-compose.react.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.react.yml run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose exec -T api python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/api/v1/ready', timeout=3).status)"
```

Expect readiness HTTP 200. Optional model or Skills Bridge degradation must be reviewed
in the release report even though it does not remove the API from service.

## Activate after approval

```sh
docker compose -f docker-compose.yml -f docker-compose.react.yml up -d --no-deps --build app web caddy
docker compose -f docker-compose.yml -f docker-compose.react.yml ps
```

Record the actual switch timestamp (including timezone), operator, commit and rollback
image identifiers on TASK-103. Compute the earliest removal date as that timestamp plus
14 full days; it is not 14 days after this configuration was written.

Smoke-test `/`, a refreshed React deep link such as `/find/readiness`, sign-in/sign-out,
profile, guest saving, training, and administrator analytics. Confirm `/beta/training?q=manila`
redirects to `/training?q=manila`. Confirm `/classic/` loads, its assets work, and its
WebSocket stays connected through a form interaction. Check `/api/v1/ready` and the MCP
discovery endpoints, and capture the results on the card. Retain the frontend's existing
CSP headers. Do not include real learner information in screenshots or logs.

Guest drafts use sessionStorage. Open browser tabs do not share storage between tabs;
keep the same tab when following a beta redirect. Streamlit and React sign-in remain separate.

## Roll back

Use the preserved pre-switch images, or rebuild the accepted pre-switch commit with the
base compose configuration. Omit the React overlay:

```sh
docker compose -f docker-compose.yml up -d --no-deps --build app web caddy
```

This rebuilds React for `/beta/`, removes Streamlit's base-path override, and restores
the default Caddy routes. Verify `/`, `/beta/`, sign-in and readiness again. This is a
frontend routing rollback; it does not downgrade the database or remove saved learner work.

## Remove Streamlit after the observation period

Only after the 14-day period has elapsed with accepted monitoring and no unresolved
critical parity defects, remove `classic/`, its tests and requirement entries, the `web`
service, and `/classic/` routing. Fold the accepted React overlay into the default stack
and retain a tested archived rollback release. Review `pytest.ini`, `requirements-dev.txt`,
deployment documentation and CI paths during that removal. Removal is a separate change
after an actual switch; no removal date or completion is claimed here.
