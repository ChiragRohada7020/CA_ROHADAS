"""Review and approval models.

Kept separate from ``app.models.messaging`` (which owns ``Notification``) so
that the review tables can be imported independently by the compliance service.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.db import Base

if TYPE_CHECKING:
    pass


class Review(Base):
    __tablename__ = "reviews"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False)
    reviewer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status = Column(String(50), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    decided_at = Column(DateTime(timezone=True), nullable=True)
    decided_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    task = relationship("Task")
    reviewer = relationship("User", foreign_keys=[reviewer_id])
    decided_by = relationship("User", foreign_keys=[decided_by_id])


class Approval(Base):
    __tablename__ = "approvals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False)
    approver_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    approval_type = Column(String(50), nullable=False)
    status = Column(String(50), default="pending", nullable=False)
    round = Column(Integer, default=1, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    decided_at = Column(DateTime(timezone=True), nullable=True)

    task = relationship("Task")
    approver = relationship("User", foreign_keys=[approver_id])

    __table_args__ = (
        UniqueConstraint("task_id", "approval_type", name="uq_approvals_type_per_task"),
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected') OR decided_at IS NOT NULL",
            name="ck_approvals_decided_has_timestamp",
        ),
    )


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    action = Column(String(50), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    before_json = Column(Text, nullable=True)
    after_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
