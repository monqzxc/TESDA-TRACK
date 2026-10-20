# Roles and account seeding

Each account has one role. All signed-in roles retain access to their own learner
records; ownership checks still apply. Staff permissions cover the whole application,
not individual providers or assessment centers. Assign them only to trusted staff.

| Role | Additional access |
| --- | --- |
| learner | None |
| trainer | Manage training providers, programs, and pathways |
| assessor | Manage assessment centers, schedules, and applications |
| verifier | Read and maintain service verification evidence |
| analyst | Read aggregate reports |
| admin | All staff operations, integrations, MCP administration, and role assignment |

Public registration always creates learners. Permissions are defined in
`backend/tesda_track/rbac.py`; unknown roles have no staff permissions.
The database migration preserves existing learner/admin assignments.

From the repository root, apply the migration:

```powershell
.venv/Scripts/alembic.exe -c backend/alembic.ini upgrade head
```

## Seed accounts

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

- `GET /api/v1/admin/roles`: role and permission catalog.
- `GET /api/v1/admin/users?limit=50&offset=0`: paginated accounts.
- `PATCH /api/v1/admin/users/{id}/role` with `{"role":"assessor"}`: assign a role.

A changed role invalidates the account's existing bearer tokens and session cookies.
The account must sign in again. Administrators cannot change their own role.
Cookie-authenticated writes require `X-Requested-With`, as elsewhere in the app.
The existing `create-admin` CLI remains available for initial administrator setup.

Downgrading migration 0015 requires first reassigning staff accounts to learner or
admin, so rollback cannot silently lose assignments.
