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
| 4 | Integrations and AI | Planned | Hybrid search inside PostgreSQL (see below) and the Skills Bridge client |
| 5 | Reporting and analytics | Planned | Reports for administrators |

**How recommendations will work (part 4).** Everything stays in PostgreSQL. There is no separate search
engine and no cloud AI service, so learner text never leaves our server.

- **Meaning:** pgvector compares a learner's goal with qualifications. The embeddings come from one
  local model, [`intfloat/multilingual-e5-small`](https://huggingface.co/intfloat/multilingual-e5-small),
  which handles Filipino and Taglish and runs on a CPU.
- **Distance:** PostGIS finds training providers and assessment centers near the learner.
- **Keywords:** PostgreSQL full-text search matches exact terms.
- **Ranking:** the final score is a weighted sum that can be configured, for example meaning 50,
  distance 20, assessment availability 15, schedule 10 and preference 5. Each part of the score is
  stored, so any recommendation can be explained and audited.

Skills Bridge (skills-bridge.ph) has no public API yet. Its client stays disabled until we get API
access from the Skills Bridge team.

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

4. **Create the tables and load the seed data:**

   ```bash
   cd backend
   ../.venv/Scripts/alembic upgrade head
   ../.venv/Scripts/python -m tesda_track.seed
   ```

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
| Run the tests | `.venv/Scripts/python -m pytest` |

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

## Tests

```bash
.venv/Scripts/python -m pytest
```

Tests run against the real PostgreSQL database in `TEST_DATABASE_URL`, so the dev database must be
running. Each run rebuilds the schema with the Alembic migrations and loads the seed data. Every test runs
inside a transaction that is rolled back. The UI tests drive the Streamlit app with `AppTest`, against
the API served over HTTP.

## Seed data

`backend/seed/` is the source of truth for reference data:

- `regions.json`: Philippine regions and the coordinates of each region's center
- `qualifications.json`: qualifications and their competencies
- `pathways.json`: a default pathway template for each recommendation route

After editing a file, run `python -m tesda_track.seed` (Docker does this on every deploy). Qualifications
removed from the file are archived, not deleted, so saved learner records keep their references. Every
active qualification that lacks a pathway gets one from the templates. Seeding never overwrites a pathway
an administrator has edited.

## Deployment (own server or VM)

```bash
cp .env.example .env        # set DOMAIN, SECRET_KEY, POSTGRES_PASSWORD, APP_DB_PASSWORD
docker compose up -d --build
```

Compose starts PostgreSQL, runs the migrations and the seed, then starts the API, the Streamlit app and
Caddy. Only ports 80 and 443 are published. Caddy serves the app at `/` and the API at `/api/`
(interactive docs at `/api/docs`). Point the domain's DNS at the server before starting, so Caddy can
obtain a certificate.

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
