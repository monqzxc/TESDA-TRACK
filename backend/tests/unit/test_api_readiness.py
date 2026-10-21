"""The probe fails closed on required dependencies and never probes optional services."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.exc import OperationalError

from tesda_track.db import get_session
from tesda_track.routers.health import router
from tesda_track.services import api_readiness


class Result:
    def __init__(self, value):
        self.value = value

    def one(self):
        return self.value

    scalar_one = one

    def scalars(self):
        return self

    def all(self):
        return self.value


class Database:
    def __init__(self, *, versions=("0017",), extensions=("postgis", "vector"), reachable=True):
        self.versions, self.extensions, self.reachable = versions, extensions, reachable

    def exec(self, statement):
        if not self.reachable:
            raise OperationalError("PRIVATE SQL", {}, Exception("PRIVATE CREDENTIAL"))
        sql = str(statement)
        if "pg_extension" in sql:
            return Result(self.extensions)
        if "to_regclass" in sql:
            return Result(self.versions is not None)
        if "version_num" in sql:
            return Result(self.versions)
        assert sql == "SELECT 1"
        return Result(1)


def probe(monkeypatch, **database):
    monkeypatch.setattr(api_readiness, "migration_heads", lambda: ("0017",))
    monkeypatch.setattr(api_readiness.embeddings, "is_loaded", lambda: False)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_session] = lambda: Database(**database)
    return TestClient(app).get("/api/v1/ready")


def test_optional_degradation_keeps_api_ready(monkeypatch):
    response = probe(monkeypatch)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["checks"]["model"]["status"] == "degraded"
    assert body["checks"]["skills_bridge"]["status"] == "degraded"
    assert body["checks"]["migrations"] == {"status": "ok", "reason": None, "current": ["0017"], "expected": ["0017"]}


@pytest.mark.parametrize("versions", [("0007",), ("0016",), ("future",), (), None])
def test_missing_stale_or_unrecognized_schema_is_not_ready(monkeypatch, versions):
    response = probe(monkeypatch, versions=versions)
    assert response.status_code == 503
    assert response.json()["checks"]["migrations"]["reason"] == "schema_not_current"


@pytest.mark.parametrize("extensions, missing", [(("vector",), "postgis"), (("postgis",), "pgvector")])
def test_required_extensions_are_independent_gates(monkeypatch, extensions, missing):
    response = probe(monkeypatch, extensions=extensions)
    assert response.status_code == 503
    assert response.json()["checks"][missing]["reason"] == "extension_missing"


def test_database_failure_is_safe_and_not_ready(monkeypatch):
    response = probe(monkeypatch, reachable=False)
    assert response.status_code == 503
    assert response.json()["checks"]["database"]["reason"] == "database_unreachable"
    assert "PRIVATE" not in response.text


def test_missing_migration_graph_fails_closed(monkeypatch):
    from alembic.util import CommandError

    def missing_graph():
        raise CommandError("Private local path")

    monkeypatch.setattr(api_readiness, "migration_heads", missing_graph)
    report = api_readiness.readiness(Database())
    assert report.status == "unavailable"
    assert report.checks.database.status == "ok"
    assert report.checks.migrations.reason == "migration_graph_unavailable"
    assert "Private" not in report.model_dump_json()


def test_head_follows_the_migration_graph():
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from pathlib import Path

    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    assert api_readiness.migration_heads() == tuple(sorted(ScriptDirectory.from_config(config).get_heads()))
    assert api_readiness.migration_heads(), "an empty migration graph must never become ready"
