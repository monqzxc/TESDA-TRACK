"""Rehearse downgrade and backup restore on a disposable copy in the local dev DB container.

Never connects Alembic to the source database. The backup stays in a temporary directory and is
deleted after the run; the JSON report contains schema revisions and aggregate row counts only.
Run with the repository virtualenv: python scripts/rehearse_migrations.py
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))


def disposable_name(name):
    if not re.fullmatch(r"tesda_rehearsal_[0-9a-f]{12}", name):
        raise ValueError("Refusing to mutate a database outside the rehearsal namespace")
    return name


def validate_source(url):
    if url.get_backend_name() != "postgresql" or url.host not in {"localhost", "127.0.0.1"} or url.port != 5433:
        raise ValueError("This helper only copies the local development PostgreSQL database on localhost:5433.")
    if not url.database or not url.username or url.database.startswith("tesda_rehearsal_"):
        raise ValueError("Use the named source database and application role, never an earlier rehearsal copy.")
    return url


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)


def downgrade_refusal_reason(error):
    """Classify authored migration guards without reporting account/role values."""
    if isinstance(error, RuntimeError):
        message = str(error)
        if message.startswith("Accounts still hold roles added after 0017"):
            return "custom_role_assignments_require_reassignment_before_0017"
        if message.startswith("Reassign staff accounts to learner or admin"):
            return "staff_role_assignments_require_reassignment_before_0015"
    return "migration_failed"


def inventory(engine):
    from sqlalchemy import inspect, text

    with engine.connect() as connection:
        tables = inspect(connection).get_table_names(schema="public")
        quote = connection.dialect.identifier_preparer.quote
        counts, fingerprints = {}, {}
        for table in sorted(tables):
            if table == "spatial_ref_sys":
                continue
            # Compare complete record contents without storing learner rows in the report.
            rows = connection.execute(text(
                f"SELECT to_jsonb(record)::text AS document FROM public.{quote(table)} AS record ORDER BY document"))
            count, digest = 0, hashlib.sha256()
            for document, in rows:
                count += 1
                payload = document.encode("utf-8")
                digest.update(len(payload).to_bytes(8, "big"))
                digest.update(payload)
            counts[table], fingerprints[table] = count, digest.hexdigest()
        revisions = list(connection.execute(text("SELECT version_num FROM alembic_version ORDER BY version_num")).scalars())
    return {"revisions": revisions, "rows": counts, "content_sha256": fingerprints}


def main():
    from alembic import command
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from dotenv import dotenv_values
    from sqlalchemy import create_engine, make_url
    from sqlalchemy.pool import NullPool

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "reports/pilot-2026-10-21/migration-rehearsal.json")
    args = parser.parse_args()
    values = dotenv_values(ROOT / ".env")
    source_url = validate_source(make_url(os.environ.get("DATABASE_URL") or values["DATABASE_URL"]))
    container = run(["docker", "compose", "-f", str(ROOT / "docker-compose.dev.yml"), "ps", "-q", "db"], text=True).stdout.strip()
    if not container:
        raise SystemExit("Start the local development DB container first.")
    clone = disposable_name("tesda_rehearsal_" + uuid4().hex[:12])
    if clone == source_url.database:
        raise SystemExit("Source and disposable database must differ.")
    docker = ["docker", "exec", "-u", "postgres", container]
    config = Config(str(ROOT / "backend/alembic.ini"))
    config.attributes["configure_logger"] = False
    heads = sorted(ScriptDirectory.from_config(config).get_heads())
    source = create_engine(source_url, poolclass=NullPool,
                           connect_args={"options": "-c default_transaction_read_only=on"})
    copy = create_engine(source_url.set(database=clone), poolclass=NullPool)
    report = {"started_at": datetime.now(timezone.utc).isoformat(), "scope": "Local development database copy; no source migrations",
              "expected_heads": heads, "downgrade_target": "0004", "passed": False, "checks": {}}
    report["attempted_revision_path"] = [revision.revision for revision in
                                         ScriptDirectory.from_config(config).iterate_revisions("heads", "0004")]

    def recreate():
        disposable_name(clone)
        run([*docker, "dropdb", "--if-exists", "--force", clone])
        run([*docker, "createdb", "-O", source_url.username, clone])
        # The dev image puts PostGIS/vector in extensions, outside public. Database settings
        # are not included in a plain pg_dump, so reproduce that serving search path on the copy.
        run([*docker, "psql", "-v", "ON_ERROR_STOP=1", "-d", clone, "-c",
             f'ALTER DATABASE "{disposable_name(clone)}" SET search_path = "$user", public, extensions'])

    def migrate(action, revision):
        # Supplying the copy's connection overrides every URL from settings/config.
        disposable_name(str(copy.url.database))
        if copy.url.database == source.url.database:
            raise ValueError("Refusing to migrate the source database")
        try:
            with copy.begin() as connection:
                config.attributes["connection"] = connection
                getattr(command, action)(config, revision)
        finally:
            config.attributes.pop("connection", None)

    try:
        report["stage"] = "source_inventory"
        report["source_before"] = inventory(source)
        with tempfile.TemporaryDirectory(prefix="tesda-rehearsal-") as temp:
            backup = Path(temp) / "copy.dump"
            with backup.open("wb") as stream:
                subprocess.run([*docker, "pg_dump", "-Fc", "-d", source_url.database],
                               stdout=stream, stderr=subprocess.PIPE, check=True)

            def restore():
                recreate()
                with backup.open("rb") as stream:
                    # Same cluster, same roles: retaining original ownership/ACLs is essential.
                    # --no-owner would create every table as postgres and lock the app role out.
                    run(["docker", "exec", "-i", "-u", "postgres", container, "pg_restore",
                         "--exit-on-error", "-d", clone], stdin=stream)

            report["stage"] = "initial_restore"
            restore()
            report["stage"] = "copy_inventory"
            report["checks"]["copy_matches_source"] = inventory(copy) == report["source_before"]
            report["stage"] = "upgrade_copy"
            migrate("upgrade", "head")
            report["upgraded"] = inventory(copy)
            try:
                report["stage"] = "downgrade_copy"
                migrate("downgrade", "0004")
                report["downgraded"] = inventory(copy)
                report["stage"] = "reupgrade_copy"
                migrate("upgrade", "head")
                report["roundtrip"] = inventory(copy)
                report["checks"]["downgrade_upgrade"] = report["roundtrip"]["revisions"] == heads
                report["rows_lost_by_downgrade"] = {
                    table: count - report["roundtrip"]["rows"].get(table, 0)
                    for table, count in report["upgraded"]["rows"].items()
                    if count > report["roundtrip"]["rows"].get(table, 0)}
            except Exception as error:
                # DB exception strings may contain row values; keep only their type in shared evidence.
                report["checks"]["downgrade_upgrade"] = False
                report["downgrade_error_type"] = type(error).__name__
                report["downgrade_refusal_reason"] = downgrade_refusal_reason(error)
                report["downgrade_sqlstate"] = getattr(getattr(error, "orig", None), "sqlstate", None)
                report["after_refused_downgrade"] = inventory(copy)
                report["checks"]["refused_downgrade_kept_copy_unchanged"] = report["after_refused_downgrade"] == report["upgraded"]
                report["rows_lost_by_downgrade"] = {
                    table: count - report["after_refused_downgrade"]["rows"].get(table, 0)
                    for table, count in report["upgraded"]["rows"].items()
                    if count > report["after_refused_downgrade"]["rows"].get(table, 0)}
            report["stage"] = "backup_restore"
            restore()
            report["restored"] = inventory(copy)
            report["checks"]["backup_restore_matches_source"] = report["restored"] == report["source_before"]
            migrate("upgrade", "head")
            report["restored_at_head"] = inventory(copy)
            report["checks"]["restored_copy_upgrades_to_head"] = report["restored_at_head"]["revisions"] == heads
        report["stage"] = "final_source_inventory"
        report["source_after"] = inventory(source)
        report["checks"]["source_inventory_unchanged"] = report["source_before"] == report["source_after"]
        report["passed"] = all(report["checks"].values())
        report["stage"] = "completed"
    except Exception as error:
        report["error_type"] = type(error).__name__
        report["sqlstate"] = getattr(getattr(error, "orig", None), "sqlstate", None)
    finally:
        if "source_before" in report and "source_after" not in report:
            try:
                report["source_after"] = inventory(source)
                report["checks"]["source_inventory_unchanged"] = report["source_before"] == report["source_after"]
            except Exception as error:
                report["source_verification_error_type"] = type(error).__name__
                report["checks"]["source_inventory_unchanged"] = False
        copy.dispose()
        source.dispose()
        try:
            run([*docker, "dropdb", "--if-exists", "--force", disposable_name(clone)])
            report["copy_removed"] = True
        except subprocess.CalledProcessError:
            report["copy_removed"] = False
            report["passed"] = False
        report["completed_at"] = datetime.now(timezone.utc).isoformat()
        report["downgrade_success"] = report["checks"].get("downgrade_upgrade", False)
        report["backup_restore_passed"] = report.get("copy_removed", False) and all(
            report["checks"].get(key, False) for key in ("copy_matches_source", "backup_restore_matches_source",
                                                       "restored_copy_upgrades_to_head", "source_inventory_unchanged"))
        report["rollback_guidance"] = "Downgrades drop newer tables/columns. Use the tested backup restore, not a downgrade, to preserve records."
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(args.output), "passed": report["passed"], "checks": report["checks"],
                      "error_type": report.get("error_type"), "downgrade_error_type": report.get("downgrade_error_type"),
                      "downgrade_refusal_reason": report.get("downgrade_refusal_reason"),
                      "backup_restore_passed": report["backup_restore_passed"]}))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
