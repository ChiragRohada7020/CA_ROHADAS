"""Service catalogue and client-service assignment models."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.db import Base


class ServiceCategory(str, enum.Enum):
    GST = "gst"
    INCOME_TAX = "income_tax"
    TDS = "tds"
    AUDIT = "audit"
    ROC = "roc"
    ACCOUNTING = "accounting"
    PAYROLL = "payroll"
    ADVISORY = "advisory"
    OTHER = "other"


class Service(Base):
    __tablename__ = "services"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    code = Column(String(50), nullable=False)
    name = Column(String(200), nullable=False)
    category = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    is_recurring = Column(Boolean, default=True, nullable=False)
    default_frequency = Column(String(50), nullable=True)
    default_priority = Column(String(50), default="normal", nullable=False)
    default_fee_model = Column(String(50), nullable=True)
    standard_fee = Column(Float, nullable=True)
    sac_code = Column(String(20), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_services_code"),
    )


class ClientService(Base):
    __tablename__ = "client_services"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    service_id = Column(UUID(as_uuid=True), ForeignKey("services.id"), nullable=False)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Engagement(Base):
    __tablename__ = "engagements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    service_id = Column(UUID(as_uuid=True), ForeignKey("services.id"), nullable=True)
    legal_entity_id = Column(UUID(as_uuid=True), ForeignKey("legal_entities.id"), nullable=True)
    code = Column(String(20), nullable=False)
    title = Column(String(200), nullable=False)
    scope_of_work = Column(Text, nullable=True)
    engagement_letter_ref = Column(String(50), nullable=True)
    status = Column(String(50), default="active", nullable=False)
    fee_model = Column(String(50), nullable=False)
    fee_amount = Column(Float, nullable=True)
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)
    renewal_date = Column(DateTime(timezone=True), nullable=True)
    partner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    manager_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class FinancialYear(Base):
    __tablename__ = "financial_years"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    code = Column(String(20), nullable=False)
    label = Column(String(50), nullable=False)
    start_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True), nullable=False)
    assessment_year = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=False, nullable=False)
    is_closed = Column(Boolean, default=False, nullable=False)
    closed_on = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_fy_code"),
    )
