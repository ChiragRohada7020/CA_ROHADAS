/**
 * Types mirroring the FastAPI response schemas.
 *
 * Hand-written rather than generated, because the surface the dashboard needs is
 * small and a generated client would add a build step for little gain. The
 * backend's OpenAPI document at `/openapi.json` is the source of truth.
 */

export interface PageMeta {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface Page<T> {
  items: T[];
  meta: PageMeta;
}

/** The error envelope every AppError produces: `{"error": {...}}`. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown> | null;
  };
}

export interface UserProfile {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  designation: string | null;
  employee_code: string | null;
  phone: string | null;
  branch_id: string | null;
  is_partner: boolean;
  status: string;
  last_login_at: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  expires_in: number;
  user: UserProfile;
  roles: string[];
  permissions: string[];
  scope: string;
}

export interface UserPermissionInfo {
  user_id: string;
  email: string;
  full_name: string;
  roles: string[];
  base_permissions: string[];
  effective_permissions: string[];
  overrides: Array<{
    permission_code: string;
    action: "grant" | "revoke";
    expires_at: string | null;
    scope: "code" | "module" | "section" | "role";
    module: string | null;
    covers: string[];
  }>;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface FirmDashboardTotals {
  clients_total: number;
  clients_active: number;
  engagements_active: number;
  tasks_open: number;
  tasks_completed: number;
  tasks_blocked: number;
  tasks_overdue: number;
  tasks_due_today: number;
  tasks_due_this_week: number;
  tasks_due_this_month: number;
  awaiting_review: number;
  awaiting_approval: number;
  waiting_for_client: number;
  unverified_deadlines: number;
  clients_with_missing_documents: number;
  open_document_requests: number;
}

export interface WorkloadRow {
  user_id: string;
  full_name: string;
  branch_id: string | null;
  open_tasks: number;
  overdue_tasks: number;
  awaiting_review: number;
  due_this_week: number;
  /** Complexity-weighted effort, not a task count. */
  weighted_load_hours: number;
  capacity_hours: number;
  utilisation_percent: number;
}

export interface ClientRiskRow {
  client_id: string;
  client_code: string;
  client_name: string;
  open_tasks: number;
  overdue_tasks: number;
  unverified_deadlines: number;
  open_document_requests: number;
  progress_percent: number;
  risk_classification: string;
  last_activity_at: string | null;
}

export interface DeadlineAlertRow {
  task_id: string | null;
  client_id: string;
  client_name: string;
  title: string;
  statutory_due_date: string;
  internal_due_date: string | null;
  days_remaining: number;
  /** False when no human has confirmed the statutory date. */
  verified: boolean;
  status: string;
  owner_name: string | null;
}

export interface RecentActivityRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  summary: string | null;
  actor_label: string | null;
  actor_type: string;
  created_at: string;
}

export interface TrendDelta {
  current: number;
  previous: number;
  /** `current - previous`. Negative means fewer than before — good for overdue. */
  delta: number;
  /** What `previous` is measured against: "last week", "yesterday". */
  compared_to: string;
}

/**
 * Direction of travel for the headline figures.
 *
 * Only the three that can be computed honestly are declared. `awaiting_review` and
 * `missing_documents` are deliberately absent from the API rather than sent as null,
 * so a screen cannot render a zero for a comparison that was never made.
 */
export interface DashboardTrends {
  overdue?: TrendDelta;
  due_today?: TrendDelta;
  due_this_week?: TrendDelta;
}

export interface ComplianceCategoryRow {
  category: string;
  label: string;
  total: number;
  overdue: number;
  due_soon: number;
  in_progress: number;
  completed: number;
}

export interface PipelineStageRow {
  key: string;
  label: string;
  count: number;
  /** The workflow statuses this stage covers, so the grouping is inspectable. */
  statuses: string[];
}

export interface PortfolioSummary {
  clients_total: number;
  clients_active: number;
  clients_inactive: number;
  engagements_active: number;
  new_clients_this_fy: number;
}

export interface FinancialOverview {
  period_label: string;
  from_date: string;
  to_date: string;
  fees_invoiced: number;
  fees_collected: number;
  invoice_count: number;
  /** Everything issued and unsettled, across all periods — owed *now*. */
  outstanding_total: number;
  overdue_total: number;
  /** Completed work not yet on a live invoice. */
  unbilled_value: number;
  unbilled_task_count: number;
  /** Completed work with no agreed fee, so it has no value to add. */
  unbillable_task_count: number;
  notes: string[];
}

export interface FirmDashboard {
  generated_at: string;
  as_of_date: string;
  /** How much of the firm the figures cover: own | team | branch | firm. */
  scope: string;
  financial_year: string | null;
  totals: FirmDashboardTotals;
  tasks_by_status: StatusCount[];
  trends: DashboardTrends;
  compliance: ComplianceCategoryRow[];
  pipeline: PipelineStageRow[];
  portfolio: PortfolioSummary;
  financials: FinancialOverview | null;
  workload: WorkloadRow[];
  at_risk_clients: ClientRiskRow[];
  upcoming_deadlines: DeadlineAlertRow[];
  recent_activity: RecentActivityRow[];
  alerts: string[];
}

export type NotificationChannel = "in_app" | "email" | "whatsapp" | "sms";

export type NotificationStatus = "queued" | "sent" | "failed" | "read" | "cancelled";

export interface NotificationRow {
  id: string;
  channel: NotificationChannel;
  template: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  status: NotificationStatus;
  scheduled_for: string | null;
  sent_at: string | null;
  read_at: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  is_read: boolean;
}

