"""Role-based access control primitives.

Defines the catalogue of permissions and the ``Permission`` enum used by
``require_permission`` in routers. The database stores role → permission
mappings in ``role_permissions``; this module is the code-facing mirror.
"""
from __future__ import annotations

from enum import Enum
from typing import Iterable


class Permission(str, Enum):
    """Canonical permission codes used across routers and the UI."""

    # Clients
    CLIENT_READ = "client.read"
    CLIENT_WRITE = "client.write"
    CLIENT_STATUS = "client.status"

    # Contacts
    CONTACT_READ = "contact.read"
    CONTACT_WRITE = "contact.write"

    # Registrations
    REGISTRATION_READ = "registration.read"
    REGISTRATION_WRITE = "registration.write"

    # Services
    SERVICE_READ = "service.read"
    SERVICE_WRITE = "service.write"

    # Engagements
    ENGAGEMENT_READ = "engagement.read"
    ENGAGEMENT_WRITE = "engagement.write"

    # Tasks
    TASK_READ = "task.read"
    TASK_WRITE = "task.write"
    TASK_APPROVE = "task.approve"
    TASK_ASSIGN = "task.assign"
    TASK_COMMENT = "task.comment"
    TASK_CLOSE = "task.close"

    # Compliance
    COMPLIANCE_READ = "compliance.read"
    COMPLIANCE_WRITE = "compliance.write"
    COMPLIANCE_VERIFY = "compliance.verify"

    # Documents
    DOCUMENT_READ = "document.read"
    DOCUMENT_WRITE = "document.write"
    DOCUMENT_UPLOAD = "document.upload"
    DOCUMENT_SHARE = "document.share"

    # Invoices / Billing
    INVOICE_READ = "invoice.read"
    INVOICE_WRITE = "invoice.write"
    INVOICE_ISSUE = "invoice.issue"
    INVOICE_CANCEL = "invoice.cancel"
    INVOICE_SEND = "invoice.send"
    INVOICE_SHARE = "invoice.share"
    PAYMENT_READ = "payment.read"
    PAYMENT_WRITE = "payment.write"
    BILLING_SETTINGS = "billing.settings"

    # Users / roles
    USER_READ = "user.read"
    USER_WRITE = "user.write"
    ROLE_READ = "role.read"
    ROLE_WRITE = "role.write"

    # Integrations / imports
    INTEGRATION_READ = "integration.read"
    INTEGRATION_WRITE = "integration.write"
    IMPORT_READ = "import.read"
    IMPORT_WRITE = "import.write"

    # Communications
    COMMUNICATION_READ = "communication.read"
    COMMUNICATION_SEND = "communication.send"

    # Notifications
    NOTIFICATION_READ = "notification.read"
    NOTIFICATION_WRITE = "notification.write"

    # Reports
    REPORT_READ = "report.read"

    # Assistant / MCP
    ASSISTANT_USE = "assistant.use"
    MCP_TOOL_USE = "mcp.tool_use"

    # Financial years
    FINANCIAL_YEAR_READ = "financial_year.read"
    FINANCIAL_YEAR_WRITE = "financial_year.write"


# A flat set of all permission strings for convenience.
ALL_PERMISSIONS: frozenset[str] = frozenset(p.value for p in Permission)


class RoleCode(str, Enum):
    """Built-in role codes (seed data)."""

    FIRM_OWNER = "firm_owner"
    BRANCH_PARTNER = "branch_partner"
    PARTNER = "partner"
    ADMIN = "admin"
    MANAGER = "manager"
    SENIOR_ASSOCIATE = "senior_associate"
    CA_SENIOR = "ca_senior"
    ARTICLE_ASSISTANT = "article_assistant"
    ACCOUNTS_STAFF = "accounts_staff"
    ACCOUNTANT = "accountant"
    CLIENT = "client"
    SYSTEM_ADMIN = "system_admin"


class DataScope(str, Enum):
    """How broadly a role's read access extends."""

    OWN = "own"
    TEAM = "team"
    BRANCH = "branch"
    FIRM = "firm"


