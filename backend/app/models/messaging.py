"""Messaging and communication models."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.db import Base


class Conversation(Base):
    __tablename__ = "messaging_conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=True)
    subject = Column(String(200), nullable=True)
    channel = Column(String(20), default="whatsapp", nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ConversationMessage(Base):
    __tablename__ = "messaging_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("messaging_conversations.id"), nullable=False)
    author_type = Column(String(50), nullable=False)
    author_id = Column(UUID(as_uuid=True), nullable=True)
    body = Column(Text, nullable=False)
    sent_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    channel = Column(String(50), default="in_app", nullable=False)
    template = Column(String(100), nullable=True)
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=True)
    entity_type = Column(String(100), nullable=True)
    entity_id = Column(UUID(as_uuid=True), nullable=True)
    status = Column(String(50), default="queued", nullable=False)
    scheduled_for = Column(DateTime(timezone=True), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    attempts = Column(Integer, default=0, nullable=False)
    last_error = Column(Text, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class IntegrationConnection(Base):
    __tablename__ = "integration_connections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    provider = Column(String(50), nullable=False)
    name = Column(String(200), nullable=True)
    config_data = Column(Text, nullable=True)
    credential_ref = Column(String(255), nullable=True)
    status = Column(String(50), default="not_configured", nullable=False)
    is_enabled = Column(Boolean, default=False, nullable=False)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    provider = Column(String(50), nullable=True)
    job_type = Column(String(50), nullable=False)
    status = Column(String(50), default="pending", nullable=False)
    source_ref = Column(String(255), nullable=True)
    external_company = Column(String(200), nullable=True)
    rows_imported = Column(Integer, default=0, nullable=False)
    rows_rejected = Column(Integer, default=0, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    error = Column(Text, nullable=True)
    reconciliation_status = Column(String(50), default="pending", nullable=False)
    run_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
