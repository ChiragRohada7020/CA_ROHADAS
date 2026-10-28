"""Auth router — login, logout, session, refresh, and firm onboarding."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import SessionLocal, get_db
from app.core.errors import AppError, ConflictError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_bearer_token,
    hash_password,
    verify_password,
)
from app.models import Role, RolePermission, Tenant, User, user_roles
from app.models.user import UserPermissionOverride
from app.schemas import LoginRequest, TokenResponse

router = APIRouter(tags=["auth"])


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        "ca_staff_token", access_token, httponly=True, secure=False,
        samesite="lax", max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, path="/",
    )
    response.set_cookie(
        "ca_refresh_token", refresh_token, httponly=True, secure=False,
        samesite="lax", max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400, path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("ca_staff_token", path="/")
    response.delete_cookie("ca_refresh_token", path="/")


@router.post("/auth/login")
async def login(
    response: Response,
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> Any:
    """Sign in: verify credentials, issue access + refresh tokens."""
    from app.models.user import ClientPortalUser

    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()

    if user is None:
        portal_user = (
            db.execute(select(ClientPortalUser).where(ClientPortalUser.email == payload.email))
            .scalar_one_or_none()
        )
        if portal_user is None or not verify_password(payload.password, portal_user.password_hash or ""):
            raise AppError("Invalid email or password", code="invalid_credentials", status_code=401)
        token = create_access_token(
            subject=str(portal_user.id), tenant_id=str(portal_user.tenant_id),
            roles=["client"], permissions=[], audience="client",
        )
        refresh = create_refresh_token(
            subject=str(portal_user.id), tenant_id=str(portal_user.tenant_id), audience="client",
        )
        _set_auth_cookies(response, token, refresh)
        return {
            "access_token": token, "refresh_token": refresh, "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user": {
                "id": str(portal_user.id), "tenant_id": str(portal_user.tenant_id),
                "email": portal_user.email, "full_name": portal_user.full_name or "",
                "designation": None, "employee_code": None, "phone": portal_user.phone,
                "branch_id": None, "is_partner": False, "status": portal_user.status,
                "last_login_at": None,
            },
            "roles": ["client"], "permissions": [], "scope": "client",
        }

    if not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise AppError("Invalid email or password", code="invalid_credentials", status_code=401)

    role_rows = db.execute(
        select(Role).join(user_roles).where(user_roles.c.user_id == user.id)
    ).scalars().all()
    role_codes = [r.code for r in role_rows]

    permission_codes: list[str] = []
    if role_rows:
        perm_rows = db.execute(
            select(RolePermission.permission_code).where(
                RolePermission.role_id.in_([r.id for r in role_rows])
            )
        ).scalars().all()
        permission_codes = list(perm_rows)

    # Apply per-user permission overrides on top of role-based grants
    overrides = db.execute(
        select(UserPermissionOverride.permission_code, UserPermissionOverride.action).where(
            UserPermissionOverride.user_id == user.id,
            UserPermissionOverride.expires_at.is_(None) | (UserPermissionOverride.expires_at > datetime.now(timezone.utc)),
        )
    ).all()
    for code, action in overrides:
        if action == "grant" and code not in permission_codes:
            permission_codes.append(code)
        elif action == "revoke" and code in permission_codes:
            permission_codes.remove(code)

    token = create_access_token(
        subject=str(user.id), tenant_id=str(user.tenant_id),
        roles=role_codes, permissions=permission_codes,
    )
    refresh = create_refresh_token(subject=str(user.id), tenant_id=str(user.tenant_id))
    _set_auth_cookies(response, token, refresh)

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "access_token": token, "refresh_token": refresh, "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": {
            "id": str(user.id), "tenant_id": str(user.tenant_id),
            "email": user.email, "full_name": user.full_name,
            "designation": user.designation, "employee_code": user.employee_code,
            "phone": user.phone,
            "branch_id": str(user.branch_id) if user.branch_id else None,
            "is_partner": user.is_partner, "status": user.status,
            "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        },
        "roles": role_codes, "permissions": permission_codes, "scope": "staff",
    }


@router.post("/auth/refresh")
async def refresh(
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    """Rotate the refresh token and issue a new access token.

    Refresh tokens do **not** carry ``roles`` or ``permissions`` — those are
    re-hydrated from the database on every refresh so that permission changes
    take effect immediately without a re-login.
    """
    refresh_cookie = request.cookies.get("ca_refresh_token")
    if not refresh_cookie:
        raise AppError("No refresh token", code="missing_refresh", status_code=401)

    try:
        payload = decode_token(refresh_cookie, expected_type="refresh", expected_audience=None)
    except Exception:
        raise AppError("Invalid refresh token", code="invalid_refresh", status_code=401)

    user_id = payload.sub
    tenant_id = payload.tenant_id
    aud = payload.aud or "staff"

    # ── Staff users: re-load roles & permissions from the DB ───────────────
    if aud == "staff":
        role_rows = db.execute(
            select(Role).join(user_roles).where(user_roles.c.user_id == user_id)
        ).scalars().all()
        role_codes = [r.code for r in role_rows]

        permission_codes: list[str] = []
        if role_rows:
            perm_rows = db.execute(
                select(RolePermission.permission_code).where(
                    RolePermission.role_id.in_([r.id for r in role_rows])
                )
            ).scalars().all()
            permission_codes = list(perm_rows)

        # Apply per-user permission overrides on top of role-based grants
        overrides = db.execute(
            select(UserPermissionOverride.permission_code, UserPermissionOverride.action).where(
                UserPermissionOverride.user_id == user_id,
                UserPermissionOverride.expires_at.is_(None)
                | (UserPermissionOverride.expires_at > datetime.now(timezone.utc)),
            )
        ).all()
        for code, action in overrides:
            if action == "grant" and code not in permission_codes:
                permission_codes.append(code)
            elif action == "revoke" and code in permission_codes:
                permission_codes.remove(code)

        token = create_access_token(
            subject=user_id, tenant_id=tenant_id,
            roles=role_codes, permissions=permission_codes,
            audience="staff",
        )
        refresh = create_refresh_token(
            subject=user_id, tenant_id=tenant_id, audience="staff",
        )
    # ── Client portal users: re-issue with the same limited scope ──────────
    else:
        token = create_access_token(
            subject=user_id, tenant_id=tenant_id,
            roles=["client"], permissions=[],
            audience=aud,
        )
        refresh = create_refresh_token(
            subject=user_id, tenant_id=tenant_id, audience=aud,
        )

    _set_auth_cookies(response, token, refresh)
    return {"ok": True, "token_type": "bearer", "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60}


@router.post("/auth/logout")
async def logout(
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    """Revoke the refresh token and clear cookies."""
    _clear_auth_cookies(response)
    refresh_cookie = request.cookies.get("ca_refresh_token")
    if refresh_cookie:
        from app.models.user import RefreshToken
        from app.core.security import hash_opaque
        try:
            db.execute(
                __import__("sqlalchemy").update(RefreshToken)
                .where(RefreshToken.token_hash == hash_opaque(refresh_cookie))
                .values(revoked_at=datetime.now(timezone.utc))
            )
            db.commit()
        except Exception:
            pass
    return {"ok": True, "message": "Signed out"}


@router.post("/auth/change-password")
async def change_password(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    try:
        body = await request.json()
    except Exception:
        body = {}
    current_password = body.get("current_password") or body.get("old_password") or body.get("currentPassword")
    new_password = body.get("new_password") or body.get("newPassword") or body.get("password") or body.get("newPasswordConfirm")

    if not current_password or not new_password:
        raise AppError("current_password and new_password are required", code="missing_fields", status_code=400)

    user = db.get(User, principal.id)
    if user is None:
        raise NotFoundError("User not found")

    from app.core.security import verify_password

    if not verify_password(current_password, user.password_hash):
        raise AppError("Current password is incorrect", code="invalid_password", status_code=400)

    user.password_hash = hash_password(new_password)
    db.commit()
    return {"ok": True}



@router.get("/auth/me")
async def me(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    """Return the current authenticated principal."""
    from app.core.security import get_current_user
    principal = await get_current_user(request, db)
    return {
        "access_token": "",
        "refresh_token": None,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": {
            "id": principal.id,
            "tenant_id": principal.tenant_id,
            "email": principal.email,
            "full_name": principal.full_name,
            "designation": principal.designation,
            "employee_code": principal.employee_code,
            "phone": None,
            "branch_id": None,
            "is_partner": principal.is_partner,
            "status": "active",
            "last_login_at": None,
        },
        "roles": principal.roles,
        "permissions": principal.permissions,
        "scope": "staff",
    }


@router.post("/auth/onboarding")
async def onboarding(
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    """Create the first firm and owner user. Only allowed when no tenant exists."""
    body = await request.json()
    firm_name = body.get("firm_name", "").strip()
    firm_slug = body.get("firm_slug", "").strip()
    owner_full_name = body.get("owner_full_name", "").strip()
    owner_email = body.get("owner_email", "").strip()
    owner_password = body.get("owner_password", "")

    if not all([firm_name, firm_slug, owner_full_name, owner_email, owner_password]):
        raise AppError("All fields are required", code="missing_fields", status_code=400)

    existing_tenant = db.execute(select(Tenant)).first()
    if existing_tenant:
        raise ConflictError("A firm already exists on this deployment")

    if db.execute(select(User).where(User.email == owner_email)).scalar_one_or_none():
        raise ConflictError("Email already registered")

    tenant = Tenant(name=firm_name, legal_name=firm_name, slug=firm_slug, status="active")
    db.add(tenant)
    db.flush()

    owner_role = db.execute(select(Role).where(Role.code == "firm_owner")).scalar_one_or_none()
    if owner_role is None:
        owner_role = Role(
            tenant_id=tenant.id, code="firm_owner", name="Firm Owner",
            is_system=True, data_scope="firm",
        )
        db.add(owner_role)
        db.flush()

    owner = User(
        tenant_id=tenant.id, email=owner_email, full_name=owner_full_name,
        password_hash=hash_password(owner_password), is_partner=True, status="active",
    )
    db.add(owner)
    db.flush()

    db.execute(user_roles.insert().values(user_id=owner.id, role_id=owner_role.id))

    from app.models import Permission
    all_perms = db.execute(select(Permission)).scalars().all()
    for p in all_perms:
        db.execute(
            RolePermission.__table__.insert().values(role_id=owner_role.id, permission_code=p.code)
        )

    db.commit()

    # Seed the remaining built-in roles (partner, manager, senior_associate,
    # etc.) so the new firm has the full role catalogue from day one.
    # ``firm_owner`` is already created above; ``seed_default_roles`` is
    # idempotent and will skip it.
    from app.core.rbac import seed_default_roles
    seed_default_roles(db, tenant.id)

    token = create_access_token(
        subject=str(owner.id), tenant_id=str(tenant.id),
        roles=["firm_owner"], permissions=[p.code for p in all_perms],
    )
    refresh = create_refresh_token(subject=str(owner.id), tenant_id=str(tenant.id))
    _set_auth_cookies(response, token, refresh)

    return {
        "access_token": token, "refresh_token": refresh, "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": {
            "id": str(owner.id), "tenant_id": str(tenant.id),
            "email": owner.email, "full_name": owner.full_name,
            "designation": None, "employee_code": None, "phone": None,
            "branch_id": None, "is_partner": True, "status": "active",
            "last_login_at": None,
        },
        "roles": ["firm_owner"],
        "permissions": [p.code for p in all_perms],
        "scope": "staff",
    }