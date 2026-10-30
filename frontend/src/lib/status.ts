/**
 * Status → colour mapping.
 *
 * The three status axes (task, approval, filing) are independent in the data model,
 * so each gets its own mapping. Nothing here infers one from another — that would
 * undo the separation the database enforces.
 *
 * Colour tokens use Tailwind classes with `dark:` variants, so every badge, dot,
 * and progress bar is readable on both light and dark surfaces without the
 * caller branching on theme.
 */

export type Tone = "neutral" | "info" | "progress" | "warning" | "danger" | "success";

import type { TaskStatus } from "./types";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-300",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  progress: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

/** All 14 workflow states. */
const TASK_STATUS_TONES: Record<string, Tone> = {
  not_started: "neutral",
  assigned: "info",
  in_progress: "progress",
  waiting_for_client: "warning",
  waiting_for_internal: "warning",
  ready_for_review: "info",
  changes_requested: "danger",
  ready_for_approval: "info",
  approved: "success",
  ready_to_file: "progress",
  filed: "success",
  delivered: "success",
  completed: "success",
  cancelled: "neutral",
};

const RISK_TONES: Record<string, Tone> = {
  low: "success",
  medium: "warning",
  high: "danger",
};

export function badgeClasses(tone: Tone): string {
  return `inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[tone]}`;
}

export function taskStatusTone(status: string): Tone {
  return TASK_STATUS_TONES[status] ?? "neutral";
}

export function riskTone(risk: string): Tone {
  return RISK_TONES[risk] ?? "neutral";
}

/** A deadline within this many days is worth flagging, matching the backend's
 *  `deadline-alerts` window. */
export const DEADLINE_WARNING_DAYS = 7;

export function daysRemainingTone(days: number): Tone {
  if (days < 0) return "danger";
  if (days === 0) return "danger";
  if (days <= DEADLINE_WARNING_DAYS) return "warning";
  return "neutral";
}

export function daysRemainingLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `${days}d left`;
}

/**
 * Utilisation is the opposite of progress: for a person, a *high* number means
 * overload. Treating it like a completion bar would paint the most stretched
 * employee green.
 */
export function utilisationTone(percent: number): Tone {
  if (percent > 100) return "danger";
  if (percent >= 85) return "warning";
  if (percent >= 40) return "success";
  return "neutral";
}

/** The solid fill colour for a progress or utilisation bar.
 * Solid fills are already visible on dark surfaces, so only `neutral` adjusts. */
const BAR_CLASSES: Record<Tone, string> = {
  neutral: "bg-slate-400",
  info: "bg-sky-500",
  progress: "bg-indigo-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  success: "bg-emerald-500",
};

export function barClass(tone: Tone): string {
  return BAR_CLASSES[tone];
}

// ─────────────────────────────────────────────────────────────────────────────
// The other axes
//
// Task status, approval status and filing status are three independent columns in
// the database. Each gets its own mapping, and nothing here derives one from
// another — that would undo the separation the schema enforces.
// ─────────────────────────────────────────────────────────────────────────────

const APPROVAL_TONES: Record<string, Tone> = {
  not_required: "neutral",
  pending: "info",
  approved: "success",
  changes_requested: "danger",
  rejected: "danger",
};

const FILING_TONES: Record<string, Tone> = {
  not_required: "neutral",
  pending: "warning",
  filed: "progress",
  acknowledged: "success",
  rejected_by_authority: "danger",
};

const PRIORITY_TONES: Record<string, Tone> = {
  low: "neutral",
  normal: "info",
  high: "warning",
  urgent: "danger",
};

const STEP_TONES: Record<string, Tone> = {
  pending: "neutral",
  in_progress: "progress",
  completed: "success",
  skipped: "warning",
  not_applicable: "neutral",
};

const CLIENT_STATUS_TONES: Record<string, Tone> = {
  prospect: "info",
  onboarding: "progress",
  active: "success",
  inactive: "neutral",
  on_hold: "warning",
  closed: "neutral",
};

