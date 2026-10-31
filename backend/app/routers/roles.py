"""Roles router — role and permission management.

Endpoints:
  GET  /permissions              — permission catalogue
  GET  /roles                    — role list with permissions
  GET  /roles/{id}               — role detail
  POST /roles                    — create a new role
  PATCH /roles/{id}              — update role permission grants
  GET  /users/{user_id}/permissions    — effective permissions for a user
  PATCH /users/{user_id}/permissions   — set per-user permission overrides
  POST /users/{user_id}/permissions/invalidate-tokens  — revoke refresh tokens
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user, require_permission
from app.models import Permission, Role, RolePermission
from app.models.user import User, UserPermissionOverride, RefreshToken

router = APIRouter(tags=["roles"])


# Role codes that may be assigned to a new team member, ordered from most to
# least senior. A caller's role determines which of these they may assign.
ASSIGNABLE_ROLE_CODES: list[str] = [
    "firm_owner",
    "branch_partner",
    "partner",
    "admin",
    "manager",
    "senior_associate",
    "ca_senior",
    "article_assistant",
    "accounts_staff",
    "accountant",
    "system_admin",
]

# The set of role codes a principal of a given role may assign. Anything not
# listed here gets none — a manager cannot make a partner, for example.
# Policy: owner/admin → all; partner/branch_partner → non-partner roles below
# partner; manager → seniors and below; everyone else → none.
_ROLE_ASSIGNMENT_SCOPE: dict[str, set[str]] = {
    "firm_owner": set(ASSIGNABLE_ROLE_CODES),
    "admin": set(ASSIGNABLE_ROLE_CODES),
    "partner": {
        "manager", "senior_associate", "ca_senior", "article_assistant",
        "accounts_staff", "accountant",
    },
    "branch_partner": {
        "manager", "senior_associate", "ca_senior", "article_assistant",
        "accounts_staff", "accountant",
    },
    "manager": {
        "senior_associate", "ca_senior", "article_assistant",
        "accounts_staff", "accountant",
    },
}


def assignable_roles_for(principal: Any) -> set[str]:
    """Role codes the principal may assign to a new team member."""
    if "firm_owner" in getattr(principal, "roles", []) or "admin" in getattr(principal, "roles", []):
        return set(ASSIGNABLE_ROLE_CODES)
    scope: set[str] = set()
    for code in getattr(principal, "roles", []):
        scope |= _ROLE_ASSIGNMENT_SCOPE.get(code, set())
    return scope


def _expand_override_codes(override: UserPermissionOverride, db: Session) -> list[str]:
    """Concrete permission codes an override row covers.

    A ``code`` scope covers exactly one code. A ``module`` scope covers every
    permission whose module matches. A ``section`` scope is the same as
    module (the UI groups by module). A ``role`` scope covers every
    permission the named role grants.
    """
    scope = override.scope or UserPermissionOverride.SCOPE_CODE
    if scope == UserPermissionOverride.SCOPE_CODE:
        return [override.permission_code]
    if scope == UserPermissionOverride.SCOPE_ROLE:
        from app.core.rbac import permissions_for_role
        return sorted(permissions_for_role(override.permission_code))
    # module / section: every permission in that module
    module = override.module or override.permission_code
    return [r[0] for r in db.execute(
        select(Permission.code).where(Permission.module == module)
    ).fetchall()]


@router.get("/permissions")
async def list_permissions(
    request: Request,
    db: Session = Depends(get_db),
    _: Any = Depends(require_permission("role.read")),
) -> Any:
    """Return the full permission catalogue, grouped by module."""
    rows = db.execute(
        select(Permission.code, Permission.module, Permission.action, Permission.description)
    ).fetchall()

    by_module: dict[str, list[dict]] = {}
    for code, module, action, desc in rows:
        by_module.setdefault(module, []).append({
            "code": code,
            "action": action,
            "description": desc,
        })
    return {"permissions": by_module}


@router.get("/roles")
async def list_roles(
    request: Request,
    db: Session = Depends(get_db),
    _: Any = Depends(require_permission("role.read")),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    roles = db.execute(select(Role).where(
        (Role.tenant_id == tenant_id) | (Role.tenant_id.is_(None))
    )).scalars().all()

    items = []
    for r in roles:
        perms = db.execute(
            select(RolePermission.permission_code).where(RolePermission.role_id == r.id)
        ).scalars().all()
        items.append({
            "id": str(r.id),
            "code": r.code,
            "name": r.name,
            "description": r.description,
            "data_scope": r.data_scope,
            "is_system": r.is_system,
            "is_active": r.is_active,
            "permissions": list(perms),
        })

    catalogue = [
        {"code": p.code, "module": p.module, "action": p.action, "description": p.description}
        for p in db.execute(select(Permission.code, Permission.module, Permission.action, Permission.description)).fetchall()
    ]
    # Only surface assignable codes for roles that actually exist in the
    # database — offering codes that have no matching role row leads to a
    # misleading 403 "Unknown role" when the caller tries to use one.
    existing_codes = {r["code"] for r in items}
    return {
        "roles": items,
        "catalogue": catalogue,
        "assignable": sorted(assignable_roles_for(principal) & existing_codes),
    }


@router.get("/roles/{role_id}")
async def get_role(
    request: Request,
    role_id: str,
    db: Session = Depends(get_db),
    _: Any = Depends(require_permission("role.read")),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    role = db.get(Role, role_id)
    if role is None or (role.tenant_id is not None and str(role.tenant_id) != str(tenant_id)):
        from app.core.errors import NotFoundError
        raise NotFoundError(f"Role {role_id} not found")

    perms = db.execute(
        select(RolePermission.permission_code).where(RolePermission.role_id == role.id)
    ).scalars().all()

    return {
        "id": str(role.id),
        "code": role.code,
        "name": role.name,
        "description": role.description,
        "data_scope": role.data_scope,
        "is_system": role.is_system,
        "is_active": role.is_active,
        "permissions": list(perms),
    }


@router.patch("/roles/{role_id}")
async def update_role_permissions(
    request: Request,
    role_id: str,
    payload: Any = Body(...),
    db: Session = Depends(get_db),
    principal: Any = Depends(require_permission("role.write")),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    role = db.get(Role, role_id)
    if role is None or (role.tenant_id is not None and str(role.tenant_id) != str(tenant_id)):
        from app.core.errors import NotFoundError
        raise NotFoundError(f"Role {role_id} not found")

    p = payload if isinstance(payload, dict) else payload.dict()
    desired = set(p.get("permission_codes", []))

    existing = {
        rp.permission_code: rp
        for rp in db.execute(
            select(RolePermission).where(RolePermission.role_id == role.id)
        ).scalars().all()
    }

    for code in desired - set(existing.keys()):
             db.add(RolePermission(role_id=role.id, permission_code=code))

    for code in set(existing.keys()) - desired:
        db.delete(existing[code])

    db.commit()

    perms = db.execute(
        select(RolePermission.permission_code).where(RolePermission.role_id == role.id)
    ).scalars().all()
    return {
        "id": str(role.id),
        "code": role.code,
        "name": role.name,
        "permissions": list(perms),
    }


@router.delete("/roles/{role_id}")
async def delete_role(
    request: Request,
    role_id: str,
    db: Session = Depends(get_db),
    principal: Any = Depends(require_permission("role.write")),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    role = db.get(Role, role_id)
    if role is None or (role.tenant_id is not None and str(role.tenant_id) != str(tenant_id)):
        from app.core.errors import NotFoundError
        raise NotFoundError(f"Role {role_id} not found")

    if role.is_system:
        from app.core.errors import BadRequestError
        raise BadRequestError("System roles cannot be deleted.")

    # Prevent deleting roles that are still assigned to users
    assigned = db.execute(
        select(User).where(User.roles.any(id=role.id))
    ).scalars().first()
    if assigned is not None:
        from app.core.errors import BadRequestError
        raise BadRequestError("Role is assigned to one or more users and cannot be deleted.")

    db.execute(
        delete(RolePermission).where(RolePermission.role_id == role.id)
    )
    db.delete(role)
    db.commit()
    return {"ok": True}


@router.post("/roles")
async def create_role(
    request: Request,
    payload: Any = Body(...),
    db: Session = Depends(get_db),
    principal: Any = Depends(require_permission("role.write")),
) -> Any:
    """Create a new role with the given permission grants.

    Body: {"name": "...", "description": "...", "data_scope": "team",
           "is_system": false, "permission_codes": ["client.read", ...]}
    """
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    p = payload if isinstance(payload, dict) else payload.dict()
    name = (p.get("name") or "").strip()
    if not name:
        from app.core.errors import BadRequestError
        raise BadRequestError("Role name is required.")

    # Derive a stable code from the name (slugified).
    code = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    if not code:
        from app.core.errors import BadRequestError
        raise BadRequestError("Could not derive a role code from the name.")

    description = p.get("description")
    data_scope = p.get("data_scope") or "team"
    is_system = bool(p.get("is_system", False))
    permission_codes = list(p.get("permission_codes", []) or [])

    # Validate duplicate code within tenant.
    existing = db.execute(
        select(Role).where(Role.code == code, Role.tenant_id == tenant_id)
    ).scalars().first()
    if existing is not None:
        from app.core.errors import BadRequestError
        raise BadRequestError(f"A role with code '{code}' already exists.")

    # Validate that every permission code exists.
    if permission_codes:
        known = {
            r[0]
            for r in db.execute(
                select(Permission.code).where(Permission.code.in_(permission_codes))
            ).fetchall()
        }
        unknown = set(permission_codes) - known
        if unknown:
            from app.core.errors import BadRequestError
            raise BadRequestError(
                f"Unknown permission code(s): {', '.join(sorted(unknown))}"
            )

    role = Role(
        tenant_id=tenant_id,
        code=code,
        name=name,
        description=description,
        data_scope=data_scope,
        is_system=is_system,
        is_active=True,
    )
    db.add(role)
    db.flush()

    for code_ in permission_codes:
        db.add(RolePermission(role_id=role.id, permission_code=code_))

    db.commit()

    perms = db.execute(
        select(RolePermission.permission_code).where(RolePermission.role_id == role.id)
    ).scalars().all()
    return {
        "id": str(role.id),
        "code": role.code,
        "name": role.name,
        "description": role.description,
        "data_scope": role.data_scope,
        "is_system": role.is_system,
        "is_active": role.is_active,
        "permissions": list(perms),
    }


@router.get("/users/{user_id}/permissions")
async def get_user_permissions(
    request: Request,
    user_id: str,
    db: Session = Depends(get_db),
    principal: Any = Depends(require_permission("user.permission.manage")),
) -> Any:
    """Return the effective permissions and per-user overrides for a team member.

    The caller must be the firm owner or an admin.
    """
    from app.core.errors import NotFoundError

    target = db.get(User, user_id)
    if target is None or str(target.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"User {user_id} not found")

    # Role-based permissions
    role_rows = db.execute(
        select(Role).distinct().join(User.roles).where(User.id == target.id)
    ).scalars().all()
    role_codes = [r.code for r in role_rows]

    base_perms: list[str] = []
    if role_rows:
        base_perms = list(db.execute(
            select(RolePermission.permission_code).where(
                RolePermission.role_id.in_([r.id for r in role_rows])
            )
        ).scalars().all())

    # Per-user overrides
    overrides = db.execute(
        select(UserPermissionOverride).where(UserPermissionOverride.user_id == target.id)
    ).scalars().all()
    overrides_list = [
        {
            "permission_code": ov.permission_code,
            "action": ov.action,
            "expires_at": ov.expires_at,
            "scope": ov.scope,
            "module": ov.module,
            "covers": _expand_override_codes(ov, db),
        }
        for ov in overrides
    ]

    # Compute effective permissions
    effective = set(base_perms)
    for ov in overrides:
        if ov.expires_at is not None and ov.expires_at <= datetime.now(timezone.utc):
            continue
        for code in _expand_override_codes(ov, db):
            if ov.action == "grant":
                effective.add(code)
            elif ov.action == "revoke":
                effective.discard(code)

    return {
        "user_id": str(target.id),
        "email": target.email,
        "full_name": target.full_name,
        "roles": role_codes,
        "base_permissions": sorted(base_perms),
        "effective_permissions": sorted(effective),
        "overrides": overrides_list,
    }


@router.patch("/users/{user_id}/permissions")
async def set_user_permissions(
    request: Request,
    user_id: str,
    payload: Any = Body(...),
    db: Session = Depends(get_db),
    principal: Any = Depends(require_permission("user.permission.manage")),
) -> Any:
    """Set per-user permission overrides (owner/admin only).

    Body: {"overrides": [{"permission_code": "client.read", "action": "revoke",
                          "scope": "section", "module": "clients",
                          "expires_at": null}, ...]}

    Each row may be scoped to a single code (the default), a whole practice
    area module, or a role. Revokes beat grants for the same code, so a
    caller cannot grant and revoke the same code in one payload.
    """
    from app.core.errors import NotFoundError

    target = db.get(User, user_id)
    if target is None or str(target.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"User {user_id} not found")

    p = payload if isinstance(payload, dict) else payload.dict()
    desired = p.get("overrides", [])

    # Wipe existing overrides for this user
    db.execute(
        delete(UserPermissionOverride).where(UserPermissionOverride.user_id == target.id)
    )

    # De-dupe: revoke beats grant for the same (scope, module, code) key.
    seen: dict[tuple, dict] = {}
    for ov in desired:
        if not isinstance(ov, dict):
            continue
        code = ov.get("permission_code")
        action = ov.get("action", "grant")
        if not code or action not in ("grant", "revoke"):
            continue
        scope = ov.get("scope") or UserPermissionOverride.SCOPE_CODE
        if scope not in UserPermissionOverride.VALID_SCOPES:
            scope = UserPermissionOverride.SCOPE_CODE
        module = ov.get("module")
        expires_at = ov.get("expires_at")
        key = (scope, module, code)
        existing = seen.get(key)
        if existing is None:
            seen[key] = {
                "permission_code": code,
                "action": action,
                "scope": scope,
                "module": module,
                "expires_at": expires_at,
            }
        elif existing["action"] == "grant" and action == "revoke":
            # A later revoke overrides an earlier grant for the same key.
            existing["action"] = "revoke"

    for entry in seen.values():
        db.add(UserPermissionOverride(
            user_id=target.id,
            permission_code=entry["permission_code"],
            action=entry["action"],
            scope=entry["scope"],
            module=entry["module"],
            granted_by_id=principal.user_id,
            expires_at=entry["expires_at"],
        ))

    db.commit()

    # Refresh tokens so the new effective permissions take effect immediately
    # rather than waiting for the access token to expire.
    db.execute(
        __import__("sqlalchemy").update(RefreshToken)
        .where(RefreshToken.user_id == target.id)
        .values(revoked_at=datetime.now(timezone.utc))
    )
    db.commit()

    # Return updated effective set
    base_perms: list[str] = []
    role_rows = db.execute(
        select(Role).distinct().join(User.roles).where(User.id == target.id)
    ).scalars().all()
    if role_rows:
        base_perms = list(db.execute(
            select(RolePermission.permission_code).where(
                RolePermission.role_id.in_([r.id for r in role_rows])
            )
        ).scalars().all())

    effective = set(base_perms)
    for entry in seen.values():
        expires_at = entry["expires_at"]
        if expires_at is not None and expires_at <= datetime.now(timezone.utc):
            continue
        for code in _expand_override_codes(
            UserPermissionOverride(
                permission_code=entry["permission_code"],
                action=entry["action"],
                scope=entry["scope"],
                module=entry["module"],
            ),
            db,
        ):
            if entry["action"] == "grant":
                effective.add(code)
            elif entry["action"] == "revoke":
                effective.discard(code)

    return {
        "user_id": str(target.id),
        "base_permissions": sorted(base_perms),
        "effective_permissions": sorted(effective),
        "tokens_invalidated": True,
    }


@router.post("/users/{user_id}/permissions/invalidate-tokens")
async def invalidate_tokens(
    request: Request,
    user_id: str,
    db: Session = Depends(get_db),
    principal: Any = Depends(require_permission("user.permission.manage")),
) -> Any:
    """Revoke every refresh token issued to a team member.

    Use this when a permission change must take effect immediately, or when a
    member's session is suspected of being abused. The access token still
    expires on its own schedule; this only kills the refresh tokens that would
    have refreshed it.
    """
    from app.core.errors import NotFoundError

    target = db.get(User, user_id)
    if target is None or str(target.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"User {user_id} not found")

    result = db.execute(
        __import__("sqlalchemy").update(RefreshToken)
        .where(
            RefreshToken.user_id == target.id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(timezone.utc))
    )
    db.commit()
    return {
        "user_id": str(target.id),
        "revoked": int(result.rowcount or 0),
        "message": "Refresh tokens revoked.",
    }