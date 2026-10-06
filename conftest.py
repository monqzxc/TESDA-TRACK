"""Shared fixtures: a migrated PostgreSQL test database and per-test transactions that roll back."""
import os
from pathlib import Path

import pytest
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import make_url, text

ROOT = Path(__file__).resolve().parent


class _TestEnvironment(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")
    test_database_url: str


_test_url = _TestEnvironment().test_database_url
if not (make_url(_test_url).database or "").endswith("_test"):
    raise RuntimeError("TEST_DATABASE_URL must name a database ending in _test; tests drop and recreate its schema.")

# Must happen before tesda_track reads its settings.
os.environ.update({
    "DATABASE_URL": _test_url,
    "ENVIRONMENT": "test",
    "SECRET_KEY": "test-only-secret-key-that-is-long-enough-0123456789",
    # Tests use an injected test embedder; the real model is exercised only by opt-in tests.
    "SEMANTIC_SEARCH_ENABLED": "false",
    "SKILLS_BRIDGE_BASE_URL": "",
    "SKILLS_BRIDGE_API_TOKEN": "",
})


def pytest_report_header(config):
    url = make_url(_test_url)
    return f"test database: {url.host}:{url.port}/{url.database} (schema rebuilt every run)"


@pytest.fixture(scope="session")
def engine():
    from alembic import command
    from alembic.config import Config
    from sqlmodel import Session

    from tesda_track.db import get_engine
    from tesda_track.seed import SEED_DIR, seed_all

    engine = get_engine()
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    config = Config(ROOT / "backend" / "alembic.ini")
    config.attributes["configure_logger"] = False
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    with Session(engine) as session:
        seed_all(session, SEED_DIR)
        session.commit()
    yield engine
    engine.dispose()


@pytest.fixture
def session(engine):
    from sqlmodel import Session

    with engine.connect() as connection:
        transaction = connection.begin()
        with Session(bind=connection, join_transaction_mode="create_savepoint") as session:
            yield session
        transaction.rollback()


@pytest.fixture
def app(session):
    from tesda_track.db import get_session
    from tesda_track.main import create_app

    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    return app


@pytest.fixture
def client(app):
    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        yield client
