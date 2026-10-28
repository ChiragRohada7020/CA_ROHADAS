"""Pydantic schemas for API input and output.

Mirrors the frontend's ``types.ts`` closely. The backend's OpenAPI document at
``/openapi.json`` is the source of truth for the front-end types.
"""
from __future__ import annotations

import enum
from datetime import datetime
from typing import Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# ── Pagination ────────────────────────────────────────────────────────────────

T = TypeVar("T")


class PageMeta(BaseModel):
    total: int
    limit: int
    offset: int
    has_more: bool


class Page(BaseModel, Generic[T]):
    items: list[T]
    meta: PageMeta


# ── Enums ─────────────────────────────────────────────────────────────────────


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


class CommentVisibility(str, enum.Enum):
    INTERNAL = "internal"
    CLIENT = "client"


class DependencyType(str, enum.Enum):
    FINISH_TO_START = "finish_to_start"
    START_TO_START = "start_to_start"
    FINISH_TO_FINISH = "finish_to_finish"


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


class LegalEntityType(str, enum.Enum):
    INDIVIDUAL = "individual"
    HUF = "huf"
    PROPRIETORSHIP = "proprietorship"
    PARTNERSHIP_FIRM = "partnership_firm"
    LLP = "llp"
    PRIVATE_LIMITED = "private_limited"
    PUBLIC_LIMITED = "public_limited"
    ONE_PERSON_COMPANY = "one_person_company"
    SECTION_8_COMPANY = "section_8_company"
    TRUST = "trust"
    SOCIETY = "society"
    AOP = "aop"
    OTHER = "other"


class KycStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    DOCUMENTS_PENDING = "documents_pending"
    IN_REVIEW = "in_review"
    COMPLETE = "complete"
    REJECTED = "rejected"


class ClientStatus(str, enum.Enum):
    PROSPECT = "prospect"
    ONBOARDING = "onboarding"
    ACTIVE = "active"
    INACTIVE = "inactive"
    ON_HOLD = "on_hold"
    CLOSED = "closed"


