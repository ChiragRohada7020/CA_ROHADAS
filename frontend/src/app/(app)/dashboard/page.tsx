"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Calendar,
  FileText,
  ShieldCheck,
  Users,
  Receipt,
  PiggyBank,
  BarChart3,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertTriangle,
  Activity,
  ArrowRight,
  User,
  Building2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer } from "@/components/PageContainer";
import { StatCard } from "@/components/PageHeader";
import { EmptyState } from "@/components/PageContainer";
import { ApiError, api } from "@/lib/api";
import { cn, formatDate, formatMoney, formatPercent, formatRelative, humanise } from "@/lib/format";
import { riskTone, utilisationTone, invoiceStatusTone, invoiceStatusLabel, taskStatusTone, taskStatusLabel, clientStatusTone } from "@/lib/status";
import { useSession } from "@/lib/session";
import type { FirmDashboard } from "@/lib/types";

type ComplianceCategoryRow = FirmDashboard["compliance"][number];

const CATEGORY_COLOURS: Record<string, string> = {
  overdue: "text-rose-600 border-rose-100 bg-rose-50",
  due_soon: "text-amber-600 border-amber-100 bg-amber-50",
  in_progress: "text-blue-600 border-blue-100 bg-blue-50",
  completed: "text-emerald-600 border-emerald-100 bg-emerald-50",
};

const CATEGORY_LABELS: Record<string, string> = {
  overdue: "Overdue",
  due_soon: "Due Soon",
  in_progress: "In Progress",
  completed: "Completed",
};

const PIPELINE_COLOURS = [
  "bg-blue-50 text-blue-600 border-blue-100",
  "bg-indigo-50 text-indigo-600 border-indigo-100",
  "bg-violet-50 text-violet-600 border-violet-100",
  "bg-amber-50 text-amber-600 border-amber-100",
  "bg-orange-50 text-orange-600 border-orange-100",
  "bg-emerald-50 text-emerald-600 border-emerald-100",
];

