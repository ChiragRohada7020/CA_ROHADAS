"""Client, entity, contact, and registration models."""
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


class ClientStatus(str, enum.Enum):
    PROSPECT = "prospect"
    ONBOARDING = "onboarding"
    ACTIVE = "active"
    INACTIVE = "inactive"
    ON_HOLD = "on_hold"
    CLOSED = "closed"


class ClientType(str, enum.Enum):
    INDIVIDUAL = "individual"
    HUF = "huf"
    PROPRIETORSHIP = "proprietorship"
    PARTNERSHIP = "partnership"
    LLP = "llp"
    COMPANY = "company"
    TRUST = "trust"
    SOCIETY = "society"
    AOP = "aop"
    OTHER = "other"


class Client(Base):
    __tablename__ = "clients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    client_code = Column(String(50), nullable=False)
    client_type = Column(String(50), nullable=False)
    legal_name = Column(String(200), nullable=False)
    trade_name = Column(String(200), nullable=True)
    pan = Column(String(10), nullable=True)
    tan = Column(String(10), nullable=True)
    cin = Column(String(27), nullable=True)
    llpin = Column(String(8), nullable=True)
    gstin = Column(String(15), nullable=True)
    date_of_birth = Column(DateTime(timezone=True), nullable=True)
    date_of_incorporation = Column(DateTime(timezone=True), nullable=True)
    address_line1 = Column(String(255), nullable=True)
    address_line2 = Column(String(255), nullable=True)
    district = Column(String(100), nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    state_code = Column(String(10), nullable=True)
    pincode = Column(String(20), nullable=True)
    country = Column(String(100), default="India", nullable=False)
    risk_classification = Column(String(20), default="low", nullable=False)
    relationship_notes = Column(Text, nullable=True)
    status = Column(String(50), default=ClientStatus.PROSPECT, nullable=False)
    kyc_status = Column(String(50), default="not_started", nullable=False)
    status_reason = Column(Text, nullable=True)
    onboarded_on = Column(DateTime(timezone=True), nullable=True)
    archived_on = Column(DateTime(timezone=True), nullable=True)
    branch_id = Column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=True)
    partner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    manager_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("tenant_id", "client_code", name="uq_clients_code"),
        UniqueConstraint("tenant_id", "pan", name="uq_clients_pan"),
        {"schema": None},
    )


class LegalEntity(Base):
    __tablename__ = "legal_entities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False)
    name = Column(String(200), nullable=False)
    trade_name = Column(String(200), nullable=True)
    pan = Column(String(10), nullable=True)
    tan = Column(String(10), nullable=True)
    cin = Column(String(27), nullable=True)
    llpin = Column(String(8), nullable=True)
    gstin = Column(String(15), nullable=True)
    date_of_birth = Column(DateTime(timezone=True), nullable=True)
    date_of_incorporation = Column(DateTime(timezone=True), nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    state_code = Column(String(10), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ClientEntityLink(Base):
    __tablename__ = "client_entity_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    legal_entity_id = Column(UUID(as_uuid=True), ForeignKey("legal_entities.id"), nullable=False)
    relationship_type = Column(String(50), nullable=False)
    is_primary = Column(Boolean, default=False, nullable=False)
    shareholding_percentage = Column(Float, nullable=True)
    designation = Column(String(100), nullable=True)
    effective_from = Column(DateTime(timezone=True), nullable=True)
    effective_to = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    legal_entity = relationship("LegalEntity")


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    legal_entity_id = Column(UUID(as_uuid=True), ForeignKey("legal_entities.id"), nullable=True)
    name = Column(String(200), nullable=False)
    role = Column(String(50), nullable=False, default="other")
    designation = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(30), nullable=True)
    whatsapp_number = Column(String(30), nullable=True)
    is_primary = Column(Boolean, default=False, nullable=False)
    is_authorised_signatory = Column(Boolean, default=False, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    contact_pers = relationship("Client", backref="contacts")


class Registration(Base):
    __tablename__ = "registrations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    legal_entity_id = Column(UUID(as_uuid=True), ForeignKey("legal_entities.id"), nullable=True)
    registration_type = Column(String(50), nullable=False)
    number = Column(String(100), nullable=False)
    state_code = Column(String(10), nullable=True)
    place_of_business = Column(String(255), nullable=True)
    registered_on = Column(DateTime(timezone=True), nullable=True)
    valid_upto = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(50), default="active", nullable=False)
    gst_scheme = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("tenant_id", "client_id", "registration_type", "number", name="uq_registrations_client_type_number"),
    )
