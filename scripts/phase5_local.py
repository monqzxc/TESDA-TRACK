"""Local-only preview bootstrap. Copies development data; never resets or migrates its database.
Uses the existing local Docker PostgreSQL maintenance account to create separate preview/test databases.
"""

import argparse, os, re, sys, subprocess, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
os.chdir(ROOT)
from tesda_track.config import get_settings
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

PREVIEW = "tesda_track_phase5_preview"
TEST = "tesda_track_phase5_test"


def docker(shell, stdin=None):
    r = subprocess.run(
        ["docker", "exec", "-i", "tesda-track-dev-db-1", "sh", "-c", shell],
        input=stdin,
        text=True,
        capture_output=True,
    )
    if r.returncode:
        raise RuntimeError(r.stderr[:1600])
    return r.stdout


def main():
    p = argparse.ArgumentParser()
    p.add_argument("action", choices=["setup", "import", "serve", "test"])
    a, rest = p.parse_known_args()
    u = make_url(get_settings().database_url)
    if (
        u.host not in ["127.0.0.1", "localhost"]
        or get_settings().environment == "production"
    ):
        raise RuntimeError("Local development database required")
    assert re.fullmatch("[a-zA-Z0-9_]+", u.username) and re.fullmatch(
        "[a-zA-Z0-9_]+", u.database
    )
    if a.action == "setup":
        existing = docker(
            'psql -U postgres -d postgres -Atc "select datname from pg_database"'
        ).splitlines()
        for n in [PREVIEW, TEST]:
            if n not in existing:
                docker(
                    "psql -U postgres -d postgres -v ON_ERROR_STOP=1",
                    f"CREATE DATABASE {n} OWNER {u.username};",
                )
        docker(
            "psql -U postgres -d " + TEST + " -v ON_ERROR_STOP=1",
            "CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions; CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions; GRANT USAGE ON SCHEMA extensions TO "
            + u.username
            + "; ALTER DATABASE "
            + TEST
            + " SET search_path=public,extensions;",
        )
        docker(
            "psql -U postgres -d postgres -v ON_ERROR_STOP=1",
            "ALTER DATABASE " + PREVIEW + " SET search_path=public,extensions;",
        )
        e = create_engine(u.set(database=PREVIEW))
        with e.connect() as c:
            initialized = (
                c.execute(text("select to_regclass('public.alembic_version')")).scalar()
                is not None
            )
        if not initialized:
            docker(
                "pg_dump -U postgres -Fc -f /tmp/tesda_phase5_snapshot.dump "
                + u.database
            )
            docker(
                "pg_restore -U postgres --no-owner --clean --if-exists --exit-on-error -d "
                + PREVIEW
                + " /tmp/tesda_phase5_snapshot.dump"
            )
            docker(
                "psql -U postgres -d " + PREVIEW + " -v ON_ERROR_STOP=1",
                "GRANT ALL ON ALL TABLES IN SCHEMA public TO "
                + u.username
                + "; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO "
                + u.username
                + "; GRANT USAGE ON SCHEMA extensions TO "
                + u.username
                + ";",
            )
        from alembic import command
        from alembic.config import Config

        cfg = Config("backend/alembic.ini")
        cfg.attributes["configure_logger"] = False
        with e.begin() as c:
            cfg.attributes["connection"] = c
            command.upgrade(cfg, "head")
        with e.connect() as c:
            print(
                "Preview revision:",
                c.execute(text("select version_num from alembic_version"))
                .scalars()
                .all(),
            )
        print("Isolated preview/test databases ready; development database unchanged.")
        return
    os.environ["DATABASE_URL"] = u.set(
        database=TEST if a.action == "test" else PREVIEW
    ).render_as_string(hide_password=False)
    get_settings.cache_clear()
    if a.action == "import":
        from sqlmodel import Session
        from tesda_track.services.labor_market import import_bundle
        from tesda_track.db import get_engine

        for folder in sorted((ROOT / "backend/seed/sources/labor_market").iterdir()):
            if folder.is_dir():
                with Session(get_engine()) as s:
                    result = import_bundle(s, folder)
                    s.commit()
                    print(json.dumps(result))
    elif a.action == "serve":
        import uvicorn

        os.environ["SEMANTIC_SEARCH_ENABLED"] = "true"
        get_settings.cache_clear()
        uvicorn.run("tesda_track.main:app", host="127.0.0.1", port=8018)
    else:
        os.environ["TEST_DATABASE_URL"] = os.environ["DATABASE_URL"]
        import pytest

        raise SystemExit(
            pytest.main(
                (
                    rest
                    if any(not arg.startswith("-") for arg in rest)
                    else ["backend/tests/test_labor_market.py", "-q", *rest]
                )
                or ["backend/tests/test_labor_market.py", "-q"]
            )
        )


if __name__ == "__main__":
    main()
