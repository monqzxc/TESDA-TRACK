# TESDA-TRACK

Career pathway recommendations for TESDA qualifications: learners describe a goal, get matched to
qualifications, see a suggested training or assessment pathway, and check their readiness. Built for a
pilot with real learners, self-hosted on our own server with Docker.

Start with [local setup](#local-development). If you already installed the app, use
[Daily startup](#daily-startup) or [After updating the code](#after-updating-the-code).
For errors, jump to [Troubleshooting](#troubleshooting).

- [Requirements](#requirements)
- [Optional features](#optional-features)
- [Everyday commands](#everyday-commands)
- [Accounts](#accounts) and [viewing the database](#viewing-the-database)
- [Tests](#tests)
- [Deployment](#deployment-own-server-or-vm)
- [Project layout](#project-layout) and [technical background](#roadmap)

## Requirements

For local development on Windows, install:

| Tool | Version / purpose |
| --- | --- |
| Python | **3.13** for the API and Python tools |
| Node.js | **24**, including npm, for the React frontend |
| Docker Desktop | Running with Linux containers; provides PostgreSQL 17, pgvector and PostGIS |
| Git | To clone and update the repository |
| Laragon | Optional; HeidiSQL can view the Docker database |

The steps below use **PowerShell**. They call the virtual environment's Python directly and use
`npm.cmd`, so you do not need to activate the environment or change PowerShell's execution policy.

## Local development

You will run three services: **Docker database → Python API → React frontend**.
The React app is at [localhost:5173](http://localhost:5173). Streamlit is optional.

### 1. Open the project folder

Open PowerShell in the folder containing `README.md`, `.env.example` and `docker-compose.dev.yml`.
For this checkout:

```powershell
cd D:/Projects/Laragon/TESDA-TRACK
py -3.13 --version
node --version
npm.cmd --version
docker compose version
```

Use your own checkout path if different. Expect Python 3.13 and Node v24.
If a command is missing, install the corresponding requirement and open a new terminal.

### 2. Install dependencies

Run from the **repository root**:

```powershell
py -3.13 -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements-dev.txt
Push-Location frontend
npm.cmd ci
Pop-Location
```

The first install needs internet access. Wait for both installations to succeed before continuing.
If `.venv` already exists with Python 3.13, skip its creation.

### 3. Configure the environment

From the **repository root**, create `.env` only if it does not already exist:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
./.venv/Scripts/python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
```

Run the Python command three times to generate separate values for `SECRET_KEY`,
`POSTGRES_PASSWORD` and `APP_DB_PASSWORD`. Edit `.env` with those values:

```dotenv
SECRET_KEY=PASTE_FIRST_GENERATED_VALUE
POSTGRES_PASSWORD=PASTE_SECOND_GENERATED_VALUE
APP_DB_PASSWORD=PASTE_THIRD_GENERATED_VALUE

DATABASE_URL=postgresql+psycopg://tesda_track:PASTE_THIRD_GENERATED_VALUE@127.0.0.1:5433/tesda_track
TEST_DATABASE_URL=postgresql+psycopg://tesda_track:PASTE_THIRD_GENERATED_VALUE@127.0.0.1:5433/tesda_track_test
API_BASE_URL=http://127.0.0.1:8000
ENVIRONMENT=development

# Start with keyword matching; enable optional integrations later.
SEMANTIC_SEARCH_ENABLED=false
SKILLS_BRIDGE_MCP_ENABLED=false
```

Replace every placeholder. The password inside **both database URLs** must match `APP_DB_PASSWORD`.
Keep the `_test` database separate: tests rebuild its schema. Keep existing secrets when updating an
existing installation; changing `.env` does not change passwords already stored in PostgreSQL.

**Optional features:** the example starts with keyword matching and disables Skills Explorer.
Accounts, the catalog and the pathway finder work without either integration.
See [optional features](#optional-features) to enable them later. Keep `.env` private.

### 4. Start the database and create the tables

Open Docker Desktop and wait for its engine to start. From the **repository root**:

```powershell
docker compose -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.dev.yml exec db pg_isready -h 127.0.0.1 -U postgres -d tesda_track
```

Wait for `accepting connections`; if it is still starting, repeat the second command.
The database listens on **127.0.0.1:5433**. The first startup creates `tesda_track` and `tesda_track_test`.

Apply all migrations and load the catalog:

```powershell
Push-Location backend
../.venv/Scripts/python.exe -m alembic upgrade head
../.venv/Scripts/python.exe -m alembic current
../.venv/Scripts/python.exe -m tesda_track.seed
Pop-Location
```

Expect the current migration to show `(head)`, and the seed command to finish without errors.
**Do not skip migrations:** the API can pass its health check while signed-in features fail because
a required table is missing.

### 5. Start the API and frontend

Keep these **two terminals open**. Start each terminal in the repository root.

**Terminal 1 — API:**

```powershell
cd backend
../.venv/Scripts/python.exe -m uvicorn tesda_track.main:app --reload
```

Wait for `Application startup complete`. Check [API health](http://127.0.0.1:8000/health);
it should return `{"status":"ok","database":"ok"}`.
The interactive API documentation is at [API docs](http://127.0.0.1:8000/api/docs).

**Terminal 2 — React frontend:**

```powershell
cd frontend
npm.cmd run dev -- --port 5173 --strictPort
```

Open [TESDA-TRACK](http://localhost:5173). The frontend forwards `/api` requests to port 8000.
Use the same hostname throughout a session; `localhost` and `127.0.0.1` have separate browser cookies.

### 6. Check that setup worked

1. Open **Find my pathway**, enter `I want to become a welder`, and get a recommendation.
2. Create a learner account, sign in, and submit the goal again.
3. Confirm that recommendations load and the saved journey appears in **My Progress**.

With the supplied catalog, the welding goal should include **Manual Metal Arc Welding (MMAW) NC II**.
Testing both guest and signed-in requests checks the catalog, matching and saved-record tables.
If either fails, use [Troubleshooting](#troubleshooting).

## Daily startup

After the initial setup, start Docker Desktop. In a terminal at the **repository root**:

```powershell
docker compose -f docker-compose.dev.yml up -d
cd backend
../.venv/Scripts/python.exe -m uvicorn tesda_track.main:app --reload
```

In a second terminal at the **repository root**:

```powershell
cd frontend
npm.cmd run dev -- --port 5173 --strictPort
```

Open [localhost:5173](http://localhost:5173). Stop each development server with **Ctrl+C**.
To stop the database while keeping its data, run
`docker compose -f docker-compose.dev.yml stop` from the repository root.

## After updating the code

Stop the API and frontend with **Ctrl+C**, then run these commands from the **repository root**
after pulling or switching to the updated code:

```powershell
./.venv/Scripts/python.exe -m pip install -r requirements-dev.txt
Push-Location frontend
npm.cmd ci
Pop-Location
docker compose -f docker-compose.dev.yml up -d
Push-Location backend
../.venv/Scripts/python.exe -m alembic upgrade head
../.venv/Scripts/python.exe -m alembic current
../.venv/Scripts/python.exe -m tesda_track.seed
Pop-Location
```

Confirm `(head)`, then use [Daily startup](#daily-startup). Local development does **not** apply migrations
automatically. Check new settings in `.env.example` and add them to your existing `.env`.
If the catalog or model changed and semantic search is enabled, sync embeddings as described below.

## Optional features

### Semantic matching

Semantic matching helps with goals that do not use exact catalog keywords. Set
`SEMANTIC_SEARCH_ENABLED=true` in `.env`, then run from the **repository root**:

```powershell
Push-Location backend
../.venv/Scripts/python.exe -m tesda_track.embeddings sync
Pop-Location
```

With `EMBEDDING_MODEL` and `EMBEDDING_MODEL_PATH` unset, this downloads the default model on first use
(about 470 MB). Expect an `Embeddings: ... created, ... updated.` message. Restart the API afterwards.
If you want to finish setup without the download, set `SEMANTIC_SEARCH_ENABLED=false` and restart the API.

For a shared fine-tuned model, follow [the model setup guide](backend/models/README.md).
Model folders are not included in Git. Set both its model name and local folder path, then sync again;
stored vectors belong to a particular model.

### Skills Explorer

Set `SKILLS_BRIDGE_MCP_ENABLED=true`, `SKILLS_BRIDGE_CLIENT_ID` and `SKILLS_BRIDGE_CLIENT_SECRET`
in `.env` using credentials issued to your application, then restart the API.
See [Skills Bridge](#skills-bridge) for details. This service is separate from the local pathway finder.

### Classic Streamlit app

With the database and API running, open another terminal at the **repository root**:

```powershell
cd classic
../.venv/Scripts/python.exe -m streamlit run app.py
```

Open [the classic app](http://localhost:8501). This terminal is optional when using the React frontend.

## Everyday commands

Start each command in the directory shown.

| Task | Directory | Command |
| --- | --- | --- |
| Database status | Repository root | `docker compose -f docker-compose.dev.yml ps` |
| Database logs | Repository root | `docker compose -f docker-compose.dev.yml logs --tail=100 db` |
| Apply migrations | `backend/` | `../.venv/Scripts/python.exe -m alembic upgrade head` |
| Current / available migration | `backend/` | `../.venv/Scripts/python.exe -m alembic current` / `../.venv/Scripts/python.exe -m alembic heads` |
| Reload catalog data | `backend/` | `../.venv/Scripts/python.exe -m tesda_track.seed` |
| Sync embeddings | `backend/` | `../.venv/Scripts/python.exe -m tesda_track.embeddings sync` |
| Python tests | Repository root | `./.venv/Scripts/python.exe -m pytest` |
| Frontend tests | `frontend/` | `npm.cmd test` |
| Frontend lint / build | `frontend/` | `npm.cmd run lint` / `npm.cmd run build` |
| Browser tests | `frontend/` | First `npx.cmd playwright install chromium`, then `npm.cmd run e2e` |
| Refresh API types after API changes | `frontend/` | `npm.cmd run api:types` |
| Format frontend code | `frontend/` | `npm.cmd run format` |

To create a migration, run `../.venv/Scripts/python.exe -m alembic revision --autogenerate --rev-id NEXT_NUMBER -m "short description"`
from `backend/`. Replace `NEXT_NUMBER` with the next unused number after checking
`backend/migrations/versions/`, and review the generated file before applying it.

For real training and assessment registries, see the [registry import and review workflow](docs/registry-import.md).
For test database behavior and optional real-model checks, see [Tests](#tests).

### Frontend styles

**Styles** are Tailwind CSS utility classes in the components. `src/styles/app.css` sets up the theme: the
colors come from the `--track-*` tokens in `src/styles/tokens.css` (copied from `classic/styles.css`, and
`tokens.test.ts` fails if the two drift apart), plus the app's own type sizes, corners and breakpoints in place
of Tailwind's. A few things to know:

- **No Preflight.** `src/styles/base.css` is the reset. A border style class styles every side, so for a border
  on one side start from `border-0` (`border-0 border-t border-dashed`).
- **Write class names out whole.** Tailwind only generates the classes it finds in the source, so a name built
  from a template string (`` `text-${size}` ``) gets no CSS. Map each value to a full class name instead.
- **One class per property.** When two classes on an element set the same property, Tailwind's rule order
  decides which one wins, not their order in `className`. Shared looks such as `button()` in
  `src/styles/buttons.ts` pick one class per property for that reason.
- **React Aria's states** have variants: `data-hovered:`, `data-pressed:`, `data-selected:` and so on, and
  `hovered:` for mouse hover on both React Aria widgets and plain links.
- **Leaflet's own markup** (map controls, popups) is styled in `src/features/training/center-map.css`, outside
  the layers so it beats `leaflet.css`.
- `npm run format` sorts the classes (`prettier-plugin-tailwindcss`).

## Troubleshooting

### "We can't reach the TESDA-TRACK service right now"

This message can mean a stopped service **or a server error**. Check these in order.
Run the commands from the **repository root** in a third terminal:

```powershell
docker compose -f docker-compose.dev.yml ps
curl.exe -fsS http://127.0.0.1:8000/health
curl.exe -fsS http://localhost:5173/api/v1/qualifications
```

| Result | What to do |
| --- | --- |
| Docker is unavailable or no database is running | Open Docker Desktop, then run `docker compose -f docker-compose.dev.yml up -d`. |
| Port 8000 refuses the connection | Start the API using [Daily startup](#daily-startup). Read its terminal if it exits. |
| Health returns 503 or `database: unreachable` | Check database status, port 5433, and the password in `DATABASE_URL`. See the database fixes below. |
| Health works, but the frontend API URL fails | Keep both servers running. Check the frontend terminal for proxy errors; the default API target is `http://127.0.0.1:8000`. |
| Catalog works, but a recommendation fails | Check the API terminal's traceback. If a table or column is missing, apply migrations using the next section. |
| Both URLs work, but the page still fails | Refresh and reproduce once. In browser DevTools → Network, note the failing `/api/` request and HTTP status; match it to the API terminal error. |

A working landing page does not prove the API is running. A healthy API only confirms a database
connection; it does not verify that every migration has been applied.

### Guest recommendations work, but signed-in recommendations fail

A missing migration can break saved recommendations while guest matching still works. For example,
migration `0009` adds the `write_receipt` table used to retry saves safely. Without it, a logged-in
learner can receive the service error when submitting `I want to become a welder`, including in incognito.

Apply **all available migrations**, not just a fixed revision. From the **repository root**:

```powershell
Push-Location backend
../.venv/Scripts/python.exe -m alembic upgrade head
../.venv/Scripts/python.exe -m alembic current
../.venv/Scripts/python.exe -m alembic heads
Pop-Location
```

The current revision must match the available head. Refresh the page and retry while signed in.
This does not require clearing browser data or resetting the database.
If it still fails, read the new API traceback rather than assuming it has the same cause.

### Database connection or password fails

**Connection refused on port 5433:** start Docker Desktop, then run from the repository root:

```powershell
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml logs --tail=100 db
docker compose -f docker-compose.dev.yml exec db pg_isready -h 127.0.0.1 -U postgres -d tesda_track
```

**`password authentication failed for user "tesda_track"`:** both database URLs must contain the
password originally assigned to the `tesda_track` role. Changing `APP_DB_PASSWORD` in `.env` alone
does not change an existing database password.

Restore the correct password in `.env`, or change the role's password without deleting data.
From the **repository root**, open PostgreSQL:

```powershell
docker compose -f docker-compose.dev.yml exec db psql -U postgres -d tesda_track
```

At the `psql` prompt, run:

```text
\password tesda_track
\q
```

Enter the new password twice when prompted. Update `APP_DB_PASSWORD`, `DATABASE_URL` and
`TEST_DATABASE_URL` to match, then restart the API. Generated URL-safe passwords avoid special-character
escaping in database URLs.

**PostGIS or vector extension errors:** check that both URLs use **127.0.0.1:5433** and that you started
the database with `docker-compose.dev.yml`. Laragon's database on port 5432 is separate.
If the Docker database itself reports a missing extension, check its initialization logs before continuing.

Avoid `docker compose ... down -v` as a troubleshooting shortcut: it deletes the database volume,
including accounts and saved journeys. Migrations and password corrections do not need a reset.

### A port is already in use

Reuse the existing TESDA-TRACK server if it is healthy, or stop its terminal with **Ctrl+C** before
starting another copy. To inspect listeners:

```powershell
Get-NetTCPConnection -State Listen |
    Where-Object { $_.LocalPort -in 5173, 8000, 5433 } |
    Select-Object LocalAddress, LocalPort, OwningProcess
```

If another application needs the port:

| Port | Alternative |
| --- | --- |
| Frontend 5173 | From `frontend/`, run `npm.cmd run dev -- --port 5174 --strictPort`, then use `http://localhost:5174`. |
| API 8000 | Start Uvicorn with `--port 8001`. In the frontend terminal, set `$env:API_PROXY = "http://127.0.0.1:8001"` before starting Vite. If using Streamlit, also update `API_BASE_URL` in `.env`. |
| Database 5433 | Change the host mapping in `docker-compose.dev.yml`, for example to `127.0.0.1:5434:5432`, and use port 5434 in both database URLs. Run the database `up -d` command again. |

If you previously overrode `API_PROXY`, remove that override with
`Remove-Item Env:API_PROXY -ErrorAction SilentlyContinue` in the frontend terminal and restart Vite
to return to port 8000. The React frontend uses this proxy setting; `API_BASE_URL` configures the classic app.

### Installation, catalog, model and sign-in problems

| Problem | What to do |
| --- | --- |
| `npm.ps1 cannot be loaded` or script execution is disabled | Use `npm.cmd` / `npx.cmd` and the explicit `.venv/Scripts/python.exe` commands shown above. |
| `py`, `node` or Docker is not recognized | Install the requirement and reopen PowerShell. If Python is installed without the launcher, check `python --version` is 3.13 and use `python -m venv .venv`. |
| Python reports a missing module | Run `./.venv/Scripts/python.exe -m pip install -r requirements-dev.txt` from the repository root; use that same Python to start the API. |
| Settings validation fails at startup | Check the repository-root `.env`: database URL, a `SECRET_KEY` of at least 32 characters, and both Skills Bridge credentials or neither. Restart the API after edits. |
| `npm ci` fails | Verify Node 24 and internet access, then retry from `frontend/`. If npm reports a lockfile mismatch, restore matching `package.json` and `package-lock.json` from the same revision. |
| Catalog is empty | Apply migrations, then run `../.venv/Scripts/python.exe -m tesda_track.seed` from `backend/`. Refresh the page. |
| Model download fails, matching waits on model loading, or the configured folder is missing | Set `SEMANTIC_SEARCH_ENABLED=false` in `.env` and restart the API to use keywords. To enable it again, follow [Semantic matching](#semantic-matching), confirm the folder exists, and sync embeddings. |
| Skills Explorer asks you to contact the administrator | Configure both issued Skills Bridge credentials, or disable the integration. Restart the API; these credentials are not needed for Find my pathway. |
| Sign-in disappears or a request returns 401 | Sign in again on the same hostname. Incognito has its own cookies. For local HTTP development, use `ENVIRONMENT=development`; production sessions require HTTPS. |
| Sign-in is temporarily locked | Wait 15 minutes after five failed attempts, then use the correct password. |

### Full Docker deployment fails

The full stack uses `docker-compose.yml`; local development uses `docker-compose.dev.yml`.
They have separate databases. Do not mix their commands when diagnosing an installation.

From the **repository root**, inspect the full stack:

```powershell
docker compose ps -a
docker compose logs --tail=100 migrate api db caddy
```

Resolve a failed migration before starting the API. If ports 80/443 are occupied by Laragon, stop its
web server or choose unused `HTTP_PORT` and `HTTPS_PORT` values in `.env`.
For production sign-in, serve the app over HTTPS. See [Deployment](#deployment-own-server-or-vm).

If a failure remains, collect the failed command or request, HTTP status, and the relevant terminal
error. Remove passwords, tokens and learner details before sharing logs.

## Project layout

```
Browser ──HTTPS──▶ Caddy ──▶ Streamlit (classic/) ──HTTP──▶ FastAPI (backend/) ──▶ PostgreSQL 17
                                                     └── internal network only ──┘   + pgvector + PostGIS
```

- **backend/**: FastAPI + SQLModel (SQLAlchemy 2.0) + PostgreSQL, with migrations in Alembic. It is the
  only component that touches the database.
- **frontend/**: the React app (React, Vite, TypeScript) that will replace the Streamlit app. Until the switch,
  Caddy serves it at `/beta/`. It calls the API at `/api/v1/` on the same domain.
- **classic/**: the Streamlit app, still serving `/` until the switch. It has no database credentials and calls
  the API through `api_client.py`.
- **deploy/**: the PostgreSQL image (`deploy/postgres/`, PostgreSQL 17 with pgvector and PostGIS) and the
  Caddy configuration.
- **docker-compose.dev.yml**: the local development database.
- **docker-compose.yml**: the full single-server deployment.

## Roadmap

The backend is built in five parts, in order:

| #   | Part                              | Status | What it adds                                                                                                                                              |
| --- | --------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Foundation                        | Done   | FastAPI, SQLModel, PostgreSQL, Alembic, the qualification catalog                                                                                         |
| 2   | Learner accounts and records      | Done   | Sign-in, saved recommendation sessions, readiness checks, goals, certifications, data export and deletion                                                 |
| 3   | Pathways, training and assessment | Done   | Regions, training providers and programs, assessment centers, schedules and applications, pathway progress, "near me" search with PostGIS                 |
| 4   | Integrations and AI               | Done   | Semantic search with a local embedding model (pgvector), weighted training rankings with an audit trail, a PostgreSQL cache, and the Skills Bridge client |
| 5   | Reporting and analytics           | Done   | Overview, learner funnel, demand by qualification, skill gaps per competency, and supply by region, for administrators                                    |

**How pathway recommendations work.** Goals are processed locally with PostgreSQL and a local embedding
model. The separate Skills Bridge tab sends only the skill or role terms extracted from a learner's explicit
short request to that service.

- **Meaning:** pgvector compares a learner's goal with qualifications and training programs. The
  embeddings come from one local model,
  [`intfloat/multilingual-e5-small`](https://huggingface.co/intfloat/multilingual-e5-small), which
  handles Filipino and Taglish and runs on a CPU. It catches goals that share no words with the catalog,
  such as "I want to take care of elderly people abroad".
- **Keywords:** each qualification's keywords (its name, its jobs, and the Filipino words in
  `backend/seed/sources/keywords_tl.json`) count as direct evidence, so a goal that names a trade, in
  English or Filipino, finds it reliably. Qualification matches blend both parts (`MATCH_WEIGHT_KEYWORD`,
  0.5 by default). PostgreSQL full-text search is a possible next step for searching unit descriptions.
- **Distance:** PostGIS measures how far training providers and assessment centers are from the
  learner's region.
- **Ranking training programs:** the score is a weighted sum: meaning 50, distance 20, an assessment
  available nearby 15, start date 10, and the learner's stated preferences 5. Each response shows every
  part with a plain-language explanation, and every ranking is saved in `ranking_audit`. The audit keeps a
  hash of the goal, never the text, and a location rounded to about 10 km.
- **Without the model:** if semantic search is off or the model can't load, everything falls back to the
  keyword rules, and the app keeps working.

The model's raw similarities are close together for related and unrelated goals alike, so a
qualification counts by its **z-score**: how many standard deviations its similarity stands above the
whole catalog's. I tested 32 sample goals against the 319-qualification catalog:

- Goals with no TVET equivalent (astronaut, lawyer, police, politician) scored 3.5 or less.
- Most related goals scored 4 or more.

The band `SEMANTIC_Z_FLOOR` (3.0) to `SEMANTIC_Z_CEILING` (5.0) favors precision. A goal the model
isn't sure about gets no match rather than a wrong one, and the Filipino keywords cover common trades the
model misses. Recalibrate the band once the pilot collects real goals and outcomes.
`TESDA_MODEL_TESTS=1` runs a guard test against the real catalog. It currently fails on 2 of its 13 goals with the
adopted local model (a solar-panel goal ranks Carpentry first; "work in a call center" scores 21, under the minimum
of 25) and passes with the base model; see `docs/ml/2026-10-09-matching-model-evaluation.md`. Three job titles
(Mechanical Drafting NC I, Machining NC III, FCAW NC III) were corrected after the model was trained, and they were
present in its training data; the model was not retrained.

The pilot serves a copy of the model fine-tuned on the TESDA catalog, `tesda-track/tesda-e5-small-v1`,
with its own band in `calibration.json`: on held-out goals it ranked the right qualification first more
often, in English, Filipino and Taglish, and still gave no match to almost all goals with no TVET
equivalent ([evaluation](docs/ml/2026-10-09-matching-model-evaluation.md)). The model folder is not in git;
`backend/models/README.md` explains how to serve it. With `EMBEDDING_MODEL` and `EMBEDDING_MODEL_PATH` unset,
the API uses the base model above.

The training weights (`RANKING_WEIGHTS__SEMANTIC`, `__PROXIMITY`, `__ASSESSMENT`, `__SCHEDULE`,
`__PREFERENCE`) must add up to 1 and are set in `.env`.

Learners can optionally personalize the finder with a versioned structured assessment. Its separate
35/25/15/15/10 policy uses interests, reported skills, career goals, location and practical preferences.
Both policies expose missing evidence and effective weights; unavailable models no longer receive full
semantic credit. See [Structured assessments and scoring](docs/structured-assessments.md) for the workflow,
API, migration `0007`, and configuration.

Assessment-center comparisons now use a distinct verified schedule ranker with explicit exam fee/date
constraints, explained fit scores, and direct application tracking. Open **Compare assessment centers**
in **Training & Assessment**. See [Assessment-center ranking and portal integration](docs/assessment-center-ranking.md)
for eligibility checks, pagination, historical snapshots, and the completed application/certificate flow.

Run `.venv/Scripts/python.exe scripts/release_check.py --build-images` for repeatable relevance,
constraint, regression, migration and container checks. It saves reports and fails unmet release gates.
See [Evaluation and release checks](docs/evaluation-and-release-checks.md) and the
[2026-10-14 validation report](docs/2026-10-14-release-validation.md) for measured results and current blockers.

### Recommendation feedback

At the end of Find my pathway (the React app), under the recommendation, learners are asked **"Are you satisfied
with this recommendation?"** with Yes and No. After No they can pick one optional reason: the wrong qualification, a
readiness result that seems wrong, or a pathway that isn't helpful. The reason says which part to fix: matching, the
readiness rules or the curated pathways. Guests and signed-in learners can both answer.

Each answer is a row in `recommendation_feedback`, kept with the numbers behind the recommendation:

- the chosen qualification, how many matches the learner saw, and the chosen one's place and score among them (no
  place means they picked it from the library)
- its keyword strength and the **raw z-score** of its meaning similarity, the number `SEMANTIC_Z_FLOOR` and
  `SEMANTIC_Z_CEILING` are calibrated on, and the embedding model and parameters that produced them
- the intent, years of experience and certification as matching read them, and the readiness score and level
- whether the learner was signed in, but not who

The goal's words are never stored, only the keyed hash the ranking audit uses, and the answer isn't linked to an
account. The finder sends the goal, profile, qualification and readiness answers with the answer; the API works the
matches and readiness out again rather than trusting numbers from the browser, so every row says what this server's
matching gave. Each client address may send `FEEDBACK_RATE_LIMIT_PER_MINUTE` answers a minute (30).

Administrators see the results under **Reports → Recommendation feedback** (`GET /api/v1/admin/reports/feedback`):
satisfaction overall, by where the qualification stood among the matches, reasons for No, by model and by
qualification. Satisfaction with a top match is the pilot's live measure of matching. Compare it across models
before adopting a fine-tuned one, and plot satisfaction against `z_score` to recalibrate the semantic band. The
answers are self-selected, so treat them as a signal next to the held-out evaluation in `backend/training/`, not a
replacement for it.

### Skills Bridge

The **Skills Explorer** tab (powered by Skills Bridge) connects to the read-only MCP endpoint at
[mcp.skills-bridge.ph/mcp](https://mcp.skills-bridge.ph/mcp), through FastAPI. It distinguishes target job
titles from capabilities: “welder” and “programmer” use the bounded occupation-title lookup, while “welding”,
“JavaScript”, and “network configuration” use `match_skills`. It then supports related qualifications, a
preview of up to 50 occupation skills, and the international mappings actually returned by the provider.
Input-match scores are not readiness assessments; international mappings are not certification equivalencies.
No qualifications are imported into the local catalog.

The integration is enabled by default. Skills Bridge requires sign-in with the OAuth client credentials grant, so set
`SKILLS_BRIDGE_CLIENT_ID` and `SKILLS_BRIDGE_CLIENT_SECRET` to the client issued to TESDA Track; without them every
lookup fails with a message asking learners to contact the administrator. The backend requests an access token from
`SKILLS_BRIDGE_TOKEN_URL` (default `https://skills-bridge.ph/oauth/token`, where Skills Bridge issues such clients)
with the `mcp` scope, and reuses it until shortly before it expires. If Skills Bridge refuses a token, the backend requests a new one, once. Set
`SKILLS_BRIDGE_MCP_ENABLED=false` to disable the integration. `SKILLS_BRIDGE_MCP_URL` and
`SKILLS_BRIDGE_TIMEOUT_SECONDS` configure the connection, and `SKILLS_BRIDGE_MCP_TOKEN` can supply a fixed bearer
token instead of the client credentials. Restart the backend after changing settings. The legacy REST settings are
separate and are not required for MCP.

- `POST /api/v1/skills-bridge/matches`: accepts 1–25 extracted capability terms, each at most 80 characters.
- `POST /api/v1/skills-bridge/occupations/search`: finds occupations by title, Skills Bridge's exact title or alias
  match first (`occupation_curriculum_profile`), then titles containing the term (`graph_search`). Every term keeps
  a place among the results.
- `GET /api/v1/skills-bridge/occupations/{id}`: retrieves the occupation's promulgated qualifications and bounded
  skills/mapping previews.
- `POST /api/v1/skills-bridge/explore`: Skills Explorer in one request, for the React app. It takes `{"text": ...}`
  (up to 500 characters), extracts the skill and role terms on the server, runs the two lookups above as needed, and
  returns the extracted terms with the combined matches. Only the extracted terms reach Skills Bridge; the text is
  not logged or cached. Each lookup counts against the per-client limit, as the Streamlit app's two calls do, and
  text with no usable terms returns `searched: false` with a `reason` without contacting Skills Bridge.

Only extracted skill or role terms and public occupation IDs leave the backend. Account details and saved learner
records are not forwarded. The application owns all tool names. Terms travel only as plain tool arguments, and the
only Cypher sent is two fixed reads keyed by an occupation ID, so nothing a learner types becomes a query. Responses
are cut down to the fields the portal shows before they are cached or returned. POST carries read-only MCP requests;
when the server issues an `Mcp-Session-Id`, the client ends that session with a DELETE after each lookup.
Upstream errors remain local to the Skills Bridge panel, and no request is sent just by opening its tab.

Lookups are cached in PostgreSQL for `SKILLS_BRIDGE_CACHE_TTL_SECONDS` (an hour by default). Cache keys are
hashes, so search terms are stored only inside the cached response, never with who asked, and the API deletes
expired entries every 10 minutes. A cached answer keeps its original `retrieved_at`.

Each client address may make `SKILLS_BRIDGE_RATE_LIMIT_PER_MINUTE` lookups a minute (20; IPv6 clients count per
/64 network), and all clients together may send `SKILLS_BRIDGE_UPSTREAM_PER_MINUTE` uncached lookups (120). Over
either limit the API answers 429 with a `Retry-After` header, while cached answers keep being served. Learners
behind one public address, such as a training center's network, share the per-client limit, so raise it for
such sites. The overall cap protects Skills Bridge rather than availability: clients on several addresses can
use it up for a minute, which only delays new lookups in the Skills Bridge panel.

Caddy sets `X-Forwarded-For` to the connecting address (a client cannot supply its own), the API and the
Streamlit app trust it, and the app passes each learner's address on to the API. The limits are kept in memory,
so they assume the single API process the Dockerfile starts.

Database-free checks (run these separately from the database integration suite):

```bash
.venv/Scripts/python -m pytest --confcutdir=backend/tests/unit backend/tests/unit
.venv/Scripts/python -m pytest --confcutdir=classic/tests classic/tests/test_frontend_states.py classic/tests/test_skills_bridge_ui.py
```

### Frontend presentation

Native Streamlit theme settings live in `classic/.streamlit/config.toml`; scoped layout and responsive
styles live in `classic/styles.css`. `classic/presentation.py` provides escaped branding and reusable
page elements. The finder, qualification library, training, progress, account dialogs, and reports use
the same spacing, blue palette, accessible form controls, and empty/error states. Inactive tabs do not
make page-specific requests, and switching tabs preserves entered goals and filters.

### Light and dark themes

The app follows the device's light or dark setting. Learners can also pick **System**, **Light** or **Dark** in
the menu at the top right (⋮), and the browser remembers their choice.

- **Streamlit's widgets** take their colors from `[theme.light]` and `[theme.dark]` in
  `classic/.streamlit/config.toml`.
- **The app's own elements** take theirs from the `--track-*` tokens in `classic/styles.css`: light values on
  `:root`, dark values on `:root[data-theme="dark"]`. A script in `app.py` (`THEME_SYNC`) sets `data-theme` to the
  theme Streamlit is showing. The center map and the Skills Explorer map use the same tokens inside their
  components, and darken their map tiles at night. The landing page has its own light and dark colors in
  `landing.css`.
- **Icons** in `presentation.py` are images, so each one carries its dark color too (`DARK_INK`).
- **Adding a color:** give it a value in both themes. `classic/tests/test_theme.py` fails when one is missing.

### Landing page (Home)

The app opens on **Home**, a landing page with its own top bar instead of the sidebar. Its links open the
other pages, and its goal box opens Find my pathway with that goal filled in for the learner to review. It
needs no API, so it shows even while the service is down.

- **Files:** `classic/landing.html`, `landing.css` and `landing.js`, mounted by `landing_view.py` as one
  `st.components.v2` component. The component renders in a shadow root, so its styles and the app's don't
  mix. Clicks come back as triggers, which `follow_landing()` in `app.py` turns into page changes.
- **Assets:** `server.enableStaticServing` serves `classic/static/` at `app/static/`: the photos in
  `static/landing/` and the fonts in `static/fonts/`. The fonts are declared under `[[theme.fontFaces]]` in
  `.streamlit/config.toml`, because a font face declared inside a shadow root doesn't load.
- **Scroll reveal:** a road drawn from the logo winds through the four finder steps as the page scrolls, and
  sections fade in as they enter the screen. With reduced motion turned on, everything shows at once.
- **Figures are written into the page:** 319 qualifications, 27 sectors, 738 jobs, 4,981 units of
  competency, the NC level counts, the 18 regional centers, the ranking weights and the readiness bands
  (80% and 50%). Update them when the catalog, `regions.json`, `RANKING_WEIGHTS__*` or
  `skill_gap_service.py` change. The match percentages in the hero and in step 2 are labelled examples.

## Viewing the database

The dev database accepts connections on **127.0.0.1, port 5433**.

### In Laragon (HeidiSQL)

1. In Laragon, click **Database**. This opens HeidiSQL.
2. Click **New** and name the session `TESDA-TRACK (Docker)`.
3. Fill in:

   | Field         | Value                                                       |
   | ------------- | ----------------------------------------------------------- |
   | Network type  | PostgreSQL (TCP/IP)                                         |
   | Hostname / IP | `127.0.0.1`                                                 |
   | User          | `tesda_track`                                               |
   | Password      | your `APP_DB_PASSWORD` from `.env`                          |
   | Port          | `5433`                                                      |
   | Database(s)   | `tesda_track` (or `tesda_track_test` for the test database) |

4. Click **Save**, then **Open**. The tables are under **public**. The pgvector and PostGIS objects are
   under **extensions**.

For administrator tasks, connect as `postgres` with your `POSTGRES_PASSWORD` instead.

The Docker database must be running. Laragon's own PostgreSQL (port 5432) is a separate server, and
TESDA-TRACK doesn't use it. Both can run at the same time.

### From the command line

```bash
docker compose -f docker-compose.dev.yml exec db psql -U postgres -d tesda_track
```

Any other client (DBeaver, pgAdmin, VS Code extensions) works with the same host, port and user.

## Accounts

Learners can use the pathway finder without an account. Signing in (sidebar) saves recommendation
sessions, readiness checks, goals and certifications under **My Progress**. To register, learners must
agree to the privacy notice. From the sidebar they can download all their data or permanently delete
their account; the API deletes every record they own along with it.

Create the first administrator from the backend directory:

```bash
../.venv/Scripts/python -m tesda_track.cli create-admin --email you@example.com --name "Your Name"
# Docker: docker compose run --rm -e TESDA_ADMIN_PASSWORD=... api python -m tesda_track.cli create-admin --email ...
```

Passwords are hashed with Argon2. Access tokens are JWTs signed with `SECRET_KEY`. Changing a password
revokes every existing token, and five failed sign-ins lock an account for 15 minutes.

The browser app signs in with `POST /api/v1/auth/session` (the same form as `/auth/token`) instead. It puts the
token in an `HttpOnly`, `SameSite=Strict` cookie named `tesda_session` (also `Secure` in production) and
`DELETE /api/v1/auth/session` signs out. Requests signed in by the cookie that aren't reads (`GET`, `HEAD`,
`OPTIONS`) must send an `X-Requested-With` header, and so do both session routes. Bearer tokens keep working
as before, need no extra header, and win if a request has both. Cookie sign-in works only when the app and the
API share an origin (through Caddy, or the Vite proxy in development): CORS deliberately allows neither
credentials nor `X-Requested-With`, and loosening that needs a security review.

### Admin management workspace

Full administrators see **Admin management** in the React app at `/admin`. The workspace provides:

- an operational overview with links to reports, the delivery network, and the qualification catalog;
- paginated learner accounts, role assignment, and an editable role-permission matrix where
  administrators compose roles from the backend's fixed permission vocabulary, with each admin
  section gated on the permission its own endpoints require;
- MCP partner client creation with selectable expected tools, one-time credential display, secret rotation, revocation,
  scopes, and rate limits;
- aggregate recommendation activity and qualification-demand oversight; and
- anonymous, aggregate recommendation feedback and dissatisfaction reasons.

Analysts continue to see aggregate **Reports** without receiving the broader management workspace. API authorization
remains authoritative: hiding the page or navigation is not treated as an access control.

## Training, assessment and pathways

Service recommendations require current qualification-specific verification and satisfied prerequisites.
See [Service verification and eligibility](docs/service-verification.md) for migration `0006`, administrator evidence imports, availability updates, and the distinction between confirmed results and records requiring verification.

Learners use the **Training & Assessment** tab to find training programs and upcoming assessments,
nearest to their region first, and to apply for an assessment. The region only sorts the results and
isn't saved. Under **My Progress** they tick off the steps of the pathways they follow and can withdraw
an application.

Administrators manage this data through the API. Open `/api/docs`, click **Authorize**, and sign in with
an administrator's email (as `username`) and password. Then use the admin endpoints:

| Task                                            | Endpoint                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Add a training provider or an assessment center | `POST /api/v1/admin/training-providers`, `POST /api/v1/admin/assessment-centers`                                    |
| Add a training program                          | `POST /api/v1/admin/training-programs`                                                                              |
| Open an assessment schedule                     | `POST /api/v1/admin/assessment-schedules`                                                                           |
| Review applications                             | `GET /api/v1/admin/assessment-applications?status=pending`, then `PATCH /api/v1/admin/assessment-applications/{id}` |
| Edit a pathway                                  | `PUT /api/v1/admin/pathways/{id}`                                                                                   |

- **Locations:** give providers and centers a `latitude` and `longitude` so they appear in "near me"
  search. Without coordinates they still appear in region and qualification searches.
- **Reviewing applications:** a pending application can be `approved` or `rejected`. An approved one can
  be `completed` with a `result` of `competent` or `not_yet_competent`.
- **Seats and certificates:** approving takes a seat, and is refused when the schedule is full. A
  `competent` result issues a verified certification to the learner automatically.
- **Pathways:** steps sent with an `id` are kept, along with learners' progress on them. Steps you leave
  out are removed.
- **Directions:** the API asks an OSRM router for road routes (`GET /api/v1/routes`) and adds an estimated
  flight for long trips, so the router sees the server's address, not the learner's. `ROUTING_URL` picks the
  router (see `.env.example`); set it empty to turn Directions off, and the app links to Google Maps instead.
  The learner's location is rounded to about 1 km first and never logged.
- **App settings:** the React app asks `GET /api/v1/client-config` for the map's CARTO key (`CARTO_API`) and
  whether Directions and Skills Bridge are on, so one build runs in every deployment.

## Reports

Administrators see a **Reports** tab in the app. The same data is available at `/api/v1/admin/reports/*`,
with optional `date_from` and `date_to` dates in Philippine time:

| Report                              | What it answers                                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `overview`                          | How many learners, saved recommendations and readiness checks; the average readiness; applications by status; certifications |
| `funnel`                            | How many learners registered, saved a recommendation, checked readiness, applied for assessment, and were certified          |
| `qualification-demand`              | For each qualification: how often it was the top match or the learner's choice, readiness, applications, and results         |
| `skill-gaps?qualification_code=...` | For each competency: how learners rated themselves, and the share who weren't confident (the gap rate)                       |
| `supply`                            | For each region right now: training providers, programs, upcoming assessments, and open seats                                |

Reports return only counts and averages, never individual records.

## Tests

Run from the **repository root**, with the Docker development database running:

```bash
.venv/Scripts/python -m pytest
```

Tests run against the real PostgreSQL database in `TEST_DATABASE_URL`, so the dev database must be
running. Each run rebuilds the schema with the Alembic migrations and loads the seed data. Every test runs
inside a transaction that is rolled back. The UI tests drive the Streamlit app with `AppTest`, against
the API served over HTTP.

The tests don't load the embedding model. They use a small stand-in that treats texts sharing words as
similar. Set `TESDA_MODEL_TESTS=1` to also run the real-model guard test; with the adopted local model it
currently fails on 2 of 13 goals (see `docs/ml/2026-10-09-matching-model-evaluation.md`), and it passes with the
base model.

To include the real-model check in PowerShell (uses the model configured in `.env`):

```powershell
$env:TESDA_MODEL_TESTS = "1"
./.venv/Scripts/python.exe -m pytest backend/tests/test_semantic.py
Remove-Item Env:TESDA_MODEL_TESTS
```

## Seed data

`backend/seed/` is the source of truth for reference data:

- `regions.json`: Philippine regions and the coordinates of each region's center
- `qualifications.json`: qualifications and their units of competency, built from TESDA's Training
  Regulations (see below)
- `pathways.json`: a default pathway template for each recommendation route
- `airports_ph.json`: Philippine airports with scheduled flights (from OurAirports), read by the API for
  flight estimates and not stored in the database
- `delivery_sites.json`: clearly marked development fixtures with regional coordinates, linked training
  offerings and upcoming assessment schedules. These records are not verified T2MIS data.

After editing a file, run `python -m tesda_track.seed` (Docker does this on every deploy). Qualifications
removed from the file are archived, not deleted, so saved learner records keep their references. Every
active qualification that lacks a pathway gets one from the templates. Seeding never overwrites a pathway
an administrator has edited. The delivery fixture is skipped when `ENVIRONMENT=production`; replace it
with an approved T2MIS import before exposing provider listings to real learners.

The tests use their own fixed copy of these files in `backend/tests/seed/` (five qualifications), so the
real catalog can grow without changing test results.

### The qualification catalog comes from TESDA Training Regulations

Each current TESDA Training Regulation (TR) becomes one qualification. Section 1 of every TR lists its
basic, common and core units of competency and the jobs it leads to; those become the readiness-check
competencies, the career goals and the search keywords. Rebuild the catalog when TESDA publishes new TRs:

```bash
cd backend
../.venv/Scripts/python -m tesda_track.training_regulations list
../.venv/Scripts/python -m tesda_track.training_regulations download --email you@example.com
../.venv/Scripts/python -m tesda_track.training_regulations build
../.venv/Scripts/python -m tesda_track.seed
../.venv/Scripts/python -m tesda_track.embeddings sync
```

- `list` collects TESDA's public list of TRs into `seed/sources/training_regulations.json`.
- `download` fetches the PDFs through TESDA's download form, which asks for your email address, a purpose
  and a country for every file. It goes one file at a time and skips files it already has. The PDFs stay
  in `seed/sources/tr-pdfs/`, which git ignores.
- `build` reads Section 1 of each PDF and writes `seed/qualifications.json`. It needs PyMuPDF
  (`requirements-dev.txt`).
- The five hand-tuned qualifications in `seed/sources/curated.json` keep their codes, career goals and
  keywords, and take their units of competency from the TR. Edit that file to tune others.
- `seed/sources/keywords_tl.json` adds the Filipino words learners use for a trade (kusinero, tubero,
  magsasaka). `build` lists any name in it that isn't in the catalog, so a typo doesn't go unnoticed.

TESDA superseded Shielded Metal Arc Welding (SMAW) with Manual Metal Arc Welding (MMAW), so the welding
qualification is now MMAW NC II. It still answers to "SMAW", and seeding archives the old SMAW entry so
saved records keep working.

## Demo data

To try the app with realistic activity, load clearly fictional demo data into your local database:

```bash
cd backend
../.venv/Scripts/python -m tesda_track.demo load --learners 40
../.venv/Scripts/python -m tesda_track.demo remove
```

`load` adds two "[Demo]" training providers with programs and one "[Demo]" assessment center with
upcoming schedules in every region. It also adds demo learners (`learnerNNN@demo.tesda-track.invalid`, who
can't sign in) with goals, readiness checks and assessment applications, so the reports have something to
show. Loading again replaces the earlier demo data, and `remove` deletes all of it. It is refused when
`ENVIRONMENT=production`, so real learners never see invented providers or schedules.

## Deployment (own server or VM)

```bash
# First deployment only: copy .env.example to .env if it does not exist.
# Set DOMAIN, SECRET_KEY, POSTGRES_PASSWORD and APP_DB_PASSWORD in .env.
docker compose up -d --build
```

Compose starts PostgreSQL, runs the migrations, the seed and the embedding sync, then starts the API, the
Streamlit app, the React app and Caddy. The embedding model is built into the API image, so the server never needs to
download it. If the sync fails, the deploy still goes ahead and matching falls back to keywords. Only ports 80 and 443 are published. Caddy serves the Streamlit app at `/`, the React app at `/beta/`
and the API at `/api/` (interactive docs at `/api/docs`). Point the domain's DNS at the server before starting, so
Caddy can obtain a certificate.

### The React app's container

`frontend/Dockerfile` builds the React app with Node 24, then serves `dist/` with Caddy on port 8080 (`frontend/Caddyfile`).
The build argument `BASE_PATH` sets where the site serves it: Compose builds it for `/beta/` while it runs beside
Streamlit, and the site's Caddy (`deploy/Caddyfile`) passes `/beta/…` to it without the prefix. To serve it at `/`
after the switch, build it with `BASE_PATH: /` and point the site's catch-all `handle` at `app:8080`.

- App addresses (`/beta/find`, `/beta/training?…`) get `index.html`. A missing file under `assets/`, `fonts/` or
  `img/` stays a 404.
- Files under `assets/` have hashed names and are cached for a year. Fonts and pictures are cached for a week, and
  `index.html`, `theme-init.js` and the icon are checked on every visit, so a release shows at once.
- The app's Content Security Policy is in `frontend/Caddyfile`: everything from the site itself, plus the map's tile
  servers for pictures. React Aria adds one small style element, allowed by its hash. If a React Aria upgrade
  changes it, `src/csp.test.tsx` fails with the new hash to put in `frontend/Caddyfile`.

The first build is slow. It installs the Python packages and downloads the embedding model into the API
image. On the slow connection we tested, that took about 45 minutes. Later builds reuse Docker's cache.
The API and the migration job share one image (`tesda-track-backend`), so it's built only once.

To try the full stack on your own machine, stop Laragon's Apache or Nginx first, because Caddy needs
ports 80 and 443. Then set `DOMAIN=localhost` and open https://localhost. It runs as a separate Compose
project (`tesda-track`), with its own database volume.

## Deployment on Railway (demo)

`.railway/railway.ts` describes a Railway project with the same database image (`deploy/postgres`) and API image
(`backend/`), managed with Railway's Infrastructure as Code (`railway config plan`, `railway config apply`). The React
app is on Vercel, which passes `/api/*` to the API (`frontend/vercel.json`), so cookie sign-in works as it does behind
Caddy. Setup, plan sizing and secrets: [`.railway/README.md`](.railway/README.md).

## Privacy

Learner data is subject to the Data Privacy Act of 2012 (RA 10173). Goals typed into the finder are
processed in memory and never logged, and request bodies are excluded from logs.
