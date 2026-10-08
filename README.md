# TESDA-TRACK

Career pathway recommendations for TESDA qualifications: learners describe a goal, get matched to
qualifications, see a suggested training or assessment pathway, and check their readiness. Built for a
pilot with real learners, self-hosted on our own server with Docker.

```
Browser ──HTTPS──▶ Caddy ──▶ Streamlit (frontend/) ──HTTP──▶ FastAPI (backend/) ──▶ PostgreSQL 17
                                                      └── internal network only ──┘   + pgvector + PostGIS
```

- **backend/**: FastAPI + SQLModel (SQLAlchemy 2.0) + PostgreSQL, with migrations in Alembic. It is the
  only component that touches the database.
- **frontend/**: the Streamlit app. It has no database credentials and calls the API through
  `api_client.py`.
- **deploy/**: the PostgreSQL image (`deploy/postgres/`, PostgreSQL 17 with pgvector and PostGIS) and the
  Caddy configuration.
- **docker-compose.dev.yml**: the local development database.
- **docker-compose.yml**: the full single-server deployment.

## Roadmap

The backend is built in five parts, in order:

| # | Part | Status | What it adds |
|---|------|--------|--------------|
| 1 | Foundation | Done | FastAPI, SQLModel, PostgreSQL, Alembic, the qualification catalog |
| 2 | Learner accounts and records | Done | Sign-in, saved recommendation sessions, readiness checks, goals, certifications, data export and deletion |
| 3 | Pathways, training and assessment | Done | Regions, training providers and programs, assessment centers, schedules and applications, pathway progress, "near me" search with PostGIS |
| 4 | Integrations and AI | Done | Semantic search with a local embedding model (pgvector), weighted training rankings with an audit trail, a PostgreSQL cache, and the Skills Bridge client |
| 5 | Reporting and analytics | Done | Overview, learner funnel, demand by qualification, skill gaps per competency, and supply by region, for administrators |

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
`TESDA_MODEL_TESTS=1` runs the tests that guard it against the real catalog.

The training weights (`RANKING_WEIGHTS__SEMANTIC`, `__PROXIMITY`, `__ASSESSMENT`, `__SCHEDULE`,
`__PREFERENCE`) must add up to 1 and are set in `.env`.

### Skills Bridge

The **Skills Bridge** tab connects to the public read-only MCP endpoint at
[mcp.skills-bridge.ph/mcp](https://mcp.skills-bridge.ph/mcp), through FastAPI. It distinguishes target job
titles from capabilities: “welder” and “programmer” use the bounded occupation-title lookup, while “welding”,
“JavaScript”, and “network configuration” use `match_skills`. It then supports related qualifications, a
preview of up to 50 occupation skills, and the international mappings actually returned by the provider.
Input-match scores are not readiness assessments; international mappings are not certification equivalencies.
No qualifications are imported into the local catalog.

The integration is enabled by default and currently needs no token. Set `SKILLS_BRIDGE_MCP_ENABLED=false`
to disable it. `SKILLS_BRIDGE_MCP_URL`, optional `SKILLS_BRIDGE_MCP_TOKEN`, and
`SKILLS_BRIDGE_TIMEOUT_SECONDS` configure the connection. Restart the backend after changing settings.
The legacy REST settings are separate and are not required for MCP.

- `POST /api/v1/skills-bridge/matches`: accepts 1–25 extracted capability terms, each at most 80 characters.
- `POST /api/v1/skills-bridge/occupations/search`: finds occupations by title, Skills Bridge's exact title or alias
  match first (`occupation_curriculum_profile`), then titles containing the term (`graph_search`). Every term keeps
  a place among the results.
- `GET /api/v1/skills-bridge/occupations/{id}`: retrieves the occupation's promulgated qualifications and bounded
  skills/mapping previews.

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
.venv/Scripts/python -m pytest --confcutdir=frontend/tests frontend/tests/test_frontend_states.py frontend/tests/test_skills_bridge_ui.py
```

### Frontend presentation

Native Streamlit theme settings live in `frontend/.streamlit/config.toml`; scoped layout and responsive
styles live in `frontend/styles.css`. `frontend/presentation.py` provides escaped branding and reusable
page elements. The finder, qualification library, training, progress, account dialogs, and reports use
the same spacing, blue palette, accessible form controls, and empty/error states. Inactive tabs do not
make page-specific requests, and switching tabs preserves entered goals and filters.

## Requirements

- **Docker Desktop** for the database. Local development uses the same PostgreSQL image as production,
  because the app needs pgvector and PostGIS. Laragon's PostgreSQL has neither, so it isn't used.
- **Python 3.13**
- **Laragon** (optional) for its database viewer, HeidiSQL. See
  [Viewing the database](#viewing-the-database).

## Local development

The database runs in Docker. The API and the Streamlit app run directly on your machine, so code
changes reload instantly. The commands below work in PowerShell and Git Bash.

1. **Create `.env`.**

   ```bash
   cp .env.example .env
   ```

   Generate a value for each of `SECRET_KEY`, `POSTGRES_PASSWORD` and `APP_DB_PASSWORD`:

   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```

   Replace `CHANGE_ME` in `DATABASE_URL` and `TEST_DATABASE_URL` with your `APP_DB_PASSWORD`.
   `token_urlsafe` passwords are safe to put inside a URL.

2. **Start the database.** The first run builds the image, which takes a few minutes.

   ```bash
   docker compose -f docker-compose.dev.yml up -d --build
   ```

   This starts PostgreSQL on `127.0.0.1:5433` and creates two databases, `tesda_track` and
   `tesda_track_test`. Both have the `vector` and `postgis` extensions, installed in an `extensions`
   schema. Unless you stop it, the container starts again on its own whenever Docker Desktop starts.

3. **Install the Python dependencies** into a virtualenv at the repository root:

   ```bash
   python -m venv .venv
   .venv/Scripts/python -m pip install -r requirements-dev.txt
   ```

4. **Create the tables, load the seed data, and embed the catalog:**

   ```bash
   cd backend
   ../.venv/Scripts/alembic upgrade head
   ../.venv/Scripts/python -m tesda_track.seed
   ../.venv/Scripts/python -m tesda_track.embeddings sync
   ```

   The first `embeddings sync` downloads the model (about 470 MB) into `EMBEDDING_CACHE_DIR`, which
   takes a few minutes. Later runs only embed new or changed records.

5. **Run the app.** Use two terminals, both starting from the repository root.

   ```bash
   # Terminal 1: API (interactive docs at http://127.0.0.1:8000/api/docs)
   cd backend
   ../.venv/Scripts/uvicorn tesda_track.main:app --reload
   ```

   ```bash
   # Terminal 2: Streamlit app (http://localhost:8501)
   cd frontend
   ../.venv/Scripts/streamlit run app.py
   ```

6. **Optional: create an administrator account** (see [Accounts](#accounts)).

### Everyday commands

| Task | Command |
|------|---------|
| Start the database | `docker compose -f docker-compose.dev.yml up -d` |
| Stop the database (keeps data) | `docker compose -f docker-compose.dev.yml stop` |
| Check the database is running | `docker compose -f docker-compose.dev.yml ps` |
| Database logs | `docker compose -f docker-compose.dev.yml logs -f db` |
| Delete the database and start fresh | `docker compose -f docker-compose.dev.yml down -v`, then repeat steps 2 and 4 |
| Apply new migrations (after pulling) | `cd backend` then `../.venv/Scripts/alembic upgrade head` |
| Create a migration | `cd backend` then `../.venv/Scripts/alembic revision --autogenerate --rev-id 0004 -m "short description"` |
| Reload the seed data | `cd backend` then `../.venv/Scripts/python -m tesda_track.seed` |
| Embed new or changed qualifications and programs | `cd backend` then `../.venv/Scripts/python -m tesda_track.embeddings sync` |
| Run the tests | `.venv/Scripts/python -m pytest` |
| Also test the real embedding model | `TESDA_MODEL_TESTS=1 .venv/Scripts/python -m pytest backend/tests/test_semantic.py` |

Migrations are numbered `0001`, `0002`, and so on. Pass the next number with `--rev-id`, and read the
generated file before applying it.

## Viewing the database

The dev database accepts connections on **127.0.0.1, port 5433**.

### In Laragon (HeidiSQL)

1. In Laragon, click **Database**. This opens HeidiSQL.
2. Click **New** and name the session `TESDA-TRACK (Docker)`.
3. Fill in:

   | Field | Value |
   |-------|-------|
   | Network type | PostgreSQL (TCP/IP) |
   | Hostname / IP | `127.0.0.1` |
   | User | `tesda_track` |
   | Password | your `APP_DB_PASSWORD` from `.env` |
   | Port | `5433` |
   | Database(s) | `tesda_track` (or `tesda_track_test` for the test database) |

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
sessions, readiness checks, goals and certifications under **My progress**. To register, learners must
agree to the privacy notice. From the sidebar they can download all their data or permanently delete
their account; the API deletes every record they own along with it.

Create the first administrator from the backend directory:

```bash
../.venv/Scripts/python -m tesda_track.cli create-admin --email you@example.com --name "Your Name"
# Docker: docker compose run --rm -e TESDA_ADMIN_PASSWORD=... api python -m tesda_track.cli create-admin --email ...
```

Passwords are hashed with Argon2. Access tokens are JWTs signed with `SECRET_KEY`. Changing a password
revokes every existing token, and five failed sign-ins lock an account for 15 minutes.

## Training, assessment and pathways

Learners use the **Training & assessment** tab to find training programs and upcoming assessments,
nearest to their region first, and to apply for an assessment. The region only sorts the results and
isn't saved. Under **My progress** they tick off the steps of the pathways they follow and can withdraw
an application.

Administrators manage this data through the API. Open `/api/docs`, click **Authorize**, and sign in with
an administrator's email (as `username`) and password. Then use the admin endpoints:

| Task | Endpoint |
|------|----------|
| Add a training provider or an assessment center | `POST /api/v1/admin/training-providers`, `POST /api/v1/admin/assessment-centers` |
| Add a training program | `POST /api/v1/admin/training-programs` |
| Open an assessment schedule | `POST /api/v1/admin/assessment-schedules` |
| Review applications | `GET /api/v1/admin/assessment-applications?status=pending`, then `PATCH /api/v1/admin/assessment-applications/{id}` |
| Edit a pathway | `PUT /api/v1/admin/pathways/{id}` |

- **Locations:** give providers and centers a `latitude` and `longitude` so they appear in "near me"
  search. Without coordinates they still appear in region and qualification searches.
- **Reviewing applications:** a pending application can be `approved` or `rejected`. An approved one can
  be `completed` with a `result` of `competent` or `not_yet_competent`.
- **Seats and certificates:** approving takes a seat, and is refused when the schedule is full. A
  `competent` result issues a verified certification to the learner automatically.
- **Pathways:** steps sent with an `id` are kept, along with learners' progress on them. Steps you leave
  out are removed.

## Reports

Administrators see a **Reports** tab in the app. The same data is available at `/api/v1/admin/reports/*`,
with optional `date_from` and `date_to` dates in Philippine time:

| Report | What it answers |
|--------|-----------------|
| `overview` | How many learners, saved recommendations and readiness checks; the average readiness; applications by status; certifications |
| `funnel` | How many learners registered, saved a recommendation, checked readiness, applied for assessment, and were certified |
| `qualification-demand` | For each qualification: how often it was the top match or the learner's choice, readiness, applications, and results |
| `skill-gaps?qualification_code=...` | For each competency: how learners rated themselves, and the share who weren't confident (the gap rate) |
| `supply` | For each region right now: training providers, programs, upcoming assessments, and open seats |

Reports return only counts and averages, never individual records.

## Tests

```bash
.venv/Scripts/python -m pytest
```

Tests run against the real PostgreSQL database in `TEST_DATABASE_URL`, so the dev database must be
running. Each run rebuilds the schema with the Alembic migrations and loads the seed data. Every test runs
inside a transaction that is rolled back. The UI tests drive the Streamlit app with `AppTest`, against
the API served over HTTP.

The tests don't load the embedding model. They use a small stand-in that treats texts sharing words as
similar. Set `TESDA_MODEL_TESTS=1` to also check that the real model understands Taglish goals.

## Seed data

`backend/seed/` is the source of truth for reference data:

- `regions.json`: Philippine regions and the coordinates of each region's center
- `qualifications.json`: qualifications and their units of competency, built from TESDA's Training
  Regulations (see below)
- `pathways.json`: a default pathway template for each recommendation route
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
cp .env.example .env        # set DOMAIN, SECRET_KEY, POSTGRES_PASSWORD, APP_DB_PASSWORD
docker compose up -d --build
```

Compose starts PostgreSQL, runs the migrations, the seed and the embedding sync, then starts the API, the
Streamlit app and Caddy. The embedding model is built into the API image, so the server never needs to
download it. If the sync fails, the deploy still goes ahead and matching falls back to keywords. Only ports 80 and 443 are published. Caddy serves the app at `/` and the API at `/api/`
(interactive docs at `/api/docs`). Point the domain's DNS at the server before starting, so Caddy can
obtain a certificate.

The first build is slow. It installs the Python packages and downloads the embedding model into the API
image. On the slow connection we tested, that took about 45 minutes. Later builds reuse Docker's cache.
The API and the migration job share one image (`tesda-track-backend`), so it's built only once.

To try the full stack on your own machine, stop Laragon's Apache or Nginx first, because Caddy needs
ports 80 and 443. Then set `DOMAIN=localhost` and open https://localhost. It runs as a separate Compose
project (`tesda-track`), with its own database volume.

## Troubleshooting

- **`password authentication failed for user "tesda_track"`**: the password in `DATABASE_URL` must
  match `APP_DB_PASSWORD`. The database passwords are set only when the volume is first created, so
  changing `.env` afterwards has no effect. Run `docker compose -f docker-compose.dev.yml down -v`
  (this deletes the data), then repeat steps 2 and 4.
- **`connection refused` on port 5433**: Docker Desktop isn't running, or the database is stopped. Run
  `docker compose -f docker-compose.dev.yml up -d`.
- **`extension "postgis" is not available`** while running migrations: you are connected to Laragon's
  PostgreSQL (port 5432) instead of the Docker database (port 5433). Check `.env`.
- **Port 5433 is already in use**: change the left-hand port in `docker-compose.dev.yml`
  (`127.0.0.1:5433:5432`) and in both URLs in `.env`.

## Privacy

Learner data is subject to the Data Privacy Act of 2012 (RA 10173). Goals typed into the finder are
processed in memory and never logged, and request bodies are excluded from logs.
