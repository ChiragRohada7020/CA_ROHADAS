"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Icon, type IconName } from "@/components/Icon";
import {
  Avatar,
  DonutChart,
  IconChip,
  MiniBar,
  TrendPill,
  type ChipTone,
  type DonutSegment,
} from "@/components/charts";
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { cn, formatMoney, formatPercent, formatRelative, humanise } from "@/lib/format";
import { riskTone, utilisationTone } from "@/lib/status";
import { useSession } from "@/lib/session";
import type { ComplianceCategoryRow, FirmDashboard } from "@/lib/types";

/**
 * The partner's home screen.
 *
 * Every figure comes from `GET /reports/dashboard`, which computes all of it at read
 * time. Nothing here is a stored counter, and nothing is invented to fill a space:
 *
 * * The trend arrows appear only where the API could compute an honest comparison. Two
 *   of the five cards have none, so they simply show no arrow — which is why `TrendPill`
 *   is only rendered when the delta is present.
 * * The compliance ring's segments always sum to the figure in its centre, because the
 *   API derives the fourth bucket as the remainder rather than counting it separately.
 */

const CATEGORY_COLOURS: Record<string, string> = {
  overdue: "stroke-rose-500",
  due_soon: "stroke-amber-400",
  in_progress: "stroke-sky-500",
  completed: "stroke-emerald-500",
};

const CATEGORY_CHIP: Record<string, ChipTone> = {
  overdue: "danger",
  due_soon: "warning",
  in_progress: "info",
  completed: "success",
};

const PIPELINE_COLOURS = [
  "bg-sky-50 text-sky-800 ring-sky-100",
  "bg-indigo-50 text-indigo-800 ring-indigo-100",
  "bg-violet-50 text-violet-800 ring-violet-100",
  "bg-amber-50 text-amber-800 ring-amber-100",
  "bg-orange-50 text-orange-800 ring-orange-100",
  "bg-emerald-50 text-emerald-800 ring-emerald-100",
];

function greeting(data: FirmDashboard): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<FirmDashboard>("/reports/dashboard"),
  });
  const { data: session } = useSession();

  if (isPending) return <LoadingState label="Building your dashboard…" />;
  if (isError) {
    return (
      <ErrorState
        message={
          error instanceof ApiError
            ? error.message
            : "Could not load the dashboard. Please try again."
        }
      />
    );
  }

  const totals = data.totals;
  const trends = data.trends;

  return (
    <div className="dashboard-page min-h-screen space-y-8 py-2">
      <PageHeader
        title={`${greeting(data)}${session?.user?.full_name ? `, ${session.user.full_name.split(" ")[0]}` : ""}`}
        subtitle="Here&rsquo;s what&rsquo;s important for your practice today."
        action={
          <div className="text-right text-xs text-slate-500">
            <p className="font-medium text-slate-700">
              {new Intl.DateTimeFormat("en-IN", {
                timeZone: "Asia/Kolkata",
                weekday: "long",
                day: "numeric",
                month: "short",
                year: "numeric",
              }).format(new Date())}
            </p>
            {data.financial_year && <p>FY {data.financial_year}</p>}
            <p className="mt-0.5">
              {data.scope === "firm" ? "Firm-wide figures" : `Scoped to your ${data.scope}`}
            </p>
            <p className="mt-1 flex items-center justify-end gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Updated {formatRelative(data.generated_at)}</span>
            </p>
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <HeadlineCard
          icon="clock"
          tone="danger"
          label="Overdue"
          value={totals.tasks_overdue}
          trend={trends.overdue}
          href="/tasks"
          index={0}
        />
        <HeadlineCard
          icon="calendar"
          tone="warning"
          label="Due Today"
          value={totals.tasks_due_today}
          trend={trends.due_today}
          href="/calendar"
          index={1}
        />
        <HeadlineCard
          icon="calendar"
          tone="info"
          label="Due This Week"
          value={totals.tasks_due_this_week}
          trend={trends.due_this_week}
          href="/calendar"
          index={2}
        />
        <HeadlineCard
          icon="check-circle"
          tone="violet"
          label="Awaiting Review"
          value={totals.awaiting_review}
          href="/tasks"
          index={3}
        />
        <HeadlineCard
          icon="file-text"
          tone="success"
          label="Missing Documents"
          value={totals.clients_with_missing_documents}
          hint={`${totals.open_document_requests} open request(s)`}
          href="/documents"
          index={4}
        />
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
        <ComplianceSummary rows={data.compliance} className="xl:col-span-2" />
        <UpcomingDeadlines rows={data.upcoming_deadlines} />
      </div>

      <WorkPipeline stages={data.pipeline} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <ClientPortfolio portfolio={data.portfolio} />
        <FinancialOverview financials={data.financials} />
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
        <ClientsNeedingAttention rows={data.at_risk_clients} />
        <TeamWorkload rows={data.workload} />
        <RecentActivity rows={data.recent_activity} />
      </div>
    </div>
  );
}

