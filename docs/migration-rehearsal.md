# Migration and backup restoration rehearsal

Run the copy-only rehearsal from the repository root while the local development database is running:

```powershell
./.venv/Scripts/python.exe scripts/rehearse_migrations.py
```

The helper accepts only a named PostgreSQL source on `localhost:5433` or `127.0.0.1:5433`.
It reads the source through a read-only connection and uses `pg_dump` to create a temporary backup.
All restores, upgrades, downgrades and database deletion target a generated
`tesda_rehearsal_<12 hexadecimal characters>` database in the same Docker development cluster.
Alembic receives that copy's connection directly; the source database is never migrated.

The backup retains ownership and ACLs. Restoring with `--no-owner --no-acl` as PostgreSQL's administrator
would make tables belong to that administrator and lock the application role out. The disposable database
also receives the development image's `public, extensions` search path so PostGIS and pgvector remain usable.

The report is written to `reports/pilot-2026-10-21/migration-rehearsal.json`. It includes migration revisions,
aggregate table counts, SHA-256 fingerprints of complete table contents, safe failure reason codes, source
integrity checks and copy cleanup. It does not include connection credentials, learner rows or role values.
The temporary backup is deleted after the rehearsal; this report is evidence, rather than a production backup.

## Result from 21 October 2026

The local source was at `0017`. Its copy matched the source's row counts and content fingerprints, upgraded
to `0018`, and attempted the downgrade toward `0004`, including both `0005` branches and the merge at `0016`.
The attempt stopped at the intentional `0015` guard because staff accounts exist. Its safe reason code is
`staff_role_assignments_require_reassignment_before_0015`. No learner roles were rewritten to bypass it.
Migration `0017` similarly refuses a downgrade while accounts hold custom roles; that refusal is classified
as `custom_role_assignments_require_reassignment_before_0017` without publishing the custom role names.

A downgrade below `0015` is therefore unsuitable for this database as it stands. Newer tables and columns
would also be dropped by a successful downgrade, so a reversible schema change must not be assumed to
preserve learner records. The report keeps `downgrade_success: false` and the overall `passed: false`;
it does not count the blocked downgrade as a completed traversal.

The independent backup restore succeeded: restored row counts and complete-content fingerprints matched
the original source, and the restored copy upgraded successfully to `0018`. The source's original inventory
remained unchanged and the disposable database was removed. These checks produce
`backup_restore_passed: true`. Use a tested backup restoration or forward repair as the rollback route,
with the matching application version and a separately retained production backup.
