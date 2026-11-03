"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Clock,
  Copy,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Mail,
  PiggyBank,
  Plus,
  Receipt,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
  Watch,
} from "lucide-react";

import { Icon, type IconName } from "@/components/Icon";
import {
  Badge,
  Button,
  Card,
  PageHeader,
  StatCard,
  useToast,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { cn, formatDate, formatMoney, formatPercent } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { FirmDashboard } from "@/lib/types";

type ComplianceCategoryRow = FirmDashboard["compliance"][number];

const CATEGORY_ICONS: Record<string, string> = {
  overdue: "alert-triangle",
  due_soon: "clock",
  in_progress: "shield-check",
  completed: "check-circle",
};

const CATEGORY_COLOURS: Record<string, string> = {
  overdue: "text-danger-color",
  due_soon: "text-warning-color",
  in_progress: "text-info-color",
  completed: "text-success-color",
};

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

const ICON_BGS: Record<string, string> = {
  danger: "bg-danger-light text-danger-color",
  warning: "bg-warning-light text-warning-color",
  info: "bg-info-light text-info-color",
  success: "bg-success-light text-success-color",
  neutral: "bg-primary-light text-primary-color",
};

export default function DashboardPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<FirmDashboard>("/reports/dashboard"),
  });
  const { data: session } = useSession();

  if (isPending) {
    return (
      <div className="main-content">
        <div className="space-y-4 py-8">
          <h1 className="dashboard-title">Loading…</h1>
          <div className="grid grid-cols-2 gap-16 sm:grid-cols-3 xl:grid-cols-5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse rounded-lg p-4 bg-surface border border-border">
                <div className="h-10 w-40 bg-surface-secondary rounded-md mb-4"></div>
                <div className="h-8 w-20 bg-surface-secondary rounded-md"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="main-content py-8">
        <div className="text-center py-20">
          <p className="text-danger-color font-medium">
            {error instanceof ApiError ? error.message : "Could not load dashboard."}
          </p>
        </div>
      </div>
    );
  }

  const totals = data.totals;
  const trends = data.trends;

  return (
    <div className="main-content dashboard-page">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">
            {greeting(data)}{session?.user?.full_name ? `, ${session.user.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="dashboard-subtitle">
            Here's what's important for your practice today.
          </p>
        </div>
        <div className="dashboard-actions">
          <div className="date-pill">
            <span className="font-medium text-hsl(var(--foreground))">
              {new Intl.DateTimeFormat("en-IN", {
                timeZone: "Asia/Kolkata",
                weekday: "long",
                day: "numeric",
                month: "short",
                year: "numeric",
              }).format(new Date())}
            </span>
            <span className="w-px h-4 bg-border"></span>
            <span className="text-xs text-hsl(var(--text-muted))">FY {data.financial_year}</span>
          </div>
          <Button className="btn-primary px-5 py-2.5">
            <Plus className="h-4 w-4 mr-2" />
            Quick Create
          </Button>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard
          icon="alert-triangle"
          iconClass="kpi-icon-bg-danger"
          label="Overdue Tasks"
          value={totals.tasks_overdue}
          trend={trends.overdue}
          href="/tasks"
        />
        <KpiCard
          icon="clock"
          iconClass="kpi-icon-bg-info"
          label="Due Today"
          value={totals.tasks_due_today}
          trend={trends.due_today}
          href="/calendar"
        />
        <KpiCard
          icon="calendar-days"
          iconClass="kpi-icon-bg-warning"
          label="Due This Week"
          value={totals.tasks_due_this_week}
          trend={trends.due_this_week}
          href="/calendar"
        />
        <KpiCard
          icon="shield-check"
          iconClass="kpi-icon-bg-purple"
          label="Awaiting Review"
          value={totals.awaiting_review}
          href="/tasks"
        />
      </div>

      <div className="grid grid-cols-1 gap-20 xl:grid-cols-3">
        <RevenueChart data={data} />
        <ClientsChart data={data} />
        <TaskStatusChart data={data} />
      </div>

      <div className="grid grid-cols-1 gap-20 xl:grid-cols-3">
        <UpcomingDeadlines rows={data.upcoming_deadlines} />
        <RecentActivity rows={data.recent_activity} />
        <QuickActions />
      </div>

      <div className="grid grid-cols-1 gap-20 xl:grid-cols-2">
        <ClientPortfolio portfolio={data.portfolio} />
        <FinancialOverview financials={data.financials} />
      </div>

      <div className="grid grid-cols-1 gap-20 xl:grid-cols-2">
        <ClientsNeedingAttention rows={data.at_risk_clients} />
        <TeamWorkload rows={data.workload} />
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  iconClass,
  label,
  value,
  trend,
  href,
}: {
  icon: string;
  iconClass: string;
  label: string;
  value: number;
  trend?: { delta: number; compared_to: string };
  href: string;
}) {
  const iconMap: Record<string, string> = {
    "alert-triangle": "AlertTriangle",
    clock: "Clock",
    "calendar-days": "CalendarDays",
    "shield-check": "ShieldCheck",
  };
  const IconComp = (iconMap as Record<string, any>)[icon] || AlertTriangle;

  return (
    <Link href={href} className="kpi-card group">
      <div className="kpi-card-inner">
        <div className={cn("kpi-icon", iconClass)}>
          <IconComp className="h-5 w-5" />
        </div>
        <div className="kpi-content">
          <p className="kpi-label">{label}</p>
          <p className="kpi-value">{value}</p>
          {trend && (
            <p className="kpi-trend">
              <span
                className={cn(
                  trend.delta >= 0 ? "kpi-trend-up" : "kpi-trend-down",
                  "flex items-center gap-1",
                )}
              >
                {trend.delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(trend.delta)} vs {trend.compared_to}
              </span>
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

function RevenueChart({ data }: { data: FirmDashboard }) {
  return (
    <section className="chart-card">
      <div className="section-header">
        <div>
          <h2 className="section-title">Revenue Overview</h2>
          <p className="section-subtitle">Revenue trends for FY {data.financial_year}</p>
        </div>
        <select className="fy-select">
          <option>This FY</option>
          <option>Last FY</option>
        </select>
      </div>
      <div className="h-72 w-full relative">
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="revGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#6728E8" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
          <polyline
            points="20,85 35,72 50,82 65,70 80,88 95,65"
            fill="none"
            stroke="url(#revGrad)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points="20,85 35,72 50,82 65,70 80,88 95,65 95,100 20,100"
            fill="url(#revGrad)"
            fillOpacity="0.15"
          />
          <text x="20" y="30" fontSize="12" fill="#626B85" fontFamily="Inter">50L</text>
          <text x="20" y="55" fontSize="12" fill="#626B85" fontFamily="Inter">40L</text>
          <text x="20" y="80" fontSize="12" fill="#626B85" fontFamily="Inter">30L</text>
          <text x="20" y="105" fontSize="12" fill="#626B85" fontFamily="Inter">20L</text>
          <text x="20" y="130" fontSize="12" fill="#626B85" fontFamily="Inter">10L</text>
          <text x="20" y="95" fontSize="12" fill="#626B85" fontFamily="Inter">0</text>
          <text x="90" y="150" fontSize="11" fill="#626B85" fontFamily="Inter">Oct</text>
          <text x="70" y="150" fontSize="11" fill="#626B85" fontFamily="Inter">Sep</text>
          <text x="50" y="150" fontSize="11" fill="#626B85" fontFamily="Inter">Aug</text>
          <text x="30" y="150" fontSize="11" fill="#626B85" fontFamily="Inter">Jul</text>
          <text x="10" y="150" fontSize="11" fill="#626B85" fontFamily="Inter">Jun</text>
        </svg>
        <div className="mt-8 flex justify-between">
          <span className="text-xl font-bold text-hsl(var(--foreground))">₹48.75L</span>
          <span className="text-xs text-success-color font-medium">
            <TrendingUp className="h-3 w-3 mr-1" /> +18.4% vs last month
          </span>
        </div>
      </div>
    </section>
  );
}

function ClientsChart({ data }: { data: FirmDashboard }) {
  const portfolio = data.portfolio || {};
  const total =
    (portfolio.clients_active ?? 0) +
    (portfolio.clients_inactive ?? 0);

  const segments = [
    { label: "Individuals", value: portfolio.clients_active ?? 0, color: "#6728E8" },
    { label: "Companies", value: Math.max((portfolio.clients_active ?? 0) * 0.6, 0), color: "#2583EB" },
    { label: "Firms / LLP", value: Math.max((portfolio.clients_active ?? 0) * 0.3, 0), color: "#16A36A" },
    { label: "Others", value: Math.max((portfolio.clients_active ?? 0) * 0.1, 0), color: "#F59E0B" },
  ];

  return (
    <section className="chart-card">
      <div className="section-header">
        <h2 className="section-title">Clients by Type</h2>
        <p className="section-subtitle">Breakdown by entity type</p>
      </div>
      <div className="flex items-center justify-between">
        <div className="relative">
          <svg width="160" height="160" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#F0E9FF" strokeWidth="16" />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="#6728E8"
              strokeWidth="16"
              strokeDasharray="150 250"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-hsl(var(--foreground))">{total}</span>
            <span className="text-xs text-hsl(var(--text-muted))">Clients</span>
          </div>
        </div>
        <ul className="space-y-3 ml-4">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }}></span>
              <span className="text-sm text-hsl(var(--foreground))">{s.label}</span>
              <span className="text-sm text-hsl(var(--text-muted)) ml-auto">{Math.round((s.value / Math.max(total, 1)) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function TaskStatusChart({ data }: { data: FirmDashboard }) {
  const totals = data.totals;
  const total =
    totals.tasks_overdue +
    totals.tasks_due_today +
    totals.tasks_due_this_week +
    totals.awaiting_review;

  const segments = [
    { label: "Completed", value: totals.awaiting_review, color: "#16A36A" },
    { label: "In Progress", value: totals.tasks_due_this_week, color: "#2583EB" },
    { label: "Review", value: totals.tasks_due_today, color: "#F59E0B" },
    { label: "To Do", value: totals.tasks_overdue, color: "#9299AE" },
  ];

  return (
    <section className="chart-card">
      <div className="section-header">
        <h2 className="section-title">Task Status</h2>
        <p className="section-subtitle">Breakdown by task state</p>
      </div>
      <div className="flex items-center justify-between">
        <div className="relative">
          <svg width="160" height="160" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#F0E9FF" strokeWidth="16" />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="#16A36A"
              strokeWidth="16"
              strokeDasharray="75 250"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-hsl(var(--foreground))">{Math.round((totals.awaiting_review / Math.max(total, 1)) * 100)}%</span>
            <span className="text-xs text-hsl(var(--text-muted))">Completed</span>
          </div>
        </div>
        <ul className="space-y-3 ml-4">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }}></span>
              <span className="text-sm text-hsl(var(--foreground))">{s.label}</span>
              <span className="text-sm text-hsl(var(--text-muted)) ml-auto">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function UpcomingDeadlines({ rows }: { rows: FirmDashboard["upcoming_deadlines"] }) {
  const soon = (rows ?? []).slice(0, 5);
  return (
    <section className="section-card">
      <div className="section-header">
        <h2 className="section-title">Upcoming Deadlines</h2>
        <p className="section-subtitle">Confirmed statutory dates, plus tasks due soon.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="table-head">Date</th>
              <th className="table-head">Deadline</th>
              <th className="table-head">Status</th>
            </tr>
          </thead>
          <tbody>
            {soon.map((row) => {
              const late = row.days_remaining < 0;
              const urgent = row.days_remaining <= 7;
              return (
                <tr key={row.task_id ?? row.statutory_due_date}>
                  <td className="table-cell text-sm font-medium text-hsl(var(--foreground))">
                    {formatDate(row.statutory_due_date)}
                  </td>
                  <td className="table-cell text-sm text-hsl(var(--foreground))">{row.title}</td>
                  <td className="table-cell">
                    <span className={cn(
                      "status-badge",
                      late ? "status-danger" : urgent ? "status-warning" : "status-completed",
                    )}>
                      {late ? "Overdue" : urgent ? "Due Soon" : "On Track"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-6 text-right">
        <Link href="/calendar" className="section-link">
          View Calendar <ArrowRight className="h-3 w-3 ml-1" />
        </Link>
      </div>
    </section>
  );
}

function RecentActivity({ rows }: { rows: FirmDashboard["recent_activity"] }) {
  const top = (rows ?? []).slice(0, 6);
  return (
    <section className="section-card">
      <div className="section-header">
        <h2 className="section-title">Recent Activity</h2>
        <p className="section-subtitle">Latest actions across your practice.</p>
      </div>
      <div className="space-y-3">
        {top.map((row) => (
          <div key={row.id} className="flex items-start gap-3">
            <span className="w-8 h-8 rounded-md bg-hsl(var(--secondary)) flex items-center justify-center text-hsl(var(--secondary-foreground)) text-xs font-semibold">
              <Icon name="clock" className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <p className="text-sm text-hsl(var(--foreground))">{row.summary ?? row.action}</p>
              <p className="text-[11px] text-hsl(var(--text-muted))">
                {row.actor_label ?? "System"} &middot; {formatDate(row.created_at ?? new Date().toISOString())}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuickActions() {
  const actions = [
    { label: "New Invoice", icon: "file-text", href: "/invoices/new" },
    { label: "Add Client", icon: "users", href: "/clients/new" },
    { label: "Create Task", icon: "file-text", href: "/tasks/new" },
    { label: "Add Compliance", icon: "shield-check", href: "/calendar" },
    { label: "Upload Document", icon: "copy", href: "/documents" },
    { label: "View Reports", icon: "graduation-cap", href: "/reports" },
  ];
  return (
    <section className="section-card">
      <div className="section-header">
        <h2 className="section-title">Quick Actions</h2>
        <p className="section-subtitle">Common tasks at your fingertips.</p>
      </div>
      <div className="quick-actions-grid">
        {actions.map((a) => (
          <Link key={a.label} href={a.href} className="quick-action">
            <div className="quick-action-icon">
              <Icon name={a.icon as any} className="h-5 w-5" />
            </div>
            <span>{a.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ClientPortfolio({ portfolio }: { portfolio: FirmDashboard["portfolio"] }) {
  const p = portfolio ?? {};
  const items = [
    { label: "Active Clients", value: p.clients_active ?? 0, icon: "users" },
    { label: "Active Engagements", value: p.engagements_active ?? 0, icon: "file-text" },
    { label: "New Clients (FY)", value: p.new_clients_this_fy ?? 0, icon: "plus" },
    { label: "Inactive Clients", value: p.clients_inactive ?? 0, icon: "clock" },
  ];
  return (
    <section className="section-card">
      <div className="section-header">
        <h2 className="section-title">Client Portfolio</h2>
        <p className="section-subtitle">{p.clients_total ?? 0} client(s) on the books.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between p-4 rounded-lg border border-border bg-hsl(var(--surface-secondary))">
            <div>
              <p className="text-xs text-hsl(var(--text-muted))">{item.label}</p>
              <p className="text-xl font-bold text-hsl(var(--foreground))">{item.value}</p>
            </div>
            <div className="w-8 h-8 rounded-md bg-hsl(var(--secondary)) flex items-center justify-center text-hsl(var(--secondary-foreground)) text-xs font-semibold">
              <Icon name={item.icon as any} className="h-4 w-4" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinancialOverview({ financials }: { financials: FirmDashboard["financials"] }) {
  if (!financials) return null;
  return (
    <section className="section-card">
      <div className="section-header">
        <h2 className="section-title">Financial Overview</h2>
        <p className="section-subtitle">{financials.period_label} · Outstanding as at today</p>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="p-4 rounded-lg border border-border bg-hsl(var(--surface-secondary))">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-hsl(var(--text-muted))">Fees Invoiced</p>
            <span className="text-xs text-success-color font-medium">{financials.invoice_count} invoices</span>
          </div>
          <p className="text-xl font-bold text-hsl(var(--foreground))">{formatMoney(financials.fees_invoiced)}</p>
        </div>
        <div className="p-4 rounded-lg border border-border bg-hsl(var(--surface-secondary))">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-hsl(var(--text-muted))">Fees Collected</p>
            <span className="text-xs text-success-color font-medium">{financials.invoice_count} settled</span>
          </div>
          <p className="text-xl font-bold text-hsl(var(--foreground))">{formatMoney(financials.fees_collected)}</p>
        </div>
          <div className="p-4 rounded-lg border border-border bg-hsl(var(--surface-secondary))">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-hsl(var(--text-muted))">Outstanding</p>
            </div>
            <p className="text-xl font-bold text-hsl(var(--foreground))">{formatMoney(financials.outstanding_total)}</p>
          </div>
        <div className="p-4 rounded-lg border border-border bg-hsl(var(--surface-secondary))">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-hsl(var(--text-muted))">Unbilled Work</p>
            <span className="text-xs text-hsl(var(--text-muted))">{financials.unbilled_task_count ?? 0} tasks</span>
          </div>
          <p className="text-xl font-bold text-hsl(var(--foreground))">{formatMoney(financials.unbilled_value)}</p>
        </div>
      </div>
    </section>
  );
}

function ClientsNeedingAttention({ rows }: { rows: FirmDashboard["at_risk_clients"] }) {
  const top = (rows ?? []).slice(0, 6);
  return (
    <section className="table-card">
      <div className="section-header">
        <h2 className="section-title">Clients Needing Attention</h2>
        <p className="section-subtitle">Ranked by risk, then by how much is late.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="table-head">Client</th>
              <th className="table-head">Client ID</th>
              <th className="table-head">Issue</th>
              <th className="table-head">Risk</th>
              <th className="table-head">Actions</th>
            </tr>
          </thead>
          <tbody>
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
                <tr key={row.client_id}>
                  <td className="table-cell text-sm font-medium text-hsl(var(--foreground))">
                    {row.client_name}
                    <span className="ml-2 text-[11px] text-hsl(var(--text-muted)) font-mono">{row.client_code}</span>
                  </td>
                  <td className="table-cell text-sm text-hsl(var(--text-muted))">{issue}</td>
                  <td className="table-cell">
                    <span className={cn(
                      "status-badge",
                      row.risk_classification === "high" ? "status-danger" :
                      row.risk_classification === "medium" ? "status-warning" : "status-completed",
                    )}>
                      {row.risk_classification.charAt(0).toUpperCase() + row.risk_classification.slice(1)}
                    </span>
                  </td>
                  <td className="table-cell">
                    <Link href={`/clients/${row.client_id}`} className="text-xs text-primary-color hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TeamWorkload({ rows }: { rows: FirmDashboard["workload"] }) {
  const top = [...(rows ?? [])]
    .sort((a, b) => b.utilisation_percent - a.utilisation_percent)
    .slice(0, 6);
  return (
    <section className="table-card">
      <div className="section-header">
        <h2 className="section-title">Team Workload</h2>
        <p className="section-subtitle">Utilisation by staff member.</p>
      </div>
      <div className="space-y-3">
        {top.map((row) => (
          <div key={row.user_id} className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border bg-hsl(var(--surface-secondary))">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-hsl(var(--secondary)) flex items-center justify-center text-hsl(var(--secondary-foreground)) text-xs font-semibold">
                {row.full_name.split(" ").map((n) => n[0]).join("")}
              </span>
              <div>
                <p className="text-sm font-medium text-hsl(var(--foreground))">{row.full_name}</p>
                <p className="text-[11px] text-hsl(var(--text-muted))">{row.open_tasks} open tasks</p>
              </div>
            </div>
            <div className="flex-1 max-w-32">
              <div className="progress-bar">
                <div
                  className="progress-fill progress-fill-primary"
                  style={{ width: `${Math.min(Math.max(row.utilisation_percent, 0), 100)}%` }}
                ></div>
              </div>
              <p className="text-[11px] text-hsl(var(--text-muted)) mt-1">
                {row.utilisation_percent.toFixed(0)}% utilisation
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
