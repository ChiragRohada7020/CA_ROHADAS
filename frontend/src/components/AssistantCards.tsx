"use client";

import type { ReactNode } from "react";

import { badgeClasses, taskStatusLabel, taskStatusTone } from "@/lib/status";

/**
 * The cards the assistant renders for structured tool results.
 *
 * Two things changed from the first version:
 *
 * * every card type the tools actually emit now has a renderer. Anything
 *   unhandled used to fall through to `JSON.stringify`, so a checklist or a
 *   workload summary arrived as raw braces in the middle of a conversation.
 * * the cards are styled as content, not as a debug view - a header with the
 *   record's identity, a body, and its actions in a footer.
 */

export interface AssistantAction {
  label: string;
  action: string;
  args: Record<string, unknown>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={badgeClasses(taskStatusTone(status))}>{taskStatusLabel(status)}</span>;
}

function Tone({ value, tone }: { value?: string | null; tone: (v: string) => any }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return <span className={badgeClasses(tone(value))}>{value.replace(/_/g, " ")}</span>;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch {
    return value;
  }
}

function Shell({
  title,
  subtitle,
  children,
  actions,
  onAction,
  accent = "sky",
}: {
  title: string;
  subtitle?: string | null;
  children: ReactNode;
  actions?: AssistantAction[];
  onAction?: (action: AssistantAction) => void;
  accent?: "sky" | "violet" | "amber" | "emerald";
}) {
  const accents: Record<string, string> = {
    sky: "from-sky-400 to-indigo-400",
    violet: "from-violet-400 to-fuchsia-400",
    amber: "from-amber-400 to-orange-400",
    emerald: "from-emerald-400 to-teal-400",
  };
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,27,61,0.04),0_12px_32px_-20px_rgba(16,27,61,0.25)]">
      <div className={`h-1 w-full bg-gradient-to-r ${accents[accent]}`} />
      <div className="flex items-baseline justify-between gap-3 px-4 pt-3">
        <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <span className="shrink-0 text-xs text-slate-500">{subtitle}</span>}
      </div>
      <div className="px-4 pb-3 pt-2">{children}</div>
      {actions && actions.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
          <ActionButtons actions={actions} onAction={onAction} />
        </div>
      )}
    </div>
  );
}

