# Roles and account seeding

Each account has one role. All signed-in roles retain access to their own learner
records; ownership checks still apply. Staff permissions cover the whole application,
not individual providers or assessment centers. Assign them only to trusted staff.

## Permissions are fixed; roles are not

Permissions live in code, in `PERMISSIONS` in `backend/tesda_track/rbac.py`. Each one is
named by a `require_permission` guard on a real endpoint, so the list is exactly what can
be granted and an administrator cannot invent a new one at runtime. Adding a permission
means adding both the entry and the guard.

Roles are rows in the `app_role` table, so an administrator with `users:manage` can compose
new ones out of that vocabulary — under **Admin → Roles & Permissions**, or through the API
below. An account's permissions are read from its role row on every request, so re-scoping a
role takes effect immediately, without waiting for tokens to expire.

These six roles are built in. They are seeded by migration 0017 and cannot be deleted or
renamed, but their permissions can be changed, so treat the table as a starting point rather
than a description of the live system:

| Role | Additional access as seeded |
| --- | --- |
| learner | None |
| trainer | Manage training providers, programs, and pathways |
| assessor | Manage assessment centers, schedules, and applications |
| verifier | Read and maintain service verification evidence |
| analyst | Read aggregate reports |
| admin | Every permission, always |

Two rules keep the pilot from locking everybody out of `/admin`, and both are enforced in
`backend/tesda_track/services/roles.py` so the CLI and seeding obey them too:

- `admin` is frozen. It always holds the whole vocabulary, so a permission added in code
  reaches it without a data migration, and no edit can take `users:manage` away from the
  last account that holds it.
- No role can be deleted while an account still has it; the foreign key says `RESTRICT` as
  well. Built-in roles cannot be deleted at all.

Public registration always creates learners. A role the database holds but code does not
recognise, or a permission outside `PERMISSIONS`, grants nothing: unknown values fail closed.

## What the web admin workspace shows

`/admin` is gated per section on the permission that section's own endpoints require, so a
composed role can use the parts it was given and nothing else:

| Section | Needs |
| --- | --- |
| Overview, Recommendation, Feedback | `reports:read` |
| Users, Roles & Permissions | `users:manage` |
| MCP partners | `mcp:manage` |

An account holding none of those three is turned away from `/admin` altogether, and the
sidebar's Admin link only appears when at least one section is open to it. A link to a section
the account cannot open falls back to the first one it can, rather than dead-ending. The API
enforces the same permissions independently; hiding a tab is presentation, not protection.

From the repository root, apply the migration:

```powershell
.venv/Scripts/alembic.exe -c backend/alembic.ini upgrade head
```

## Seed accounts

For local development, `backend/seed/sample_accounts.json` contains one sample
account for each role with explicit demo credentials. Run from the repository root:

```powershell
$env:PYTHONPATH = "backend"
.venv/Scripts/alembic.exe -c backend/alembic.ini upgrade head
.venv/Scripts/python.exe -m tesda_track.seed
```

These published sample passwords are for local development only. The command
can be rerun safely: existing accounts are skipped, not reset.
The standard seeder loads `sample_accounts.json` from its seed directory when
present and skips it in production. To seed only accounts without syncing the
catalog, use `python -m tesda_track.cli seed-accounts backend/seed/sample_accounts.json`
with `PYTHONPATH=backend` from the repository root.

Create a private JSON file containing the accounts you want. This PowerShell example
prompts for a separate password for each of the six roles (minimum 10 characters):

```powershell
$accounts = foreach ($role in @("admin", "learner", "trainer", "assessor", "verifier", "analyst")) {
    $credential = Get-Credential -UserName "$role@example.com" -Message "Seed account for $role"
    if ($null -eq $credential) { throw "Account seeding cancelled" }
    @{
        email = $credential.UserName
        full_name = "Pilot $role"
        role = $role
        password = $credential.GetNetworkCredential().Password
    }
}
$seedPath = Join-Path $env:TEMP "tesda-seed-accounts.json"
try {
    ConvertTo-Json -InputObject @($accounts) | Set-Content -LiteralPath $seedPath -Encoding utf8
    $env:PYTHONPATH = "backend"
    .venv/Scripts/python.exe -m tesda_track.cli seed-accounts $seedPath
} finally {
    Remove-Item -LiteralPath $seedPath -ErrorAction SilentlyContinue
}
```

Use accounts whose owners have agreed to the privacy notice; seeding records that
consent. No accounts or default passwords are created at application startup.
The seed command validates the complete file and commits atomically. Rerunning it
skips existing accounts with the same role without resetting passwords, names,
lockouts, or active status. A role conflict aborts the batch instead of promoting
an existing account. Keep seed files out of source control and delete them after use.

## Assign roles

Administrators can use the authenticated API (also available through `/api/docs`):

- `GET /api/v1/admin/permissions`: the permission vocabulary, with a description of each.
  Read-only: there is no route that creates a permission.
- `GET /api/v1/admin/roles`: every role with the permissions it grants.
- `GET /api/v1/admin/roles/assignments`: how many accounts hold each role.
- `POST /api/v1/admin/roles` with
  `{"key":"regional_coordinator","label":"Regional Coordinator","permissions":["reports:read"]}`:
  compose a role. The key is a lowercase slug (letters, numbers, underscores), is stored on
  every account given that role, and cannot be changed afterwards.
- `PATCH /api/v1/admin/roles/{key}`: change only the fields sent, so a label edit cannot
  silently clear the permissions. Refused for `admin`.
- `DELETE /api/v1/admin/roles/{key}`: delete a composed role. Refused for built-in roles,
  and `409` while any account still holds it.
- `GET /api/v1/admin/users?limit=50&offset=0`: paginated accounts.
- `PATCH /api/v1/admin/users/{id}/role` with `{"role":"assessor"}`: assign any existing role,
  composed ones included. An unknown role is `422`.

A changed role invalidates the account's existing bearer tokens and session cookies.
The account must sign in again. Administrators cannot change their own role.
Cookie-authenticated writes require `X-Requested-With`, as elsewhere in the app.
The existing `create-admin` CLI remains available for initial administrator setup.

Changing a role's permissions does not invalidate tokens: permissions are read from the
role row per request, so the change applies to the account's next call either way.

Downgrading migration 0017 requires first moving accounts off any role added after it, and
downgrading 0015 requires reassigning staff accounts to learner or admin, so neither rollback
can silently lose assignments.
