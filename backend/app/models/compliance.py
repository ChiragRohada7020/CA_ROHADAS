"""Compliance, deadline, and filing models."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.db import Base


class RuleStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    RETIRED = "retired"


class ComplianceRule(Base):
    __tablename__ = "compliance_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    code = Column(String(50), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(50), nullable=False)
    authority = Column(String(100), nullable=True)
    filing_type = Column(String(50), nullable=True)
    applicability_rule = Column(Text, nullable=True)
    default_frequency = Column(String(50), nullable=True)
    lead_days = Column(Integer, default=14, nullable=False)
    internal_due_days = Column(Integer, default=7, nullable=False)
    status = Column(String(50), default=RuleStatus.DRAFT, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    versions = relationship("ComplianceRuleVersion", back_populates="rule", cascade="all, delete-orphan")
    periods = relationship("Period", back_populates="rule", cascade="all, delete-orphan")
    deadlines = relationship("Deadline", back_populates="rule", cascade="all, delete-orphan")


class ComplianceRuleVersion(Base):
    __tablename__ = "compliance_rule_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_id = Column(UUID(as_uuid=True), ForeignKey("compliance_rules.id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    rule = relationship("ComplianceRule", back_populates="versions")


class Period(Base):
    __tablename__ = "periods"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    compliance_rule_id = Column(UUID(as_uuid=True), ForeignKey("compliance_rules.id"), nullable=True)
    label = Column(String(100), nullable=False)
    start_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True), nullable=False)
    period_key = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    rule = relationship("ComplianceRule", back_populates="periods")


class Deadline(Base):
    __tablename__ = "deadlines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    compliance_rule_id = Column(UUID(as_uuid=True), ForeignKey("compliance_rules.id"), nullable=True)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)
    financial_year_id = Column(UUID(as_uuid=True), ForeignKey("financial_years.id"), nullable=True)
    period_key = Column(String(50), nullable=True)
    statutory_due_date = Column(DateTime(timezone=True), nullable=False)
    internal_due_date = Column(DateTime(timezone=True), nullable=True)
    source = Column(String(50), default="rule", nullable=False)
    verified = Column(Boolean, default=False, nullable=False)
    notes = Column(Text, nullable=True)
    verified_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "internal_due_date IS NULL OR internal_due_date <= statutory_due_date",
            name="ck_deadlines_internal_le_statutory",
        ),
        CheckConstraint(
            "verified = false OR (verified_by_id IS NOT NULL AND verified_at IS NOT NULL)",
            name="ck_deadlines_verified_requires_verifier",
        ),
        UniqueConstraint(
            "client_id", "compliance_rule_id", "period_key", name="uq_deadlines_client_rule_period"
        ),
    )

    rule = relationship("ComplianceRule", back_populates="deadlines")
    task = relationship("Task", backref="deadlines")
    client = relationship("Client", backref="deadlines")
    financial_year = relationship("FinancialYear", backref="deadlines")
    verified_by = relationship("User", foreign_keys=[verified_by_id], backref="verified_deadlines")


class DeadlineOverride(Base):
    __tablename__ = "deadline_overrides"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    deadline_id = Column(UUID(as_uuid=True), ForeignKey("deadlines.id", ondelete="CASCADE"), nullable=False)
    new_due_date = Column(DateTime(timezone=True), nullable=False)
    reason = Column(Text, nullable=False)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    deactivated_at = Column(DateTime(timezone=True), nullable=True)
    deactivated_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)


class FilingRecord(Base):
    __tablename__ = "filing_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    compliance_rule_id = Column(UUID(as_uuid=True), ForeignKey("compliance_rules.id"), nullable=True)
    period_key = Column(String(50), nullable=True)
    filing_type = Column(String(50), nullable=False)
    filed_on = Column(DateTime(timezone=True), nullable=True)
    acknowledgement_number = Column(String(100), nullable=True)
    portal_reference = Column(String(200), nullable=True)
    filed_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    proof_document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True)
    status = Column(String(50), default="pending", nullable=False)
    late_fee_paid = Column(Integer, default=0, nullable=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "client_id", "filing_type", "period_key", name="uq_filing_records_client_type_period"
        ),
        CheckConstraint(
            "status = 'pending' OR filed_on IS NOT NULL",
            name="ck_filings_filed_has_date",
        ),
    )


class Acknowledgement(Base):
    __tablename__ = "acknowledgements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    filing_record_id = Column(UUID(as_uuid=True), ForeignKey("filing_records.id"), nullable=False)
    acknowledged_on = Column(DateTime(timezone=True), nullable=True)
    acknowledgement_number = Column(String(100), nullable=True)
    status = Column(String(50), default="pending", nullable=False)
    source_file = Column(String(200), nullable=True)
    extracted_text = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