def permissions_for_role(role_code: RoleCode | str) -> set[str]:
    """Return the set of permission codes granted to a role code.

    This is the in-code mirror of the database seed; the actual enforcement uses
    the ``role_permissions`` table at runtime.
    """
    _DEFAULTS: dict[str, Iterable[str]] = {
        RoleCode.SYSTEM_ADMIN.value: ALL_PERMISSIONS,
        RoleCode.FIRM_OWNER.value: RoleCode.BRANCH_PARTNER.value,
        RoleCode.BRANCH_PARTNER.value: [
            "client.read", "client.write", "client.status",
            "contact.read", "contact.write",
            "registration.read", "registration.write",
            "service.read", "service.write",
            "engagement.read", "engagement.write",
            "task.read", "task.write", "task.approve", "task.assign",
            "task.comment", "task.close",
            "compliance.read", "compliance.write", "compliance.verify",
            "document.read", "document.write", "document.upload", "document.share",
            "invoice.read", "invoice.write", "invoice.issue", "invoice.cancel",
            "invoice.send", "invoice.share",
            "payment.read", "payment.write",
            "billing.settings",
            "user.read", "user.write",
            "role.read", "role.write",
            "integration.read", "integration.write",
            "import.read", "import.write",
            "communication.read", "communication.send",
            "notification.read", "notification.write",
            "report.read",
            "assistant.use", "mcp.tool_use",
            "financial_year.read", "financial_year.write",
        ],
        RoleCode.PARTNER.value: [
            "client.read", "client.write", "client.status",
            "contact.read", "contact.write",
            "registration.read", "registration.write",
            "engagement.read", "engagement.write",
            "task.read", "task.write", "task.approve", "task.assign",
            "task.comment",
            "compliance.read", "compliance.write", "compliance.verify",
            "document.read", "document.write", "document.upload", "document.share",
            "invoice.read", "invoice.write", "invoice.issue",
            "payment.read",
            "user.read",
            "notification.read",
            "report.read",
            "assistant.use", "mcp.tool_use",
        ],
        RoleCode.MANAGER.value: [
            "client.read", "client.write", "client.status",
            "contact.read", "contact.write",
            "registration.read", "registration.write",
            "engagement.read", "engagement.write",
            "task.read", "task.write", "task.assign", "task.comment",
            "compliance.read", "compliance.write",
            "document.read", "document.write", "document.upload", "document.share",
            "invoice.read",
            "user.read",
            "notification.read",
            "report.read",
            "assistant.use",
        ],
        RoleCode.SENIOR_ASSOCIATE.value: [
            "client.read", "client.write",
            "contact.read", "contact.write",
            "registration.read",
            "engagement.read",
            "task.read", "task.write", "task.comment",
            "compliance.read",
            "document.read", "document.upload",
            "invoice.read",
            "notification.read",
            "assistant.use",
        ],
        RoleCode.CA_SENIOR.value: [
            "client.read", "client.write",
            "engagement.read",
            "task.read", "task.write", "task.comment",
            "compliance.read",
            "document.read", "document.upload",
            "invoice.read",
            "notification.read",
        ],
        RoleCode.ARTICLE_ASSISTANT.value: [
            "client.read",
            "task.read", "task.comment",
            "compliance.read",
            "document.read",
            "notification.read",
        ],
        RoleCode.ACCOUNTS_STAFF.value: [
            "client.read",
            "task.read",
            "compliance.read",
            "document.read", "document.upload",
            "invoice.read", "payment.read", "payment.write",
            "notification.read",
        ],
        RoleCode.ACCOUNTANT.value: [
            "client.read", "client.write",
            "task.read", "task.write", "task.comment",
            "compliance.read",
            "document.read", "document.upload",
            "invoice.read", "invoice.write", "invoice.issue",
            "payment.read", "payment.write",
            "billing.settings",
            "notification.read",
            "report.read",
        ],
        RoleCode.CLIENT.value: [],
    }

    # Resolve the alias for "branch_partner" → same permissions
    code = role_code.value if isinstance(role_code, RoleCode) else role_code
    if code == RoleCode.FIRM_OWNER.value:
        return set(_DEFAULTS[RoleCode.BRANCH_PARTNER.value])
    return set(_DEFAULTS.get(code, []))
