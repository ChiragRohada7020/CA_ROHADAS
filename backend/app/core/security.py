"""Authentication and authorization helpers.

JWT-based access and refresh tokens, password hashing with bcrypt, and a
``get_current_user`` FastAPI dependency that extracts the principal from the
bearer token or the ``ca_staff_token`` cookie.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Any, Optional
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request, status
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_opaque(token: str) -> str:
    """SHA-256 digest of a refresh token before storing — store only the digest."""
    return hashlib.sha256(token.encode()).hexdigest()


def create_access_token(
    *,
    subject: UUID | str,
    tenant_id: UUID | str,
    roles: list[str],
    permissions: list[str],
    audience: str = "staff",
    expires_delta: timedelta | None = None,
) -> str:
    """Build a signed JWT access token."""
    now = datetime.utcnow()
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    payload: dict[str, Any] = {
        "sub": str(subject),
        "tenant_id": str(tenant_id),
        "aud": audience,
        "roles": roles,
        "permissions": permissions,
        "iat": now,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(
    *,
    subject: UUID | str,
    tenant_id: UUID | str,
    audience: str = "staff",
    expires_delta: timedelta | None = None,
) -> str:
    """Build a signed JWT refresh token (no permissions embedded)."""
    now = datetime.utcnow()
    expire = now + (expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))
    payload: dict[str, Any] = {
        "sub": str(subject),
        "tenant_id": str(tenant_id),
        "aud": audience,
        "iat": now,
        "exp": expire,
        "type": "refresh",
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


class TokenPayload(BaseModel):
    sub: str
    tenant_id: str
    aud: str
    exp: int
    iat: int
    type: str
    roles: list[str] = []
    permissions: list[str] = []


TOKEN_VERSION = "v1"


def decode_token(
    token: str,
    *,
    expected_type: str = "access",
    expected_audience: str = "staff",
) -> TokenPayload:
    """Decode and validate a JWT token.

    Raises ``HTTPException`` with the appropriate status for expired, invalid,
    or mismatched-type tokens.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience=expected_audience,
            options={"require": ["exp", "iat", "type", "sub", "tenant_id"]},
        )
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload_type = payload.get("type")
    if payload_type != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token is not of type '{expected_type}'",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return TokenPayload(**payload)


class SecurityContext:
    """Carries the authenticated principal through a request.

    Set as a request scope attribute by the auth middleware so that any handler
    or MCP tool can read the caller's identity without re-decoding the token.
    """

    def __init__(
        self,
        *,
        user_id: UUID | str,
        tenant_id: UUID | str,
        roles: list[str],
        permissions: list[str],
        audience: str = "staff",
    ) -> None:
        self.user_id = str(user_id)
        self.tenant_id = str(tenant_id)
        self.roles = roles
        self.permissions = permissions
        self.audience = audience

    @property
    def is_authenticated(self) -> bool:
        return bool(self.user_id)

    @property
    def is_partner(self) -> bool:
        return "partner" in self.roles or "firm_owner" in self.roles


class Principal(BaseModel):
    """The authenticated user, hydrated from the database for each request."""

    id: str
    tenant_id: str
    email: str
    full_name: str
    designation: str | None = None
    employee_code: str | None = None
    is_partner: bool = False
    roles: list[str] = []
    permissions: list[str] = []
    data_scope: str = "firm"

    @property
    def user_id(self) -> str:
        return self.id


def get_bearer_token(request: Request) -> str | None:
    """Extract a bearer token from the Authorization header or ca_staff_token cookie."""
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:]

    token_cookie = request.cookies.get("ca_staff_token")
    if token_cookie:
        return token_cookie

    refresh_cookie = request.cookies.get("ca_refresh_token")
    if refresh_cookie:
        try:
            payload = decode_token(refresh_cookie, expected_type="refresh")
            return refresh_cookie
        except HTTPException:
            return None

    return None


async def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> Principal:
    """Resolve the authenticated principal for the current request.

    Reads the bearer token from the Authorization header or the ``ca_staff_token``
    httpOnly cookie (the browser sets this automatically on same-origin requests).
    """
    token = get_bearer_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(token, expected_type="access")

    # Lazily import to avoid circular import at module load
    from app.models.user import User

    user_row = db.execute(
        select(User).where(User.id == payload.sub)
    ).scalar_one_or_none()

    if user_row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return Principal(
        id=str(user_row.id),
        tenant_id=payload.tenant_id,
        email=user_row.email,
        full_name=user_row.full_name,
        designation=user_row.designation,
        employee_code=user_row.employee_code,
        is_partner=user_row.is_partner,
        roles=payload.roles,
        permissions=payload.permissions,
        data_scope="firm",
    )


def require_permission(permission: str):
    """FastAPI dependency: raise 403 if the current principal lacks a permission."""

    async def _dep(principal: Principal = Depends(get_current_user)) -> Principal:
        if permission not in principal.permissions and "*:*" not in principal.permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{permission}' is required for this action.",
            )
        return principal

    return _dep
