# React cutover (TASK-103)

The React app is the site: the default stack (`docker-compose.yml` with `deploy/Caddyfile`) builds it for `/` and
serves it at the root. The Streamlit app stays at `/classic/`, and the API, MCP and OAuth discovery routes are
unchanged. There is no `/beta/` route and no redirect from it: the parallel run is over.

## Check a deployment

```sh
docker compose config --quiet
docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose up -d --build app web caddy
```

Then smoke-test `/`, a refreshed deep link such as `/find/readiness`, `/explore`, sign-in and sign-out, and
`/classic/` (its assets and WebSocket included), and check `/api/v1/ready`.

## Roll back

Rebuild an earlier release's commit with its own `docker-compose.yml`. Routing only changes; the database and saved
learner work are untouched.

## Remove Streamlit later

Once nobody needs `/classic/`, remove `classic/`, its tests and requirements, the `web` service and the `/classic/`
route, and review `pytest.ini`, `requirements-dev.txt` and CI paths in the same change.
