"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { Icon, type IconName } from "@/components/Icon";
import { Avatar } from "@/components/charts";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, Skeleton } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { cn, formatDate, formatMoney, formatPercent, formatRelative, humanise } from "@/lib/format";
import { riskTone, utilisationTone } from "@/lib/status";
import { useSession } from "@/lib/session";
import type { FirmDashboard } from "@/lib/types";

type ComplianceCategoryRow = FirmDashboard["compliance"][number];

const CATEGORY_COLOURS: Record<string, string> = {
  overdue: "text-hsl(var(--destructive))",
  due_soon: "text-hsl(var(--warning))",
  in_progress: "text-hsl(var(--info))",
  completed: "text-hsl(var(--success))",
};

const CATEGORY_CHIP: Record<string, string> = {
  overdue: "destructive",
  due_soon: "warning",
  in_progress: "info",
  completed: "success",
};

const PIPELINE_COLOURS = [
  "bg-blue-50 text-blue-800 ring-blue-100",
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

  if (isPending) {
    return (
      <div className="dashboard-page min-h-screen space-y-10 py-8">
        <PageHeader title="Loading dashboard…" subtitle="Fetching your latest practice insights." />
        <section className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="relative p-5">
              <div className="flex items-start justify-between">
                <Skeleton className="h-11 w-11 rounded-lg" />
                <Skeleton className="h-5 w-12" />
              </div>
              <Skeleton className="mt-4 h-8 w-16" />
              <Skeleton className="mt-2 h-3 w-24" />
            </Card>
          ))}
        </section>
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <div className="card-header">
              <Skeleton className="h-5 w-40" />
            </div>
            <div className="card-body">
              <Skeleton className="h-48 w-full" />
            </div>
          </Card>
          <Card>
            <div className="card-header">
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="card-body space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

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
        subtitle="Here’s what’s important for your practice today."
        action={
          <div className="flex items-end gap-2 text-right">
            <div className="flex flex-col items-end">
              <p className="font-medium text-hsl(var(--foreground))">
                {new Intl.DateTimeFormat("en-IN", {
                  timeZone: "Asia/Kolkata",
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }).format(new Date())}
              </p>
              {data.financial_year && <p className="text-[11px] text-hsl(var(--muted-foreground))">FY {data.financial_year}</p>}
              <p className="mt-1 flex items-center justify-end gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-hsl(var(--success))" />
                <span className="text-xs text-hsl(var(--muted-foreground))">Updated {formatRelative(data.generated_at)}</span>
              </p>
            </div>
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <HeadlineCard
          icon="alert-circle"
          tone="danger"
          label="Overdue Tasks"
          value={totals.tasks_overdue}
          trend={trends.overdue}
          href="/tasks"
          index={0}
        />
        <HeadlineCard
          icon="clock-3"
          tone="warning"
          label="Due Today"
          value={totals.tasks_due_today}
          trend={trends.due_today}
          href="/calendar"
          index={1}
        />
        <HeadlineCard
          icon="calendar-days"
          tone="info"
          label="Due This Week"
          value={totals.tasks_due_this_week}
          trend={trends.due_this_week}
          href="/calendar"
          index={2}
        />
        <HeadlineCard
          icon="shield-check"
          tone="info"
          label="Awaiting Review"
          value={totals.awaiting_review}
          href="/tasks"
          index={3}
        />
        <HeadlineCard
          icon="file-text"
          tone="warning"
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
  icon: string;
  tone: "danger" | "warning" | "info" | "success" | "neutral";
  label: string;
  value: number;
  hint?: string;
  trend?: { delta: number; compared_to: string };
  href: string;
  index: number;
}) {
  const iconBg: Record<string, string> = {
    danger: "bg-rose-50 text-rose-600",
    warning: "bg-amber-50 text-amber-600",
    info: "bg-blue-50 text-blue-600",
    success: "bg-emerald-50 text-emerald-600",
    neutral: "bg-hsl(var(--secondary)) text-hsl(var(--secondary-foreground))",
  };

  return (
    <Link href={href} className="block group">
      <Card className="dashboard-card dashboard-stat relative overflow-hidden border-t-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg" style={{ animationDelay: `${index * 60}ms` }}>
        <div className="stat-fade-in p-4">
          <div className="flex items-start justify-between">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconBg[tone])}>
              <Icon name={icon as any} className="h-5 w-5" />
            </div>
            {trend ? (
              <div className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium">
                {trend.delta >= 0 ? (
                  <span className="border-hsl(var(--success))/20 bg-hsl(var(--success))/10 text-hsl(var(--success))">↑ {Math.abs(trend.delta)}</span>
                ) : (
                  <span className="border-hsl(var(--destructive))/20 bg-hsl(var(--destructive))/10 text-hsl(var(--destructive))">↓ {Math.abs(trend.delta)}</span>
                )}
                <span>{trend.compared_to}</span>
              </div>
            ) : hint ? (
              <Badge tone="neutral" className="text-[10px]">
                {hint}
              </Badge>
            ) : null}
          </div>
          <p className="mt-3 text-xs font-medium text-hsl(var(--muted-foreground))">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular tracking-tight text-hsl(var(--foreground))">{value}</p>
        </div>
      </Card>
    </Link>
  );
}

