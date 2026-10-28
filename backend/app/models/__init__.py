"""SQLAlchemy models for the application.

Imports all model modules so that ``Base.metadata.create_all`` discovers every
table. Models are organised by domain — users, clients, tasks, etc. — with each
file owning one or more related tables.
"""
from __future__ import annotations

from app.models.tenant import Tenant, Branch, TenantStatus
from app.models.user import User, RefreshToken, ClientPortalUser, Role, RolePermission, Permission, user_roles, UserPermissionOverride
from app.models.client import (
    Client, LegalEntity, ClientEntityLink, Contact, Registration,
    ClientStatus, ClientType,
)
from app.models.service import (
    Service, ClientService, Engagement, FinancialYear, ServiceCategory,
)
from app.models.task import (
    Task, TaskAssignment, TaskDependency, TaskStep, TaskStatusHistory,
    WorkflowTemplate, WorkflowTransition, TaskTemplate, TaskTemplateStep,
    TaskWorkLog, TaskComment,
    TaskStatus, ApprovalStatus, FilingStatus, Priority, Complexity, TaskType,
)
from app.models.compliance import (
    ComplianceRule, ComplianceRuleVersion, Period, Deadline,
    DeadlineOverride, FilingRecord, Acknowledgement, RuleStatus,
)
from app.models.document import (
    Document, DocumentVersion, DocumentLink, DocumentRequest,
    DocumentShare, DocumentAccessLog, DocumentStatus,
)
from app.models.invoice import (
    Invoice, InvoiceLine, Payment, PaymentAllocation, BillingSettings, ClientSummaryRow, CreditNote, RecurringSchedule,
    InvoiceStatus, GstTaxType, PaymentMethod, CreditNoteType, CreditNoteStatus, RecurringFrequency, RecurringStatus,
    PaymentReminder, Receipt,
)
from app.models.messaging import (
    Conversation, ConversationMessage, Notification,
    IntegrationConnection, ImportJob,
)
from app.models.audit_models import Review, Approval, AuditLog

__all__ = [
    "Tenant", "Branch", "TenantStatus",
    "User", "RefreshToken", "ClientPortalUser", "Role", "RolePermission", "Permission", "user_roles", "UserPermissionOverride", "UserPermissionOverride",
    "Client", "LegalEntity", "ClientEntityLink", "Contact", "Registration",
    "ClientStatus", "ClientType",
    "Service", "ClientService", "Engagement", "FinancialYear", "ServiceCategory",
    "Task", "TaskAssignment", "TaskDependency", "TaskStep", "TaskStatusHistory",
    "WorkflowTemplate", "WorkflowTransition", "TaskTemplate", "TaskTemplateStep",
    "TaskWorkLog", "TaskComment",
    "TaskStatus", "ApprovalStatus", "FilingStatus", "Priority", "Complexity", "TaskType",
    "ComplianceRule", "ComplianceRuleVersion", "Period", "Deadline",
    "DeadlineOverride", "FilingRecord", "Acknowledgement", "RuleStatus",
    "Document", "DocumentVersion", "DocumentLink", "DocumentRequest",
    "DocumentShare", "DocumentAccessLog", "DocumentStatus",
    "Invoice", "InvoiceLine", "Payment", "PaymentAllocation", "BillingSettings", "ClientSummaryRow", "CreditNote",
    "InvoiceStatus", "GstTaxType", "PaymentMethod", "CreditNoteType", "CreditNoteStatus",
    "PaymentReminder", "Receipt",
    "Conversation", "ConversationMessage", "Notification",
    "IntegrationConnection", "ImportJob",
    "Review", "Approval", "AuditLog",
]
