import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine

from tesda_track.db import get_session


@pytest.fixture
def unreachable_db_client(app):
    """The API wired to a PostgreSQL address where nothing listens."""
    engine = create_engine("postgresql+psycopg://nobody:nothing@127.0.0.1:1/none", connect_args={"connect_timeout": 2})

    def broken_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = broken_session
    with TestClient(app) as client:
        yield client
    engine.dispose()


def test_health_reports_ok_when_database_answers(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_readiness_checks_actual_migrated_postgres(client):
    from tesda_track.services.api_readiness import migration_heads

    response = client.get("/api/v1/ready")
    assert response.status_code == 200
    checks = response.json()["checks"]
    assert all(checks[key]["status"] == "ok" for key in ("database", "migrations", "postgis", "pgvector"))
    assert checks["migrations"]["current"] == list(migration_heads())
    assert checks["model"]["status"] == "degraded"
    assert checks["skills_bridge"]["status"] == "degraded"


def test_health_is_503_when_database_is_unreachable(unreachable_db_client):
    response = unreachable_db_client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable", "database": "unreachable"}


def test_readiness_is_503_when_database_is_unreachable(unreachable_db_client):
    response = unreachable_db_client.get("/api/v1/ready")
    assert response.status_code == 503
    assert response.json()["checks"]["database"]["reason"] == "database_unreachable"


def test_endpoints_return_503_without_leaking_details_when_database_is_down(unreachable_db_client):
    response = unreachable_db_client.get("/api/v1/qualifications")
    assert response.status_code == 503
    assert response.json() == {"detail": "The service is temporarily unavailable. Please try again shortly."}
