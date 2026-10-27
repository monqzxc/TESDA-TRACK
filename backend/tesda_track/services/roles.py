"""Reading and editing the roles an administrator composes.

Two rules protect the pilot from locking everybody out of /admin, and both are enforced here rather than in the
router so the CLI and seeding obey them too:

* `admin` is frozen. It always holds the whole vocabulary, so a new permission added in code reaches it without
  a data migration, and no edit can take `users:manage` away from the last account that has it.
* A built-in role can be re-scoped but never deleted or renamed, and no role can be deleted while an account
  still holds it (the foreign key says RESTRICT as well).
"""
from sqlmodel import Session, func, select

from tesda_track.errors import ConflictError, InvalidRequestError, NotFoundError
from tesda_track.models import Learner, Role
from tesda_track.rbac import (ADMIN_ROLE, PERMISSIONS, ROLE_KEY_PATTERN, SYSTEM_ROLES, known_permissions,
                              system_permissions_for)


def list_roles(session: Session) -> list[Role]:
    return list(session.exec(select(Role).order_by(Role.is_system.desc(), Role.key)).all())


def get_role(session: Session, key: str) -> Role:
    role = session.get(Role, key)
    if role is None:
        raise NotFoundError(f"There is no role named {key!r}.")
    return role


def assignment_counts(session: Session) -> dict[str, int]:
    """How many accounts hold each role, so the UI can warn before an administrator tries to delete one."""
    rows = session.exec(select(Learner.role, func.count()).group_by(Learner.role)).all()
    return {role: count for role, count in rows}


def require_assignable(session: Session, key: str) -> Role:
    """A role an account may be given. Unknown keys are a bad request, not a 404 on the account being edited."""
    role = session.get(Role, key)
    if role is None:
        raise InvalidRequestError(f"There is no role named {key!r}.")
    return role


def _clean_permissions(permissions: list[str]) -> list[str]:
    unknown = sorted(set(permissions) - set(PERMISSIONS))
    if unknown:
        raise InvalidRequestError(
            f"Unknown permission(s): {', '.join(unknown)}. Permissions are defined in the backend; "
            f"a role can only combine the ones that already exist.")
    return known_permissions(permissions)


def create_role(session: Session, *, key: str, label: str, description: str | None,
                permissions: list[str]) -> Role:
    if not ROLE_KEY_PATTERN.match(key):
        raise InvalidRequestError(
            "A role key must start with a letter and use only lowercase letters, numbers and underscores.")
    if session.get(Role, key) is not None:
        raise ConflictError(f"A role named {key!r} already exists.")
    role = Role(key=key, label=label, description=description, permissions=_clean_permissions(permissions),
                is_system=False)
    session.add(role)
    session.commit()
    session.refresh(role)
    return role


def update_role(session: Session, key: str, *, label: str | None = None, description: str | None = None,
                permissions: list[str] | None = None, description_set: bool = False) -> Role:
    role = get_role(session, key)
    if role.key == ADMIN_ROLE:
        raise InvalidRequestError(
            "The administrator role cannot be edited; it always holds every permission. Create a new role "
            "instead and move the accounts that should have less access onto it.")
    if label is not None:
        role.label = label
    if description_set:
        role.description = description
    if permissions is not None:
        role.permissions = _clean_permissions(permissions)
    session.add(role)
    session.commit()
    session.refresh(role)
    return role


def delete_role(session: Session, key: str) -> None:
    role = get_role(session, key)
    if role.is_system:
        raise InvalidRequestError(
            f"{role.label} is a built-in role and cannot be deleted. Its permissions can be changed instead.")
    held = session.exec(select(func.count()).select_from(Learner).where(Learner.role == key)).one()
    if held:
        raise ConflictError(
            f"{held} account(s) still have the {role.label} role. Move them to another role before deleting it.")
    session.delete(role)
    session.commit()


def sync_system_roles(session: Session) -> dict[str, int]:
    """Insert any built-in role the database is missing, and keep `admin` holding the whole vocabulary.

    Built-in roles other than `admin` are only ever inserted, never rewritten, so an administrator who has
    re-scoped `trainer` does not have that undone by the next deploy or seed run. Flushes but does not commit,
    so it can run inside a larger seeding transaction.
    """
    created = repaired = 0
    for key, (label, permissions) in SYSTEM_ROLES.items():
        role = session.get(Role, key)
        if role is None:
            session.add(Role(key=key, label=label, permissions=sorted(permissions), is_system=True))
            created += 1
            continue
        expected = system_permissions_for(ADMIN_ROLE)
        if key == ADMIN_ROLE and (sorted(role.permissions) != expected or not role.is_system):
            role.permissions = expected
            role.is_system = True
            session.add(role)
            repaired += 1
    session.flush()
    return {"created": created, "repaired": repaired}
