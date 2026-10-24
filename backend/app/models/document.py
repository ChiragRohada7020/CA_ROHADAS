"""Document models."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, Float, ForeignKey, Integer, String, Text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.db import Base


class DocumentStatus(str, enum.Enum):
    REQUESTED = "requested"
    RECEIVED = "received"
    UNDER_REVIEW = "under_review"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    SUPERSEDED = "superseded"


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=True)
    financial_year_id = Column(UUID(as_uuid=True), ForeignKey("financial_years.id"), nullable=True)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)
    document_request_id = Column(UUID(as_uuid=True), ForeignKey("document_requests.id"), nullable=True)
    category = Column(String(100), nullable=True)
    doc_type = Column(String(100), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    period_key = Column(String(50), nullable=True)
    status = Column(String(50), default=DocumentStatus.REQUESTED, nullable=False)
    is_confidential = Column(Boolean, default=False, nullable=False)
    from_client = Column(Boolean, default=False, nullable=False)
    current_version_id = Column(UUID(as_uuid=True), nullable=True)
    version_count = Column(Integer, default=0, nullable=False)
    rejection_reason = Column(Text, nullable=True)
    tags = Column(Text, nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    versions = relationship("DocumentVersion", back_populates="document", cascade="all, delete-orphan")
    links = relationship("DocumentLink", back_populates="document", cascade="all, delete-orphan")
    shares = relationship("DocumentShare", back_populates="document", cascade="all, delete-orphan")

    @property
    def current_version(self):
        """Return the version matching current_version_id, or None."""
        for v in self.versions:
            if v.id == self.current_version_id:
                return v
        return None


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    version_no = Column(Integer, nullable=False)
    file_name = Column(String(255), nullable=False)
    stored_name = Column(String(255), nullable=True)
    mime_type = Column(String(100), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    checksum_sha256 = Column(String(64), nullable=False)
    blob_pathname = Column(String(500), nullable=True)
    blob_url = Column(String(500), nullable=True)
    uploaded_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    uploaded_by_type = Column(String(50), default="user", nullable=False)
    ocr_status = Column(String(50), default="pending", nullable=False)
    ocr_error = Column(Text, nullable=True)
    extracted_text = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    document = relationship("Document", back_populates="versions")


class DocumentLink(Base):
    __tablename__ = "document_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    linked_type = Column(String(50), nullable=False)
    linked_id = Column(UUID(as_uuid=True), nullable=True)
    purpose = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    document = relationship("Document", back_populates="links")


class DocumentRequest(Base):
    __tablename__ = "document_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=True)
    financial_year_id = Column(UUID(as_uuid=True), ForeignKey("financial_years.id"), nullable=True)
    period_key = Column(String(50), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    doc_type = Column(String(100), nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(50), default="open", nullable=False)
    requested_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reminder_count = Column(Integer, default=0, nullable=False)
    last_reminder_at = Column(DateTime(timezone=True), nullable=True)
    fulfilled_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    @property
    def is_overdue(self):
        from app.core.clock import today_local
        if self.status in ("fulfilled", "received", "cancelled", "closed", "completed", "done"):
            return False
        if self.due_date:
            try:
                due = self.due_date
                today = today_local()
                due_date = due.date() if hasattr(due, 'date') else due
                today_date = today.date() if hasattr(today, 'date') else today
                return due_date < today_date
            except Exception:
                pass
        return False


class DocumentShare(Base):
    __tablename__ = "document_shares"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(100), unique=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    max_downloads = Column(Integer, nullable=True)
    download_count = Column(Integer, default=0, nullable=False)
    shared_with_email = Column(String(255), nullable=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    document = relationship("Document", back_populates="shares")
    creator = relationship("User", foreign_keys=[created_by_id])


class DocumentAccessLog(Base):
    __tablename__ = "document_access_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    access_type = Column(String(50), nullable=False)
    granted = Column(Boolean, default=False, nullable=False)
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