function ComplianceSummary({
  rows,
  className,
}: {
  rows: ComplianceCategoryRow[];
  className?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  if (!rows || rows.length === 0) {
    return (
      <Card title="Compliance Summary" className={cn(className)} style={{ animationDelay: "180ms" }}>
         <EmptyState message="No work has been generated yet." />
        </Card>
    );
  }

  const current = rows.find((row) => row.category === selected) ?? rows[0];

  return (
    <Card
       title="Compliance Summary"
       subtitle="Work by service category, counted at read time."
       className={cn(className)}
       action={
         <Button asChild variant="ghost" size="sm">
           <Link href="/tasks">View tasks</Link>
         </Button>
       }
    >
      <div className="px-4 pt-4 pb-3">
        <div className="flex flex-wrap gap-2">
          {rows.map((row) => {
            const isActive = row.category === current.category;
            return (
              <button
                key={row.category}
                type="button"
                onClick={() => setSelected(row.category)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-medium transition",
                  isActive
                    ? "bg-blue-100 text-blue-700 ring-2 ring-blue-200"
                    : "text-hsl(var(--muted-foreground)) hover:bg-hsl(var(--secondary))/50 hover:text-hsl(var(--foreground))",
                )}
              >
                {row.label}
                <span className="ml-1.5 tabular text-xs text-hsl(var(--muted-foreground))">{row.total}</span>
              </button>
            );
          })}
        </div>
      </div>

        <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-5 lg:items-start">
          <div className="lg:col-span-3 flex justify-center">
            <DonutChartInline current={current} total={current.total} totalLabel={`Total ${current.label} tasks`} size={200} />
          </div>

          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-hsl(var(--muted-foreground))">
                <span>Completion</span>
                <span>
                  {formatPercent(current.total > 0 ? (current.completed / current.total) * 100 : 0)}
                  <span className="ml-1 text-hsl(var(--muted-foreground))">({current.completed} of {current.total})</span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-hsl(var(--muted))/30">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${current.total > 0 ? (current.completed / current.total) * 100 : 0}%` }} />
              </div>
            </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="tabular text-xl font-semibold text-hsl(var(--foreground))">{current.overdue}</p>
              <p className="text-[10px] uppercase tracking-wide text-hsl(var(--muted-foreground))">Overdue</p>
            </div>
            <div>
              <p className="tabular text-xl font-semibold text-hsl(var(--foreground))">{current.in_progress}</p>
              <p className="text-[10px] uppercase tracking-wide text-hsl(var(--muted-foreground))">In progress</p>
            </div>
          </div>

          <div className="pt-1 text-center">
            <p className="tabular text-sm font-medium text-hsl(var(--foreground))">
              {current.total > 0 ? `${formatPercent((current.due_soon / current.total) * 100)} due soon` : "No tasks in this category"}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function DonutChartInline({ current, total, totalLabel, size }: { current: any; total: number; totalLabel: string; size: number }) {
  const segments = [
    { key: "overdue", label: "Overdue", value: current.overdue, color: "text-hsl(var(--destructive))" },
    { key: "due_soon", label: "Due Soon", value: current.due_soon, color: "text-hsl(var(--warning))" },
    { key: "in_progress", label: "In Progress", value: current.in_progress, color: "text-hsl(var(--info))" },
    { key: "completed", label: "Completed", value: current.completed, color: "text-hsl(var(--success))" },
  ];

  const RADIUS = 40;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const drawable = segments.filter((s) => s.value > 0);
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:items-start">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={totalLabel}>
          <g transform="rotate(-90 50 50)">
            <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth={14} className="stroke-hsl(var(--border))" />
            {drawable.map((segment) => {
              const fraction = total > 0 ? segment.value / total : 0;
              const length = fraction * CIRCUMFERENCE;
              const dash = `${length} ${CIRCUMFERENCE - length}`;
              return (
                <circle
                  key={segment.key}
                  cx="50" cy="50" r={RADIUS} fill="none" strokeWidth={14}
                  strokeDasharray={dash} strokeDashoffset={-offset} strokeLinecap="butt"
                  className={segment.color}
                  style={{ opacity: 1 }}
                />
              );
            })}
          </g>
          <text x="50" y="55" textAnchor="middle" className="tabular text-2xl font-bold text-hsl(var(--foreground))">
            {total}
          </text>
          <text x="50" y="72" textAnchor="middle" className="text-[10px] text-hsl(var(--muted-foreground))">
            {totalLabel}
          </text>
        </svg>
      </div>
    </div>
  );
}

function UpcomingDeadlines({ rows }: { rows: FirmDashboard["upcoming_deadlines"] }) {
  const soon = (rows ?? []).slice(0, 6);

  return (
    <Card title="Upcoming Deadlines" subtitle="Confirmed statutory dates, plus tasks due soon." action={
      <Button asChild variant="ghost" size="sm">
        <Link href="/calendar">View calendar</Link>
      </Button>
    }>
      {soon.length === 0 ? (
        <EmptyState message="Nothing due in the next two weeks." />
      ) : (
        <ul className="divide-y divide-hsl(var(--border))">
          {soon.map((row) => {
            const late = row.days_remaining < 0;
            const urgent = row.days_remaining <= 7;
            return (
              <li key={row.task_id ?? `${row.client_id}-${row.statutory_due_date}`}>
                <Link href={row.task_id ? `/tasks/${row.task_id}` : "/calendar"} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-hsl(var(--secondary))/50">
                  <span className={cn(
                    "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg ring-1 ring-inset",
                    late ? "bg-rose-50 text-rose-700 ring-rose-100" : urgent ? "bg-amber-50 text-amber-700 ring-amber-100" : "bg-hsl(var(--secondary))/50 text-hsl(var(--muted-foreground)) ring-hsl(var(--border))/50",
                  )}>
                    <span className="tabular text-sm font-semibold leading-none">{Number(row.statutory_due_date.slice(8, 10))}</span>
                    <span className="mt-0.5 text-[10px] uppercase leading-none">{new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date(`${row.statutory_due_date.slice(0, 10)}T00:00:00Z`))}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-hsl(var(--foreground))">{row.title}</span>
                    <span className="block truncate text-xs text-hsl(var(--muted-foreground))">{row.client_name}{!row.verified && " · date unconfirmed"}</span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", late ? "bg-rose-50 text-rose-700 ring-rose-200" : urgent ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200")}>
                    {late ? `${Math.abs(row.days_remaining)}d late` : row.days_remaining === 0 ? "Due today" : "On track"}
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

function WorkPipeline({ stages }: { stages: FirmDashboard["pipeline"] }) {
  const safeStages = stages ?? [];
  const total = safeStages.reduce((sum, stage) => sum + stage.count, 0);

  return (
    <Card title="Work Pipeline" subtitle={`${total} task(s) in flight, across ${safeStages.length} stages.`} action={
      <Button asChild variant="ghost" size="sm">
        <Link href="/tasks">View all</Link>
      </Button>
    }>
      <div className="flex flex-wrap items-stretch gap-2 p-4">
        {safeStages.map((stage, index) => (
          <div key={stage.key} className="flex flex-1 items-center gap-2">
              <Link href="/tasks" title={stage.statuses.map(humanise).join(", ")} className={cn("min-w-[8rem] flex-1 rounded-lg p-3 border border-hsl(var(--border))", PIPELINE_COLOURS[index % PIPELINE_COLOURS.length])}>
              <p className="tabular text-2xl font-semibold leading-none">{stage.count}</p>
              <p className="mt-1.5 text-xs font-medium leading-tight">{stage.label}</p>
            </Link>
            {index < safeStages.length - 1 && (
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-hsl(var(--muted-foreground)) sm:block" />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ClientPortfolio({ portfolio }: { portfolio: FirmDashboard["portfolio"] }) {
  const p = portfolio ?? {};
  const items: Array<{ icon: string; tone: string; value: number; label: string }> = [
    { icon: "clients", tone: "info", value: p.clients_active ?? 0, label: "Active clients" },
    { icon: "tasks", tone: "progress", value: p.engagements_active ?? 0, label: "Active engagements" },
    { icon: "user", tone: "neutral", value: p.new_clients_this_fy ?? 0, label: "New clients (FY)" },
    { icon: "clock", tone: "neutral", value: p.clients_inactive ?? 0, label: "Inactive clients" },
  ];

  return (
    <Card title="Client Portfolio" subtitle={`${p.clients_total ?? 0} client(s) on the books.`} action={
      <Button asChild variant="ghost" size="sm">
        <Link href="/clients">View all</Link>
      </Button>
    }>
      <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl bg-hsl(var(--secondary))/50 p-5 transition-colors hover:bg-hsl(var(--secondary))/80">
             <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-hsl(var(--secondary)) text-hsl(var(--secondary-foreground)) mb-2">
               <Icon name={item.icon as any} className="h-3.5 w-3.5" />
             </div>
             <p className="tabular mt-2 text-xl font-semibold text-hsl(var(--foreground))">{item.value}</p>
             <p className="text-xs text-hsl(var(--muted-foreground))">{item.label}</p>
           </div>
        ))}
      </div>
    </Card>
  );
}

function FinancialOverview({ financials }: { financials: FirmDashboard["financials"] }) {
  if (!financials) {
    return (
      <Card title="Financial Overview" className="dashboard-card dashboard-card--financial">
         <EmptyState message="Financial figures are not available." />
        </Card>
    );
  }

  return (
    <Card title="Financial Overview" subtitle={`${financials.period_label} · outstanding is as at today`} action={
      <Button asChild variant="ghost" size="sm">
        <Link href="/receivables">View report</Link>
      </Button>
    }>
       <div className="grid grid-cols-2 gap-3 p-4">
         <div className="rounded-lg bg-emerald-50 p-3 ring-1 ring-inset ring-emerald-100 transition-colors hover:bg-emerald-100/40">
           <div className="flex items-center gap-2">
             <Icon name="billing" className="h-4 w-4 text-emerald-600" />
             <p className="text-xs font-medium text-emerald-800">Fees invoiced</p>
           </div>
           <p className="tabular mt-1.5 text-lg font-semibold text-hsl(var(--foreground))">{formatMoney(financials.fees_invoiced)}</p>
           <p className="text-[11px] text-hsl(var(--muted-foreground))">{financials.invoice_count} invoice(s)</p>
         </div>

         <div className="rounded-lg bg-blue-50 p-3 ring-1 ring-inset ring-blue-100 transition-colors hover:bg-blue-100/40">
           <div className="flex items-center gap-2">
             <Icon name="receivables" className="h-4 w-4 text-blue-600" />
             <p className="text-xs font-medium text-blue-800">Fees collected</p>
           </div>
           <p className="tabular mt-1.5 text-lg font-semibold text-hsl(var(--foreground))">{formatMoney(financials.fees_collected)}</p>
         </div>

         <div className="rounded-lg bg-rose-50 p-3 ring-1 ring-inset ring-rose-100 transition-colors hover:bg-rose-100/40">
           <div className="flex items-center gap-2">
             <Icon name="clock" className="h-4 w-4 text-rose-600" />
             <p className="text-xs font-medium text-rose-800">Outstanding</p>
           </div>
           <p className="tabular mt-1.5 text-lg font-semibold text-hsl(var(--foreground))">{formatMoney(financials.outstanding_total)}</p>
           {financials.overdue_total > 0 && (
             <p className="text-[11px] text-rose-700">{formatMoney(financials.overdue_total)} of it overdue</p>
           )}
         </div>

         <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-inset ring-amber-100 transition-colors hover:bg-amber-100/40">
           <div className="flex items-center gap-2">
             <Icon name="file-text" className="h-4 w-4 text-amber-600" />
             <p className="text-xs font-medium text-amber-800">Unbilled work</p>
           </div>
           <p className="tabular mt-1.5 text-lg font-semibold text-hsl(var(--foreground))">{formatMoney(financials.unbilled_value)}</p>
           <p className="text-[11px] text-hsl(var(--muted-foreground))">{financials.unbilled_task_count} completed task(s)</p>
         </div>
       </div>

      {financials.notes.length > 0 && (
        <ul className="space-y-1 border-t border-hsl(var(--border)) px-4 py-3 text-[11px] text-hsl(var(--muted-foreground))">
          {financials.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ClientsNeedingAttention({ rows }: { rows: FirmDashboard["at_risk_clients"] }) {
  const top = (rows ?? []).slice(0, 6);

  return (
    <Card title="Clients Needing Attention" subtitle="Ranked by risk, then by how much is late." action={
      <Button asChild variant="ghost" size="sm">
        <Link href="/clients">View all</Link>
      </Button>
    }>
      {top.length === 0 ? (
        <EmptyState message="No client needs attention." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem]">
            <thead className="bg-hsl(var(--secondary))/50">
              <tr>
                <th className="th">Client</th>
                <th className="th">Issue</th>
                <th className="th">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hsl(var(--border))">
              {top.map((row) => {
                const issue =
                  row.overdue_tasks > 0
                    ? `${row.overdue_tasks} task(s) overdue`
                    : row.unverified_deadlines > 0
                      ? `${row.unverified_deadlines} unconfirmed date(s)`
                      : row.open_document_requests > 0
                        ? `${row.open_document_requests} document request(s)`
                        : `${row.open_tasks} open task(s)`;

                return (
                  <tr key={row.client_id} className="hover:bg-hsl(var(--secondary))/50 transition-colors">
                     <td className="td text-sm">
                      <Link href={`/clients/${row.client_id}`} className="font-medium text-hsl(var(--foreground)) underline-offset-2 hover:underline">
                        {row.client_name}
                      </Link>
                      <span className="ml-2 font-mono text-hsl(var(--muted-foreground))">{row.client_code}</span>
                    </td>
                    <td className="td text-xs text-hsl(var(--muted-foreground))">{issue}</td>
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
  const top = [...(rows ?? [])]
    .sort((a, b) => b.utilisation_percent - a.utilisation_percent)
    .slice(0, 6);

  return (
    <Card title="Team Workload" subtitle="Utilisation is complexity-weighted effort, not a task count." action={
      <Button asChild variant="ghost" size="sm">
        <Link href="/team">View team</Link>
      </Button>
    }>
      {top.length === 0 ? (
        <EmptyState message="No staff to show." />
      ) : (
        <ul className="divide-y divide-hsl(var(--border))">
          {top.map((row) => {
            const tone = utilisationTone(row.utilisation_percent);
            return (
               <li key={row.user_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-hsl(var(--secondary))/50 transition-colors">
                <Avatar name={row.full_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-hsl(var(--foreground))">{row.full_name}</p>
                  <p className="text-[11px] text-hsl(var(--muted-foreground))">
                    {row.open_tasks} open
                    {row.overdue_tasks > 0 && (
                      <span className="text-hsl(var(--destructive))"> · {row.overdue_tasks} overdue</span>
                    )}
                  </p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-hsl(var(--muted))/30 mt-1">
                    <div className={cn("h-full rounded-full transition-all duration-500", tone === "danger" ? "bg-hsl(var(--destructive))" : tone === "warning" ? "bg-hsl(var(--warning))" : tone === "success" ? "bg-hsl(var(--success))" : "bg-hsl(var(--muted-foreground))")} style={{ width: `${Math.min(Math.max(row.utilisation_percent, 0), 100)}%` }} />
                  </div>
                </div>
                <span className="tabular shrink-0 text-xs font-medium text-hsl(var(--foreground))">{formatPercent(row.utilisation_percent)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RecentActivity({ rows }: { rows: FirmDashboard["recent_activity"] }) {
  const top = (rows ?? []).slice(0, 6);

  return (
    <Card title="Recent Activity" subtitle="Append-only: the firm's own record of what happened." action={
      <Button asChild variant="ghost" size="sm">
        <Link href="/reports">View all</Link>
      </Button>
    }>
      {top.length === 0 ? (
        <EmptyState message="Nothing has happened yet." />
      ) : (
        <ul className="divide-y divide-hsl(var(--border))">
          {top.map((row) => (
              <li key={row.id} className="flex items-start gap-3 px-4 py-2.5">
               <span className="flex h-8 w-8 items-center justify-center rounded-full bg-hsl(var(--secondary))/50 text-hsl(var(--muted-foreground)) shrink-0">
                 <Icon name={activityIcon(row.entity_type) as any} className="h-3.5 w-3.5" />
               </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-hsl(var(--foreground))">{row.summary ?? `${humanise(row.action)} on ${humanise(row.entity_type)}`}</p>
                <p className="truncate text-[11px] text-hsl(var(--muted-foreground))">
                  {row.actor_label ?? "System"}
                  {row.entity_label ? ` · ${row.entity_label}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-[11px] text-hsl(var(--muted-foreground))">
                {formatRelative(row.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function activityIcon(entityType: string): string {
  switch (entityType) {
    case "task": return "tasks";
    case "client": return "clients";
    case "document": case "document_request": return "file-text";
    case "invoice": case "payment": return "billing";
    case "service": return "check-circle";
    case "user": return "user";
    default: return "circle-dot";
  }
}
