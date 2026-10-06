# TESDA-TRACK

Career pathway recommendations for TESDA qualifications: learners describe a goal, get matched to
qualifications, see a suggested training or assessment pathway, and check their readiness.

```
Browser ──HTTPS──▶ Caddy ──▶ Streamlit (frontend/) ──HTTP──▶ FastAPI (backend/) ──▶ PostgreSQL
                                                      └── internal network only ──┘
```

- **backend/** — FastAPI + SQLModel (SQLAlchemy 2.0) + PostgreSQL, migrations with Alembic. The only
  component that touches the database.
- **frontend/** — the Streamlit app. It has no database credentials and calls the API through
  `api_client.py`.
- **deploy/** and **docker-compose.yml** — single-server deployment behind Caddy (automatic HTTPS).

## Local development (Laragon PostgreSQL)

1. Create a database role and two databases (the test database name must end in `_test`):

   ```sql
   CREATE ROLE tesda_track LOGIN PASSWORD 'choose-a-password';
   CREATE DATABASE tesda_track OWNER tesda_track;
   CREATE DATABASE tesda_track_test OWNER tesda_track;
   ```

2. Copy `.env.example` to `.env` and fill in `SECRET_KEY`, `DATABASE_URL` and `TEST_DATABASE_URL`.

3. Install dependencies into a virtualenv at the repository root:

   ```bash
   python -m venv .venv
   .venv/Scripts/python -m pip install -r requirements-dev.txt      # Windows
   ```

4. Create the schema and load the qualification catalog:

   ```bash
   cd backend
   ../.venv/Scripts/alembic upgrade head
   ../.venv/Scripts/python -m tesda_track.seed
   ```

5. Run both services (two terminals):

   ```bash
   cd backend  && ../.venv/Scripts/uvicorn tesda_track.main:app --reload       # http://127.0.0.1:8000/api/docs
   cd frontend && ../.venv/Scripts/streamlit run app.py                         # http://localhost:8501
   ```

## Accounts

Learners can use the pathway finder without an account. Signing in (sidebar) saves recommendation
sessions, readiness checks, goals and certifications under **My progress**. Registration requires
agreeing to the privacy notice; learners can download all their data or permanently delete their
account from the sidebar (the API cascades the deletion to every record they own).

Create the first administrator from the backend directory:

```bash
../.venv/Scripts/python -m tesda_track.cli create-admin --email you@example.com --name "Your Name"
# Docker: docker compose run --rm -e TESDA_ADMIN_PASSWORD=... api python -m tesda_track.cli create-admin --email ...
```

Passwords are hashed with Argon2. Access tokens are JWTs signed with `SECRET_KEY`; changing a password
revokes every existing token, and five failed sign-ins lock an account for 15 minutes.

## Tests

```bash
.venv/Scripts/python -m pytest
```

Tests run against the real PostgreSQL database in `TEST_DATABASE_URL`: the schema is rebuilt with the
Alembic migrations, and every test runs inside a transaction that is rolled back. The UI tests drive the
Streamlit app with `AppTest` against the API served over HTTP.

## The qualification catalog

`backend/seed/qualifications.json` is the source of truth for qualifications and competencies. After
editing it, run `python -m tesda_track.seed` (Docker does this on every deploy). Entries removed from the
file are archived, not deleted, so saved learner records keep their references.

## Deployment (own server or VM)

```bash
cp .env.example .env        # set DOMAIN, SECRET_KEY, POSTGRES_PASSWORD, APP_DB_PASSWORD
docker compose up -d --build
```

Compose starts PostgreSQL, runs migrations and the catalog seed, then starts the API, the Streamlit app
and Caddy. Only ports 80/443 are published: Caddy serves the app at `/` and the API at `/api/`
(interactive docs at `/api/docs`). Point the domain's DNS at the server before starting so
Caddy can obtain a certificate.

## Privacy

Goals typed into the finder are processed in memory and never logged. Request bodies are excluded from
logs.
