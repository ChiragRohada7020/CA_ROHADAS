"""User and staff models."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Table, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.db import Base


# ── Association tables ────────────────────────────────────────────────────────

user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("created_at", DateTime(timezone=True), nullable=False, default=datetime.utcnow),
    Column("assigned_by_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
)


class UserPermissionOverride(Base):
    """Per-user permission overrides that extend or restrict role-based grants.

    A ``grant`` override adds a permission the user does not have via their role;
    a ``revoke`` override removes a permission even if the role grants it.
    """

    __tablename__ = "user_permission_overrides"

    # How broad this override row is. ``code`` is a single permission code
    # (the historical shape); ``module``/``section`` cover every permission in a
    # practice-area module; ``role`` covers every permission a role grants.
    SCOPE_CODE = "code"
    SCOPE_MODULE = "module"
    SCOPE_SECTION = "section"
    SCOPE_ROLE = "role"
    VALID_SCOPES = (SCOPE_CODE, SCOPE_MODULE, SCOPE_SECTION, SCOPE_ROLE)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    permission_code = Column(String(100), nullable=False)
    action = Column(String(10), nullable=False)  # "grant" or "revoke"
    scope = Column(String(20), default=SCOPE_CODE, nullable=False)
    module = Column(String(50), nullable=True)
    granted_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", foreign_keys=[user_id], back_populates="permission_overrides")


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(255), nullable=False, unique=True)
    full_name = Column(String(200), nullable=False)
    password_hash = Column(String(255), nullable=True)
    designation = Column(String(100), nullable=True)
    employee_code = Column(String(50), nullable=True)
    phone = Column(String(30), nullable=True)
    branch_id = Column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=True)
    is_partner = Column(Boolean, default=False, nullable=False)
    status = Column(String(50), default="active", nullable=False)
    date_of_joining = Column(DateTime(timezone=True), nullable=True)
    weekly_capacity_hours = Column(String(20), default="40", nullable=True)
    department = Column(String(100), nullable=True)
    reporting_to_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="users")
    roles = relationship(
        "Role",
        secondary=user_roles,
        primaryjoin="User.id == user_roles.c.user_id",
        secondaryjoin="Role.id == user_roles.c.role_id",
        back_populates="users",
    )
    refresh_tokens = relationship("RefreshToken", back_populates="user")
    permission_overrides = relationship(
        "UserPermissionOverride",
        foreign_keys="UserPermissionOverride.user_id",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    client_portal_user_id = Column(UUID(as_uuid=True), ForeignKey("client_portal_users.id"), nullable=True)
    token_hash = Column(String(255), nullable=False, unique=True)
    issued_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="refresh_tokens")

    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_refresh_tokens_hash"),
    )


class ClientPortalUser(Base):
    __tablename__ = "client_portal_users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=True)
    full_name = Column(String(200), nullable=True)
    phone = Column(String(30), nullable=True)
    status = Column(String(50), default="active", nullable=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Role(Base):
    __tablename__ = "roles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=True)
    code = Column(String(50), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    data_scope = Column(String(20), default="firm", nullable=False)
    is_system = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    permissions = relationship(
        "Permission",
        secondary="role_permissions",
        primaryjoin="Role.id == RolePermission.role_id",
        secondaryjoin="Permission.code == RolePermission.permission_code",
        back_populates="roles",
    )
    users = relationship(
        "User",
        secondary=user_roles,
        primaryjoin="Role.id == user_roles.c.role_id",
        secondaryjoin="User.id == user_roles.c.user_id",
        back_populates="roles",
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_roles_tenant_code"),
    )


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    permission_code = Column(String(100), ForeignKey("permissions.code", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(100), nullable=False, unique=True)
    module = Column(String(50), nullable=False)
    action = Column(String(50), nullable=False)
    description = Column(Text, nullable=True)

    roles = relationship(
        "Role",
        secondary="role_permissions",
        primaryjoin="Permission.code == RolePermission.permission_code",
        secondaryjoin="Role.id == RolePermission.role_id",
        back_populates="permissions",
    )
