"""Task and workflow models."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime, Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.db import Base


class TaskStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    WAITING_FOR_CLIENT = "waiting_for_client"
    WAITING_FOR_INTERNAL = "waiting_for_internal"
    READY_FOR_REVIEW = "ready_for_review"
    CHANGES_REQUESTED = "changes_requested"
    READY_FOR_APPROVAL = "ready_for_approval"
    APPROVED = "approved"
    READY_TO_FILE = "ready_to_file"
    FILED = "filed"
    DELIVERED = "delivered"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ApprovalStatus(str, enum.Enum):
    NOT_REQUIRED = "not_required"
    PENDING = "pending"
    APPROVED = "approved"
    CHANGES_REQUESTED = "changes_requested"
    REJECTED = "rejected"


class FilingStatus(str, enum.Enum):
    NOT_REQUIRED = "not_required"
    PENDING = "pending"
    FILED = "filed"
    ACKNOWLEDGED = "acknowledged"
    REJECTED_BY_AUTHORITY = "rejected_by_authority"


class Priority(str, enum.Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class Complexity(str, enum.Enum):
    SIMPLE = "simple"
    MODERATE = "moderate"
    COMPLEX = "complex"
    HIGHLY_COMPLEX = "highly_complex"


class TaskType(str, enum.Enum):
    COMPLIANCE = "compliance"
    REGULAR = "regular"
    INTERNAL = "internal"


class Frequency(str, enum.Enum):
    ONE_TIME = "one_time"
    CUSTOM = "custom"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    HALF_YEARLY = "half_yearly"
    YEARLY = "yearly"


class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    task_code = Column(String(50), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default=TaskStatus.NOT_STARTED, nullable=False)
    approval_status = Column(String(50), default=ApprovalStatus.NOT_REQUIRED, nullable=False)
    filing_status = Column(String(50), default=FilingStatus.NOT_REQUIRED, nullable=False)
    priority = Column(String(20), default=Priority.NORMAL, nullable=False)
    complexity = Column(String(20), default=Complexity.MODERATE, nullable=False)
    task_type = Column(String(50), default=TaskType.REGULAR, nullable=False)
    category = Column(String(50), nullable=True)
    sub_category = Column(String(50), nullable=True)
    progress_percent = Column(Integer, default=0, nullable=False)
    start_date = Column(DateTime(timezone=True), nullable=True)
    internal_due_date = Column(DateTime(timezone=True), nullable=True)
    statutory_due_date = Column(DateTime(timezone=True), nullable=True)
    deadline_verified = Column(Boolean, default=False, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    filed_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    estimated_hours = Column(Float, nullable=True)
    actual_hours = Column(Float, nullable=True)
    blocked_reason = Column(Text, nullable=True)
    delay_reason = Column(String(50), nullable=True)
    preparer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reviewer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    approver_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    filer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    template_id = Column(UUID(as_uuid=True), ForeignKey("workflow_templates.id"), nullable=True)
    compliance_rule_id = Column(UUID(as_uuid=True), ForeignKey("compliance_rules.id"), nullable=True)
    engagement_id = Column(UUID(as_uuid=True), ForeignKey("engagements.id"), nullable=True)
    service_id = Column(UUID(as_uuid=True), ForeignKey("services.id"), nullable=True)
    financial_year_id = Column(UUID(as_uuid=True), ForeignKey("financial_years.id"), nullable=True)
    branch_id = Column(UUID(as_uuid=True), ForeignKey("branches.id"), nullable=True)
    legal_entity_id = Column(UUID(as_uuid=True), ForeignKey("legal_entities.id"), nullable=True)
    period_key = Column(String(50), nullable=True)
    is_recurring = Column(Boolean, default=False, nullable=False)
    recurrence_frequency = Column(Enum(Frequency, name="frequency", native_enum=True, create_type=False), nullable=True)
    recurrence_end_date = Column(DateTime(timezone=True), nullable=True)
    create_next_period = Column(Boolean, default=False, nullable=True)
    reminder_date = Column(DateTime(timezone=True), nullable=True)
    tags = Column(Text, nullable=True)
    parent_task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)
    escalation_level = Column(Integer, default=0, nullable=False)
    review_round = Column(Integer, default=0, nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        CheckConstraint("progress_percent BETWEEN 0 AND 100", name="ck_tasks_progress_range"),
        CheckConstraint(
            "reviewer_id IS DISTINCT FROM preparer_id AND approver_id IS DISTINCT FROM preparer_id",
            name="ck_tasks_separation_of_duty",
        ),
        UniqueConstraint(
            "tenant_id", "task_code", name="uq_tasks_code"
        ),
    )


class TaskAssignment(Base):
    __tablename__ = "task_assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    role_in_task = Column(String(50), nullable=False)
    assigned_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    assigned_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    unassigned_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    reason = Column(Text, nullable=True)


class TaskDependency(Base):
    __tablename__ = "task_dependencies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    depends_on_task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False)
    dependency_type = Column(String(50), default="finish_to_start", nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class TaskStep(Base):
    __tablename__ = "task_steps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    sequence = Column(Integer, nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="pending", nullable=False)
    is_mandatory = Column(Boolean, default=True, nullable=False)
    requires_review = Column(Boolean, default=False, nullable=False)
    requires_approval = Column(Boolean, default=False, nullable=False)
    requires_filing = Column(Boolean, default=False, nullable=False)
    requires_document = Column(Boolean, default=False, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    completed_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    notes = Column(Text, nullable=True)
    skip_reason = Column(Text, nullable=True)


class TaskStatusHistory(Base):
    __tablename__ = "task_status_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    from_status = Column(String(50), nullable=True)
    to_status = Column(String(50), nullable=False)
    approval_status = Column(String(50), nullable=False)
    filing_status = Column(String(50), nullable=False)
    progress_percent = Column(Integer, nullable=False)
    changed_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    actor_type = Column(String(50), default="user", nullable=False)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class WorkflowTemplate(Base):
    __tablename__ = "workflow_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    code = Column(String(50), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    transitions = relationship("WorkflowTransition", back_populates="template", cascade="all, delete-orphan")


class WorkflowTransition(Base):
    __tablename__ = "workflow_transitions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id = Column(UUID(as_uuid=True), ForeignKey("workflow_templates.id", ondelete="CASCADE"), nullable=False)
    from_status = Column(String(50), nullable=False)
    to_status = Column(String(50), nullable=False)
    allowed_roles = Column(Text, nullable=True)
    requires_approval = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    template = relationship("WorkflowTemplate", back_populates="transitions")


class TaskTemplate(Base):
    __tablename__ = "task_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    service_id = Column(UUID(as_uuid=True), ForeignKey("services.id"), nullable=True)
    workflow_template_id = Column(UUID(as_uuid=True), ForeignKey("workflow_templates.id"), nullable=True)
    compliance_rule_id = Column(UUID(as_uuid=True), ForeignKey("compliance_rules.id"), nullable=True)
    code = Column(String(50), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    is_recurring = Column(Boolean, default=False, nullable=False)
    frequency = Column(String(50), nullable=True)
    default_priority = Column(String(20), default=Priority.NORMAL, nullable=False)
    default_complexity = Column(String(50), default="moderate", nullable=False)
    lead_days = Column(Integer, default=14, nullable=False)
    estimated_hours = Column(Float, nullable=True)
    title_template = Column(String(200), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    steps = relationship("TaskTemplateStep", back_populates="template", cascade="all, delete-orphan")


class TaskTemplateStep(Base):
    __tablename__ = "task_template_steps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id = Column(UUID(as_uuid=True), ForeignKey("task_templates.id", ondelete="CASCADE"), nullable=False)
    sequence = Column(Integer, nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    is_mandatory = Column(Boolean, default=True, nullable=False)
    requires_review = Column(Boolean, default=False, nullable=False)
    requires_approval = Column(Boolean, default=False, nullable=False)
    requires_filing = Column(Boolean, default=False, nullable=False)
    requires_document = Column(Boolean, default=False, nullable=False)
    estimated_hours = Column(Float, nullable=True)
    role_hint = Column(String(50), nullable=True)

    template = relationship("TaskTemplate", back_populates="steps")


class TaskWorkLog(Base):
    __tablename__ = "task_work_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    work_date = Column(DateTime(timezone=True), nullable=False)
    hours = Column(Float, nullable=False)
    description = Column(Text, nullable=True)
    activity_type = Column(String(50), default="work", nullable=False)
    is_billable = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class TaskComment(Base):
    __tablename__ = "task_comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    author_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    author_type = Column(String(50), default="user", nullable=False)
    body = Column(Text, nullable=False)
    visibility = Column(String(50), default="internal", nullable=False)
    is_review_note = Column(Boolean, default=False, nullable=False)
    parent_comment_id = Column(UUID(as_uuid=True), ForeignKey("task_comments.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    edited_at = Column(DateTime(timezone=True), nullable=True)
