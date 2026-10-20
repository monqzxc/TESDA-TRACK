"""Fixed application roles. Unknown roles and permissions always fail closed."""
from typing import Literal, get_args

Role = Literal["learner", "admin", "trainer", "assessor", "verifier", "analyst"]
ROLES = get_args(Role)
ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "learner": frozenset(),
    "trainer": frozenset({"training:manage", "pathways:manage"}),
    "assessor": frozenset({"assessments:manage"}),
    "verifier": frozenset({"verifications:manage"}),
    "analyst": frozenset({"reports:read"}),
    "admin": frozenset({
        "training:manage", "pathways:manage", "assessments:manage",
        "verifications:manage", "reports:read", "integrations:manage",
        "mcp:manage", "users:manage",
    }),
}


def permissions_for(role: str) -> list[str]:
    return sorted(ROLE_PERMISSIONS.get(role, frozenset()))
