"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Badge, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { ChecklistEditor } from "@/components/ChecklistEditor";
import { EditServiceForm } from "@/components/ServiceForms";
import { ApiError, api, buildQuery } from "@/lib/api";
import { cn, formatDate, formatMoney, humanise } from "@/lib/format";
import { taskStatusLabel, taskStatusTone } from "@/lib/status";
import type { Page, ServiceDetailRow, TaskListItem } from "@/lib/types";

type DrawerTab = "overview" | "assignments" | "tasks" | "checklist" | "templates";

/**
 * One service, as a slide-over.
 *
 * A drawer rather than a page because the catalogue is the context: somebody auditing
 * which services are under-priced wants to open one, read its fee and its checklist, and
 * move to the next without losing their tab and filters. `/services/{id}` still exists as
 * a page for direct links and for printing.
 *
 * The checklist shown here is the service's task templates' steps — the same steps copied
 * onto every task generated for it. There is no second copy.
 */
export function ServiceDetailDrawer({
  serviceId,
  onClose,
}: {
  serviceId: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("overview");
  const [editing, setEditing] = useState(false);

  const service = useQuery({
    queryKey: ["service", serviceId],
    queryFn: () => api.get<ServiceDetailRow>(`/services/${serviceId}`),
  });

  const tasks = useQuery({
    queryKey: ["tasks", "list", { serviceId }],
    queryFn: () =>
      api.get<Page<TaskListItem>>(
        `/tasks${buildQuery({ service_id: serviceId, limit: 50 })}`,
      ),
    enabled: tab === "tasks",
  });

  const row = service.data;
  const steps = row?.templates?.flatMap((tpl) => tpl.steps) ?? [];

  const tabs: Array<{ key: DrawerTab; label: string; count?: number }> = [
    { key: "overview", label: "Overview" },
    { key: "assignments", label: "Assignments", count: row?.client_count },
    { key: "tasks", label: "Tasks" },
    { key: "checklist", label: "Checklist", count: steps.length },
    { key: "templates", label: "Templates", count: row?.templates.length },
  ];

  return (
    <>
      <button
        type="button"
        aria-label="Close service details"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-slate-900/20"
      />
      <aside
        role="dialog"
        aria-label="Service details"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-xl"
      >
        <header className="border-b border-slate-200 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  {row?.name ?? "Service"}
                </h2>
                {row && (
                  <Badge tone={row.is_active ? "success" : "neutral"}>
                    {row.is_active ? "Active" : "Inactive"}
                  </Badge>
                )}
              </div>
              {row && (
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">{row.code}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href={`/services/${serviceId}`} className="btn-ghost px-2 py-1 text-xs">
                Open full page
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost px-2 py-1 text-xs"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          <nav className="mt-3 flex flex-wrap items-center gap-1">
            {tabs.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setTab(entry.key)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium",
                  entry.key === tab
                    ? "bg-sky-50 text-sky-700"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
                )}
              >
                {entry.label}
                {entry.count != null && entry.count > 0 && (
                  <span className="tabular ml-1 text-[10px] text-slate-400">
                    ({entry.count})
                  </span>
                )}
              </button>
            ))}
          </nav>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {service.isPending && <LoadingState label="Loading the service…" />}
          {service.isError && (
            <ErrorState
              message={
                service.error instanceof ApiError
                  ? service.error.message
                  : "Could not load this service."
              }
            />
          )}

          {row && tab === "overview" && (
            <OverviewTab
              row={row}
              editing={editing}
              setEditing={setEditing}
              onManageChecklist={() => setTab("checklist")}
            />
          )}

          {row && tab === "assignments" && <AssignmentsTab row={row} />}

          {row && tab === "tasks" && (
            <TasksTab
              tasks={tasks.data?.items ?? []}
              pending={tasks.isPending}
              error={tasks.error}
            />
          )}

          {row && tab === "checklist" && <ChecklistTab row={row} />}

          {row && tab === "templates" && <TemplatesTab row={row} />}
        </div>
      </aside>
    </>
  );
}

/** A label/value row. `value` is a node so a badge or a link can sit in it. */
function Field({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn("flex gap-3 px-4 py-2", wide && "flex-col gap-1")}>
      <dt className="w-40 shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-slate-800">{value}</dd>
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      {action}
    </div>
  );
}


