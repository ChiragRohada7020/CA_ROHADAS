"""Invoice and payment models."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, Float, ForeignKey, Integer, JSON, String, Text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.db import Base


class InvoiceStatus(str, enum.Enum):
    DRAFT = "draft"
    ISSUED = "issued"
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"
    CANCELLED = "cancelled"


class GstTaxType(str, enum.Enum):
    INTRA_STATE = "intra_state"
    INTER_STATE = "inter_state"
    NONE = "none"


class PaymentMethod(str, enum.Enum):
    CASH = "cash"
    BANK_TRANSFER = "bank_transfer"
    UPI = "upi"
    CHEQUE = "cheque"
    CARD = "card"
    OTHER = "other"


class CreditNoteType(str, enum.Enum):
    CREDIT = "credit"
    DEBIT = "debit"


class CreditNoteStatus(str, enum.Enum):
    DRAFT = "draft"
    ISSUED = "issued"
    CANCELLED = "cancelled"


class CreditNote(Base):
    __tablename__ = "credit_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    note_number = Column(String(50), nullable=True)
    note_type = Column(String(20), default=CreditNoteType.CREDIT, nullable=False)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    reason = Column(Text, nullable=True)
    status = Column(String(50), default=CreditNoteStatus.DRAFT, nullable=False)
    subtotal = Column(Float, default=0.0, nullable=False)
    discount_total = Column(Float, default=0.0, nullable=False)
    taxable_total = Column(Float, default=0.0, nullable=False)
    cgst_amount = Column(Float, default=0.0, nullable=False)
    sgst_amount = Column(Float, default=0.0, nullable=False)
    igst_amount = Column(Float, default=0.0, nullable=False)
    total = Column(Float, default=0.0, nullable=False)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    issued_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    invoice = relationship("Invoice", foreign_keys=[invoice_id], back_populates="credit_notes")


class RecurringFrequency(str, enum.Enum):
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    HALF_YEARLY = "half_yearly"
    ANNUAL = "annual"


class RecurringStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    ENDED = "ended"


class RecurringSchedule(Base):
    __tablename__ = "recurring_schedules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    service_id = Column(UUID(as_uuid=True), ForeignKey("services.id"), nullable=True)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=True)
    frequency = Column(String(20), default=RecurringFrequency.MONTHLY, nullable=False)
    fee = Column(Float, default=0.0, nullable=False)
    tax_rate = Column(Float, default=0.0, nullable=False)
    gst_tax_type = Column(String(50), default=GstTaxType.NONE, nullable=False)
    sac_code = Column(String(20), nullable=True)
    description = Column(Text, nullable=True)
    next_billing_date = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(20), default=RecurringStatus.ACTIVE, nullable=False)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    invoice_number = Column(String(50), nullable=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    client_name = Column(String(200), nullable=True)
    client_code = Column(String(50), nullable=True)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=True)
    status = Column(String(50), default=InvoiceStatus.DRAFT, nullable=False)
    invoice_date = Column(DateTime(timezone=True), nullable=False)
    due_date = Column(DateTime(timezone=True), nullable=False)
    place_of_supply_state_code = Column(String(10), nullable=True)
    gst_tax_type = Column(String(50), default=GstTaxType.NONE, nullable=False)
    tax_rate = Column(Float, default=0.0, nullable=False)
    subtotal = Column(Float, default=0.0, nullable=False)
    discount_total = Column(Float, default=0.0, nullable=False)
    taxable_total = Column(Float, default=0.0, nullable=False)
    cgst_amount = Column(Float, default=0.0, nullable=False)
    sgst_amount = Column(Float, default=0.0, nullable=False)
    igst_amount = Column(Float, default=0.0, nullable=False)
    total = Column(Float, default=0.0, nullable=False)
    amount_paid = Column(Float, default=0.0, nullable=False)
    outstanding = Column(Float, default=0.0, nullable=False)
    is_overdue = Column(Boolean, default=False, nullable=False)
    days_overdue = Column(Integer, default=0, nullable=False)
    ageing_bucket = Column(String(50), default="current", nullable=False)
    notes = Column(Text, nullable=True)
    terms = Column(Text, nullable=True)
    issued_at = Column(DateTime(timezone=True), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_reason = Column(Text, nullable=True)
    share_token = Column(String(100), nullable=True, unique=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    bank_details = Column(JSON, nullable=True)

    lines = relationship("InvoiceLine", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="invoice", cascade="all, delete-orphan")
    credit_notes = relationship("CreditNote", back_populates="invoice", cascade="all, delete-orphan")
    receipts = relationship("Receipt", cascade="all, delete-orphan")

    @property
    def share_link_active(self) -> bool:
        """Whether a client-facing share link currently exists for this invoice."""
        return self.share_token is not None


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    sequence = Column(Integer, nullable=False)
    description = Column(String(255), nullable=False)
    sac_code = Column(String(20), nullable=True)
    service_id = Column(UUID(as_uuid=True), ForeignKey("services.id"), nullable=True)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)
    quantity = Column(Integer, default=1, nullable=False)
    unit_price = Column(Float, nullable=False)
    discount = Column(Float, default=0.0, nullable=False)
    amount = Column(Float, nullable=False)
    is_taxable = Column(Boolean, default=True, nullable=False)

    invoice = relationship("Invoice", back_populates="lines")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Float, nullable=False)
    paid_on = Column(DateTime(timezone=True), nullable=False)
    method = Column(String(50), nullable=False)
    reference = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    recorded_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    invoice = relationship("Invoice", back_populates="payments")
    allocations = relationship("PaymentAllocation", back_populates="payment", cascade="all, delete-orphan")


class PaymentAllocation(Base):
    __tablename__ = "payment_allocations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    payment_id = Column(UUID(as_uuid=True), ForeignKey("payments.id", ondelete="CASCADE"), nullable=False)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    payment = relationship("Payment", back_populates="allocations")
    invoice = relationship("Invoice")


class BillingSettings(Base):
    __tablename__ = "billing_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), unique=True, nullable=False, index=True)
    legal_name = Column(String(200), nullable=True)
    trade_name = Column(String(200), nullable=True)
    pan = Column(String(10), nullable=True)
    gstin = Column(String(15), nullable=True)
    address_line1 = Column(String(255), nullable=True)
    address_line2 = Column(String(255), nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    state_code = Column(String(10), nullable=True)
    pincode = Column(String(20), nullable=True)
    country = Column(String(100), default="India", nullable=False)
    phone = Column(String(30), nullable=True)
    email = Column(String(255), nullable=True)
    gst_tax_type = Column(String(50), default="intra_state", nullable=False)
    tax_rate = Column(Float, default=18.0, nullable=False)
    sac_code = Column(String(20), nullable=True)
    payment_terms_days = Column(Integer, default=15, nullable=False)
    round_off = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ClientSummaryRow(Base):
    __table_args__ = {"extend_existing": True}
    __tablename__ = "client_summaries_view"

    client_id = Column(UUID(as_uuid=True), primary_key=True)
    total = Column(Integer, default=0)
    active = Column(Integer, default=0)
    inactive = Column(Integer, default=0)
    prospects = Column(Integer, default=0)
    onboarding = Column(Integer, default=0)
    on_hold = Column(Integer, default=0)
    closed = Column(Integer, default=0)
    new_this_year = Column(Integer, default=0)
    gst_clients = Column(Integer, default=0)
    itr_clients = Column(Integer, default=0)
    tds_clients = Column(Integer, default=0)
    roc_clients = Column(Integer, default=0)


class PaymentReminder(Base):
    __tablename__ = "payment_reminders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=True)
    reminder_type = Column(String(20), default="email", nullable=False)
    status = Column(String(20), default="queued", nullable=False)
    message = Column(Text, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class Receipt(Base):
    __tablename__ = "receipts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    invoice_id = Column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    payment_id = Column(UUID(as_uuid=True), ForeignKey("payments.id"), nullable=True)
    receipt_number = Column(String(50), nullable=True)
    issued_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    invoice = relationship("Invoice", back_populates="receipts")