function greeting(): string {
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

const ICON_MAP: Record<string, React.ElementType> = {
  overdue: AlertTriangle,
  due_soon: Clock,
  in_progress: Activity,
  completed: CheckCircle,
};

export default function DashboardPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<FirmDashboard>("/reports/dashboard"),
  });
  const { data: session } = useSession();

  if (isPending) {
    return (
      <div className="min-h-screen py-8">
        <PageHeader title="Loading dashboard" subtitle="Fetching your latest practice insights." />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <SkeletonCard className="lg:col-span-2 h-96" />
          <SkeletonCard h-96 />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen py-8">
        <PageHeader title="Error" subtitle="Could not load dashboard data." />
        <div className="p-6">
          <p className="text-sm text-muted-foreground">
            {error instanceof ApiError ? error.message : "Could not load the dashboard. Please try again."}
          </p>
        </div>
      </div>
    );
  }

  const totals = data.totals;
  const trends = data.trends;

  return (
    <div className="min-h-screen py-8">
      <PageContainer>
        <PageHeader
          title={`${greeting()}${session?.user?.full_name ? `, ${session.user.full_name.split(" ")[0]}` : ""}`}
          subtitle="Here's what's important for your practice today."
          action={
            <div className="flex items-end gap-2 text-right">
              <div className="flex flex-col items-end">
                <p className="text-xs font-medium text-foreground">
                  {new Intl.DateTimeFormat("en-IN", {
                    timeZone: "Asia/Kolkata",
                    weekday: "long",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  }).format(new Date())}
                </p>
                {data.financial_year && <p className="text-xs text-muted-foreground">FY {data.financial_year}</p>}
              </div>
              <Badge variant="info" className="text-[10px] px-2 py-1">
                Updated {formatRelative(data.generated_at)}
              </Badge>
            </div>
          }
          breadcrumbs={[{ label: "Dashboard" }]}
        />

        {/* Headline KPI Cards */}
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <StatCard
              title="Overdue Tasks"
              value={totals.tasks_overdue}
              icon={AlertTriangle}
              tone="danger"
              trend={trends.overdue ? { delta: trends.overdue.delta, label: "from " + trends.overdue.compared_to, good: trends.overdue.delta <= 0 } : undefined}
              href="/tasks"
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <StatCard
              title="Due Today"
              value={totals.tasks_due_today}
              icon={Clock}
              tone="warning"
              trend={trends.due_today ? { delta: trends.due_today.delta, label: "from " + trends.due_today.compared_to, good: trends.due_today.delta <= 0 } : undefined}
              href="/calendar"
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <StatCard
              title="Due This Week"
              value={totals.tasks_due_this_week}
              icon={Calendar}
              tone="info"
              trend={trends.due_this_week ? { delta: trends.due_this_week.delta, label: "from " + trends.due_this_week.compared_to, good: trends.due_this_week.delta <= 0 } : undefined}
              href="/calendar"
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <StatCard
              title="Awaiting Review"
              value={totals.awaiting_review}
              icon={ShieldCheck}
              tone="info"
              hint={`${totals.awaiting_approval} awaiting approval`}
              href="/tasks"
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <StatCard
              title="Missing Documents"
              value={totals.clients_with_missing_documents}
              icon={FileText}
              tone="warning"
              hint={`${totals.open_document_requests} open request(s)`}
              href="/documents"
            />
          </motion.div>
        </section>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Compliance Summary */}
          <ComplianceSummary rows={data.compliance} className="lg:col-span-2" />

          {/* Upcoming Deadlines */}
          <UpcomingDeadlines rows={data.upcoming_deadlines} />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <WorkPipeline stages={data.pipeline} className="lg:col-span-2" />
          <FinancialOverview financials={data.financials} />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-3">
          <ClientPortfolio portfolio={data.portfolio} />
          <TeamWorkload rows={data.workload} />
          <RecentActivity rows={data.recent_activity} />
        </div>
      </PageContainer>
    </div>
  );
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <Card className={cn("h-48", className)}>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="h-4 w-32 bg-muted rounded animate-pulse" />
          <div className="h-8 w-16 bg-muted rounded animate-pulse" />
          <div className="h-4 w-24 bg-muted rounded animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}