export interface UnreadCount {
  unread: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enums
//
// Copied from the backend's `StrEnum`s. They are unions rather than TS `enum`s so
// that a raw API string assigns to them without a cast, and an unknown value from a
// newer backend degrades to a runtime fallback in the label helpers instead of
// failing the build.
// ─────────────────────────────────────────────────────────────────────────────

export type TaskStatus =
  | "not_started"
  | "assigned"
  | "in_progress"
  | "waiting_for_client"
  | "waiting_for_internal"
  | "ready_for_review"
  | "changes_requested"
  | "ready_for_approval"
  | "approved"
  | "ready_to_file"
  | "filed"
  | "delivered"
  | "completed"
  | "cancelled";

export type ApprovalStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "changes_requested"
  | "rejected";

export type FilingStatus =
  | "not_required"
  | "pending"
  | "filed"
  | "acknowledged"
  | "rejected_by_authority";

export type TaskStepStatus = "pending" | "in_progress" | "completed" | "skipped" | "not_applicable";

export type Priority = "low" | "normal" | "high" | "urgent";

export type Complexity = "simple" | "moderate" | "complex" | "highly_complex";

export type TaskRole = "preparer" | "reviewer" | "approver" | "filer" | "manager" | "partner" | "observer";

/**
 * How one task waits on another.
 *
 * Finish-to-start is the normal case: B cannot begin until A is done. The other two are
 * for work that runs alongside but is still bound to another task's timing.
 */
export type DependencyType = "finish_to_start" | "start_to_start" | "finish_to_finish";

/**
 * What kind of work a task is.
 *
 * Distinct from its status (where the work is) and from its service (what was sold).
 * This is the axis that decides whether a filing record is expected.
 */
export type TaskType = "compliance" | "regular" | "internal";

export type CommentVisibility = "internal" | "client";

export type DelayReason =
  | "client_documents_pending"
  | "client_clarification_pending"
  | "internal_capacity"
  | "portal_downtime"
  | "awaiting_review"
  | "awaiting_approval"
  | "data_mismatch"
  | "third_party_dependency"
  | "other";

export type ClientStatus = "prospect" | "onboarding" | "active" | "inactive" | "on_hold" | "closed";

export type ClientType =
  | "individual"
  | "huf"
  | "proprietorship"
  | "partnership"
  | "llp"
  | "company"
  | "trust"
  | "society"
  | "aop"
  | "other";

export type KycStatus = "not_started" | "documents_pending" | "in_review" | "complete" | "rejected";

export type RiskClassification = "low" | "medium" | "high";

export type RegistrationType =
  | "pan"
  | "tan"
  | "gst"
  | "professional_tax"
  | "esi"
  | "pf"
  | "iec"
  | "dsc"
  | "shops_establishment"
  | "msme"
  | "labour_welfare"
  | "other";

export type RegistrationStatus = "active" | "suspended" | "cancelled" | "expired";

export type RelationshipType =
  | "owner"
  | "proprietor"
  | "partner"
  | "director"
  | "karta"
  | "trustee"
  | "authorised_signatory"
  | "beneficial_owner"
  | "whole_time_director";

export type ServiceCategory =
  | "gst"
  | "income_tax"
  | "tds"
  | "audit"
  | "roc"
  | "accounting"
  | "payroll"
  | "advisory"
  | "other";

export type EngagementStatus =
  | "draft"
  | "active"
  | "on_hold"
  | "completed"
  | "terminated"
  | "expired";

export type Frequency = "one_time" | "monthly" | "quarterly" | "half_yearly" | "yearly" | "custom";

export type DeadlineSource = "rule" | "override" | "manual";

export type RuleStatus = "draft" | "active" | "retired";

export type FilingRecordStatus =
  | "pending"
  | "submitted"
  | "acknowledged"
  | "rejected"
  | "resubmitted";

export type ContactRole = "primary" | "authorised_signatory" | "finance" | "management" | "other";

export type DocumentLinkType =
  | "task"
  | "filing_record"
  | "engagement"
  | "notice"
  | "audit_finding"
  | "invoice"
  | "client";

export type FeeModel = "fixed" | "hourly" | "recurring" | "milestone" | "retainer" | "per_return";

export type LegalEntityType =
  | "individual"
  | "huf"
  | "proprietorship"
  | "partnership_firm"
  | "llp"
  | "private_limited"
  | "public_limited"
  | "one_person_company"
  | "section_8_company"
  | "trust"
  | "society"
  | "aop"
  | "other";

// ─────────────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────────────

/** A service a client holds, as shown in the list's services column. */
export interface ClientServiceChip {
  code: string;
  name: string;
  category: ServiceCategory;
}

/** Fields every client response carries, however it was fetched. */
export interface ClientCore {
  id: string;
  client_code: string;
  client_type: ClientType;
  legal_name: string;
  trade_name: string | null;
  pan: string | null;
  gstin: string | null;
  city: string | null;
  state: string | null;
  status: ClientStatus;
  kyc_status: KycStatus;
  risk_classification: RiskClassification;
  partner_id: string | null;
  manager_id: string | null;
}

/**
 * The lean shape the list endpoint returns.
 *
 * Extends `ClientCore` rather than the other way round. The list adds fields the detail
 * response does not carry (`next_due_date`, resolved owner names), so treating the list
 * shape as the base and the detail shape as a superset — which is how this was written
 * before — would claim the detail endpoint returns things it never sends.
 */
export interface ClientListItem extends ClientCore {
  /** Resolved server-side so the table does not fetch the directory per row. */
  partner_name: string | null;
  manager_name: string | null;
  services: ClientServiceChip[];
  /** The earliest deadline still ahead of the client. Null when nothing is scheduled. */
  next_due_date: string | null;
}
/** Counts for the client list header. Scoped to the same filters as the table. */
export interface ClientSummary {
  total: number;
  active: number;
  inactive: number;
  prospects: number;
  onboarding: number;
  on_hold: number;
  closed: number;
  new_this_year: number;
  gst_clients: number;
  itr_clients: number;
  tds_clients: number;
  roc_clients: number;
}

export interface LegalEntityRow {
  id: string;
  entity_type: LegalEntityType;
  name: string;
  trade_name: string | null;
  pan: string | null;
  tan: string | null;
  cin: string | null;
  llpin: string | null;
  gstin: string | null;
  date_of_birth: string | null;
  date_of_incorporation: string | null;
  city: string | null;
  state: string | null;
  state_code: string | null;
  is_active: boolean;
}

export interface ClientEntityLinkRow {
  id: string;
  client_id: string;
  legal_entity_id: string;
  relationship_type: RelationshipType;
  is_primary: boolean;
  shareholding_percentage: number | null;
  designation: string | null;
  effective_from: string | null;
  effective_to: string | null;
  legal_entity: LegalEntityRow | null;
}

export interface ContactRow {
  id: string;
  client_id: string;
  legal_entity_id: string | null;
  name: string;
  role: ContactRole;
  designation: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  is_primary: boolean;
  is_authorised_signatory: boolean;
}

export interface RegistrationRow {
  id: string;
  client_id: string;
  legal_entity_id: string | null;
  registration_type: RegistrationType;
  number: string;
  state_code: string | null;
  place_of_business: string | null;
  registered_on: string | null;
  valid_upto: string | null;
  status: RegistrationStatus;
  gst_scheme: string | null;
}

export interface ServiceRow {
  id: string;
  code: string;
  name: string;
  category: ServiceCategory;
  description: string | null;
  is_recurring: boolean;
  default_frequency: string | null;
  default_priority: string;
  default_fee_model: FeeModel | null;
  standard_fee: number | null;
  /** Services Accounting Code printed on invoice lines for this service. */
  sac_code: string;
  is_active: boolean;
  sort_order: number;
  /** How many clients currently hold this service. Populated by the catalogue list. */
  client_count: number;
}

/** One row of the category panel. */
export interface ServiceCategorySummary {
  value: string;
  label: string;
  service_count: number;
  client_count: number;
}

/** One row of the assignment summary. */
export interface ServiceAssignmentRow {
  service_id: string;
  code: string;
  name: string;
  category: ServiceCategory;
  frequency: string | null;
  standard_fee: number | null;
  /** The unit fee multiplied out to a year. Null when no fee is on file. */
  annual_fee: number | null;
  total_clients: number;
  active_clients: number;
  inactive_clients: number;
  annual_fees: number;
}

/** The figures across the top of the service catalogue. */
export interface ServiceSummary {
  total_services: number;
  active_services: number;
  inactive_services: number;
  total_assignments: number;
  recurring_services: number;
  total_annual_fees: number;
  by_category: ServiceCategorySummary[];
  assignments: ServiceAssignmentRow[];
  tab_counts: Record<string, number>;
}

export interface ServiceClientRef {
  client_id: string;
  client_code: string;
  legal_name: string;
  client_status: string;
  link_is_active: boolean;
  start_date: string | null;
}

export interface ServiceDetailRow extends ServiceRow {
  client_count: number;
  clients: ServiceClientRef[];
  /** The service's checklist lives here — these templates' steps, not a second copy. */
  templates?: TaskTemplateRow[];
}

export interface ServiceCategoryOption {
  value: ServiceCategory;
  label: string;
  service_count: number;
}

export interface TaskTemplateStepRow {
  id: string;
  sequence: number;
  name: string;
  description: string | null;
  is_mandatory: boolean;
  requires_review: boolean;
  requires_approval: boolean;
  requires_filing: boolean;
  requires_document: boolean;
  estimated_hours: number | null;
  role_hint: string | null;
}

export interface TaskTemplateRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  service_id: string | null;
  workflow_template_id: string | null;
  compliance_rule_id: string | null;
  is_recurring: boolean;
  frequency: Frequency | null;
  default_priority: Priority;
  default_complexity: string;
  lead_days: number;
  estimated_hours: number | null;
  title_template: string | null;
  is_active: boolean;
  steps: TaskTemplateStepRow[];
}