class RiskClassification(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class RegistrationType(str, enum.Enum):
    PAN = "pan"
    TAN = "tan"
    GST = "gst"
    PROFESSIONAL_TAX = "professional_tax"
    ESI = "esi"
    PF = "pf"
    IEC = "iec"
    DSC = "dsc"
    SHOPS_ESTABLISHMENT = "shops_establishment"
    MSME = "msme"
    LABOUR_WELFARE = "labour_welfare"
    OTHER = "other"


class RegistrationStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class RelationshipType(str, enum.Enum):
    OWNER = "owner"
    PROPRIETOR = "proprietor"
    PARTNER = "partner"
    DIRECTOR = "director"
    KARTA = "karta"
    TRUSTEE = "trustee"
    AUTHORISED_SIGNATORY = "authorised_signatory"
    BENEFICIAL_OWNER = "beneficial_owner"
    WHOLE_TIME_DIRECTOR = "whole_time_director"


class ContactRole(str, enum.Enum):
    PRIMARY = "primary"
    AUTHORISED_SIGNATORY = "authorised_signatory"
    FINANCE = "finance"
    MANAGEMENT = "management"
    OTHER = "other"


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


class FeeModel(str, enum.Enum):
    FIXED = "fixed"
    HOURLY = "hourly"
    RECURRING = "recurring"
    MILESTONE = "milestone"
    RETAINER = "retainer"
    PER_RETURN = "per_return"


class EngagementStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    ON_HOLD = "on_hold"
    COMPLETED = "completed"
    TERMINATED = "terminated"
    EXPIRED = "expired"


class Frequency(str, enum.Enum):
    ONE_TIME = "one_time"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    HALF_YEARLY = "half_yearly"
    YEARLY = "yearly"
    CUSTOM = "custom"


class DeadlineSource(str, enum.Enum):
    RULE = "rule"
    OVERRIDE = "override"
    MANUAL = "manual"


class RuleStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    RETIRED = "retired"


class FilingRecordStatus(str, enum.Enum):
    PENDING = "pending"
    SUBMITTED = "submitted"
    ACKNOWLEDGED = "acknowledged"
    REJECTED = "rejected"
    RESUBMITTED = "resubmitted"


class DocumentStatus(str, enum.Enum):
    REQUESTED = "requested"
    RECEIVED = "received"
    UNDER_REVIEW = "under_review"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    SUPERSEDED = "superseded"


class DocumentRequestStatus(str, enum.Enum):
    OPEN = "open"
    PARTIALLY_RECEIVED = "partially_received"
    FULFILLED = "fulfilled"
    CANCELLED = "cancelled"


class DocumentLinkType(str, enum.Enum):
    TASK = "task"
    FILING_RECORD = "filing_record"
    ENGAGEMENT = "engagement"
    NOTICE = "notice"
    AUDIT_FINDING = "audit_finding"
    INVOICE = "invoice"
    CLIENT = "client"


class NotificationChannel(str, enum.Enum):
    IN_APP = "in_app"
    EMAIL = "email"
    WHATSAPP = "whatsapp"
    SMS = "sms"


class NotificationStatus(str, enum.Enum):
    QUEUED = "queued"
    SENT = "sent"
    FAILED = "failed"
    READ = "read"
    CANCELLED = "cancelled"


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


class UserStatus(str, enum.Enum):
    INVITED = "invited"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DISABLED = "disabled"


class RoleCode(str, enum.Enum):
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


class DataScope(str, enum.Enum):
    OWN = "own"
    TEAM = "team"
    BRANCH = "branch"
    FIRM = "firm"


class ImportJobStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"


class ImportIssueSeverity(str, enum.Enum):
    ERROR = "error"
    WARNING = "warning"


class IntegrationProvider(str, enum.Enum):
    TALLY = "tally"
    WINMAN = "winman"
    VERCEL_BLOB = "vercel_blob"
    EMAIL = "email"
    WHATSAPP = "whatsapp"


class IntegrationStatus(str, enum.Enum):
    NOT_CONFIGURED = "not_configured"
    CONNECTED = "connected"
    ERROR = "error"
    DISABLED = "disabled"


# ── User / auth schemas ────────────────────────────────────────────────────────


class UserProfile(BaseModel):
    id: str
    tenant_id: str
    email: str
    full_name: str
    designation: str | None = None
    employee_code: str | None = None
    phone: str | None = None
    branch_id: str | None = None
    is_partner: bool = False
    status: str
    last_login_at: str | None = None

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int
    user: UserProfile
    roles: list[str]
    permissions: list[str]
    scope: str = "staff"


class LoginRequest(BaseModel):
    email: str
    password: str
    firm_slug: str | None = None


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int
    user: UserProfile
    roles: list[str]
    permissions: list[str]
    scope: str = "staff"


class UserListItem(BaseModel):
    id: str
    full_name: str
    email: str
    designation: str | None = None
    department: str | None = None
    employee_code: str | None = None
    phone: str | None = None
    branch_id: str | None = None
    branch_name: str | None = None
    reporting_to_id: str | None = None
    is_partner: bool
    status: str
    date_of_joining: str | None = None
    weekly_capacity_hours: int = 40
    last_login_at: str | None = None
    roles: list[str]

    model_config = {"from_attributes": True}


class UserDetailRow(UserListItem):
    work_location: str | None = None
    skills: list[str] = []
    system_access: list[str] = []
    created_at: str
    updated_at: str


class UserCounts(BaseModel):
    active: int
    invited: int
    suspended: int
    disabled: int
    total: int


class BranchRow(BaseModel):
    id: str
    code: str
    name: str
    state_code: str | None = None
    is_active: bool

    model_config = {"from_attributes": True}


class RoleRow(BaseModel):
    id: str
    code: str
    name: str
    description: str | None = None
    data_scope: str = "firm"
    is_system: bool = False
    is_active: bool = True
    permissions: list[str] = []


class PermissionDef(BaseModel):
    code: str
    module: str
    action: str
    description: str | None = None


class RolesResponse(BaseModel):
    roles: list[RoleRow]
    catalogue: list[PermissionDef]


class UserCreatePayload(BaseModel):
    email: str
    full_name: str
    password: str | None = None
    employee_code: str | None = None
    designation: str | None = None
    department: str | None = None
    phone: str | None = None
    branch_id: str | None = None
    reporting_to_id: str | None = None
    date_of_joining: str | None = None
    weekly_capacity_hours: int = 40
    is_partner: bool = False
    skills: list[str] = []
    system_access: list[str] = []
    work_location: str | None = None
    role_code: str | None = None


# ── Client schemas ────────────────────────────────────────────────────────────


class ClientCore(BaseModel):
    id: str
    client_code: str
    client_type: str
    legal_name: str
    trade_name: str | None = None
    pan: str | None = None
    gstin: str | None = None
    city: str | None = None
    state: str | None = None
    status: str
    kyc_status: str
    risk_classification: str
    partner_id: str | None = None
    manager_id: str | None = None

    model_config = {"from_attributes": True}


class ClientListItem(ClientCore):
    partner_name: str | None = None
    manager_name: str | None = None
    services: list = []
    next_due_date: str | None = None


class ClientSummary(BaseModel):
    total: int
    active: int
    inactive: int
    prospects: int
    onboarding: int
    on_hold: int
    closed: int
    new_this_year: int
    gst_clients: int
    itr_clients: int
    tds_clients: int
    roc_clients: int


class LegalEntityRow(BaseModel):
    id: str
    entity_type: str
    name: str
    trade_name: str | None = None
    pan: str | None = None
    tan: str | None = None
    cin: str | None = None
    llpin: str | None = None
    gstin: str | None = None
    date_of_birth: str | None = None
    date_of_incorporation: str | None = None
    city: str | None = None
    state: str | None = None
    state_code: str | None = None
    is_active: bool

    model_config = {"from_attributes": True}


class ClientEntityLinkRow(BaseModel):
    id: str
    client_id: str
    legal_entity_id: str
    relationship_type: str
    is_primary: bool
    shareholding_percentage: float | None = None
    designation: str | None = None
    effective_from: str | None = None
    effective_to: str | None = None
    legal_entity: LegalEntityRow | None = None

    model_config = {"from_attributes": True}


class ContactRow(BaseModel):
    id: str
    client_id: str
    legal_entity_id: str | None = None
    name: str
    role: str
    designation: str | None = None
    email: str | None = None
    phone: str | None = None
    whatsapp_number: str | None = None
    is_primary: bool
    is_authorised_signatory: bool

    model_config = {"from_attributes": True}


class RegistrationRow(BaseModel):
    id: str
    client_id: str
    legal_entity_id: str | None = None
    registration_type: str
    number: str
    state_code: str | None = None
    place_of_business: str | None = None
    registered_on: str | None = None
    valid_upto: str | None = None
    status: str
    gst_scheme: str | None = None

    model_config = {"from_attributes": True}


class ClientServiceChip(BaseModel):
    code: str
    name: str
    category: str


class ClientServiceRow(BaseModel):
    id: str
    client_id: str
    service_id: str
    engagement_id: str | None = None
    is_active: bool
    start_date: str | None = None
    end_date: str | None = None
    service: ServiceRow | None = None

    model_config = {"from_attributes": True}


class ClientRead(ClientCore):
    tenant_id: str
    tan: str | None = None
    cin: str | None = None
    llpin: str | None = None
    date_of_birth: str | None = None
    date_of_incorporation: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    district: str | None = None
    state_code: str | None = None
    pincode: str | None = None
    country: str
    relationship_notes: str | None = None
    status_reason: str | None = None
    onboarded_on: str | None = None
    archived_on: str | None = None
    branch_id: str | None = None
    created_at: str
    updated_at: str


class ClientDetail(ClientRead):
    entities: list[ClientEntityLinkRow] = []
    contacts: list[ContactRow] = []
    registrations: list[RegistrationRow] = []
    services: list[ClientServiceRow] = []
    engagements: list = []
    financial_years: list = []


class ClientCreatePayload(BaseModel):
    client_type: str
    legal_name: str
    client_code: str | None = None
    trade_name: str | None = None
    pan: str | None = None
    tan: str | None = None
    cin: str | None = None
    gstin: str | None = None
    date_of_incorporation: str | None = None
    date_of_birth: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    district: str | None = None
    city: str | None = None
    state: str | None = None
    state_code: str | None = None
    pincode: str | None = None
    risk_classification: str | None = "low"
    relationship_notes: str | None = None
    branch_id: str | None = None
    partner_id: str | None = None
    manager_id: str | None = None


class ClientUpdatePayload(BaseModel):
    legal_name: str | None = None
    trade_name: str | None = None
    pan: str | None = None
    tan: str | None = None
    cin: str | None = None
    gstin: str | None = None
    llpin: str | None = None
    date_of_incorporation: str | None = None
    date_of_birth: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    district: str | None = None
    city: str | None = None
    state: str | None = None
    state_code: str | None = None
    pincode: str | None = None
    kyc_status: str | None = None
    risk_classification: str | None = None
    relationship_notes: str | None = None
    partner_id: str | None = None
    manager_id: str | None = None
    branch_id: str | None = None


class ClientStatusPayload(BaseModel):
    status: str
    reason: str | None = None


class ContactCreatePayload(BaseModel):
    name: str
    role: str
    designation: str | None = None
    email: str | None = None
    phone: str | None = None
    whatsapp_number: str | None = None
    is_primary: bool | None = False
    is_authorised_signatory: bool | None = False
    notes: str | None = None


class RegistrationCreatePayload(BaseModel):
    registration_type: str
    number: str
    state_code: str | None = None
    place_of_business: str | None = None
    registered_on: str | None = None
    valid_upto: str | None = None
    gst_scheme: str | None = None
    notes: str | None = None


class ClientProgressSummary(BaseModel):
    client_id: str
    client_name: str
    financial_year: str | None = None
    open_tasks: int
    completed_tasks: int
    overdue_tasks: int
    awaiting_review: int
    awaiting_approval: int
    waiting_for_client: int
    blocked_tasks: int
    unverified_deadlines: int
    open_document_requests: int
    progress_percent: float
    last_activity_at: str | None = None


class ClientServiceCreatePayload(BaseModel):
    service_id: str
    start_date: str | None = None
    end_date: str | None = None
    notes: str | None = None


# ── Service schemas ──────────────────────────────────────────────────────────


class ServiceRow(BaseModel):
    id: str
    code: str
    name: str
    category: str
    description: str | None = None
    is_recurring: bool
    default_frequency: str | None = None
    default_priority: str
    default_fee_model: str | None = None
    standard_fee: float | None = None
    sac_code: str
    is_active: bool
    sort_order: int
    client_count: int = 0

    model_config = {"from_attributes": True}


class ServiceCategorySummary(BaseModel):
    value: str
    label: str
    service_count: int
    client_count: int


class ServiceAssignmentRow(BaseModel):
    service_id: str
    code: str
    name: str
    category: str
    frequency: str | None = None
    standard_fee: float | None = None
    annual_fee: float | None = None
    total_clients: int
    active_clients: int
    inactive_clients: int
    annual_fees: float


class ServiceSummary(BaseModel):
    total_services: int
    active_services: int
    inactive_services: int
    total_assignments: int
    recurring_services: int
    total_annual_fees: float
    by_category: list[ServiceCategorySummary]
    assignments: list[ServiceAssignmentRow]
    tab_counts: dict[str, int]


class ServiceClientRef(BaseModel):
    client_id: str
    client_code: str
    legal_name: str
    client_status: str
    link_is_active: bool
    start_date: str | None = None


class ServiceDetailRow(ServiceRow):
    clients: list[ServiceClientRef]
    templates: list = []


class ServiceCategoryOption(BaseModel):
    value: str
    label: str
    service_count: int


# ── Task schemas ──────────────────────────────────────────────────────────────


class TaskTemplateStepRow(BaseModel):
    id: str
    sequence: int
    name: str
    description: str | None = None
    is_mandatory: bool
    requires_review: bool
    requires_approval: bool
    requires_filing: bool
    requires_document: bool
    estimated_hours: float | None = None
    role_hint: str | None = None

    model_config = {"from_attributes": True}


class TaskTemplateRow(BaseModel):
    id: str
    code: str
    name: str
    description: str | None = None
    service_id: str | None = None
    workflow_template_id: str | None = None
    compliance_rule_id: str | None = None
    is_recurring: bool
    frequency: str | None = None
    default_priority: str
    default_complexity: str
    lead_days: int
    estimated_hours: float | None = None
    title_template: str | None = None
    is_active: bool
    steps: list[TaskTemplateStepRow] = []

    model_config = {"from_attributes": True}


class TaskListItem(BaseModel):
    id: str
    task_code: str
    title: str
    client_id: str
    status: str
    approval_status: str
    filing_status: str
    priority: str
    progress_percent: int
    internal_due_date: str | None = None
    statutory_due_date: str | None = None
    deadline_verified: bool
    preparer_id: str | None = None
    reviewer_id: str | None = None
    parent_task_id: str | None = None
    period_key: str | None = None
    tags: list[str] | None = None
    task_type: str
    category: str | None = None
    is_overdue: bool | None = None
    next_action: str | None = None
    client_name: str | None = None
    service_code: str | None = None
    service_name: str | None = None
    available_transitions: list[str] = []

    model_config = {"from_attributes": True}


class TaskSummary(BaseModel):
    all_tasks: int
    my_tasks: int
    overdue: int
    due_this_week: int
    completed: int
    waiting_for_client: int
    awaiting_review: int
    awaiting_approval: int
    my_blocked: int


class TaskStepRow(BaseModel):
    id: str
    task_id: str
    sequence: int
    name: str
    description: str | None = None
    status: str
    is_mandatory: bool
    requires_review: bool
    requires_approval: bool
    requires_filing: bool
    requires_document: bool
    completed_at: str | None = None
    completed_by_id: str | None = None
    notes: str | None = None
    skip_reason: str | None = None

    model_config = {"from_attributes": True}


class TaskAssignmentRow(BaseModel):
    id: str
    task_id: str
    user_id: str
    role_in_task: str
    assigned_at: str
    assigned_by_id: str | None = None
    unassigned_at: str | None = None
    is_active: bool
    reason: str | None = None

    model_config = {"from_attributes": True}


class TaskCommentRow(BaseModel):
    id: str
    task_id: str
    author_user_id: str | None = None
    author_type: str
    body: str
    visibility: str
    is_review_note: bool
    parent_comment_id: str | None = None
    created_at: str
    edited_at: str | None = None

    model_config = {"from_attributes": True}


class TaskStatusHistoryRow(BaseModel):
    id: str
    task_id: str
    from_status: str | None = None
    to_status: str
    approval_status: str
    filing_status: str
    progress_percent: int
    changed_by_id: str | None = None
    actor_type: str
    reason: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class TaskRead(TaskListItem):
    tenant_id: str
    description: str | None = None
    legal_entity_id: str | None = None
    engagement_id: str | None = None
    service_id: str | None = None
    financial_year_id: str | None = None
    branch_id: str | None = None
    template_id: str | None = None
    compliance_rule_id: str | None = None
    start_date: str | None = None
    completed_at: str | None = None
    filed_at: str | None = None
    delivered_at: str | None = None
    actual_hours: float | None = None
    blocked_reason: str | None = None
    delay_reason: str | None = None
    approver_id: str | None = None
    filer_id: str | None = None
    review_round: int = 0
    escalation_level: int = 0
    is_recurring: bool = False
    recurrence_frequency: str | None = None
    recurrence_end_date: str | None = None
    create_next_period: bool = False
    sub_category: str | None = None
    reminder_date: str | None = None
    created_at: str
    updated_at: str


class TaskDetail(TaskRead):
    steps: list[TaskStepRow] = []
    assignments: list[TaskAssignmentRow] = []
    comments: list[TaskCommentRow] = []
    status_history: list[TaskStatusHistoryRow] = []
    completion_blockers: list[str] = []
    subtasks: list[TaskListItem] = []
    parent_task_code: str | None = None
    parent_task_title: str | None = None


class TaskCreatePayload(BaseModel):
    client_id: str
    title: str
    description: str | None = None
    tags: list[str] | None = None
    status: str | None = None
    task_type: str | None = None
    category: str | None = None
    sub_category: str | None = None
    reminder_date: str | None = None
    is_recurring: bool | None = False
    recurrence_frequency: str | None = None
    recurrence_end_date: str | None = None
    create_next_period: bool | None = True
    parent_task_id: str | None = None
    template_id: str | None = None
    service_id: str | None = None
    engagement_id: str | None = None
    financial_year_id: str | None = None
    period_key: str | None = None
    priority: str | None = "normal"
    complexity: str | None = "moderate"
    start_date: str | None = None
    internal_due_date: str | None = None
    statutory_due_date: str | None = None
    estimated_hours: float | None = None
    preparer_id: str | None = None
    reviewer_id: str | None = None
    approver_id: str | None = None
    create_steps_from_template: bool | None = True


class TaskUpdatePayload(BaseModel):
    title: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    client_id: str | None = None
    service_id: str | None = None
    period_key: str | None = None
    category: str | None = None
    sub_category: str | None = None
    priority: str | None = None
    complexity: str | None = None
    start_date: str | None = None
    internal_due_date: str | None = None
    statutory_due_date: str | None = None
    reminder_date: str | None = None
    estimated_hours: float | None = None
    actual_hours: float | None = None
    blocked_reason: str | None = None
    delay_reason: str | None = None
    filing_status: str | None = None


class TaskDependencyRow(BaseModel):
    id: str
    task_id: str
    depends_on_task_id: str
    dependency_type: str
    notes: str | None = None
    created_at: str
    depends_on_task_code: str | None = None
    depends_on_task_title: str | None = None

    model_config = {"from_attributes": True}


class WorkQueueSummary(BaseModel):
    user_id: str
    due_today: int
    due_this_week: int
    overdue: int
    awaiting_review: int
    awaiting_approval: int
    waiting_for_client: int
    open_total: int
    weighted_load_hours: float


class GenerateTasksResult(BaseModel):
    financial_year: str
    templates_considered: int
    clients_considered: int
    created: int
    skipped_existing: int
    skipped_not_applicable: int
    dry_run: bool
    created_task_ids: list[str]
    skipped_reasons: dict[str, int]


# ── Compliance schemas ────────────────────────────────────────────────────────


class CalendarEntry(BaseModel):
    task_id: str | None = None
    deadline_id: str | None = None
    client_id: str
    client_name: str
    compliance_rule_id: str | None = None
    rule_name: str | None = None
    filing_type: str | None = None
    period_key: str | None = None
    statutory_due_date: str
    internal_due_date: str | None = None
    verified: bool
    status: str
    priority: str
    preparer_id: str | None = None
    reviewer_id: str | None = None
    days_remaining: int
    is_overdue: bool
    is_filed: bool
    authority: str | None = None


class CalendarResponse(BaseModel):
    from_date: str
    to_date: str
    total: int
    unverified_count: int
    overdue_count: int
    entries: list[CalendarEntry]


class DeadlineRow(BaseModel):
    id: str
    client_id: str
    compliance_rule_id: str | None = None
    period_id: str | None = None
    task_id: str | None = None
    financial_year_id: str | None = None
    period_key: str | None = None
    statutory_due_date: str
    internal_due_date: str | None = None
    source: str
    verified: bool
    notes: str | None = None

    model_config = {"from_attributes": True}


class FilingRecordRow(BaseModel):
    id: str
    task_id: str | None = None
    client_id: str
    compliance_rule_id: str | None = None
    period_key: str | None = None
    filing_type: str
    filed_on: str | None = None
    acknowledgement_number: str | None = None
    portal_reference: str | None = None
    filed_by_id: str | None = None
    proof_document_id: str | None = None
    status: str
    late_fee_paid: float | None = None
    remarks: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


# ── Document schemas ──────────────────────────────────────────────────────────


class DocumentVersionRow(BaseModel):
    id: str
    document_id: str
    version_no: int
    file_name: str
    mime_type: str
    size_bytes: int
    checksum_sha256: str
    blob_url: str | None = None
    uploaded_by_id: str | None = None
    uploaded_by_type: str
    ocr_status: str
    notes: str | None = None
    uploaded_by_name: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class DocumentLinkRow(BaseModel):
    id: str
    document_id: str
    linked_type: str
    linked_id: str
    purpose: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class DocumentRow(BaseModel):
    id: str
    client_id: str | None = None
    engagement_id: str | None = None
    financial_year_id: str | None = None
    task_id: str | None = None
    document_request_id: str | None = None
    category: str | None = None
    doc_type: str | None = None
    title: str
    description: str | None = None
    period_key: str | None = None
    status: str
    is_confidential: bool
    from_client: bool
    current_version_id: str | None = None
    version_count: int
    rejection_reason: str | None = None
    tags: list[str] | None = None
    size_bytes: int | None = None
    file_name: str | None = None
    uploaded_by_name: str | None = None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class DocumentDetail(DocumentRow):
    versions: list[DocumentVersionRow] = []
    links: list[DocumentLinkRow] = []


class DocumentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    doc_type: str | None = None
    period_key: str | None = None
    client_id: str | None = None
    financial_year_id: str | None = None
    is_confidential: bool | None = None
    tags: list[str] | None = None


class DocumentRequestRow(BaseModel):
    id: str
    client_id: str
    task_id: str | None = None
    engagement_id: str | None = None
    financial_year_id: str | None = None
    period_key: str | None = None
    title: str
    description: str | None = None
    doc_type: str | None = None
    due_date: str | None = None
    status: str
    requested_by_id: str | None = None
    reminder_count: int
    last_reminder_at: str | None = None
    fulfilled_at: str | None = None
    created_at: str
    is_overdue: bool

    model_config = {"from_attributes": True}


class DocumentRequestCreate(BaseModel):
    client_id: str
    title: str
    description: str | None = None
    doc_type: str | None = None
    task_id: str | None = None
    engagement_id: str | None = None
    financial_year_id: str | None = None
    period_key: str | None = None
    due_date: str | None = None


class DocumentRequestMutate(BaseModel):
    client_id: str
    title: str
    description: str | None = None
    doc_type: str | None = None
    due_date: str | None = None


class DocumentShare(BaseModel):
    id: str
    document_id: str
    token: str
    url: str
    expires_at: str
    max_downloads: int | None = None
    download_count: int
    shared_with_email: str | None = None


class DocumentSummary(BaseModel):
    total_files: int
    clients_count: int
    storage_used_bytes: int
    storage_used_display: str
    pending_from_clients: int
    shared_with_client: int
    status_counts: dict[str, int]
    by_client: list = []


class DocumentClientStat(BaseModel):
    client_id: str
    client_name: str
    count: int
    size_bytes: int


class DocumentCategoryStat(BaseModel):
    category: str
    label: str
    count: int
    size_bytes: int


class UploadResult(BaseModel):
    id: str
    blob_pathname: str
    upload_via: str


# ── Invoice schemas ──────────────────────────────────────────────────────────


class InvoiceLine(BaseModel):
    id: str
    sequence: int
    description: str
    sac_code: str | None = None
    service_id: str | None = None
    task_id: str | None = None
    quantity: int
    unit_price: float
    discount: float
    amount: float
    is_taxable: bool

    model_config = {"from_attributes": True}


class Payment(BaseModel):
    id: str
    invoice_id: str
    amount: float
    paid_on: str
    method: str
    reference: str | None = None
    notes: str | None = None
    recorded_by_id: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class PartyDetails(BaseModel):
    name: str
    legal_name: str | None = None
    gstin: str | None = None
    pan: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    state_code: str | None = None
    pincode: str | None = None
    email: str | None = None
    phone: str | None = None


class Invoice(BaseModel):
    id: str
    invoice_number: str | None = None
    client_id: str
    client_name: str | None = None
    client_code: str | None = None
    engagement_id: str | None = None
    status: str
    invoice_date: str
    due_date: str
    place_of_supply_state_code: str | None = None
    gst_tax_type: str
    tax_rate: float
    subtotal: float
    discount_total: float
    taxable_total: float
    cgst_amount: float
    sgst_amount: float
    igst_amount: float
    total: float
    amount_paid: float
    outstanding: float
    is_overdue: bool
    days_overdue: int
    ageing_bucket: str
    services: list[str] = []
    notes: str | None = None
    terms: str | None = None
    issued_at: str | None = None
    sent_at: str | None = None
    cancelled_at: str | None = None
    cancelled_reason: str | None = None

    model_config = {"from_attributes": True}


class InvoiceDetail(Invoice):
    lines: list[InvoiceLine] = []
    payments: list[Payment] = []
    tax_note: str | None = None
    client: PartyDetails | None = None
    firm: PartyDetails | None = None
    share_link_active: bool = False


class FirmBillingSettings(BaseModel):
    legal_name: str | None = None
    trade_name: str | None = None
    pan: str | None = None
    gstin: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    state_code: str | None = None
    pincode: str | None = None
    country: str = "India"
    phone: str | None = None
    email: str | None = None
    gst_tax_type: str = "intra_state"
    tax_rate: float = 18.0
    sac_code: str | None = None
    payment_terms_days: int = 15
    round_off: bool = True

    model_config = {"from_attributes": True}


class InvoicePayload(BaseModel):
    client_id: str
    invoice_date: str | None = None
    due_date: str | None = None
    lines: list[dict] = []
    notes: str | None = None
    terms: str | None = None


class GenerateResult(BaseModel):
    invoice_id: str
    invoice_number: str
    total: float


class SendOutcome(BaseModel):
    channel: str
    recipient: str | None = None
    status: str
    detail: str | None = None


class InvoiceSendResult(BaseModel):
    invoice_id: str
    invoice_number: str | None
    outcomes: list[SendOutcome]
    share_url: str | None = None


class ShareLinkResult(BaseModel):
    invoice_id: str
    invoice_number: str | None
    share_url: str
    expires_at: str | None = None


class PaymentRecord(BaseModel):
    amount: float
    paid_on: str
    method: str
    reference: str | None = None
    notes: str | None = None


class ReceivablesSummary(BaseModel):
    as_of_date: str
    outstanding_total: float
    overdue_total: float
    overdue_count: int
    by_age_bucket: dict[str, float] = {}
    recent: list[dict] = []


class InvoicePrintData(BaseModel):
    invoice: InvoiceDetail
    firm: PartyDetails
    client: PartyDetails


# ── Messaging schemas ─────────────────────────────────────────────────────────


class ConversationSummary(BaseModel):
    conversation_id: str
    client_id: str
    client_name: str
    subject: str | None = None
    channel: str
    last_message: str | None = None
    last_message_at: str | None = None
    unread_count: int


class MessageRow(BaseModel):
    id: str
    conversation_id: str
    author_type: str
    body: str
    sent_at: str
    author_id: str | None = None
    author_name: str | None = None


class KnowledgeItem(BaseModel):
    category: str
    title: str
    content: str


class WhatsAppStatus(BaseModel):
    configured: bool
    provider: str
    has_api_url: bool
    has_token: bool
    has_phone_id: bool
    baileys_connected: bool | None = None
    baileys_status: dict | None = None


class WhatsAppQrResponse(BaseModel):
    qr_code: str | None = None
    pairing_code: str | None = None
    pairing_instructions: str | None = None
    instructions: str | None = None
    connection_info: dict = {}
    provider: str
    connected: bool


class SendOutcome(BaseModel):
    channel: str
    recipient: str | None = None
    status: str
    detail: str | None = None


class SendCommunicationResult(BaseModel):
    contact_id: str
    outcomes: list[SendOutcome]
    queued: int


# ── Notification schema ───────────────────────────────────────────────────────


class UnreadCount(BaseModel):
    unread: int


class NotificationRow(BaseModel):
    id: str
    channel: str
    template: str | None = None
    title: str
    body: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    status: str
    scheduled_for: str | None = None
    sent_at: str | None = None
    read_at: str | None = None
    attempts: int
    last_error: str | None = None
    created_at: str
    is_read: bool

    model_config = {"from_attributes": True}


# ── Integration / import schemas ──────────────────────────────────────────────


class ProviderInfo(BaseModel):
    provider: str
    name: str
    mechanism: str
    supports: list[str]
    limitations: list[str]


class ConnectionRow(BaseModel):
    id: str
    provider: str
    name: str | None = None
    config: dict | None = None
    credential_ref: str | None = None
    status: str
    is_enabled: bool
    last_sync_at: str | None = None
    last_error: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class ImportIssue(BaseModel):
    row_number: int | None = None
    field: str | None = None
    code: str
    message: str
    severity: str
    raw_row: dict | None = None


class ImportPlanResult(BaseModel):
    rows_read: int
    would_create: int
    would_skip_existing: int
    rows_rejected: int
    headers: list[str]
    mapping: dict[str, str]
    unmapped_fields: list[str]
    mapping_problems: list[str]
    issues: list[ImportIssue]
    sample: list[dict]


class ImportJobRow(BaseModel):
    id: str
    provider: str | None = None
    job_type: str
    status: str
    source_ref: str | None = None
    external_company: str | None = None
    rows_imported: int
    rows_rejected: int
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None
    reconciliation_status: str
    run_by_id: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class ImportJobDetailRow(ImportJobRow):
    errors: list[ImportIssue]
    error_count: int
    warning_count: int


class ImportClientsRequest(BaseModel):
    mapping: dict[str, str] | None = None


class ImportClientsConfirm(BaseModel):
    import_id: str


# ── Finance / reports schemas ────────────────────────────────────────────────


class FinancialYearRow(BaseModel):
    id: str
    code: str
    label: str
    start_date: str
    end_date: str
    assessment_year: str | None = None
    is_active: bool
    is_closed: bool
    closed_on: str | None = None

    model_config = {"from_attributes": True}


class FirmDashboardTotals(BaseModel):
    clients_total: int
    clients_active: int
    engagements_active: int
    tasks_open: int
    tasks_completed: int
    tasks_blocked: int
    tasks_overdue: int
    tasks_due_today: int
    tasks_due_this_week: int
    tasks_due_this_month: int
    awaiting_review: int
    awaiting_approval: int
    waiting_for_client: int
    unverified_deadlines: int
    clients_with_missing_documents: int
    open_document_requests: int


class WorkloadRow(BaseModel):
    user_id: str
    full_name: str
    branch_id: str | None = None
    open_tasks: int
    overdue_tasks: int
    awaiting_review: int
    due_this_week: int
    weighted_load_hours: float
    capacity_hours: float
    utilisation_percent: float


class ClientRiskRow(BaseModel):
    client_id: str
    client_code: str
    client_name: str
    open_tasks: int
    overdue_tasks: int
    unverified_deadlines: int
    open_document_requests: int
    progress_percent: float
    risk_classification: str
    last_activity_at: str | None = None


class DeadlineAlertRow(BaseModel):
    task_id: str | None = None
    client_id: str
    client_name: str
    title: str
    statutory_due_date: str
    internal_due_date: str | None = None
    days_remaining: int
    verified: bool
    status: str
    owner_name: str | None = None


class RecentActivityRow(BaseModel):
    id: str
    action: str
    entity_type: str
    entity_id: str | None = None
    entity_label: str | None = None
    summary: str | None = None
    actor_label: str | None = None
    actor_type: str
    created_at: str


class TrendDelta(BaseModel):
    current: float
    previous: float
    delta: float
    compared_to: str


class DashboardTrends(BaseModel):
    overdue: TrendDelta | None = None
    due_today: TrendDelta | None = None
    due_this_week: TrendDelta | None = None


class ComplianceCategoryRow(BaseModel):
    category: str
    label: str
    total: int
    overdue: int
    due_soon: int
    in_progress: int
    completed: int


class PipelineStageRow(BaseModel):
    key: str
    label: str
    count: int
    statuses: list[str]


class PortfolioSummary(BaseModel):
    clients_total: int
    clients_active: int
    clients_inactive: int
    engagements_active: int
    new_clients_this_fy: int


class FinancialOverview(BaseModel):
    period_label: str
    from_date: str
    to_date: str
    fees_invoiced: float
    fees_collected: float
    invoice_count: int
    outstanding_total: float
    overdue_total: float
    unbilled_value: float
    unbilled_task_count: int
    unbillable_task_count: int
    notes: list[str]


class FirmDashboard(BaseModel):
    generated_at: str
    as_of_date: str
    scope: str
    financial_year: str | None = None
    totals: FirmDashboardTotals
    tasks_by_status: list[dict]
    trends: DashboardTrends
    compliance: list[ComplianceCategoryRow]
    pipeline: list[PipelineStageRow]
    portfolio: PortfolioSummary
    financials: FinancialOverview | None = None
    workload: list[WorkloadRow]
    at_risk_clients: list[ClientRiskRow]
    upcoming_deadlines: list[DeadlineAlertRow]
    recent_activity: list[RecentActivityRow]
    alerts: list[str]


class TeamMemberLoad(BaseModel):
    user_id: str
    full_name: str
    branch_id: str | None = None
    open_tasks: int
    overdue_tasks: int
    weighted_load_hours: float
    capacity_hours: float
    utilisation_percent: float


class DepartmentSlice(BaseModel):
    department: str
    open_tasks: int
    percent: float


class LeaveDay(BaseModel):
    day: int
    present: int
    leave: int
    holiday: int
    half_day: int
    recorded: bool


class LeaveMonth(BaseModel):
    year: int
    month: int
    label: str
    days: list[LeaveDay]
    present: int
    leave: int
    holiday: int
    half_day: int


class TeamSummary(BaseModel):
    total_members: int
    active_members: int
    inactive_members: int
    joined_this_year: int
    total_open_tasks: int
    total_overdue_tasks: int
    average_utilisation: float
    over_capacity: int
    tab_counts: dict[str, int]
    by_department: list[DepartmentSlice]
    workload: list[TeamMemberLoad]
    leave: LeaveMonth | None = None
    departments: list[str]


class MemberClientRef(BaseModel):
    client_id: str
    client_code: str
    legal_name: str
    open_tasks: int


class MemberActivityRow(BaseModel):
    id: str
    summary: str
    created_at: str
    entity_type: str | None = None
    action: str | None = None


class MemberOverview(BaseModel):
    workload: TeamMemberLoad | None = None
    clients: list[MemberClientRef]
    client_count: int
    activity: list[MemberActivityRow]
    leave: LeaveMonth | None = None


class ProductivityRow(BaseModel):
    user_id: str
    full_name: str
    branch_id: str | None = None
    tasks_completed: int
    weighted_throughput: float
    logged_hours: float
    billable_hours: float
    completed_without_logged_effort: int
    average_turnaround_days: float | None = None
    on_time_percent: float | None = None
    correction_rounds: float | None = None


class ProductivityReport(BaseModel):
    period_start: str
    period_end: str
    scope: str
    rows: list[ProductivityRow]
    total_completed: int
    total_logged_hours: float
    notes: list[str]


class StatusAgingRow(BaseModel):
    status: str
    open_tasks: int
    average_days_in_status: float | None = None
    median_days_in_status: float | None = None
    oldest_days: float | None = None
    overdue_tasks: int


class StageDwellRow(BaseModel):
    status: str
    transitions: int
    average_days: float | None = None
    median_days: float | None = None


class RecurrenceDelayRow(BaseModel):
    template_id: str | None = None
    template_name: str
    instances: int
    late_instances: int
    average_days_late: float | None = None
    late_percent: float


class BottleneckReport(BaseModel):
    as_of_date: str
    scope: str
    aging: list[StatusAgingRow]
    dwell: list[StageDwellRow]
    recurrence_delay: list[RecurrenceDelayRow]
    slowest_stage: str | None = None
    notes: list[str]


class ClientServiceStatusRow(BaseModel):
    client_id: str
    client_code: str
    client_name: str
    service_id: str | None = None
    service_name: str
    total: int
    completed: int
    filed: int
    open: int
    overdue: int
    waiting_for_client: int
    awaiting_review: int
    completion_percent: float


class ClientServiceStatusReport(BaseModel):
    as_of_date: str
    scope: str
    rows: list[ClientServiceStatusRow]
    clients_covered: int
    services_covered: int
    notes: list[str]


class TaskWorkLogRow(BaseModel):
    id: str
    task_id: str
    user_id: str
    work_date: str
    hours: float
    description: str | None = None
    activity_type: str
    is_billable: bool
    created_at: str

    model_config = {"from_attributes": True}


class WeeklyChangeSummary(BaseModel):
    from_date: str
    to_date: str
    tasks_created: int
    tasks_completed: int
    tasks_filed: int
    tasks_newly_overdue: int
    documents_received: int
    documents_requested: int
    new_clients: int
    overdue_delta: int
