"""Administrator-managed roles. The permission vocabulary itself is code-defined and read-only here."""
from fastapi import APIRouter, Depends, status

from tesda_track.db import SessionDep
from tesda_track.deps import require_permission
from tesda_track.rbac import PERMISSIONS
from tesda_track.schemas.roles import PermissionPublic, RoleCreate, RolePublic, RoleUpdate
from tesda_track.services import roles as service

router = APIRouter(prefix="/admin", tags=["admin: roles"],
                   dependencies=[Depends(require_permission("users:manage"))])


@router.get("/permissions", response_model=list[PermissionPublic])
def list_permissions():
    """Every permission a role can be given. Fixed in code: each one is enforced on a real endpoint."""
    return [{"key": key, "description": description} for key, description in PERMISSIONS.items()]


@router.get("/roles", response_model=list[RolePublic])
def list_roles(session: SessionDep):
    return service.list_roles(session)


@router.get("/roles/assignments")
def role_assignment_counts(session: SessionDep) -> dict[str, int]:
    """How many accounts hold each role, keyed by role. Absent keys hold none."""
    return service.assignment_counts(session)


@router.post("/roles", response_model=RolePublic, status_code=status.HTTP_201_CREATED)
def create_role(request: RoleCreate, session: SessionDep):
    return service.create_role(session, key=request.key, label=request.label, description=request.description,
                               permissions=request.permissions)


@router.patch("/roles/{key}", response_model=RolePublic)
def update_role(key: str, request: RoleUpdate, session: SessionDep):
    return service.update_role(session, key, label=request.label, description=request.description,
                               permissions=request.permissions,
                               description_set="description" in request.model_fields_set)


@router.delete("/roles/{key}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(key: str, session: SessionDep):
    service.delete_role(session, key)
