"""Audit logging.

Writes structured entries to ``activity_logs`` for every business action that
modifies data. ``snapshot`` redacts sensitive columns before they are written to
the audit trail: password hashes, token hashes, and similar secrets must never
leak into a JSONB audit row.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.db import Base
from sqlalchemy import Column, String, Text, DateTime, JSON, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
import uuid


class AuditLog(Base):
    __tablename__ = "activity_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    actor_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_type = Column(String(50), nullable=False, default="user")
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(UUID(as_uuid=True), nullable=True)
    action = Column(String(100), nullable=False)
    summary = Column(Text, nullable=True)
    before_snapshot = Column(JSON, nullable=True)
    after_snapshot = Column(JSON, nullable=True)
    request_ref = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<AuditLog {self.entity_type}/{self.action} on {self.entity_id}>"


SENSITIVE_COLUMNS = {
    "password_hash",
    "token_hash",
    "refresh_token_hash",
    "secret",
    "credential_ref",
    "api_key",
}


def snapshot(record: Any) -> dict[str, Any] | None:
    """Serialise a SQLAlchemy model instance into a redacted dict.

    ``None`` (no record) serialises as ``None``.  Sensitive columns are replaced
    with ``"[REDACTED]"`` before the dict leaves memory.
    """
    if record is None:
        return None

    def _value(v: Any) -> Any:
        if isinstance(v, datetime):
            return v.isoformat()
        if isinstance(v, uuid.UUID):
            return str(v)
        return v

    result: dict[str, Any] = {}
    for key, value in record.__dict__.items():
        if key.startswith("_"):
            continue
        if key in SENSITIVE_COLUMNS:
            result[key] = "[REDACTED]"
        else:
            result[key] = _value(value)
    return result


def log_action(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    actor_user_id: uuid.UUID | None = None,
    actor_type: str = "user",
    entity_type: str,
    entity_id: uuid.UUID | None,
    action: str,
    summary: str | None = None,
    before: Any = None,
    after: Any = None,
    request_ref: str | None = None,
) -> AuditLog:
    """Insert an audit row and return it (the caller controls commit)."""
    entry = AuditLog(
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        actor_type=actor_type,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        summary=summary,
        before_snapshot=snapshot(before) if before is not None else None,
        after_snapshot=snapshot(after) if after is not None else None,
        request_ref=request_ref,
    )
    db.add(entry)
    db.flush()
    return entry
