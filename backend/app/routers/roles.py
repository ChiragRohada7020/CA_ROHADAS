"""Roles router — role and permission management.

Endpoints:
  GET  /roles              — role list with permissions
  GET  /roles/{id}         — role detail
  PATCH /roles/{id}        — update role permission grants
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models import Permission, Role, RolePermission

router = APIRouter(tags=["roles"])


@router.get("/roles")
async def list_roles(
    request: Request,
    db: Session = Depends(get_db),
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
    return {"roles": items, "catalogue": catalogue}


@router.get("/roles/{role_id}")
async def get_role(
    request: Request,
    role_id: str,
    db: Session = Depends(get_db),
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
        db.add(RolePermission(role_id=role.id, permission_code=code, tenant_id=role.tenant_id))

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