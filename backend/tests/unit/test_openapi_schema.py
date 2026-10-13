"""Database-free checks of the schema the web app's types are generated from. Run with --confcutdir=backend/tests/unit."""
import json

import pytest

from tesda_track.cli import write_openapi_schema
from tesda_track.config import get_settings


@pytest.fixture
def placeholder_settings(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://unused@127.0.0.1:1/unused")
    monkeypatch.setenv("SECRET_KEY", "test-only-secret-key-that-is-long-enough-0123456789")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_the_schema_is_written_without_a_database(placeholder_settings, tmp_path):
    path = tmp_path / "web" / "openapi.json"
    write_openapi_schema(path)

    schema = json.loads(path.read_text(encoding="utf-8"))
    assert schema["info"]["title"] == "TESDA-TRACK API"
    assert {"/api/v1/qualifications", "/api/v1/regions", "/api/v1/auth/session"} <= set(schema["paths"])


def test_the_file_is_stable_and_uses_lf_line_endings(placeholder_settings, tmp_path):
    first, second = tmp_path / "first.json", tmp_path / "second.json"
    write_openapi_schema(first)
    write_openapi_schema(second)

    content = first.read_bytes()
    assert content == second.read_bytes()
    assert b"\r\n" not in content
    assert content.endswith(b"}\n")