function OverviewTab({
  row,
  editing,
  setEditing,
  onManageChecklist,
}: {
  row: ServiceDetailRow;
  editing: boolean;
  setEditing: (value: boolean) => void;
  onManageChecklist: () => void;
}) {
  const steps = row.templates.flatMap((tpl) => tpl.steps);
  const template = row.templates[0];

  return (
    <div className="divide-y divide-slate-200">
      <section>
        <SectionHeader
          title="Basic Details"
          action={
            <button
              type="button"
              className="text-xs font-medium text-sky-700 hover:underline"
              onClick={() => setEditing(!editing)}
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          }
        />
        {editing ? (
          <EditServiceForm service={row} />
        ) : (
          <dl className="divide-y divide-slate-100">
            <Field label="Service Name" value={row.name} />
            <Field label="Category" value={humanise(row.category)} />
            <Field
              label="Description"
              value={row.description ?? <span className="text-slate-400">Not described</span>}
              wide
            />
            <Field
              label="Frequency"
              value={
                row.is_recurring ? humanise(row.default_frequency ?? "not set") : "One-off"
              }
            />
            <Field
              label="Default Fee"
              value={
                row.standard_fee == null ? (
                  <span className="text-slate-400">Not set</span>
                ) : (
                  <span className="tabular">{formatMoney(row.standard_fee)}</span>
                )
              }
            />
            <Field
              label="Billing Model"
              value={
                row.default_fee_model ? (
                  humanise(row.default_fee_model)
                ) : (
                  <span className="text-slate-400">Not set</span>
                )
              }
            />
            <Field
              label="Applicable For"
              value={
                row.client_count > 0 ? (
                  `${row.client_count} client${row.client_count === 1 ? "" : "s"} today`
                ) : (
                  <span className="text-slate-400">No client yet</span>
                )
              }
            />
            <Field
              label="Status"
              value={
                <Badge tone={row.is_active ? "success" : "neutral"}>
                  {row.is_active ? "Active" : "Inactive"}
                </Badge>
              }
            />
          </dl>
        )}
      </section>

      <section>
        <SectionHeader
          title={`Default Checklist (${steps.length} ${steps.length === 1 ? "item" : "items"})`}
          action={
            <button
              type="button"
              className="text-xs font-medium text-sky-700 hover:underline"
              onClick={onManageChecklist}
            >
              Manage
            </button>
          }
        />
        {steps.length === 0 ? (
          <EmptyState message="No task template is linked to this service, so it has no checklist and generates no recurring work." />
        ) : (
          <ol className="divide-y divide-slate-100">
            {steps.map((step) => (
              <li key={step.id} className="flex items-start gap-2.5 px-4 py-2">
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border text-[10px]",
                    step.is_mandatory
                      ? "border-sky-300 bg-sky-50 text-sky-700"
                      : "border-slate-300 text-slate-400",
                  )}
                  aria-hidden
                >
                  {step.is_mandatory ? "✓" : ""}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-slate-800">
                    {step.sequence}. {step.name}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
                    <span>{step.is_mandatory ? "Mandatory" : "Optional"}</span>
                    {step.requires_review && <span>· needs review</span>}
                    {step.requires_approval && <span>· needs approval</span>}
                    {step.requires_filing && <span>· needs a filing record</span>}
                    {step.requires_document && <span>· needs a document</span>}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <SectionHeader
          title="Task Creation Settings"
          action={
            <button
              type="button"
              className="text-xs font-medium text-sky-700 hover:underline"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          }
        />
        <dl className="divide-y divide-slate-100">
          <Field
            label="Create Tasks"
            value={template?.is_recurring ? "Automatically" : "Manually"}
          />
          <Field
            label="Internal Due Date"
            value={
              template ? (
                `${template.lead_days} day${template.lead_days === 1 ? "" : "s"} before the statutory due date`
              ) : (
                <span className="text-slate-400">No template linked</span>
              )
            }
          />
          <Field label="Default Priority" value={humanise(row.default_priority)} />
          <Field
            label="Estimated Hours"
            value={
              template?.estimated_hours == null ? (
                <span className="text-slate-400">Not estimated</span>
              ) : (
                `${template.estimated_hours} h`
              )
            }
          />
          <Field
            label="Review Required"
            value={steps.some((step) => step.requires_review) ? "Yes" : "No"}
          />
          <Field
            label="Checklist Template"
            value={
              template ? (
                <span className="font-mono text-xs">
                  {template.code} · {template.name}
                </span>
              ) : (
                <span className="text-slate-400">None linked</span>
              )
            }
          />
        </dl>
      </section>
    </div>
  );
}

function TasksTab({
  tasks,
  pending,
  error,
}: {
  tasks: TaskListItem[];
  pending: boolean;
  error: unknown;
}) {
  if (pending) return <LoadingState label="Loading tasks…" />;
  if (error) {
    return (
      <ErrorState
        message={error instanceof ApiError ? error.message : "Could not load tasks."}
      />
    );
  }
  if (tasks.length === 0) {
    return (
      <EmptyState message="No task has been generated for this service yet. Recurring services create one per period once a client is attached." />
    );
  }

  const overdue = tasks.filter((task) => task.is_overdue).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
        <span>
          <strong className="tabular text-slate-900">{tasks.length}</strong> task
          {tasks.length === 1 ? "" : "s"}
        </span>
        {overdue > 0 && (
          <span>
            <strong className="tabular text-rose-700">{overdue}</strong> overdue
          </span>
        )}
      </div>
      <table className="w-full">
        <thead className="bg-slate-50">
          <tr>
            <th className="th">Task</th>
            <th className="th">Client</th>
            <th className="th">Period</th>
            <th className="th">Status</th>
            <th className="th">Internal due</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tasks.map((task) => (
            <tr key={task.id}>
              <td className="td">
                <Link
                  href={`/tasks/${task.id}`}
                  className="font-medium text-slate-900 underline-offset-2 hover:text-sky-700 hover:underline"
                >
                  {task.title}
                </Link>
                <span className="block font-mono text-[10px] text-slate-400">
                  {task.task_code}
                </span>
              </td>
              <td className="td text-xs text-slate-700">{task.client_name ?? "—"}</td>
              <td className="td text-xs text-slate-600">{task.period_key ?? "—"}</td>
              <td className="td">
                <Badge tone={taskStatusTone(task.status)}>
                  {taskStatusLabel(task.status)}
                </Badge>
              </td>
              <td
                className={cn(
                  "td tabular text-xs",
                  task.is_overdue ? "text-rose-700" : "text-slate-600",
                )}
              >
                {formatDate(task.internal_due_date)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssignmentsTab({ row }: { row: ServiceDetailRow }) {
  if (row.clients.length === 0) {
    return (
      <EmptyState message="No client has taken this service yet. Attach it from a client's Services tab." />
    );
  }

  const live = row.clients.filter((client) => client.link_is_active).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
        <span>
          <strong className="tabular text-slate-900">{row.clients.length}</strong> link
          {row.clients.length === 1 ? "" : "s"}
        </span>
        <span>
          <strong className="tabular text-emerald-700">{live}</strong> active
        </span>
        <span>
          <strong className="tabular text-slate-500">{row.clients.length - live}</strong> ended
        </span>
      </div>
      <table className="w-full">
        <thead className="bg-slate-50">
          <tr>
            <th className="th">Client</th>
            <th className="th">Status</th>
            <th className="th">Taken since</th>
            <th className="th">Link</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {row.clients.map((client) => (
            <tr key={`${client.client_id}-${client.start_date ?? "none"}`}>
              <td className="td">
                <Link
                  href={`/clients/${client.client_id}`}
                  className="font-medium text-slate-900 underline-offset-2 hover:text-sky-700 hover:underline"
                >
                  {client.legal_name}
                </Link>
                <span className="block font-mono text-[10px] text-slate-400">
                  {client.client_code}
                </span>
              </td>
              <td className="td">
                <Badge tone={client.client_status === "active" ? "success" : "neutral"}>
                  {humanise(client.client_status)}
                </Badge>
              </td>
              <td className="td text-xs text-slate-600">{formatDate(client.start_date)}</td>
              <td className="td">
                <Badge tone={client.link_is_active ? "success" : "neutral"}>
                  {client.link_is_active ? "Active" : "Ended"}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChecklistTab({ row }: { row: ServiceDetailRow }) {
  if (row.templates.length === 0) {
    return (
      <EmptyState message="No task template is linked to this service, so there is no checklist to edit and no recurring work will be generated for it." />
    );
  }

  return (
    <div>
      <p className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
        These steps are copied onto every task generated for this service. Editing them
        changes future work only — tasks already created hold their own copies.
      </p>
      {row.templates.map((template) => (
        <ChecklistEditor key={template.id} template={template} />
      ))}
    </div>
  );
}

function TemplatesTab({ row }: { row: ServiceDetailRow }) {
  if (row.templates.length === 0) {
    return (
      <EmptyState message="Nothing generates work for this service yet. Link a task template to make it recurring." />
    );
  }

  return (
    <dl className="divide-y divide-slate-100">
      {row.templates.map((template) => (
        <div key={template.id} className="divide-y divide-slate-100">
          <Field label="Template" value={template.name} />
          <Field
            label="Code"
            value={<span className="font-mono text-xs">{template.code}</span>}
          />
          <Field
            label="Description"
            value={template.description ?? <span className="text-slate-400">—</span>}
            wide
          />
          <Field
            label="Recurring"
            value={
              template.is_recurring ? humanise(template.frequency ?? "not set") : "One-off"
            }
          />
          <Field label="Lead Days" value={`${template.lead_days} day(s) before due`} />
          <Field label="Default Priority" value={humanise(template.default_priority)} />
          <Field
            label="Estimated Hours"
            value={
              template.estimated_hours == null
                ? "Not estimated"
                : `${template.estimated_hours} h`
            }
          />
          <Field label="Steps" value={`${template.steps.length} step(s)`} />
          <Field
            label="Status"
            value={
              <Badge tone={template.is_active ? "success" : "neutral"}>
                {template.is_active ? "Active" : "Retired"}
              </Badge>
            }
          />
        </div>
      ))}
    </dl>
  );
}