function ComplianceSummary({ rows, className }: { rows: ComplianceCategoryRow[]; className?: string }) {
  const [selected, setSelected] = useState<string | null>(null);

  if (!rows || rows.length === 0) {
    return (
      <Card className={cn("h-full", className)}>
        <CardHeader>
          <CardTitle>Compliance Summary</CardTitle>
          <CardDescription>Work by service category, counted at read time.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-64">
          <EmptyState title="No work generated yet" description="Tasks will appear here once work is generated for your clients." />
        </CardContent>
      </Card>
    );
  }

  const current = rows.find((row) => row.category === selected) ?? rows[0];

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap gap-2 mb-4">
          {rows.map((row) => {
            const Icon = ICON_MAP[row.category] ?? Activity;
            const isActive = row.category === current.category;
            return (
              <button
                key={row.category}
                type="button"
                onClick={() => setSelected(row.category)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-blue-50 text-blue-600 border border-blue-100 shadow-sm"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className={cn(isActive ? "font-medium" : "")}>{row.label}</span>
                <span className="ml-auto tabular text-xs text-muted-foreground">{row.total}</span>
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="pb-6 pt-0">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:items-start">
          <div className="lg:col-span-3 flex justify-center">
            <div className="relative h-64 w-64">
              <svg className="h-full w-full" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" stroke="hsl(var(--muted))" strokeWidth="12" fill="none" />
                {[
                  { key: "overdue", value: current.overdue, color: "stroke-rose-500" },
                  { key: "due_soon", value: current.due_soon, color: "stroke-amber-500" },
                  { key: "in_progress", value: current.in_progress, color: "stroke-blue-500" },
                  { key: "completed", value: current.completed, color: "stroke-emerald-500" },
                ].map((segment) => {
                  const fraction = current.total > 0 ? segment.value / current.total : 0;
                  const circumference = 2 * Math.PI * 42;
                  const length = fraction * circumference;
                  return (
                    <circle
                      key={segment.key}
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke={segment.color.replace("stroke-", "text-") as any}
                      strokeWidth="12"
                      strokeDasharray={`${length} ${circumference - length}`}
                      strokeDashoffset="-25"
                      strokeLinecap="round"
                      className="transition-all duration-500"
                    />
                  );
                })}
                <text x="50" y="55" textAnchor="middle" className="text-2xl font-bold text-foreground">
                  {current.total}
                </text>
                <text x="50" y="72" textAnchor="middle" className="text-xs text-muted-foreground">
                  Total {current.label} tasks
                </text>
              </svg>
            </div>
          </div>
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Completion</span>
                <div className="flex items-end gap-1">
                  <span className="tabular text-sm font-semibold text-foreground">
                    {current.total > 0 ? formatPercent((current.completed / current.total) * 100) : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({current.completed} of {current.total})
                  </span>
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/30">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${current.total > 0 ? (current.completed / current.total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div>
                <p className="tabular text-xl font-semibold text-foreground">{current.overdue}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Overdue</p>
              </div>
              <div>
                <p className="tabular text-xl font-semibold text-foreground">{current.in_progress}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">In Progress</p>
              </div>
            </div>
            <div className="pt-2 text-center">
              <p className="tabular text-sm font-medium text-foreground">
                {current.total > 0 ? formatPercent((current.due_soon / current.total) * 100) : "0%"} due soon
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UpcomingDeadlines({ rows }: { rows: FirmDashboard["upcoming_deadlines"] }) {
  const soon = (rows ?? []).slice(0, 6);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Upcoming Deadlines</CardTitle>
        <CardDescription>Confirmed statutory dates, plus tasks due soon.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {soon.length === 0 ? (
          <div className="p-6 flex flex-col items-center justify-center text-center">
            <CheckCircle className="h-8 w-8 text-emerald-500 mb-2" />
            <p className="text-sm text-muted-foreground">Nothing due in the next two weeks.</p>
          </div>
        ) : (
          <div className="divide-y divide-hsl(var(--border))">
            {soon.map((row) => {
              const late = row.days_remaining < 0;
              const urgent = row.days_remaining <= 7;
              const tone = late ? "danger" : urgent ? "warning" : "success";
              const label = late
                ? `${Math.abs(row.days_remaining)}d late`
                : row.days_remaining === 0
                  ? "Due today"
                  : "On track";
              return (
                <Link
                  key={row.task_id ?? `${row.client_id}-${row.statutory_due_date}`}
                  href={row.task_id ? `/tasks/${row.task_id}` : "/calendar"}
                  className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className={cn(
                    "flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg ring-1 ring-inset text-center",
                    late
                      ? "bg-rose-50 text-rose-600 ring-rose-100"
                      : urgent
                        ? "bg-amber-50 text-amber-600 ring-amber-100"
                        : "bg-emerald-50 text-emerald-600 ring-emerald-100",
                  )}>
                    <span className="tabular text-sm font-semibold leading-none">
                      {Number(row.statutory_due_date.slice(8, 10))}
                    </span>
                    <span className="mt-0.5 text-[10px] uppercase leading-none">
                      {new Intl.DateTimeFormat("en-IN", { month: "short" }).format(
                        new Date(`${row.statutory_due_date.slice(0, 10)}T00:00:00Z`),
                      )}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {row.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.client_name}
                      {!row.verified && " · date unconfirmed"}
                    </span>
                  </div>
                  <span className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                    late
                      ? "bg-rose-50 text-rose-600 ring-rose-100"
                      : urgent
                        ? "bg-amber-50 text-amber-600 ring-amber-100"
                        : "bg-emerald-50 text-emerald-600 ring-emerald-100",
                  )}>
                    {label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Link href="/calendar" className="text-sm text-primary hover:underline flex items-center gap-1">
          View all deadlines <ArrowRight className="h-3 w-3" />
        </Link>
      </CardFooter>
    </Card>
  );
}

function WorkPipeline({ stages, className }: { stages: FirmDashboard["pipeline"]; className?: string }) {
  const safeStages = stages ?? [];
  const total = safeStages.reduce((sum, stage) => sum + stage.count, 0);

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader>
        <CardTitle>Work Pipeline</CardTitle>
        <CardDescription>{total} task(s) in flight, across {safeStages.length} stages.</CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          {safeStages.map((stage, index) => (
            <div key={stage.key} className="flex flex-col items-center gap-2 min-w-[8rem]">
              <Link
                href="/tasks"
                title={stage.statuses.map(humanise).join(", ")}
                className={cn(
                  "flex-1 rounded-xl p-3 text-center border",
                  PIPELINE_COLOURS[index % PIPELINE_COLOURS.length],
                  "hover:border-primary/50 transition-colors",
                )}
              >
                <span className="tabular text-2xl font-bold text-foreground">
                  {stage.count}
                </span>
                <span className="mt-1 text-xs font-medium text-muted-foreground leading-tight">
                  {stage.label}
                </span>
              </Link>
              {index < safeStages.length - 1 && (
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function FinancialOverview({ financials }: { financials: FirmDashboard["financials"] }) {
  if (!financials) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Financial Overview</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-64">
          <EmptyState title="No financial data" description="Financial figures are not available yet." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Financial Overview</CardTitle>
        <CardDescription>{`${financials.period_label} · outstanding is as at today`}</CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        <div className="grid grid-cols-2 gap-4">
          <div className={cn(
            "rounded-xl p-4 ring-1 ring-inset border-emerald-200/50 bg-emerald-50/50 transition-colors hover:bg-emerald-100/50",
          )}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded bg-emerald-500/20 flex items-center justify-center text-emerald-600">
                <Receipt className="h-3 w-3" />
              </div>
              <p className="text-xs font-medium text-emerald-800">Fees Invoiced</p>
            </div>
            <p className="tabular text-lg font-bold text-foreground">
              {formatMoney(financials.fees_invoiced)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {financials.invoice_count} invoice(s)
            </p>
          </div>
          <div className={cn(
            "rounded-xl p-4 ring-1 ring-inset border-blue-200/50 bg-blue-50/50 transition-colors hover:bg-blue-100/50",
          )}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded bg-blue-500/20 flex items-center justify-center text-blue-600">
                <PiggyBank className="h-3 w-3" />
              </div>
              <p className="text-xs font-medium text-blue-800">Fees Collected</p>
            </div>
            <p className="tabular text-lg font-bold text-foreground">
              {formatMoney(financials.fees_collected)}
            </p>
          </div>
          <div className={cn(
            "rounded-xl p-4 ring-1 ring-inset border-rose-200/50 bg-rose-50/50 transition-colors hover:bg-rose-100/50",
          )}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded bg-rose-500/20 flex items-center justify-center text-rose-600">
                <Clock className="h-3 w-3" />
              </div>
              <p className="text-xs font-medium text-rose-800">Outstanding</p>
            </div>
            <p className="tabular text-lg font-bold text-foreground">
              {formatMoney(financials.outstanding_total)}
            </p>
            {financials.overdue_total > 0 && (
              <p className="text-[11px] text-rose-700 mt-1">
                {formatMoney(financials.overdue_total)} overdue
              </p>
            )}
          </div>
          <div className={cn(
            "rounded-xl p-4 ring-1 ring-inset border-amber-200/50 bg-amber-50/50 transition-colors hover:bg-amber-100/50",
          )}>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded bg-amber-500/20 flex items-center justify-center text-amber-600">
                <FileText className="h-3 w-3" />
              </div>
              <p className="text-xs font-medium text-amber-800">Unbilled Work</p>
            </div>
            <p className="tabular text-lg font-bold text-foreground">
              {formatMoney(financials.unbilled_value)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {financials.unbilled_task_count} completed task(s)
            </p>
          </div>
        </div>
        {financials.notes.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <ul className="space-y-1 text-[11px] text-muted-foreground">
              {financials.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClientPortfolio({ portfolio }: { portfolio: FirmDashboard["portfolio"] }) {
  const p = portfolio ?? {};
  const items = [
    { icon: Users, label: "Active Clients", value: p.clients_active ?? 0, tone: "bg-blue-50 text-blue-600 border-blue-100" },
    { icon: Building2, label: "Active Engagements", value: p.engagements_active ?? 0, tone: "bg-indigo-50 text-indigo-600 border-indigo-100" },
    { icon: User, label: "New Clients (FY)", value: p.new_clients_this_fy ?? 0, tone: "bg-violet-50 text-violet-600 border-violet-100" },
    { icon: Clock, label: "Inactive Clients", value: p.clients_inactive ?? 0, tone: "bg-muted/50 text-muted-foreground border-border/30" },
  ];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Client Portfolio</CardTitle>
        <CardDescription>{`${p.clients_total ?? 0} client(s) on the books.`}</CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-xl p-4 border border-border/30 bg-muted/30">
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg mb-2", item.tone)}>
                  <Icon className="h-4 w-4" />
                </div>
                <p className="tabular text-lg font-bold text-foreground">{item.value}</p>
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function TeamWorkload({ rows }: { rows: FirmDashboard["workload"] }) {
  const top = [...(rows ?? [])]
    .sort((a, b) => b.utilisation_percent - a.utilisation_percent)
    .slice(0, 6);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Team Workload</CardTitle>
        <CardDescription>Utilisation is complexity-weighted effort, not a task count.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {top.length === 0 ? (
          <div className="p-6 flex flex-col items-center justify-center text-center">
            <Users className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No staff to show.</p>
          </div>
        ) : (
          <div className="divide-y divide-hsl(var(--border))">
            {top.map((row) => {
              const tone = utilisationTone(row.utilisation_percent);
              const color =
                tone === "danger" ? "text-rose-600" :
                tone === "warning" ? "text-amber-600" :
                tone === "success" ? "text-emerald-600" :
                "text-muted-foreground";
              return (
                <div key={row.user_id} className="flex items-center gap-3 px-6 py-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground font-semibold text-xs">
                    {row.full_name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{row.full_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {row.open_tasks} open
                      {row.overdue_tasks > 0 && (
                        <span className="text-rose-600 ml-1">· {row.overdue_tasks} overdue</span>
                      )}
                    </p>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30 mt-1">
                      <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(Math.max(row.utilisation_percent, 0), 100)}%`,
                        backgroundColor:
                          tone === "danger"
                            ? "hsl(var(--destructive))"
                            : tone === "warning"
                              ? "hsl(var(--brand-warning))"
                              : tone === "success"
                                ? "hsl(var(--brand-success))"
                                : "hsl(var(--muted-foreground))",
                      }}
                    />
                    </div>
                  </div>
                  <span className="tabular text-xs font-medium text-foreground shrink-0">
                    {formatPercent(row.utilisation_percent)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Link href="/team" className="text-sm text-primary hover:underline flex items-center gap-1">
          View team <ArrowRight className="h-3 w-3" />
        </Link>
      </CardFooter>
    </Card>
  );
}

function RecentActivity({ rows }: { rows: FirmDashboard["recent_activity"] }) {
  const top = (rows ?? []).slice(0, 6);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Append-only record of what happened in your firm.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {top.length === 0 ? (
          <div className="p-6 flex flex-col items-center justify-center text-center">
            <Activity className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-hsl(var(--border))">
            {top.map((row) => (
              <div key={row.id} className="flex items-start gap-3 px-6 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground shrink-0">
                  <Activity className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">
                    {row.summary ?? `${humanise(row.action)} on ${humanise(row.entity_type)}`}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {row.actor_label ?? "System"}
                    {row.entity_label ? ` · ${row.entity_label}` : ""}
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {formatRelative(row.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Link href="/reports" className="text-sm text-primary hover:underline flex items-center gap-1">
          View all activity <ArrowRight className="h-3 w-3" />
        </Link>
      </CardFooter>
    </Card>
  );
}