export interface ClientServiceRow {
  id: string;
  client_id: string;
  service_id: string;
  engagement_id: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  service: ServiceRow | null;
}

export interface EngagementRow {
  id: string;
  client_id: string;
  service_id: string | null;
  legal_entity_id: string | null;
  code: string;
  title: string;
  scope_of_work: string | null;
  engagement_letter_ref: string | null;
  status: EngagementStatus;
  fee_model: FeeModel;
  fee_amount: number | null;
  start_date: string | null;
  end_date: string | null;
  renewal_date: string | null;
  partner_id: string | null;
  manager_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialYearRow {
  id: string;
  code: string;
  label: string;
  start_date: string;
  end_date: string;
  assessment_year: string | null;
  is_active: boolean;
  is_closed: boolean;
  closed_on: string | null;
}

export interface ClientRead extends ClientCore {
  tenant_id: string;
  tan: string | null;
  cin: string | null;
  llpin: string | null;
  date_of_birth: string | null;
  date_of_incorporation: string | null;
  address_line1: string | null;
  address_line2: string | null;
  district: string | null;
  state_code: string | null;
  pincode: string | null;
  country: string;
  /** Free-text relationship notes, editable from the client record. */
  relationship_notes: string | null;
  status_reason: string | null;
  onboarded_on: string | null;
  archived_on: string | null;
  branch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientDetail extends ClientRead {
  entities: ClientEntityLinkRow[];
  contacts: ContactRow[];
  registrations: RegistrationRow[];
  services: ClientServiceRow[];
  engagements: EngagementRow[];
  financial_years: FinancialYearRow[];
}

export interface ClientProgressSummary {
  client_id: string;
  client_name: string;
  financial_year: string | null;
  open_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  awaiting_review: number;
  awaiting_approval: number;
  waiting_for_client: number;
  blocked_tasks: number;
  unverified_deadlines: number;
  open_document_requests: number;
  progress_percent: number;
  last_activity_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────────────────────────────────────

export interface TaskListItem {
  id: string;
  task_code: string;
  title: string;
  client_id: string;
  status: TaskStatus;
  approval_status: ApprovalStatus;
  filing_status: FilingStatus;
  priority: Priority;
  progress_percent: number;
  internal_due_date: string | null;
  statutory_due_date: string | null;
  deadline_verified: boolean;
  preparer_id: string | null;
  reviewer_id: string | null;
  /** Set when this task is a subtask. The API sends it; the list uses it to indent. */
  parent_task_id: string | null;
  period_key: string | null;
  /** Free-text labels for filtering. `null` is "none given"; `[]` is "cleared". */
  tags: string[] | null;
  task_type: TaskType;
  category: ServiceCategory | null;
  is_overdue: boolean | null;
  next_action: string | null;
  /** Resolved server-side so a row can name its client and service without a second call. */
  client_name: string | null;
  service_code: string | null;
  service_name: string | null;
  /** The transitions the API says this user may make from the current status. */
  available_transitions: TaskStatus[];
}

/** Counts for the task list tabs. Scoped to the same filters as the table. */
export interface TaskSummary {
  all_tasks: number;
  my_tasks: number;
  overdue: number;
  due_this_week: number;
  completed: number;
  waiting_for_client: number;
  awaiting_review: number;
  awaiting_approval: number;
  my_blocked: number;
}

export interface TaskStepRow {
  id: string;
  task_id: string;
  sequence: number;
  name: string;
  description: string | null;
  status: TaskStepStatus;
  is_mandatory: boolean;
  requires_review: boolean;
  requires_approval: boolean;
  requires_filing: boolean;
  requires_document: boolean;
  completed_at: string | null;
  completed_by_id: string | null;
  notes: string | null;
  skip_reason: string | null;
}

export interface TaskAssignmentRow {
  id: string;
  task_id: string;
  user_id: string;
  role_in_task: TaskRole;
  assigned_at: string;
  assigned_by_id: string | null;
  unassigned_at: string | null;
  is_active: boolean;
  reason: string | null;
}

export interface TaskCommentRow {
  id: string;
  task_id: string;
  author_user_id: string | null;
  author_type: string;
  body: string;
  visibility: CommentVisibility;
  is_review_note: boolean;
  parent_comment_id: string | null;
  created_at: string;
  edited_at: string | null;
}

export interface TaskStatusHistoryRow {
  id: string;
  task_id: string;
  from_status: TaskStatus | null;
  to_status: TaskStatus;
  approval_status: ApprovalStatus;
  filing_status: FilingStatus;
  progress_percent: number;
  changed_by_id: string | null;
  actor_type: string;
  reason: string | null;
  created_at: string;
}

export interface TaskRead extends TaskListItem {
  tenant_id: string;
  description: string | null;
  legal_entity_id: string | null;
  engagement_id: string | null;
  service_id: string | null;
  financial_year_id: string | null;
  branch_id: string | null;
  template_id: string | null;
  compliance_rule_id: string | null;
  complexity: Complexity;
  start_date: string | null;
  completed_at: string | null;
  filed_at: string | null;
  delivered_at: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  blocked_reason: string | null;
  delay_reason: DelayReason | null;
  approver_id: string | null;
  filer_id: string | null;
  review_round: number;
  escalation_level: number;
  is_recurring: boolean;
  recurrence_frequency: Frequency | null;
  recurrence_end_date: string | null;
  create_next_period: boolean;
  sub_category: string | null;
  reminder_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskDetail extends TaskRead {
  steps: TaskStepRow[];
  assignments: TaskAssignmentRow[];
  comments: TaskCommentRow[];
  status_history: TaskStatusHistoryRow[];
  client_name: string | null;
  /**
   * The transitions the API will actually accept, in workflow order.
   *
   * The UI renders these rather than hardcoding the state machine, so a firm that
   * configures its own `workflow_transitions` sees its own rules.
   */
  available_transitions: TaskStatus[];
  /** Why the task cannot be completed yet, in plain language. */
  completion_blockers: string[];
  next_action: string | null;
  /** Direct children. A child's own children live on the child's page. */
  subtasks: TaskListItem[];
  /** Set when this task is itself a subtask, so it can name what it belongs to. */
  parent_task_code: string | null;
  parent_task_title: string | null;
}

/** A precedence link: this task cannot start until another one has. */
export interface TaskDependencyRow {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: DependencyType;
  notes: string | null;
  created_at: string;
  /** Resolved server-side, so a list can name the other task without a second call. */
  depends_on_task_code: string | null;
  depends_on_task_title: string | null;
}

export interface WorkQueueSummary {
  user_id: string;
  due_today: number;
  due_this_week: number;
  overdue: number;
  awaiting_review: number;
  awaiting_approval: number;
  waiting_for_client: number;
  open_total: number;
  weighted_load_hours: number;
}

export interface GenerateTasksResult {
  financial_year: string;
  templates_considered: number;
  clients_considered: number;
  created: number;
  skipped_existing: number;
  skipped_not_applicable: number;
  dry_run: boolean;
  created_task_ids: string[];
  /** Why each template was skipped, and how many times: e.g.
   *  `{"TPL-TDS: Rule requires one of these registrations: tan.": 1}`. */
  skipped_reasons: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compliance
// ─────────────────────────────────────────────────────────────────────────────

export interface CalendarEntry {
  task_id: string | null;
  deadline_id: string | null;
  client_id: string;
  client_name: string;
  compliance_rule_id: string | null;
  rule_name: string | null;
  filing_type: string | null;
  period_key: string | null;
  statutory_due_date: string;
  internal_due_date: string | null;
  verified: boolean;
  status: string;
  priority: string;
  preparer_id: string | null;
  reviewer_id: string | null;
  days_remaining: number;
  is_overdue: boolean;
  is_filed: boolean;
  authority: string | null;
}

export interface CalendarResponse {
  from_date: string;
  to_date: string;
  total: number;
  unverified_count: number;
  overdue_count: number;
  entries: CalendarEntry[];
}

export interface DeadlineRow {
  id: string;
  client_id: string;
  compliance_rule_id: string | null;
  period_id: string | null;
  task_id: string | null;
  financial_year_id: string | null;
  period_key: string | null;
  statutory_due_date: string;
  internal_due_date: string | null;
  source: DeadlineSource;
  verified: boolean;
  notes: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentStatus =
  | "requested"
  | "received"
  | "under_review"
  | "accepted"
  | "rejected"
  | "superseded";

export interface DocumentRow {
  id: string;
  client_id: string | null;
  engagement_id: string | null;
  financial_year_id: string | null;
  task_id: string | null;
  document_request_id: string | null;
  category: string | null;
  doc_type: string | null;
  title: string;
  description: string | null;
  period_key: string | null;
  status: DocumentStatus;
  is_confidential: boolean;
  from_client: boolean;
  current_version_id: string | null;
  version_count: number;
  rejection_reason: string | null;
  /** `null` = none were ever set; `[]` = all cleared. */
  tags: string[] | null;
  /** Resolved from the version in force. `null` when there is no stored file. */
  size_bytes: number | null;
  file_name: string | null;
  /** Who uploaded the version in force. `null` when the uploader was deleted. */
  uploaded_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersionRow {
  id: string;
  document_id: string;
  version_no: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256: string;
  blob_url: string | null;
  uploaded_by_id: string | null;
  uploaded_by_type: string;
  ocr_status: string;
  notes: string | null;
  /** Who uploaded this version. `null` when the uploader was deleted. */
  uploaded_by_name: string | null;
  created_at: string;
}

export interface DocumentDetail extends DocumentRow {
  versions: DocumentVersionRow[];
  links: DocumentLinkRow[];
}

export interface DocumentLinkRow {
  id: string;
  document_id: string;
  linked_type: DocumentLinkType;
  linked_id: string;
  purpose: string | null;
  created_at: string;
}

/** Figures for the Documents stat cards. `storage_used_display` is pre-formatted. */
export interface DocumentSummary {
  total_files: number;
  clients_count: number;
  storage_used_bytes: number;
  storage_used_display: string;
  pending_from_clients: number;
  shared_with_client: number;
  /** Keyed by every status, present even at zero. */
  status_counts: Record<string, number>;
  /** Top clients by document count, for the rail beside the list. */
  by_client: DocumentClientStat[];
}

/** One row of the client rail beside the document list. */
export interface DocumentClientStat {
  client_id: string;
  client_name: string;
  count: number;
  size_bytes: number;
}

/** One row of the category breakdown beside the document list. */
export interface DocumentCategoryStat {
  category: string;
  label: string;
  count: number;
  size_bytes: number;
}

/** The one-time plaintext token. Only returned when a link is minted. */
export interface DocumentShare {
  id: string;
  document_id: string;
  url: string;
  token: string;
  expires_at: string;
  max_downloads: number | null;
  download_count: number;
  shared_with_email: string | null;
}

/**
 * Rename / re-file / re-tag. Every field is optional and an omitted field is left
 * alone, so a rename cannot blank the client a document is filed under.
 */
export interface DocumentUpdate {
  title?: string;
  description?: string | null;
  category?: string | null;
  doc_type?: string | null;
  period_key?: string | null;
  client_id?: string | null;
  financial_year_id?: string | null;
  is_confidential?: boolean;
  tags?: string[] | null;
}

export type DocumentRequestStatus = "open" | "partially_received" | "fulfilled" | "cancelled";

export interface DocumentRequestRow {
  id: string;
  client_id: string;
  task_id: string | null;
  engagement_id: string | null;
  financial_year_id: string | null;
  period_key: string | null;
  title: string;
  description: string | null;
  doc_type: string | null;
  due_date: string | null;
  status: DocumentRequestStatus;
  requested_by_id: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  fulfilled_at: string | null;
  created_at: string;
  is_overdue: boolean;
}

export interface DocumentRequestCreate {
  client_id: string;
  title: string;
  description?: string | null;
  doc_type?: string | null;
  task_id?: string | null;
  engagement_id?: string | null;
  financial_year_id?: string | null;
  period_key?: string | null;
  due_date?: string | null;
}

export interface DocumentRequestMutate {
  client_id: string;
  title: string;
  description?: string;
  doc_type?: string;
  due_date?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────────────────────────────────────

export interface ServiceTurnaroundRow {
  service_id: string | null;
  service_name: string;
  completed_tasks: number;
  average_days: number | null;
  median_days: number | null;
  on_time_percent: number | null;
  average_correction_rounds: number | null;
}

export interface WeeklyChangeSummary {
  from_date: string;
  to_date: string;
  tasks_created: number;
  tasks_completed: number;
  tasks_filed: number;
  tasks_newly_overdue: number;
  documents_received: number;
  documents_requested: number;
  new_clients: number;
  overdue_delta: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Staff directory
// ─────────────────────────────────────────────────────────────────────────────

export type UserStatus = "invited" | "active" | "suspended" | "disabled";

export interface UserListItem {
  id: string;
  full_name: string;
  email: string;
  designation: string | null;
  /** The practice area — Taxation, Audit, Accounts. Distinct from `designation`. */
  department: string | null;
  employee_code: string | null;
  phone: string | null;
  branch_id: string | null;
  branch_name: string | null;
  reporting_to_id: string | null;
  is_partner: boolean;
  status: UserStatus;
  date_of_joining: string | null;
  weekly_capacity_hours: number;
  last_login_at: string | null;
  roles: string[];
}

export interface BranchRow {
  id: string;
  code: string;
  name: string;
  state_code: string | null;
  is_active: boolean;
}

export interface UserCounts {
  active: number;
  invited: number;
  suspended: number;
  disabled: number;
  total: number;
}

/** A staff member with the fields only the member panel needs. */
export interface UserDetailRow extends UserListItem {
  work_location: string | null;
  skills: string[];
  system_access: string[];
  created_at: string;
  updated_at: string;
}

export type RoleCode =
  | "firm_owner"
  | "branch_partner"
  | "partner"
  | "admin"
  | "manager"
  | "senior_associate"
  | "ca_senior"
  | "article_assistant"
  | "accounts_staff"
  | "accountant"
  | "client"
  | "system_admin";

export interface RoleRow {
  id: string;
  code: RoleCode;
  name: string;
  description: string | null;
  data_scope: "own" | "team" | "branch" | "firm";
  is_system: boolean;
  is_active: boolean;
  permissions: string[];
}

export interface PermissionDef {
  code: string;
  module: string;
  action: string;
  description: string;
}

export interface RolesResponse {
  roles: RoleRow[];
  catalogue: PermissionDef[];
  assignable: string[];
}

export interface UserCreatePayload {
  email: string;
  full_name: string;
  password?: string;
  employee_code?: string;
  designation?: string;
  department?: string;
  phone?: string;
  branch_id?: string;
  reporting_to_id?: string;
  date_of_joining?: string;
  weekly_capacity_hours?: number;
  is_partner?: boolean;
  skills?: string[];
  system_access?: string[];
  work_location?: string;
  role_code?: RoleCode;
}

/** One row of the Team Workload panel. */
export interface TeamMemberLoad {
  user_id: string;
  full_name: string;
  open_tasks: number;
  overdue_tasks: number;
  /** Effort-weighted hours against capacity, not a task count. */
  weighted_load_hours: number;
  capacity_hours: number;
  utilisation_percent: number;
}

/** One segment of the tasks-by-department breakdown. */
export interface DepartmentSlice {
  department: string;
  open_tasks: number;
  percent: number;
}

/** One day of the attendance calendar. */
export interface LeaveDay {
  day: number;
  present: number;
  leave: number;
  holiday: number;
  half_day: number;
  /** False when nobody has recorded anything for the day — not the same as nobody in. */
  recorded: boolean;
}

export interface LeaveMonth {
  year: number;
  month: number;
  label: string;
  days: LeaveDay[];
  present: number;
  leave: number;
  holiday: number;
  half_day: number;
}

/** The Team screen's cards, tabs and panels. */
export interface TeamSummary {
  total_members: number;
  active_members: number;
  inactive_members: number;
  joined_this_year: number;
  total_open_tasks: number;
  total_overdue_tasks: number;
  average_utilisation: number;
  over_capacity: number;
  tab_counts: Record<string, number>;
  by_department: DepartmentSlice[];
  workload: TeamMemberLoad[];
  leave: LeaveMonth | null;
  departments: string[];
}

export interface MemberClientRef {
  client_id: string;
  client_code: string;
  legal_name: string;
  open_tasks: number;
}

export interface MemberActivityRow {
  id: string;
  summary: string;
  created_at: string;
  entity_type: string | null;
  action: string | null;
}

/** The member drawer's panels. */
export interface MemberOverview {
  workload: TeamMemberLoad | null;
  clients: MemberClientRef[];
  client_count: number;
  activity: MemberActivityRow[];
  leave: LeaveMonth | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Write payloads
//
// Only the fields each form actually sends. Every one is optional in the API except
// where noted, so these stay deliberately loose — the API is the validator.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientCreatePayload {
  client_type: ClientType;
  legal_name: string;
  client_code?: string;
  trade_name?: string;
  pan?: string;
  tan?: string;
  cin?: string;
  gstin?: string;
  date_of_incorporation?: string;
  date_of_birth?: string;
  address_line1?: string;
  address_line2?: string;
  district?: string;
  city?: string;
  state?: string;
  state_code?: string;
  pincode?: string;
  risk_classification?: RiskClassification;
  relationship_notes?: string;
  branch_id?: string;
  partner_id?: string;
  manager_id?: string;
}

export interface ClientUpdatePayload {
  legal_name?: string;
  trade_name?: string;
  pan?: string | null;
  tan?: string | null;
  cin?: string | null;
  gstin?: string | null;
  llpin?: string | null;
  date_of_incorporation?: string | null;
  date_of_birth?: string | null;
  address_line1?: string;
  address_line2?: string;
  district?: string;
  city?: string;
  state?: string;
  state_code?: string;
  pincode?: string;
  kyc_status?: KycStatus;
  risk_classification?: RiskClassification;
  relationship_notes?: string;
  partner_id?: string | null;
  manager_id?: string | null;
  branch_id?: string | null;
}

export interface RegistrationCreatePayload {
  registration_type: RegistrationType;
  number: string;
  state_code?: string;
  place_of_business?: string;
  registered_on?: string;
  valid_upto?: string;
  gst_scheme?: string;
  notes?: string;
}

export interface ContactCreatePayload {
  name: string;
  role: ContactRole;
  designation?: string;
  email?: string;
  phone?: string;
  whatsapp_number?: string;
  is_primary?: boolean;
  is_authorised_signatory?: boolean;
  notes?: string;
}

export interface ClientServiceCreatePayload {
  service_id: string;
  start_date?: string;
  end_date?: string;
  notes?: string;
}

export interface TaskCreatePayload {
  client_id: string;
  title: string;
  description?: string;
  tags?: string[];
  /** Where the work starts. Omit for `not_started`. */
  status?: TaskStatus;
  task_type?: TaskType;
  category?: ServiceCategory;
  sub_category?: string;
  reminder_date?: string;
  is_recurring?: boolean;
  recurrence_frequency?: Frequency;
  recurrence_end_date?: string;
  create_next_period?: boolean;
  parent_task_id?: string;
  template_id?: string;
  service_id?: string;
  engagement_id?: string;
  financial_year_id?: string;
  period_key?: string;
  priority?: Priority;
  complexity?: Complexity;
  start_date?: string;
  internal_due_date?: string;
  statutory_due_date?: string;
  estimated_hours?: number;
  preparer_id?: string;
  reviewer_id?: string;
  approver_id?: string;
  create_steps_from_template?: boolean;
}

/**
 * A partial edit of a task's own definition.
 *
 * **Only send the fields you mean to change.** The API distinguishes an omitted field
 * (leave it alone) from an explicit `null` (clear it) using Pydantic's
 * `model_fields_set`, so building this object by copying every form input would wipe
 * whatever the form did not know about.
 *
 * Status, approval and filing are deliberately absent: they move through their own
 * endpoints, each of which carries the guards that make the move legal.
 */
export interface TaskUpdatePayload {
  title?: string;
  description?: string | null;
  tags?: string[] | null;
  client_id?: string;
  service_id?: string | null;
  period_key?: string | null;
  parent_task_id?: string | null;
  category?: ServiceCategory | null;
  sub_category?: string | null;
  priority?: Priority;
  complexity?: Complexity;
  start_date?: string | null;
  internal_due_date?: string | null;
  statutory_due_date?: string | null;
  reminder_date?: string | null;
  estimated_hours?: number | null;
  actual_hours?: number | null;
  blocked_reason?: string | null;
  delay_reason?: DelayReason | null;
  filing_status?: FilingStatus;
}

export interface GenerateTasksPayload {
  financial_year?: string;
  client_ids?: string[];
  template_ids?: string[];
  dry_run?: boolean;
}

// ── Filing records ──
//
// The API could create these long before it could read them back, so nothing could
// show a firm the acknowledgement number it had just recorded.

export interface FilingRecordRow {
  id: string;
  task_id: string | null;
  client_id: string;
  compliance_rule_id: string | null;
  period_key: string | null;
  filing_type: string;
  filed_on: string | null;
  acknowledgement_number: string | null;
  portal_reference: string | null;
  filed_by_id: string | null;
  proof_document_id: string | null;
  status: FilingRecordStatus;
  late_fee_paid: number | null;
  remarks: string | null;
  created_at: string;
}

// ── Integrations, imports and exports ──

export type IntegrationProvider = "tally" | "winman" | "vercel_blob" | "email" | "whatsapp";

export type IntegrationStatus = "not_configured" | "connected" | "error" | "disabled";

export type ImportJobStatus = "pending" | "running" | "completed" | "failed" | "partial";

export type ImportIssueSeverity = "error" | "warning";

export interface ProviderInfo {
  provider: IntegrationProvider;
  name: string;
  mechanism: string;
  supports: string[];
  /** Documented gaps, so a limitation is a decision rather than a discovery. */
  limitations: string[];
}

export interface ConnectionRow {
  id: string;
  provider: IntegrationProvider;
  name: string;
  config: Record<string, unknown> | null;
  credential_ref: string | null;
  status: IntegrationStatus;
  is_enabled: boolean;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface ImportIssue {
  row_number: number | null;
  field: string | null;
  code: string;
  message: string;
  severity: ImportIssueSeverity;
  raw_row: Record<string, string> | null;
}

export interface ImportPlanResult {
  rows_read: number;
  would_create: number;
  would_skip_existing: number;
  rows_rejected: number;
  headers: string[];
  mapping: Record<string, string>;
  unmapped_fields: string[];
  mapping_problems: string[];
  issues: ImportIssue[];
  sample: Array<Record<string, unknown>>;
}

export interface ImportJobRow {
  id: string;
  provider: IntegrationProvider;
  job_type: string;
  status: ImportJobStatus;
  source_ref: string | null;
  external_company: string | null;
  rows_imported: number;
  rows_rejected: number;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  reconciliation_status: string;
  run_by_id: string | null;
  created_at: string;
}

export interface ImportJobDetailRow extends ImportJobRow {
  errors: ImportIssue[];
  error_count: number;
  warning_count: number;
}

// ── Communications ──

export interface CommunicationEntry {
  id: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  template: string;
  title: string;
  body: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  client_name: string | null;
  client_code: string | null;
  contact_name: string | null;
  is_read: boolean;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface SendOutcome {
  channel: NotificationChannel;
  recipient: string | null;
  status: string;
  detail: string | null;
}

export interface SendCommunicationResult {
  contact_id: string;
  outcomes: SendOutcome[];
  queued: number;
}

export interface WhatsAppStatus {
  configured: boolean;
  provider: string;
  has_api_url: boolean;
  has_token: boolean;
  has_phone_id: boolean;
  baileys_connected?: boolean;
  baileys_status?: { connected: boolean; error?: string };
}

export interface WhatsAppQrResponse {
  qr_code: string | null;
  pairing_code: string | null;
  pairing_instructions: string | null;
  instructions: string | null;
  connection_info: Record<string, unknown>;
  provider: string;
  connected: boolean;
}

// ── Reports and MIS ──

export interface TaskWorkLogRow {
  id: string;
  task_id: string;
  user_id: string;
  work_date: string;
  hours: number;
  description: string | null;
  activity_type: string;
  is_billable: boolean;
  created_at: string;
}

export interface ProductivityRow {
  user_id: string;
  full_name: string;
  branch_id: string | null;
  tasks_completed: number;
  /** Complexity-weighted, because a task count alone rates an acknowledgement like an audit. */
  weighted_throughput: number;
  logged_hours: number;
  billable_hours: number;
  completed_without_logged_effort: number;
  average_turnaround_days: number | null;
  on_time_percent: number | null;
  correction_rounds: number | null;
}

export interface ProductivityReport {
  period_start: string;
  period_end: string;
  scope: string;
  rows: ProductivityRow[];
  total_completed: number;
  total_logged_hours: number;
  /** Plain statements about what the figures do and do not cover. */
  notes: string[];
}

export interface StatusAgingRow {
  status: string;
  open_tasks: number;
  average_days_in_status: number | null;
  median_days_in_status: number | null;
  oldest_days: number | null;
  overdue_tasks: number;
}

export interface StageDwellRow {
  status: string;
  transitions: number;
  average_days: number | null;
  median_days: number | null;
}

export interface BottleneckReport {
  as_of_date: string;
  scope: string;
  aging: StatusAgingRow[];
  dwell: StageDwellRow[];
  recurrence_delay: RecurrenceDelayRow[];
  slowest_stage: string | null;
  notes: string[];
}

export interface RecurrenceDelayRow {
  template_id: string | null;
  template_name: string;
  instances: number;
  late_instances: number;
  average_days_late: number | null;
  late_percent: number;
}

export interface ClientServiceStatusRow {
  client_id: string;
  client_code: string;
  client_name: string;
  service_id: string | null;
  service_name: string;
  total: number;
  completed: number;
  filed: number;
  open: number;
  overdue: number;
  waiting_for_client: number;
  awaiting_review: number;
  completion_percent: number;
}

export interface ClientServiceStatusReport {
  as_of_date: string;
  scope: string;
  rows: ClientServiceStatusRow[];
  clients_covered: number;
  services_covered: number;
  notes: string[];
}



// ── Billing ──────────────────────────────────────────────────────────────────

export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "cancelled";
export type GstTaxType = "intra_state" | "inter_state" | "none";
export type PaymentMethod = "cash" | "bank_transfer" | "upi" | "cheque" | "card" | "other";

/**
 * A party as printed on the invoice.
 *
 * Sent alongside the invoice rather than looked up separately, because a printed
 * invoice is a snapshot — if the client's address changes next month, this month's
 * invoice must still print what it printed.
 */
export interface PartyDetails {
  name: string;
  legal_name: string | null;
  gstin: string | null;
  pan: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  state_code: string | null;
  pincode: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_number: string | null;
}

export interface InvoiceLine {
  id: string;
  sequence: number;
  description: string;
  sac_code: string | null;
  service_id: string | null;
  task_id: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  amount: number;
  is_taxable: boolean;
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  recorded_by_id: string | null;
  created_at: string;
}

export interface ReceiptRow {
  id: string;
  invoice_id: string;
  receipt_number: string | null;
  issued_at: string | null;
}

export interface Receipt {
  id: string;
  receipt_number: string | null;
  payment_id: string | null;
  issued_at: string | null;
}

/**
 * Derived fields are computed by the API on every read, never stored.
 *
 * `outstanding`, `is_overdue`, `days_overdue` and `ageing_bucket` all change without
 * anyone touching the invoice, so a cached copy of any of them would eventually be
 * wrong in a way nobody could see.
 */
export interface Invoice {
  id: string;
  invoice_number: string | null;
  client_id: string;
  client_name: string | null;
  client_code: string | null;
  engagement_id: string | null;
  status: InvoiceStatus;
  invoice_date: string;
  due_date: string;
  place_of_supply_state_code: string | null;
  gst_tax_type: GstTaxType;
  tax_rate: number;
  subtotal: number;
  discount_total: number;
  taxable_total: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total: number;
  amount_paid: number;
  outstanding: number;
  is_overdue: boolean;
  days_overdue: number;
  ageing_bucket: string;
  /** What was billed, as service names — so the list answers "charged for what?". */
  services: string[];
  notes: string | null;
  terms: string | null;
  issued_at: string | null;
  sent_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  bank_details?: Record<string, string | null> | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceDetail extends Invoice {
  lines: InvoiceLine[];
  payments: Payment[];
  receipts: Receipt[];
  line_count?: number;
  /** Why this invoice carries CGST+SGST, IGST or nothing. */
  tax_note: string;
  client: PartyDetails | null;
  firm: PartyDetails | null;
  /**
   * Whether a client-facing link exists. The link itself is only returned when it is
   * minted, because only a hash of the token is stored.
   */
  share_link_active: boolean;
}

export interface InvoiceLineInput {
  description: string;
  quantity?: number;
  unit_price: number;
  discount?: number;
  sac_code?: string | null;
  is_taxable?: boolean;
  service_id?: string | null;
  task_id?: string | null;
}

export interface GeneratedLine {
  task_id: string;
  task_title: string;
  service_name: string | null;
  period_key: string | null;
  completed_at: string | null;
  description: string;
  sac_code: string | null;
  unit_price: number;
  /** Where the price came from — an engagement, the catalogue, or nowhere. */
  fee_source: string;
  needs_review: boolean;
  note: string | null;
}

export interface GeneratedInvoice {
  client_id: string;
  client_name: string | null;
  line_count: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  gst_tax_type: GstTaxType;
  tax_note: string;
  lines: GeneratedLine[];
}

export interface GenerateResult {
  dry_run: boolean;
  invoices: GeneratedInvoice[];
  /** Work with no agreed fee anywhere, so nothing was proposed for it. */
  unbillable: GeneratedLine[];
  already_invoiced: number;
  created_invoice_ids: string[];
  notes: string[];
}

export interface SendOutcome {
  channel: NotificationChannel;
  recipient: string | null;
  status: string;
  detail: string | null;
}

export interface InvoiceSendResult {
  invoice_id: string;
  invoice_number: string | null;
  outcomes: SendOutcome[];
  share_url: string | null;
}

export interface ShareLinkResult {
  invoice_id: string;
  invoice_number: string | null;
  share_url: string;
  expires_at: string | null;
}

export type InvoiceTemplate =
  | "modern"
  | "classic"
  | "minimal"
  | "corporate"
  | "compact"
  | "fintech"
  | "corporate_premium"
  | "editorial"
  | "ca_professional"
  | "elegant"
  | "bold"
  | "fresh"
  | "heritage";

export interface FirmBillingSettings {
  name: string;
  legal_name: string | null;
  gstin: string | null;
  pan: string | null;
  registration_no: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  state_code: string | null;
  pincode: string | null;
  email: string | null;
  phone: string | null;
  currency: string;
  invoice_prefix: string;
  next_invoice_number: number;
  default_gst_rate: number;
  invoice_template: InvoiceTemplate;
  /** Derived from whether a GSTIN is on file, so the two cannot disagree. */
  gst_registered: boolean;
}

export interface ClientReceivable {
  client_id: string;
  client_name: string | null;
  client_code: string | null;
  invoice_count: number;
  billed: number;
  collected: number;
  outstanding: number;
  overdue_outstanding: number;
  oldest_due_date: string | null;
  worst_days_overdue: number;
}

export interface ReceivableRow {
  invoice_id: string;
  invoice_number: string | null;
  client_id: string;
  client_name: string | null;
  client_code: string | null;
  status: InvoiceStatus;
  invoice_date: string;
  due_date: string;
  total: number;
  amount_paid: number;
  outstanding: number;
  days_overdue: number;
  ageing_bucket: string;
  is_overdue: boolean;
}

export interface ReceivablesSummary {
  as_of: string;
  invoiced_total: number;
  collected_total: number;
  outstanding_total: number;
  overdue_total: number;
  /** Drafts are excluded from every total but still reported. */
  draft_count: number;
  draft_value: number;
  cancelled_count: number;
  ageing: Record<string, number>;
  ageing_counts: Record<string, number>;
  by_client: ClientReceivable[];
  oldest_overdue: ReceivableRow | null;
  notes: string[];
}

/** One month of invoiced / collected / task volumes for trend charts. */
export interface MonthlyTrendRow {
  month: string;
  month_key: string;
  invoiced: number;
  collected: number;
  tasks_created: number;
  tasks_completed: number;
}

/** One month of GST collected — CGST / SGST / IGST split. */
export interface GstSummaryRow {
  month: string;
  month_key: string;
  cgst: number;
  sgst: number;
  igst: number;
  total_tax: number;
}

/** GST summary response — monthly rows plus aggregate totals. */
export interface GstSummaryResponse {
  months: GstSummaryRow[];
  totals: { cgst: number; sgst: number; igst: number; total_tax: number };
}

/** One bar of the workload-by-person chart. */
export interface WorkloadBar {
  name: string;
  open: number;
  overdue: number;
  utilisation: number;
}

/** One segment of the invoices-by-status donut. */
export interface InvoiceStatusSlice {
  status: string;
  label: string;
  count: number;
  value: number;
  percent: number;
}

/** One segment of the tasks-by-status donut. */
export interface StatusSlice {
  status: string;
  label: string;
  count: number;
  value: number;
}

/** The Billing screen's cards, tabs and panels. */
export interface BillingSummary {
  invoiced_total: number;
  invoiced_count: number;
  collected_total: number;
  collected_count: number;
  outstanding_total: number;
  outstanding_count: number;
}

/** One bar of the receivables-ageing chart. */
export interface AgeingBucketRow {
  bucket: string;
  label: string;
  amount: number;
  count: number;
}

/** One row of the recent-payments panel. */
export interface RecentPaymentRow {
  id: string;
  invoice_id: string;
  invoice_number: string | null;
  client_id: string;
  client_name: string | null;
  amount: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
}

/** The Billing screen's cards, tabs and panels. */
export interface BillingSummary {
  invoiced_total: number;
  invoiced_count: number;
  collected_total: number;
  collected_count: number;
  outstanding_total: number;
  outstanding_count: number;
  overdue_total: number;
  overdue_count: number;
  draft_total: number;
  draft_count: number;
  credit_note_count: number;
  tab_counts: Record<string, number>;
  by_status: InvoiceStatusSlice[];
  ageing: AgeingBucketRow[];
  recent_payments: RecentPaymentRow[];
  clients: Array<{ id: string; code: string | null; name: string | null }>;
}

export interface RecurringSchedule {
  id: string;
  client_id: string;
  client_name?: string;
  service_id?: string;
  service_name?: string;
  frequency: string;
  fee: number;
  tax_rate: number;
  status: string;
  next_billing_date?: string;
  created_at?: string;
}

export interface CreditNoteRow {
  id: string;
  note_number?: string | null;
  invoice_id?: string;
  invoice_number?: string | null;
  client_name?: string | null;
  client_id?: string;
  status: string;
  total: number;
  reason?: string | null;
  created_at?: string;
}

export interface CreditNoteCreatePayload {
  invoice_id: string;
  reason?: string | null;
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    discount?: number;
    amount: number;
    is_taxable?: boolean;
    sac_code?: string;
  }>;
  tax_rate?: number;
  note_type?: 'credit' | 'debit';
}

/** Metadata describing an invoice PDF template for the selector UI. */
export interface InvoiceTemplateMeta {
  id: InvoiceTemplate;
  name: string;
  description: string;
  category: string;
  accent_color: string;
  header_style: string;
  best_for: string;
  features: string[];
}

