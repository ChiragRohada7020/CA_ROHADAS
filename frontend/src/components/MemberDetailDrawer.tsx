"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Badge, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { Avatar, IconChip, MiniBar } from "@/components/charts";
import { Icon } from "@/components/Icon";
import { ApiError, api } from "@/lib/api";
import { cn, formatDate, formatRelative, humanise } from "@/lib/format";
import { utilisationTone } from "@/lib/status";
import type { MemberOverview, UserDetailRow, UserStatus } from "@/lib/types";

type DrawerTab = "overview" | "tasks" | "clients" | "performance" | "leave";

const STATUS_TONE: Record<UserStatus, "success" | "warning" | "danger" | "neutral"> = {
  active: "success",
  invited: "warning",
  suspended: "danger",
  disabled: "neutral",
};

/**
 * One member, as a slide-over.
 *
 * A drawer rather than a page because the list is the context: somebody rebalancing work
 * wants to open a person, see what they are carrying, and move to the next without
 * losing their tab and filters.
 *
 * The panels come from `GET /users/{id}/overview` rather than the directory record —
 * three aggregates the list has no use for.
 */
export function MemberDetailDrawer({
  memberId,
  onClose,
}: {
  memberId: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("overview");

  const member = useQuery({
    queryKey: ["user", memberId],
    queryFn: () => api.get<UserDetailRow>(`/users/${memberId}`),
  });

  const overview = useQuery({
    queryKey: ["user", memberId, "overview"],
    queryFn: () => api.get<MemberOverview>(`/users/${memberId}/overview`),
  });

  const row = member.data;
  const o = overview.data;
  const load = o?.workload ?? null;

  const tabs: Array<{ key: DrawerTab; label: string; count?: number }> = [
    { key: "overview", label: "Overview" },
    { key: "tasks", label: "Tasks", count: load?.open_tasks },
    { key: "clients", label: "Clients", count: o?.client_count },
    { key: "performance", label: "Performance" },
    { key: "leave", label: "Leave" },
  ];

  return (
    <>
      <button
        type="button"
        aria-label="Close member details"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-slate-900/20"
      />
      <aside
        role="dialog"
        aria-label="Member details"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-xl"
      >
        <header className="border-b border-slate-200 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              {row && <Avatar name={row.full_name} />}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">
                    {row?.full_name ?? "Member"}
                  </h2>
                  {row && (
                    <Badge tone={STATUS_TONE[row.status]}>{humanise(row.status)}</Badge>
                  )}
                </div>
                {row && (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {[row.designation, row.department].filter(Boolean).join(" · ") ||
                      "No designation recorded"}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost shrink-0 px-2 py-1 text-xs"
              aria-label="Close"
            >
              ✕
            </button>
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
          {member.isPending && <LoadingState label="Loading the member…" />}
          {member.isError && (
            <ErrorState
              message={
                member.error instanceof ApiError
                  ? member.error.message
                  : "Could not load this member."
              }
            />
          )}

          {row && tab === "overview" && <OverviewTab row={row} overview={o} />}
          {row && tab === "tasks" && <TasksTab overview={o} />}
          {row && tab === "clients" && <ClientsTab overview={o} />}
          {row && tab === "performance" && <PerformanceTab overview={o} />}
          {row && tab === "leave" && <LeaveTab overview={o} />}
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
      <dt className="w-36 shrink-0 text-xs text-slate-500">{label}</dt>
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

/** The default tab: who they are, what they are carrying, and what they last did. */
function OverviewTab({
  row,
  overview,
}: {
  row: UserDetailRow;
  overview: MemberOverview | undefined;
}) {
  return (
    <div className="divide-y divide-slate-200">
      <section>
        <SectionHeader title="Basic Information" />
        <dl className="divide-y divide-slate-100">
          <Field label="Full Name" value={row.full_name} />
          <Field
            label="Role"
            value={
              <span className="flex flex-wrap items-center gap-1.5">
                {row.designation ?? <span className="text-slate-400">Not set</span>}
                {row.is_partner && <Badge tone="info">Partner</Badge>}
              </span>
            }
          />
          <Field
            label="Department"
            value={row.department ?? <span className="text-slate-400">Not set</span>}
          />
          <Field
            label="Employee Code"
            value={
              row.employee_code ? (
                <span className="font-mono text-xs">{row.employee_code}</span>
              ) : (
                <span className="text-slate-400">Not set</span>
              )
            }
          />
          <Field
            label="Email"
            value={
              <a href={`mailto:${row.email}`} className="text-sky-700 hover:underline">
                {row.email}
              </a>
            }
          />
          <Field
            label="Phone"
            value={row.phone ?? <span className="text-slate-400">Not set</span>}
          />
          <Field
            label="Work Location"
            value={row.work_location ?? <span className="text-slate-400">Not set</span>}
          />
          <Field
            label="Branch"
            value={row.branch_name ?? <span className="text-slate-400">Not set</span>}
          />
          <Field
            label="Weekly Capacity"
            value={`${row.weekly_capacity_hours} hours`}
          />
          <Field label="Join Date" value={formatDate(row.date_of_joining)} />
          <Field
            label="Last Login"
            value={
              row.last_login_at ? (
                formatRelative(row.last_login_at)
              ) : (
                <span className="text-slate-400">Never signed in</span>
              )
            }
          />
          <Field
            label="Status"
            value={
              <Badge tone={STATUS_TONE[row.status]}>{humanise(row.status)}</Badge>
            }
          />
        </dl>
      </section>

      <section>
        <SectionHeader title="Workload (Current Month)" />
        <LoadTiles overview={overview} />
        {overview?.workload && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2">
              <MiniBar
                percent={overview.workload.utilisation_percent}
                className={
                  utilisationTone(overview.workload.utilisation_percent) === "danger"
                    ? "bg-rose-500"
                    : utilisationTone(overview.workload.utilisation_percent) === "warning"
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                }
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              {overview.workload.weighted_load_hours} weighted hours against{" "}
              {overview.workload.capacity_hours} hours of capacity. Over 100% means more
              work than one person can carry.
            </p>
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="Skills & Access" />
        <dl className="divide-y divide-slate-100">
          <Field
            label="Skills"
            value={
              row.skills.length === 0 ? (
                <span className="text-slate-400">None recorded</span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {row.skills.map((skill) => (
                    <Badge key={skill} tone="neutral">
                      {skill}
                    </Badge>
                  ))}
                </span>
              )
            }
          />
          <Field
            label="System Access"
            value={
              row.system_access.length === 0 ? (
                <span className="text-slate-400">None recorded</span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {row.system_access.map((system) => (
                    <Badge key={system} tone="info">
                      {system}
                    </Badge>
                  ))}
                </span>
              )
            }
          />
        </dl>
      </section>

      <section>
        <SectionHeader title="Recent Activity" />
        {(overview?.activity.length ?? 0) === 0 ? (
          <EmptyState message="Nothing recorded against this person yet. Activity is written when they change a client, task or document." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {overview?.activity.slice(0, 8).map((entry) => (
              <li key={entry.id} className="flex items-start gap-2.5 px-4 py-2">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-slate-300" />
                <div className="min-w-0">
                  <p className="text-sm text-slate-800">{entry.summary}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {formatRelative(entry.created_at)}
                    {entry.action && (
                      <span className="ml-1.5 font-mono">{entry.action}</span>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The four workload figures, as a small tile row. */
function LoadTiles({ overview }: { overview: MemberOverview | undefined }) {
  const load = overview?.workload;
  if (!load) {
    return (
      <p className="px-4 py-3 text-xs text-slate-500">
        No open work is assigned to this person, so there is no load to report.
      </p>
    );
  }

  const tiles = [
    { label: "Open Tasks", value: String(load.open_tasks), tone: "info" as const, icon: "tasks" as const },
    { label: "Overdue", value: String(load.overdue_tasks), tone: "danger" as const, icon: "alert-triangle" as const },
    {
      label: "Utilisation",
      value: `${Math.round(load.utilisation_percent)}%`,
      tone: utilisationTone(load.utilisation_percent) === "danger" ? ("danger" as const) : ("success" as const),
      icon: "reports" as const,
    },
    {
      label: "Capacity",
      value: `${load.capacity_hours} h`,
      tone: "neutral" as const,
      icon: "clock" as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-lg border border-slate-200 p-2.5">
          <IconChip tone={tile.tone} size="sm">
            <Icon name={tile.icon} className="h-3.5 w-3.5" />
          </IconChip>
          <p className="tabular mt-1.5 text-lg font-semibold leading-tight text-slate-900">
            {tile.value}
          </p>
          <p className="text-[11px] text-slate-500">{tile.label}</p>
        </div>
      ))}
    </div>
  );
}

/** The task split the list's "Open Tasks" column cannot show. */
function TasksTab({ overview }: { overview: MemberOverview | undefined }) {
  const load = overview?.workload;

  if (!load) {
    return <EmptyState message="No open work is assigned to this person." />;
  }

  const rows = [
    { label: "Open tasks", value: load.open_tasks, tone: "text-slate-900" },
    { label: "Overdue", value: load.overdue_tasks, tone: "text-rose-700" },
    {
      label: "Not yet due",
      value: load.open_tasks - load.overdue_tasks,
      tone: "text-slate-900",
    },
  ];

  return (
    <div>
      <dl className="divide-y divide-slate-100">
        {rows.map((row) => (
          <Field
            key={row.label}
            label={row.label}
            value={<span className={cn("tabular font-medium", row.tone)}>{row.value}</span>}
          />
        ))}
        <Field
          label="Weighted load"
          value={`${load.weighted_load_hours} h of ${load.capacity_hours} h capacity`}
        />
      </dl>
      <div className="px-4 py-3">
        <Link
          href={`/tasks?preparer_id=${load.user_id}`}
          className="btn-ghost inline-flex text-xs"
        >
          Open these tasks
          <Icon name="arrow-right" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

/** The clients this person is responsible for. */
function ClientsTab({ overview }: { overview: MemberOverview | undefined }) {
  if (!overview) return <LoadingState label="Loading…" />;
  if (overview.clients.length === 0) {
    return (
      <EmptyState message="This person is not the partner, manager or preparer on any client." />
    );
  }

  return (
    <table className="w-full">
      <thead className="bg-slate-50">
        <tr>
          <th className="th">Client</th>
          <th className="th text-right">Open Tasks</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {overview.clients.map((client) => (
          <tr key={client.client_id} className="hover:bg-slate-50">
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
            <td className="td tabular text-right text-slate-700">
              {client.open_tasks > 0 ? (
                client.open_tasks
              ) : (
                <span className="text-slate-300">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Performance.
 *
 * Deliberately says what it cannot show. Utilisation history is not stored, so there is
 * no trend to draw — and this product measures effort-weighted load rather than
 * completed-task counts, so a "tasks closed" figure would mislead.
 */
function PerformanceTab({ overview }: { overview: MemberOverview | undefined }) {
  const load = overview?.workload;

  if (!load) {
    return <EmptyState message="No load to report for this person." />;
  }

  return (
    <div className="divide-y divide-slate-200">
      <section>
        <SectionHeader title="Current Load" />
        <dl className="divide-y divide-slate-100">
          <Field
            label="Utilisation"
            value={
              <span className="flex items-center gap-2">
                <MiniBar
                  percent={load.utilisation_percent}
                  className={
                    utilisationTone(load.utilisation_percent) === "danger"
                      ? "bg-rose-500"
                      : utilisationTone(load.utilisation_percent) === "warning"
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }
                  trackClassName="w-24"
                />
                <span className="tabular text-xs text-slate-600">
                  {Math.round(load.utilisation_percent)}%
                </span>
              </span>
            }
          />
          <Field label="Weighted hours" value={`${load.weighted_load_hours} h`} />
          <Field label="Capacity" value={`${load.capacity_hours} h per week`} />
          <Field
            label="Overdue share"
            value={
              load.open_tasks === 0
                ? "No open work"
                : `${Math.round((load.overdue_tasks / load.open_tasks) * 100)}% of open tasks`
            }
          />
        </dl>
      </section>

      <section>
        <SectionHeader title="Not Measured" />
        <p className="px-4 py-3 text-xs text-slate-500">
          Utilisation history is not stored, so no trend is shown. Load here is
          effort-weighted hours rather than a completed-task count — a raw count would rate
          a five-minute acknowledgement the same as a statutory audit.
        </p>
      </section>
    </div>
  );
}

/** This person's attendance for the current month. */
function LeaveTab({ overview }: { overview: MemberOverview | undefined }) {
  const leave = overview?.leave;

  if (!leave) {
    return <EmptyState message="No attendance recorded for this person." />;
  }

  return (
    <div>
      <dl className="divide-y divide-slate-100">
        <Field label="Month" value={leave.label} />
        <Field label="Present" value={<span className="tabular">{leave.present}</span>} />
        <Field label="On leave" value={<span className="tabular">{leave.leave}</span>} />
        <Field label="Holiday" value={<span className="tabular">{leave.holiday}</span>} />
        <Field label="Half day" value={<span className="tabular">{leave.half_day}</span>} />
      </dl>
      <div className="p-3">
        <div className="grid grid-cols-7 gap-1">
          {leave.days.map((day) => (
            <div
              key={day.day}
              className={cn(
                "rounded border py-1 text-center",
                !day.recorded
                  ? "border-dashed border-slate-200 text-slate-300"
                  : day.leave > 0
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : day.holiday > 0 && day.present === 0
                      ? "border-slate-200 bg-slate-100 text-slate-500"
                      : day.half_day > 0
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700",
              )}
              title={
                day.recorded
                  ? `${day.present} present · ${day.leave} leave · ${day.holiday} holiday · ${day.half_day} half day`
                  : "Not recorded"
              }
            >
              <p className="tabular text-[10px]">{day.day}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