const KYC_TONES: Record<string, Tone> = {
  not_started: "neutral",
  documents_pending: "warning",
  in_review: "info",
  complete: "success",
  rejected: "danger",
};

const REGISTRATION_STATUS_TONES: Record<string, Tone> = {
  active: "success",
  suspended: "warning",
  cancelled: "danger",
  expired: "danger",
};

const DOCUMENT_STATUS_TONES: Record<string, Tone> = {
  requested: "info",
  received: "progress",
  under_review: "warning",
  accepted: "success",
  rejected: "danger",
  superseded: "neutral",
};

const DOCUMENT_REQUEST_TONES: Record<string, Tone> = {
  open: "warning",
  partially_received: "info",
  fulfilled: "success",
  cancelled: "neutral",
};

const ENGAGEMENT_TONES: Record<string, Tone> = {
  draft: "neutral",
  active: "success",
  on_hold: "warning",
  completed: "info",
  terminated: "danger",
  expired: "danger",
};

const RULE_STATUS_TONES: Record<string, Tone> = {
  draft: "warning",
  active: "success",
  retired: "neutral",
};

const FILING_RECORD_TONES: Record<string, Tone> = {
  pending: "warning",
  submitted: "progress",
  acknowledged: "success",
  rejected: "danger",
  resubmitted: "info",
};

function fromMap(map: Record<string, Tone>, value: string): Tone {
  return map[value] ?? "neutral";
}

export const approvalTone = (value: string) => fromMap(APPROVAL_TONES, value);
export const filingTone = (value: string) => fromMap(FILING_TONES, value);
export const priorityTone = (value: string) => fromMap(PRIORITY_TONES, value);
export const stepStatusTone = (value: string) => fromMap(STEP_TONES, value);
export const clientStatusTone = (value: string) => fromMap(CLIENT_STATUS_TONES, value);
export const kycTone = (value: string) => fromMap(KYC_TONES, value);
export const registrationStatusTone = (value: string) => fromMap(REGISTRATION_STATUS_TONES, value);
export const documentStatusTone = (value: string) => fromMap(DOCUMENT_STATUS_TONES, value);
export const documentRequestTone = (value: string) => fromMap(DOCUMENT_REQUEST_TONES, value);
export const engagementTone = (value: string) => fromMap(ENGAGEMENT_TONES, value);
export const ruleStatusTone = (value: string) => fromMap(RULE_STATUS_TONES, value);
export const filingRecordTone = (value: string) => fromMap(FILING_RECORD_TONES, value);

/** Filters that read better as words than as slugs. */
const TASK_STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  assigned: "Assigned",
  in_progress: "In progress",
  waiting_for_client: "Waiting for client",
  waiting_for_internal: "Waiting internally",
  ready_for_review: "Ready for review",
  changes_requested: "Changes requested",
  ready_for_approval: "Ready for approval",
  approved: "Approved",
  ready_to_file: "Ready to file",
  filed: "Filed",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function taskStatusLabel(value: string): string {
  return TASK_STATUS_LABELS[value] ?? value.replace(/_/g, " ");
}

/** Workflow order for displaying statuses in dropdowns. */
export const TASK_STATUS_ORDER: TaskStatus[] = [
  "not_started",
  "assigned",
  "in_progress",
  "waiting_for_client",
  "waiting_for_internal",
  "changes_requested",
  "ready_for_review",
  "ready_for_approval",
  "approved",
  "ready_to_file",
  "filed",
  "delivered",
  "completed",
  "cancelled",
];

/** Sort statuses in workflow order rather than alphabetical. */
export function sortStatuses(statuses: TaskStatus[]): TaskStatus[] {
  return [...statuses].sort(
    (a, b) => TASK_STATUS_ORDER.indexOf(a) - TASK_STATUS_ORDER.indexOf(b),
  );
}

/** Whether a transition to this status demands a reason in the UI layer.
 * The backend decides this per-rule; most guards (completion blockers, etc.)
 * are only knowable with full task context, so this is the conservative set:
 * if the backend does not need a reason, the call still succeeds without one. */
