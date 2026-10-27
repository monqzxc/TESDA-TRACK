"""Required serving dependencies and passive optional-feature diagnostics.

Probes never load/download a model or call Skills Bridge: frequent health checks must not
turn optional integrations into deployment dependencies or consume upstream requests.
"""
from functools import lru_cache
from pathlib import Path
from typing import Literal

from alembic.config import Config
from alembic.script import ScriptDirectory
from alembic.util import CommandError
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session

from tesda_track.config import get_settings
from tesda_track.services import embeddings


class DependencyStatus(BaseModel):
    status: Literal["ok", "unavailable", "degraded"]
    reason: str | None = None


class MigrationStatus(DependencyStatus):
    current: list[str] = Field(default_factory=list)
    expected: list[str] = Field(default_factory=list)


class ReadinessChecks(BaseModel):
    database: DependencyStatus
    migrations: MigrationStatus
    postgis: DependencyStatus
    pgvector: DependencyStatus
    model: DependencyStatus
    skills_bridge: DependencyStatus


class ReadinessReport(BaseModel):
    status: Literal["ready", "degraded", "unavailable"]
    checks: ReadinessChecks


@lru_cache
def migration_heads() -> tuple[str, ...]:
    # Same path in a checkout and in /app in the backend image. Never pin an old revision.
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    return tuple(sorted(ScriptDirectory.from_config(config).get_heads()))


def readiness(session: Session) -> ReadinessReport:
    settings = get_settings()
    unavailable = DependencyStatus(status="unavailable", reason="database_unreachable")
    checks = ReadinessChecks(
        database=unavailable,
        migrations=MigrationStatus(status="unavailable", reason="database_unreachable"),
        postgis=unavailable, pgvector=unavailable,
        model=DependencyStatus(status="degraded", reason="disabled") if not settings.semantic_search_enabled else (
            DependencyStatus(status="ok") if embeddings.is_loaded() else DependencyStatus(status="degraded", reason="not_loaded")),
        skills_bridge=DependencyStatus(status="degraded", reason=(
            "not_probed" if settings.skills_bridge_mcp_enabled else "disabled")),
    )
    try:
        session.exec(text("SELECT 1")).one()
        checks.database = DependencyStatus(status="ok")
        extensions = set(session.exec(text("SELECT extname FROM pg_extension")).scalars().all())
        checks.postgis = DependencyStatus(status="ok") if "postgis" in extensions else DependencyStatus(
            status="unavailable", reason="extension_missing")
        checks.pgvector = DependencyStatus(status="ok") if "vector" in extensions else DependencyStatus(
            status="unavailable", reason="extension_missing")
        has_version_table = session.exec(text("SELECT to_regclass('alembic_version') IS NOT NULL")).scalar_one()
        current = sorted(session.exec(text("SELECT version_num FROM alembic_version")).scalars().all()) if has_version_table else []
        expected = list(migration_heads())
        checks.migrations = MigrationStatus(
            status="ok" if current == expected and expected else "unavailable",
            reason=None if current == expected and expected else "schema_not_current",
            current=current, expected=expected,
        )
    except SQLAlchemyError:
        # SQL text, connection strings and exception details never leave the probe.
        checks.database = unavailable
    except (CommandError, OSError):
        checks.migrations = MigrationStatus(status="unavailable", reason="migration_graph_unavailable")
    required = (checks.database, checks.migrations, checks.postgis, checks.pgvector)
    status = "unavailable" if any(check.status != "ok" for check in required) else (
        "degraded" if checks.model.status != "ok" or checks.skills_bridge.status != "ok" else "ready")
    return ReadinessReport(status=status, checks=checks)