/**
 * One of the five headline figures.
 *
 * The trend is rendered only when the API sent one. `awaiting_review` and
 * `missing_documents` have no honest comparison, so those cards show a hint instead of
 * a fabricated arrow.
 */
function HeadlineCard({
  icon,
  tone,
  label,
  value,
  hint,
  trend,
  href,
  index,
}: {
  icon: IconName;
  tone: ChipTone;
  label: string;
  value: number;
  hint?: string;
  trend?: { delta: number; compared_to: string };
  href: string;
  index: number;
}) {
  const toneBorder: Record<ChipTone, string> = {
    danger: "border-t-rose-200",
    warning: "border-t-amber-200",
    info: "border-t-sky-200",
    success: "border-t-emerald-200",
    neutral: "border-t-slate-200",
    progress: "border-t-indigo-200",
    violet: "border-t-violet-200",
  };

  return (
    <Link
      href={href}
      className={cn(
        "dashboard-stat stat-fade-in card group flex items-start gap-3 p-4 shadow-sm",
        "border-t",
        toneBorder[tone],
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <IconChip tone={tone}>
        <Icon name={icon} className="h-5 w-5" />
      </IconChip>
      <div className="min-w-0">
        <p className="tabular text-2xl font-semibold text-slate-900">{value}</p>
        <p className="text-xs font-medium text-slate-600">{label}</p>
        <p className="mt-0.5">
          {trend ? (
            <TrendPill delta={trend.delta} comparedTo={trend.compared_to} goodDirection="down" />
          ) : (
            hint && <span className="text-xs text-slate-400">{hint}</span>
          )}
        </p>
      </div>
    </Link>
  );
}

/**
 * Work per service category, with the ring chart.
 *
 * The ring shows the selected category only, and its segments are the four buckets the
 * API returns. They are guaranteed to sum to `total` because the API derives
 * `in_progress` as the remainder rather than counting it in a second pass — so the
 * centre figure and the arcs cannot drift apart.
 */
function ComplianceSummary({
  rows,
  className,
}: {
  rows: ComplianceCategoryRow[];
  className?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <Card title="Compliance Summary" className={cn(className, "dashboard-card dashboard-card--compliance")}>
         <EmptyState message="No work has been generated yet." />
       </Card>
    );
  }

  const current = rows.find((row) => row.category === selected) ?? rows[0];

  const segments: DonutSegment[] = [
    {
      key: "overdue",
      label: "Overdue",
      value: current.overdue,
      className: CATEGORY_COLOURS.overdue,
    },
    {
      key: "due_soon",
      label: "Due Soon",
      value: current.due_soon,
      className: CATEGORY_COLOURS.due_soon,
    },
    {
      key: "in_progress",
      label: "In Progress",
      value: current.in_progress,
      className: CATEGORY_COLOURS.in_progress,
    },
    {
      key: "completed",
      label: "Completed",
      value: current.completed,
      className: CATEGORY_COLOURS.completed,
    },
  ];

  return (
    <Card
       title="Compliance Summary"
       subtitle="Work by service category, counted at read time."
       className={cn(className, "dashboard-card dashboard-card--compliance")}
      action={
        <Link href="/tasks" className="btn-ghost px-2 py-1 text-xs">
          View all
        </Link>
      }
    >
      <div className="px-4 pb-3">
        <div className="flex flex-wrap gap-2">
          {rows.map((row) => {
            const isActive = row.category === current.category;
            return (
              <button
                key={row.category}
                type="button"
                onClick={() => setSelected(row.category)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                  isActive
                    ? "bg-sky-100 text-sky-700 ring-2 ring-sky-200"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
                )}
              >
                {row.label}
                <span className="ml-1.5 tabular text-xs text-slate-400">{row.total}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-5 lg:items-start">
        <div className="lg:col-span-3 flex justify-center">
          <DonutChart
            segments={segments}
            total={current.total}
            totalLabel={`Total ${current.label} tasks`}
            size={200}
          />
        </div>

        <div className="lg:col-span-2 flex flex-col justify-center gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Completion</span>
              <span>
                {formatPercent(
                  current.total > 0 ? (current.completed / current.total) * 100 : 0,
                )}
              </span>
            </div>
            <MiniBar
              percent={current.total > 0 ? (current.completed / current.total) * 100 : 0}
              className="h-2"
              trackClassName="bg-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="tabular text-xl font-semibold text-slate-900">{current.overdue}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Overdue</p>
            </div>
            <div>
              <p className="tabular text-xl font-semibold text-slate-900">{current.in_progress}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">In progress</p>
            </div>
          </div>

          <div className="pt-1 text-center">
            <p className="tabular text-sm font-medium text-slate-700">
              {current.total > 0
                ? `${formatPercent((current.due_soon / current.total) * 100)} due soon`
                : "No tasks in this category"}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function UpcomingDeadlines({ rows }: { rows: FirmDashboard["upcoming_deadlines"] }) {
  const soon = rows.slice(0, 6);

  return (
    <Card
      title="Upcoming Deadlines"
      subtitle="Next statutory dates across the firm."
      className="dashboard-card dashboard-card--deadlines"
      action={
        <Link href="/calendar" className="btn-ghost px-2 py-1 text-xs">
          View calendar
        </Link>
      }
    >
      {soon.length === 0 ? (
        <EmptyState message="Nothing due in the next two weeks." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {soon.map((row) => {
            const late = row.days_remaining < 0;
            const urgent = row.days_remaining <= 7;
            return (
              <li key={row.task_id ?? `${row.client_id}-${row.statutory_due_date}`}>
                <Link
                  href={row.task_id ? `/tasks/${row.task_id}` : "/calendar"}
                  className="dashboard-row flex items-center gap-3 px-4 py-2.5"
                >
                  <span
                    className={cn(
                      "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg ring-1 ring-inset",
                      late
                        ? "bg-rose-50 text-rose-700 ring-rose-100"
                        : urgent
                          ? "bg-amber-50 text-amber-700 ring-amber-100"
                          : "bg-slate-50 text-slate-600 ring-slate-200",
                    )}
                  >
                    <span className="tabular text-sm font-semibold leading-none">
                      {Number(row.statutory_due_date.slice(8, 10))}
                    </span>
                    <span className="mt-0.5 text-[10px] uppercase leading-none">
                      {new Intl.DateTimeFormat("en-IN", { month: "short" }).format(
                        new Date(`${row.statutory_due_date.slice(0, 10)}T00:00:00Z`),
                      )}
                    </span>
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {row.title}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {row.client_name}
                      {!row.verified && " · date unconfirmed"}
                    </span>
                  </span>

                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                      late
                        ? "bg-rose-50 text-rose-700 ring-rose-200"
                        : urgent
                          ? "bg-amber-50 text-amber-800 ring-amber-200"
                          : "bg-emerald-50 text-emerald-700 ring-emerald-200",
                    )}
                  >
                    {late
                      ? `${Math.abs(row.days_remaining)}d late`
                      : row.days_remaining === 0
                        ? "Due today"
                        : "On track"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/**
 * The six pipeline stages, in order, with arrows between them.
 *
 * The grouping of the 14 workflow statuses into these stages is defined by the API, not
 * here — so a screen cannot invent a seventh stage that no task can ever occupy. The
 * stage keys double as the colour index, which keeps the colours stable when a count
 * changes.
 */
function WorkPipeline({ stages }: { stages: FirmDashboard["pipeline"] }) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);

  return (
    <Card
      title="Work Pipeline"
      subtitle={`${total} task(s) in flight, across ${stages.length} stages.`}
      className="dashboard-card dashboard-card--pipeline"
      action={
        <Link href="/tasks" className="btn-ghost px-2 py-1 text-xs">
          View all
        </Link>
      }
    >
      <div className="flex flex-wrap items-stretch gap-2 p-4">
        {stages.map((stage, index) => (
          <div key={stage.key} className="flex flex-1 items-center gap-2">
            <Link
              href="/tasks"
              title={stage.statuses.map(humanise).join(", ")}
              className={cn(
                "pipeline-stage min-w-[8rem] flex-1",
                PIPELINE_COLOURS[index % PIPELINE_COLOURS.length],
              )}
            >
              <p className="tabular text-2xl font-semibold leading-none">{stage.count}</p>
              <p className="mt-1.5 text-xs font-medium leading-tight">{stage.label}</p>
            </Link>
            {index < stages.length - 1 && (
              <Icon name="chevron-right" className="hidden h-4 w-4 shrink-0 text-slate-300 sm:block" />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ClientPortfolio({ portfolio }: { portfolio: FirmDashboard["portfolio"] }) {
  const items: Array<{ icon: IconName; tone: ChipTone; value: number; label: string }> = [
    {
      icon: "clients",
      tone: "info",
      value: portfolio.clients_active,
      label: "Active clients",
    },
    {
      icon: "tasks",
      tone: "progress",
      value: portfolio.engagements_active,
      label: "Active engagements",
    },
    {
      icon: "user",
      tone: "violet",
      value: portfolio.new_clients_this_fy,
      label: "New clients (FY)",
    },
    {
      icon: "clock",
      tone: "neutral",
      value: portfolio.clients_inactive,
      label: "Inactive clients",
    },
  ];

  return (
    <Card
       title="Client Portfolio"
       subtitle={`${portfolio.clients_total} client(s) on the books.`}
       className="dashboard-card dashboard-card--portfolio"
      action={
        <Link href="/clients" className="btn-ghost px-2 py-1 text-xs">
          View all
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-100 transition-colors hover:bg-slate-100/60">
             <IconChip tone={item.tone} size="sm">
               <Icon name={item.icon} className="h-3.5 w-3.5" />
             </IconChip>
             <p className="tabular mt-2 text-xl font-semibold text-slate-900">{item.value}</p>
             <p className="text-xs text-slate-600">{item.label}</p>
           </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Billed, collected, owed and unbilled.
 *
 * Invoiced and collected are for a period; outstanding and overdue are as at today,
 * across every period — because last quarter's unpaid invoice is exactly the one that
 * needs chasing. The panel says which is which rather than leaving the reader to guess.
 */
function FinancialOverview({ financials }: { financials: FirmDashboard["financials"] }) {
  if (!financials) {
    return (
      <Card title="Financial Overview" className="dashboard-card dashboard-card--financial">
         <EmptyState message="Financial figures are not available." />
       </Card>
    );
  }

  return (
    <Card
       title="Financial Overview"
       subtitle={`${financials.period_label} · outstanding is as at today`}
       className="dashboard-card dashboard-card--financial"
      action={
        <Link href="/receivables" className="btn-ghost px-2 py-1 text-xs">
          View report
        </Link>
      }
    >
       <div className="grid grid-cols-2 gap-3 p-4">
         <div className="rounded-lg bg-emerald-50 p-3 ring-1 ring-inset ring-emerald-100 transition-colors hover:bg-emerald-100/40">
           <div className="flex items-center gap-2">
             <Icon name="billing" className="h-4 w-4 text-emerald-600" />
             <p className="text-xs font-medium text-emerald-800">Fees invoiced</p>
           </div>
           <p className="tabular mt-1.5 text-lg font-semibold text-slate-900">
             {formatMoney(financials.fees_invoiced)}
           </p>
           <p className="text-[11px] text-slate-500">{financials.invoice_count} invoice(s)</p>
         </div>

         <div className="rounded-lg bg-sky-50 p-3 ring-1 ring-inset ring-sky-100 transition-colors hover:bg-sky-100/40">
           <div className="flex items-center gap-2">
             <Icon name="receivables" className="h-4 w-4 text-sky-600" />
             <p className="text-xs font-medium text-sky-800">Fees collected</p>
           </div>
           <p className="tabular mt-1.5 text-lg font-semibold text-slate-900">
             {formatMoney(financials.fees_collected)}
           </p>
         </div>

         <div className="rounded-lg bg-rose-50 p-3 ring-1 ring-inset ring-rose-100 transition-colors hover:bg-rose-100/40">
           <div className="flex items-center gap-2">
             <Icon name="clock" className="h-4 w-4 text-rose-600" />
             <p className="text-xs font-medium text-rose-800">Outstanding</p>
           </div>
           <p className="tabular mt-1.5 text-lg font-semibold text-slate-900">
             {formatMoney(financials.outstanding_total)}
           </p>
           {financials.overdue_total > 0 && (
             <p className="text-[11px] text-rose-700">
               {formatMoney(financials.overdue_total)} of it overdue
             </p>
           )}
         </div>

         <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-inset ring-amber-100 transition-colors hover:bg-amber-100/40">
           <div className="flex items-center gap-2">
             <Icon name="file-text" className="h-4 w-4 text-amber-600" />
             <p className="text-xs font-medium text-amber-800">Unbilled work</p>
           </div>
           <p className="tabular mt-1.5 text-lg font-semibold text-slate-900">
             {formatMoney(financials.unbilled_value)}
           </p>
           <p className="text-[11px] text-slate-500">
             {financials.unbilled_task_count} completed task(s)
           </p>
         </div>
       </div>

      {financials.notes.length > 0 && (
        <ul className="space-y-1 border-t border-slate-200 px-4 py-3 text-[11px] text-slate-500">
          {financials.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ClientsNeedingAttention({ rows }: { rows: FirmDashboard["at_risk_clients"] }) {
  const top = rows.slice(0, 6);

  return (
    <Card
      title="Clients Needing Attention"
      subtitle="Ranked by risk, then by how much is late."
      className="dashboard-card dashboard-card--at-risk"
      action={
        <Link href="/clients" className="btn-ghost px-2 py-1 text-xs">
          View all
        </Link>
      }
    >
      {top.length === 0 ? (
        <EmptyState message="No client needs attention." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem]">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Client</th>
                <th className="th">Issue</th>
                <th className="th">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {top.map((row) => {
                // The single most pressing fact about this client, in the order that
                // matters: late work, then unconfirmed dates, then missing paperwork.
                const issue =
                  row.overdue_tasks > 0
                    ? `${row.overdue_tasks} task(s) overdue`
                    : row.unverified_deadlines > 0
                      ? `${row.unverified_deadlines} unconfirmed date(s)`
                      : row.open_document_requests > 0
                        ? `${row.open_document_requests} document request(s)`
                        : `${row.open_tasks} open task(s)`;

                return (
                  <tr key={row.client_id} className="dashboard-row">
                     <td className="td text-xs">
                      <Link
                        href={`/clients/${row.client_id}`}
                        className="font-medium text-slate-900 underline-offset-2 hover:underline"
                      >
                        {row.client_name}
                      </Link>
                      <span className="ml-2 font-mono text-slate-400">{row.client_code}</span>
                    </td>
                    <td className="td text-xs text-slate-600">{issue}</td>
                    <td className="td">
                      <Badge tone={riskTone(row.risk_classification)}>
                        {humanise(row.risk_classification)}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TeamWorkload({ rows }: { rows: FirmDashboard["workload"] }) {
  const top = [...rows]
    .sort((a, b) => b.utilisation_percent - a.utilisation_percent)
    .slice(0, 6);

  return (
    <Card
      title="Team Workload"
      subtitle="Utilisation is complexity-weighted effort, not a task count."
      className="dashboard-card dashboard-card--workload"
      action={
        <Link href="/team" className="btn-ghost px-2 py-1 text-xs">
          View team
        </Link>
      }
    >
      {top.length === 0 ? (
        <EmptyState message="No staff to show." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {top.map((row) => {
            const tone = utilisationTone(row.utilisation_percent);
            return (
               <li key={row.user_id} className="dashboard-row flex items-center gap-3 px-4 py-2.5">
                <Avatar name={row.full_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-800">{row.full_name}</p>
                  <p className="text-[11px] text-slate-500">
                    {row.open_tasks} open
                    {row.overdue_tasks > 0 && (
                      <span className="text-rose-600"> · {row.overdue_tasks} overdue</span>
                    )}
                  </p>
                  <MiniBar
                    percent={row.utilisation_percent}
                    className={cn(
                      "mt-1",
                      tone === "danger"
                        ? "bg-rose-500"
                        : tone === "warning"
                          ? "bg-amber-500"
                          : tone === "success"
                            ? "bg-emerald-500"
                            : "bg-slate-400",
                    )}
                  />
                </div>
                <span className="tabular shrink-0 text-xs font-medium text-slate-700">
                  {formatPercent(row.utilisation_percent)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RecentActivity({ rows }: { rows: FirmDashboard["recent_activity"] }) {
  const top = rows.slice(0, 6);

  return (
    <Card
      title="Recent Activity"
      subtitle="Append-only: the firm's own record of what happened."
      className="dashboard-card dashboard-card--activity"
      action={
        <Link href="/reports" className="btn-ghost px-2 py-1 text-xs">
          View all
        </Link>
      }
    >
      {top.length === 0 ? (
        <EmptyState message="Nothing has happened yet." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {top.map((row) => (
              <li key={row.id} className="dashboard-row flex items-start gap-3 px-4 py-2.5">
               <span className="activity-dot bg-slate-50 text-slate-600 ring-slate-200">
                 <Icon name={activityIcon(row.entity_type)} className="h-3.5 w-3.5" />
               </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-slate-800">
                  {row.summary ?? `${humanise(row.action)} on ${humanise(row.entity_type)}`}
                </p>
                <p className="truncate text-[11px] text-slate-500">
                  {row.actor_label ?? "System"}
                  {row.entity_label ? ` · ${row.entity_label}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-[11px] text-slate-400">
                {formatRelative(row.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** An icon per entity type, so the feed is scannable without reading every line. */
function activityIcon(entityType: string): IconName {
  switch (entityType) {
    case "task":
      return "tasks";
    case "client":
      return "clients";
    case "document":
    case "document_request":
      return "file-text";
    case "invoice":
    case "payment":
      return "billing";
    case "service":
      return "check-circle";
    case "user":
      return "user";
    default:
      return "circle-dot";
  }
}