export function statusRequiresReason(toStatus: TaskStatus): boolean {
  return (
    toStatus === "cancelled" ||
    toStatus === "waiting_for_client" ||
    toStatus === "waiting_for_internal" ||
    toStatus === "changes_requested" ||
    toStatus === "not_started"
  );
}

/** Solid dot colour for each status, used in dropdown option lists. */
export const STATUS_DOT_CLASSES: Record<string, string> = {
  not_started: "bg-slate-400",
  assigned: "bg-sky-500",
  in_progress: "bg-[#1677FF]",
  waiting_for_client: "bg-amber-500",
  waiting_for_internal: "bg-amber-500",
  ready_for_review: "bg-purple-500",
  changes_requested: "bg-rose-500",
  ready_for_approval: "bg-violet-500",
  approved: "bg-violet-500",
  ready_to_file: "bg-indigo-500",
  filed: "bg-emerald-600",
  delivered: "bg-emerald-500",
  completed: "bg-emerald-500",
  cancelled: "bg-slate-400",
};

export function statusDotClass(status: string): string {
  return STATUS_DOT_CLASSES[status] ?? "bg-slate-400";
}

export function delayReasonLabel(value: string): string {
  const LABELS: Record<string, string> = {
    client_documents_pending: "Client documents pending",
    client_clarification_pending: "Client clarification pending",
    internal_capacity: "Internal capacity",
    portal_downtime: "Portal/software downtime",
    awaiting_review: "Awaiting review",
    awaiting_approval: "Awaiting approval",
    data_mismatch: "Data mismatch",
    third_party_dependency: "Third-party dependency",
    other: "Other",
  };
  return LABELS[value] ?? value.replace(/_/g, " ");
}

// ── Billing ──────────────────────────────────────────────────────────────────
//
// `overdue` is deliberately absent from the invoice status map. It is not a status —
// the API derives it from the due date and what is still owed, and an invoice can be
// `issued` and overdue at the same time. It gets its own tone so the two can be shown
// together without one overwriting the other.

const INVOICE_STATUS_TONES: Record<string, Tone> = {
  draft: "neutral",
  issued: "info",
  partially_paid: "warning",
  paid: "success",
  cancelled: "neutral",
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  partially_paid: "Part paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const invoiceStatusTone = (value: string) => fromMap(INVOICE_STATUS_TONES, value);

export function invoiceStatusLabel(value: string): string {
  return INVOICE_STATUS_LABELS[value] ?? value.replace(/_/g, " ");
}

/**
 * Ageing buckets, worst last.
 *
 * `current` is not a debt problem; `90+` is. Colouring them the same would hide the
 * one the report exists to surface.
 */
const AGEING_TONES: Record<string, Tone> = {
  current: "neutral",
  "1-30": "info",
  "31-60": "warning",
  "61-90": "danger",
  "90+": "danger",
};

export const ageingTone = (value: string) => fromMap(AGEING_TONES, value);

/** Where the money came in. Not a status, so no tone beyond a neutral label. */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  upi: "UPI",
  cheque: "Cheque",
  card: "Card",
  other: "Other",
};

export function paymentMethodLabel(value: string): string {
  return PAYMENT_METHOD_LABELS[value] ?? value.replace(/_/g, " ");
}

// ── Notifications ────────────────────────────────────────────────────────────

const NOTIFICATION_STATUS_TONES: Record<string, Tone> = {
  queued: "progress",
  sent: "success",
  failed: "danger",
  read: "neutral",
  cancelled: "neutral",
};

export function notificationStatusTone(status: string): Tone {
  return NOTIFICATION_STATUS_TONES[status] ?? "neutral";
}

const CHANNEL_TONES: Record<string, Tone> = {
  email: "info",
  whatsapp: "success",
  in_app: "neutral",
  sms: "info",
};

export function channelTone(channel: string): Tone {
  return CHANNEL_TONES[channel] ?? "neutral";
}
