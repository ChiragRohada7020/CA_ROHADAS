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
    TASK_DELETE = "task.delete"

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
    INVOICE_DELETE = "invoice.delete"
    PAYMENT_READ = "payment.read"
    PAYMENT_WRITE = "payment.write"
    BILLING_SETTINGS = "billing.settings"

    # Users / roles
    USER_READ = "user.read"
    USER_WRITE = "user.write"
    ROLE_READ = "role.read"
    ROLE_WRITE = "role.write"

    # Per-user permission overrides (owner / admin only)
    USER_PERMISSION_MANAGE = "user.permission.manage"

    # Field-level permissions — allow the owner to hide sensitive fields
    CLIENT_SENSITIVE_READ = "client.read.sensitive"
    INVOICE_FINANCIAL_READ = "invoice.read.financial"
    PAYMENT_DETAIL_READ = "payment.read.detail"
    CLIENT_NOTE_READ = "client.read.notes"

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
    CREDIT_NOTE_WRITE = "credit_note.write"
    RECURRING_WRITE = "recurring.write"

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
            "task.comment", "task.close", "task.delete",
            "compliance.read", "compliance.write", "compliance.verify",
            "document.read", "document.write", "document.upload", "document.share",
            "invoice.read", "invoice.write", "invoice.issue", "invoice.cancel",
            "invoice.send", "invoice.share", "invoice.delete",
            "payment.read", "payment.write",
            "credit_note.write", "recurring.write",
            "billing.settings",
            "user.read", "user.write",
            "role.read", "role.write",
            "user.permission.manage",
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
            "task.comment", "task.delete",
            "compliance.read", "compliance.write", "compliance.verify",
            "document.read", "document.write", "document.upload", "document.share",
            "invoice.read", "invoice.write", "invoice.issue", "invoice.delete",
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
            "task.read", "task.write", "task.assign", "task.comment", "task.delete",
            "compliance.read", "compliance.write",
            "document.read", "document.write", "document.upload", "document.share",
            "invoice.read", "invoice.delete",
            "payment.read", "payment.write",
            "credit_note.write", "recurring.write",
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
            "invoice.read", "payment.read", "payment.write",
            "credit_note.write", "recurring.write",
            "client.read.sensitive", "client.read.notes",
            "invoice.read.financial",
            "notification.read",
            "assistant.use",
        ],
        RoleCode.CA_SENIOR.value: [
            "client.read", "client.write",
            "engagement.read",
            "task.read", "task.write", "task.comment",
            "compliance.read",
            "document.read", "document.upload",
            "invoice.read", "payment.read", "payment.write",
            "credit_note.write", "recurring.write",
            "client.read.sensitive", "client.read.notes",
            "invoice.read.financial",
            "notification.read",
        ],
        RoleCode.ARTICLE_ASSISTANT.value: [
            "client.read",
            "task.read", "task.comment",
            "compliance.read",
            "document.read",
            "client.read.sensitive", "client.read.notes",
            "notification.read",
        ],
        RoleCode.ACCOUNTS_STAFF.value: [
            "client.read",
            "task.read",
            "compliance.read",
            "document.read", "document.upload",
            "client.read.notes",
            "invoice.read", "payment.read", "payment.write",
            "payment.read.detail",
            "notification.read",
        ],
        RoleCode.ACCOUNTANT.value: [
            "client.read", "client.write",
            "client.read.sensitive", "client.read.notes",
            "task.read", "task.write", "task.comment",
            "compliance.read",
            "document.read", "document.upload",
            "invoice.read", "invoice.write", "invoice.issue",
            "invoice.read.financial",
            "payment.read", "payment.write",
            "payment.read.detail",
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


# Human-readable display names for every built-in system role.
_DEFAULT_ROLE_NAMES: dict[str, str] = {
    RoleCode.FIRM_OWNER.value: "Firm Owner",
    RoleCode.BRANCH_PARTNER.value: "Branch Partner",
    RoleCode.PARTNER.value: "Partner",
    RoleCode.ADMIN.value: "Administrator",
    RoleCode.MANAGER.value: "Manager",
    RoleCode.SENIOR_ASSOCIATE.value: "Senior Associate",
    RoleCode.CA_SENIOR.value: "CA Senior",
    RoleCode.ARTICLE_ASSISTANT.value: "Article Assistant",
    RoleCode.ACCOUNTS_STAFF.value: "Accounts Staff",
    RoleCode.ACCOUNTANT.value: "Accountant",
    RoleCode.SYSTEM_ADMIN.value: "System Administrator",
}

# System roles (besides the client portal) that every tenant should have.
_DEFAULT_TENANT_ROLE_CODES: list[str] = [
    RoleCode.FIRM_OWNER.value,
    RoleCode.BRANCH_PARTNER.value,
    RoleCode.PARTNER.value,
    RoleCode.ADMIN.value,
    RoleCode.MANAGER.value,
    RoleCode.SENIOR_ASSOCIATE.value,
    RoleCode.CA_SENIOR.value,
    RoleCode.ARTICLE_ASSISTANT.value,
    RoleCode.ACCOUNTS_STAFF.value,
    RoleCode.ACCOUNTANT.value,
    RoleCode.SYSTEM_ADMIN.value,
]


def seed_default_roles(db, tenant_id) -> list[str]:
    """Create all built-in system roles for a tenant and assign their permissions.

    Idempotent: roles that already exist for the tenant are left untouched, so
    this is safe to call multiple times (including on every onboarding attempt).

    ``firm_owner`` receives every permission in the catalogue (matching the
    legacy onboarding behaviour). All other roles receive their canonical
    permission set from :func:`permissions_for_role`.

    Returns the list of role codes that were newly created.
    """
    # Lazy imports avoid circular-dependency at module load time.
    from app.models.user import Role, RolePermission
    from app.models import Permission
    from sqlalchemy import select

    tid = tenant_id
    created: list[str] = []

    # Collect all permission codes once (firm_owner gets everything).
    all_perm_codes = [p.code for p in db.execute(select(Permission)).scalars().all()]

    for code in _DEFAULT_TENANT_ROLE_CODES:
        existing = db.execute(
            select(Role).where(Role.code == code, Role.tenant_id == tid)
        ).scalar_one_or_none()
        if existing is not None:
            continue

        role = Role(
            tenant_id=tid,
            code=code,
            name=_DEFAULT_ROLE_NAMES.get(code, code.replace("_", " ").title()),
            description=None,
            data_scope="firm",
            is_system=True,
            is_active=True,
        )
        db.add(role)
        db.flush()  # populate role.id

        if code == RoleCode.FIRM_OWNER.value:
            perm_codes = all_perm_codes
        else:
            perm_codes = list(permissions_for_role(code))

        for perm_code in perm_codes:
            db.execute(
                RolePermission.__table__.insert().values(
                    role_id=role.id, permission_code=perm_code
                )
            )
        created.append(code)

    db.commit()
    return created
