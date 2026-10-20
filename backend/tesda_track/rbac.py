"""The permission vocabulary, and the built-in roles that group it.

Permissions are fixed in code: each one is named by a ``require_permission`` guard on a real endpoint, so a
permission that no guard checks would grant nothing and an administrator cannot invent one at runtime.

Roles are rows in ``app_role`` (see ``tesda_track.models.rbac``), so an administrator can compose new ones out
of that vocabulary. The built-in roles below are inserted by migration 0017 and topped up by
``services.roles.sync_system_roles``; anything the database holds that is not in ``PERMISSIONS`` is ignored, so
unknown roles and permissions still fail closed.
"""
import re

# permission -> what an administrator granting it is allowing. Shown beside the checkboxes in the admin UI.
PERMISSIONS: dict[str, str] = {
    "training:manage": "Create and edit training providers and programs",
    "pathways:manage": "Create and edit learner pathways",
    "assessments:manage": "Manage assessment centers and schedules",
    "verifications:manage": "Import and review service verifications",
    "reports:read": "Read aggregate demand and matching reports",
    "integrations:manage": "Configure outside system integrations",
    "mcp:manage": "Manage MCP partner clients and their secrets",
    "users:manage": "Assign account roles and edit roles and permissions",
}

ADMIN_ROLE = "admin"
DEFAULT_ROLE = "learner"
# A role key goes in URLs, JWT-adjacent account rows and CHECK-free foreign keys, so keep it a plain slug.
ROLE_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]{1,49}$")

# key -> (label, permissions). Seeded, never deleted, and their keys can't change. Only `admin` is frozen
# outright; the rest can be re-scoped by an administrator, so these are a starting point, not a ceiling.
SYSTEM_ROLES: dict[str, tuple[str, frozenset[str]]] = {
    "learner": ("Learner", frozenset()),
    "trainer": ("Trainer", frozenset({"training:manage", "pathways:manage"})),
    "assessor": ("Assessor", frozenset({"assessments:manage"})),
    "verifier": ("Verifier", frozenset({"verifications:manage"})),
    "analyst": ("Analyst", frozenset({"reports:read"})),
    ADMIN_ROLE: ("Administrator", frozenset(PERMISSIONS)),
}
ROLES = tuple(SYSTEM_ROLES)


def system_permissions_for(role: str) -> list[str]:
    """The built-in definition of a role, before any administrator edits it. Seeding and tests use this; live
    authorization reads the database instead, through ``Learner.permissions``."""
    label_and_permissions = SYSTEM_ROLES.get(role)
    return sorted(label_and_permissions[1]) if label_and_permissions else []


def known_permissions(permissions) -> list[str]:
    """Drop anything outside the vocabulary, so a permission left in the database by an older release (or a
    hand-edited row) grants nothing."""
    return sorted(set(permissions) & set(PERMISSIONS))