export function ActionButtons({
  actions,
  onAction,
}: {
  actions: AssistantAction[];
  onAction?: (action: AssistantAction) => void;
}) {
  return (
    <>
      {actions.map((action, index) => (
        <button
          key={`${action.action}-${index}`}
          type="button"
          onClick={() => onAction?.(action)}
          className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-medium text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 active:scale-[0.98]"
        >
          {action.label}
        </button>
      ))}
    </>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  if (rows.length === 0) {
    return <p className="py-2 text-sm text-slate-500">Nothing to show.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                className="whitespace-nowrap border-b border-slate-200 pb-2 pr-4 text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-slate-100 last:border-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="py-2 pr-4 align-top text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-slate-800">{children}</dd>
    </div>
  );
}

function Fields({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-3">{children}</dl>;
}

/* ── Client cards ──────────────────────────────────────────────────────── */

function ClientListCard({ data, actions, onAction }: any) {
  const items = data.items ?? [];
  return (
    <Shell title={data.title || "Clients"} subtitle={`${data.total ?? items.length} clients`}
           actions={actions} onAction={onAction}>
      <DataTable
        columns={["Code", "Client", "Type", "Status", "City"]}
        rows={items.map((c: any) => [
          <span className="font-mono text-xs text-slate-500">{c.client_code || c.code}</span>,
          <span className="font-medium text-slate-900">{c.legal_name || c.name}</span>,
          <span className="capitalize">{c.client_type?.replace(/_/g, " ") || "—"}</span>,
          <StatusBadge status={c.status || "not_started"} />,
          c.city || "—",
        ])}
      />
    </Shell>
  );
}

function ClientDetailCard({ data, actions, onAction }: any) {
  const registrations = data.registrations ?? [];
  const services = data.services ?? [];
  const contacts = data.contacts ?? [];
  return (
    <Shell
      title={data.legal_name || data.name || "Client"}
      subtitle={data.client_code || data.code}
      actions={actions}
      onAction={onAction}
    >
      <Fields>
        <Field label="PAN">{data.pan || "—"}</Field>
        <Field label="GSTIN">{data.gstin || "—"}</Field>
        <Field label="TAN">{data.tan || "—"}</Field>
        <Field label="Status"><Tone value={data.status} tone={() => "positive"} /></Field>
        <Field label="KYC">{data.kyc_status?.replace(/_/g, " ") || "—"}</Field>
        <Field label="Open tasks">{data.open_tasks ?? "—"}</Field>
        <Field label="Overdue">{data.overdue_tasks ?? "—"}</Field>
        <Field label="City">{data.city || "—"}</Field>
        <Field label="Onboarded">{formatDate(data.onboarded_on)}</Field>
      </Fields>

      {registrations.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Registrations
          </p>
          <div className="flex flex-wrap gap-1.5">
            {registrations.map((r: any) => (
              <span key={r.id}
                    className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                {r.registration_type}: {r.number}
              </span>
            ))}
          </div>
        </div>
      )}

      {services.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Services
          </p>
          <div className="flex flex-wrap gap-1.5">
            {services.map((s: any) => (
              <span key={s.id}
                    className="rounded-md border border-sky-100 bg-sky-50 px-2 py-1 text-xs text-sky-800">
                {s.code} · {s.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {contacts.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Contacts
          </p>
          <ul className="space-y-0.5 text-sm text-slate-700">
            {contacts.map((c: any) => (
              <li key={c.id}>
                <span className="font-medium text-slate-900">{c.name}</span>
                {c.designation && <span className="text-slate-500"> · {c.designation}</span>}
                {c.email && <span className="text-slate-500"> · {c.email}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Shell>
  );
}


/* ── Task cards ────────────────────────────────────────────────────────── */

function TaskListCard({ data, actions, onAction }: any) {
  const items = data.items ?? [];
  const total = data.total ?? items.length;
  return (
    <Shell
      title={data.title || "Tasks"}
      subtitle={`${total} task${total === 1 ? "" : "s"}`}
      actions={actions}
      onAction={onAction}
      accent="violet"
    >
      <DataTable
        columns={["Task", "Client", "Due", "Status", "Owner"]}
        rows={items.map((t: any) => [
          <div className="min-w-0">
            <span className="font-mono text-xs text-slate-500">{t.task_code}</span>
            <p className="max-w-[22rem] truncate font-medium text-slate-900" title={t.title}>
              {t.title}
            </p>
          </div>,
          <span className="block max-w-[14rem] truncate">{t.client_name || "—"}</span>,
          <span className={t.is_overdue ? "font-medium text-rose-600" : ""}>
            {formatDate(t.internal_due_date || t.statutory_due_date)}
          </span>,
          <StatusBadge status={t.status} />,
          <span className="block max-w-[10rem] truncate">
            {t.preparer?.full_name || "Unassigned"}
          </span>,
        ])}
      />
    </Shell>
  );
}

function TaskDetailCard({ data, actions, onAction }: any) {
  const task = data.task ?? data;
  const steps = task.steps ?? [];
  const done = steps.filter((s: any) => s.status === "completed").length;
  return (
    <Shell
      title={`${task.task_code ?? ""} — ${task.title ?? ""}`}
      subtitle={task.client_name}
      actions={actions}
      onAction={onAction}
      accent="violet"
    >
      <Fields>
        <Field label="Status"><StatusBadge status={task.status} /></Field>
        <Field label="Approval">{task.approval_status?.replace(/_/g, " ") || "—"}</Field>
        <Field label="Filing">{task.filing_status?.replace(/_/g, " ") || "—"}</Field>
        <Field label="Priority">{task.priority || "—"}</Field>
        <Field label="Internal due">{formatDate(task.internal_due_date)}</Field>
        <Field label="Statutory due">{formatDate(task.statutory_due_date)}</Field>
        <Field label="Preparer">{task.preparer?.full_name || "Unassigned"}</Field>
        <Field label="Reviewer">{task.reviewer?.full_name || "—"}</Field>
        <Field label="Approver">{task.approver?.full_name || "—"}</Field>
      </Fields>

      {steps.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex items-baseline justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Checklist
            </p>
            <span className="text-xs text-slate-500">
              {done}/{steps.length} done · {task.progress_percent ?? 0}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, task.progress_percent ?? 0))}%` }}
            />
          </div>
        </div>
      )}

      {(task.completion_blockers ?? []).length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            Blocking completion
          </p>
          <ul className="mt-1 space-y-0.5">
            {task.completion_blockers.map((blocker: string, index: number) => (
              <li key={index} className="text-xs leading-relaxed text-amber-900">• {blocker}</li>
            ))}
          </ul>
        </div>
      )}
    </Shell>
  );
}



function ChecklistCard({ data, actions, onAction }: any) {
  const steps = data.steps ?? [];
  const progress = data.progress_percent ?? 0;
  const pending = data.pending_mandatory_steps ?? [];
  return (
    <Shell
      title={data.title || "Checklist"}
      subtitle={`${progress}% complete`}
      actions={actions}
      onAction={onAction}
      accent="emerald"
    >
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>
      <ul className="space-y-1.5">
        {steps.map((step: any) => {
          const complete = step.status === "completed";
          return (
            <li key={step.id} className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  complete
                    ? "bg-emerald-100 text-emerald-700"
                    : step.status === "in_progress"
                      ? "bg-sky-100 text-sky-700"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {complete ? "✓" : step.sequence}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${complete ? "text-slate-500 line-through" : "text-slate-800"}`}>
                  {step.name}
                  {step.is_mandatory && (
                    <span className="ml-1.5 rounded bg-rose-50 px-1 py-0.5 text-[10px] font-medium uppercase text-rose-600">
                      required
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-400">{step.status?.replace(/_/g, " ")}</p>
              </div>
            </li>
          );
        })}
      </ul>
      {pending.length > 0 && (
        <p className="mt-3 text-xs text-amber-700">
          {pending.length} mandatory step{pending.length === 1 ? "" : "s"} still open.
        </p>
      )}
    </Shell>
  );
}

function BlockersCard({ data, actions, onAction }: any) {
  const blockers = data.blockers ?? [];
  return (
    <Shell
      title={data.title || "Blockers"}
      subtitle={data.task_code}
      actions={actions}
      onAction={onAction}
      accent="amber"
    >
      {blockers.length === 0 ? (
        <p className="text-sm text-emerald-700">Nothing is blocking this task.</p>
      ) : (
        <ul className="space-y-1.5">
          {blockers.map((blocker: string, index: number) => (
            <li key={index} className="flex gap-2 text-sm leading-relaxed text-slate-700">
              <span aria-hidden className="mt-[0.5em] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span>{blocker}</span>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

/* ── Collections the tools also emit ───────────────────────────────────── */

function DocumentRequestListCard({ data, actions, onAction }: any) {
  const items = data.items ?? [];
  return (
    <Shell
      title={data.title || "Outstanding document requests"}
      subtitle={`${data.total ?? items.length} outstanding`}
      actions={actions}
      onAction={onAction}
      accent="amber"
    >
      <DataTable
        columns={["Document", "Client", "Type", "Due", "Status"]}
        rows={items.map((r: any) => [
          <span className="font-medium text-slate-900">{r.title}</span>,
          <span className="block max-w-[14rem] truncate">{r.client_name || "—"}</span>,
          <span className="font-mono text-xs">{r.doc_type || "—"}</span>,
          formatDate(r.due_date),
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
            {r.status?.replace(/_/g, " ")}
          </span>,
        ])}
      />
    </Shell>
  );
}

function StaffListCard({ data, actions, onAction }: any) {
  const items = data.items ?? [];
  return (
    <Shell
      title={data.title || "Staff"}
      subtitle={`${data.total ?? items.length} people`}
      actions={actions}
      onAction={onAction}
      accent="emerald"
    >
      <DataTable
        columns={["Name", "Email", "Roles", "Status"]}
        rows={items.map((u: any) => [
          <span className="font-medium text-slate-900">{u.full_name}</span>,
          <span className="text-slate-500">{u.email}</span>,
          <span className="text-xs text-slate-500">
            {(u.roles ?? []).join(", ").replace(/_/g, " ") || "—"}
          </span>,
          <span className={u.is_active ? "text-emerald-700" : "text-slate-400"}>
            {u.status || "—"}
          </span>,
        ])}
      />
    </Shell>
  );
}

function WorkloadCard({ data, actions, onAction }: any) {
  const roles = data.by_role ?? {};
  const totals = data.totals ?? {};
  const roleRows: ReactNode[][] = [];
  for (const role of ["preparer", "reviewer", "approver"]) {
    for (const entry of roles[role] ?? []) {
      roleRows.push([
        <span className="capitalize text-slate-500">{role}</span>,
        <span className="font-medium text-slate-900">{entry.full_name}</span>,
        <span className="tabular">{entry.open_tasks}</span>,
        <span className={`tabular ${entry.overdue ? "font-medium text-rose-600" : ""}`}>
          {entry.overdue}
        </span>,
        <span className="tabular">{entry.due_this_week}</span>,
        <span className="tabular">{entry.awaiting_their_action}</span>,
      ]);
    }
  }
  return (
    <Shell
      title={data.title || "Workload"}
      subtitle={
        totals.open_tasks !== undefined
          ? `${totals.open_tasks} open · ${totals.overdue ?? 0} overdue`
          : undefined
      }
      actions={actions}
      onAction={onAction}
      accent="violet"
    >
      <DataTable
        columns={["Role", "Person", "Open", "Overdue", "This week", "Waiting"]}
        rows={roleRows}
      />
    </Shell>
  );
}

function ActionResultCard({ data, actions, onAction }: any) {
  const ok = data.success !== false;
  return (
    <Shell
      title={data.title || (ok ? "Done" : "That did not work")}
      subtitle={data.task_code}
      actions={actions}
      onAction={onAction}
      accent={ok ? "emerald" : "amber"}
    >
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
            ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
          }`}
        >
          {ok ? "✓" : "!"}
        </span>
        <span className={ok ? "text-slate-700" : "text-rose-700"}>
          {data.action?.replace(/_/g, " ")}
        </span>
      </div>
      {(data.progress_percent !== undefined || data.priority || data.internal_due_date) && (
        <Fields>
          {data.priority && <Field label="Priority">{data.priority}</Field>}
          {data.internal_due_date && (
            <Field label="Internal due">{formatDate(data.internal_due_date)}</Field>
          )}
          {data.progress_percent !== undefined && (
            <Field label="Progress">{data.progress_percent}%</Field>
          )}
        </Fields>
      )}
    </Shell>
  );
}

function GenericListCard({ data, actions, onAction }: any) {
  const items = data.items ?? [];
  if (items.length === 0) return null;
  const columns = Object.keys(items[0]).filter((key) => !key.endsWith("_id")).slice(0, 6);
  return (
    <Shell
      title={data.title || "Results"}
      subtitle={`${data.total ?? items.length} items`}
      actions={actions}
      onAction={onAction}
    >
      <DataTable
        columns={columns}
        rows={items.map((item: any) =>
          columns.map((column) => {
            const value = item[column];
            if (value === null || value === undefined) return "—";
            if (typeof value === "object") return "—";
            return String(value);
          }),
        )}
      />
    </Shell>
  );
}



/** Render the turn's structured payload, whichever shape it arrived in. */
export function StructuredCard({
  structured,
  actions,
  onAction,
}: {
  structured: any;
  actions?: AssistantAction[];
  onAction?: (action: AssistantAction) => void;
}) {
  if (!structured) return null;
  const card = Array.isArray(structured) ? structured[0] : structured;
  if (!card) return null;
  const data = card.detail ?? card.data ?? card;
  const props = { data, actions, onAction };

  switch (card.type) {
    case "client_list":
      return <ClientListCard {...props} />;
    case "client_detail":
      return <ClientDetailCard {...props} />;
    case "task_list":
      return <TaskListCard {...props} />;
    case "task_detail":
      return <TaskDetailCard {...props} />;
    case "task_checklist":
      return <ChecklistCard {...props} />;
    case "task_blockers":
      return <BlockersCard {...props} />;
    case "document_request_list":
      return <DocumentRequestListCard {...props} />;
    case "staff_list":
      return <StaffListCard {...props} />;
    case "workload_summary":
      return <WorkloadCard {...props} />;
    case "action_success":
    case "action_error":
      return <ActionResultCard {...props} />;
    case "task_assignees": {
      const current = data.current ?? {};
      const rows = Object.entries(current).map(([role, person]: any) => [
        <span className="capitalize text-slate-500">{role}</span>,
        <span className="font-medium text-slate-900">{person?.full_name ?? "Unassigned"}</span>,
        <span className="text-slate-500">{person?.email ?? "—"}</span>,
      ]);
      return (
        <Shell
          title={`${data.task_code ?? ""} — ${data.title ?? "Assignments"}`}
          subtitle="Who holds each role"
          actions={actions}
          onAction={onAction}
        >
          <DataTable columns={["Role", "Person", "Email"]} rows={rows} />
        </Shell>
      );
    }
    default:
      return <GenericListCard {...props} />;
  }
}
