"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Icon, type IconName } from "@/components/Icon";
import { Avatar, DonutChart, type DonutSegment } from "@/components/charts";
import { Badge, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { formatMoney, formatPercent, formatRelative, humanise } from "@/lib/format";
import { riskTone } from "@/lib/status";
import { useSession } from "@/lib/session";
import type { FirmDashboard } from "@/lib/types";

type ComplianceRow = FirmDashboard["compliance"][number];

const card =
  "rounded-2xl border border-[#E3E5F4] bg-white shadow-[0_3px_12px_rgba(40,42,90,.045)]";
const title = "text-[15px] font-bold tracking-[-.025em] text-[#171A32]";
const sub = "text-[11px] text-[#747B98]";

function SectionTitle({
  icon,
  name,
  description,
  href,
  action = "View all",
}: {
  icon: IconName;
  name: string;
  description?: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#EEF0F7] p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#F1ECFF] text-[#6D3AE8]">
          <Icon name={icon} />
        </span>
        <div className="min-w-0">
          <h2 className={title}>{name}</h2>
          {description && <p className={`mt-0.5 truncate ${sub}`}>{description}</p>}
        </div>
      </div>
      {href && (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#E3E2F2] px-2.5 py-1.5 text-[10px] font-semibold text-[#303653] transition hover:border-[#C9B9FA] hover:bg-[#F8F5FF]"
        >
          {action} <Icon name="chevron-right" />
        </Link>
      )}
    </div>
  );
}

function dateLabel() {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());
}

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function StatCard({
  icon,
  label,
  value,
  hint,
  href,
  colour,
}: {
  icon: IconName;
  label: string;
  value: number;
  hint?: string;
  href: string;
  colour: "rose" | "orange" | "blue" | "violet" | "green";
}) {
  const styles = {
    rose: { icon: "bg-rose-100 text-rose-600", line: "#F28BBF", tint: "from-rose-50/80" },
    orange: { icon: "bg-orange-100 text-orange-600", line: "#FFB66D", tint: "from-orange-50/80" },
    blue: { icon: "bg-blue-100 text-blue-600", line: "#70B5FF", tint: "from-blue-50/80" },
    violet: { icon: "bg-violet-100 text-violet-600", line: "#B69AFF", tint: "from-violet-50/80" },
    green: { icon: "bg-emerald-100 text-emerald-600", line: "#67D6C8", tint: "from-emerald-50/80" },
  }[colour];

  return (
    <Link
      href={href}
      className={`relative min-h-[104px] overflow-hidden rounded-2xl border border-[#E6E6F2] bg-gradient-to-br ${styles.tint} to-white p-4 shadow-[0_3px_10px_rgba(40,42,90,.035)] transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      <div className="relative z-10 flex items-start gap-3">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${styles.icon}`}>
          <Icon name={icon} />
        </span>
        <div className="min-w-0 pt-1">
          <p className="text-xs font-semibold text-[#343A58]">{label}</p>
          <p className="mt-1 text-[27px] font-bold leading-none tracking-[-.04em] text-[#11162F]">
            {value.toLocaleString("en-IN")}
          </p>
          {hint && <p className="mt-1 text-[9px] text-[#737A96]">{hint}</p>}
        </div>
      </div>
      <svg className="absolute -bottom-1 right-2 h-9 w-28 opacity-80" viewBox="0 0 112 36" fill="none" aria-hidden="true">
        <path d="M1 29 C15 30 17 17 30 20 S48 27 61 17 S78 22 91 11 S103 12 111 4" stroke={styles.line} strokeWidth="2" strokeLinecap="round" />
      </svg>
    </Link>
  );
}

function MiniBarChart({ stages }: { stages: FirmDashboard["pipeline"] }) {
  const values = (stages ?? []).slice(0, 7);
  const max = Math.max(1, ...values.map((v) => v.count));
  return (
    <div className="flex h-[155px] items-end justify-around gap-3 p-4">
      {values.map((stage, index) => (
        <Link key={stage.key} href="/tasks" className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
          <span className="text-[10px] font-semibold text-[#59617D]">{stage.count}</span>
          <div className="flex h-[105px] w-full items-end justify-center">
            <div
              className={`w-full max-w-10 rounded-t-md transition-all group-hover:brightness-95 ${
                index === 1 ? "bg-gradient-to-t from-[#6D3AE8] to-[#9D7CF6]" : "bg-[#DCD3FF]"
              }`}
              style={{ height: `${Math.max(stage.count > 0 ? 12 : 3, (stage.count / max) * 100)}%` }}
            />
          </div>
          <span className="max-w-full truncate text-[9px] text-[#737A96]">{stage.label}</span>
        </Link>
      ))}
    </div>
  );
}

function TaskStatusBars({ rows }: { rows: ComplianceRow[] }) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.overdue += row.overdue;
      acc.dueSoon += row.due_soon;
      acc.inProgress += row.in_progress;
      acc.completed += row.completed;
      return acc;
    },
    { overdue: 0, dueSoon: 0, inProgress: 0, completed: 0 },
  );
  const all = totals.overdue + totals.dueSoon + totals.inProgress + totals.completed;
  const entries = [
    { label: "In Progress", value: totals.inProgress, colour: "bg-blue-500", dot: "bg-blue-500" },
    { label: "Due Soon", value: totals.dueSoon, colour: "bg-amber-400", dot: "bg-amber-400" },
    { label: "Overdue", value: totals.overdue, colour: "bg-rose-500", dot: "bg-rose-500" },
    { label: "Completed", value: totals.completed, colour: "bg-emerald-500", dot: "bg-emerald-500" },
  ];
  return (
    <div className="space-y-4 p-4">
      {entries.map((entry) => {
        const pct = all ? (entry.value / all) * 100 : 0;
        return (
          <div key={entry.label} className="grid grid-cols-[minmax(90px,1fr)_28px_minmax(70px,1fr)_32px] items-center gap-2">
            <span className="flex items-center gap-2 text-[11px] font-medium text-[#303653]">
              <i className={`h-2.5 w-2.5 rounded-full ${entry.dot}`} />
              {entry.label}
            </span>
            <span className="text-right text-[11px] font-bold text-[#252B47]">{entry.value}</span>
            <div className="h-2 overflow-hidden rounded-full bg-[#E9EAF3]">
              <div className={`h-full rounded-full ${entry.colour}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-right text-[10px] text-[#737A96]">{Math.round(pct)}%</span>
          </div>
        );
      })}
    </div>
  );
}

function CompliancePanel({ rows }: { rows: ComplianceRow[] }) {
  const first = rows?.[0];
  if (!rows?.length || !first) {
    return <section className={`${card} p-4`}><h2 className={title}>Compliance Summary</h2><EmptyState message="No work has been generated yet." /></section>;
  }

  const segments: DonutSegment[] = [
    { key: "overdue", label: "Overdue", value: first.overdue, className: "stroke-rose-500" },
    { key: "due_soon", label: "Due Soon", value: first.due_soon, className: "stroke-amber-400" },
    { key: "in_progress", label: "In Progress", value: first.in_progress, className: "stroke-sky-500" },
    { key: "completed", label: "Completed", value: first.completed, className: "stroke-emerald-500" },
  ];
  const completion = first.total ? (first.completed / first.total) * 100 : 0;

  return (
    <section className={`${card} p-4`}>
      <SectionTitle icon="documents" name="Compliance Summary" description="Work by service category, counted at read time." href="/tasks" action="View tasks" />
      <div className="flex flex-wrap gap-2 mb-4">
        {rows.map((row, index) => (
          <span key={row.category} className={`rounded-full px-3 py-1 text-[11px] font-semibold ${index === 0 ? "bg-gradient-to-r from-[#7948EC] to-[#6031DA] text-white shadow-sm" : "bg-[#F3F3FA] text-[#343A58]"}`}>
            {row.label} <b className="ml-1">{row.total}</b>
          </span>
        ))}
      </div>
      <div className="flex justify-center min-w-[200px]">
        <DonutChart segments={segments} total={first.total} totalLabel={`Total ${first.label} tasks`} size={160} />
      </div>
    </section>
  );
}

function DeadlinesPanel({ rows }: { rows: FirmDashboard["upcoming_deadlines"] }) {
  const soon = (rows ?? []).slice(0, 5);
  return (
    <section className={`${card} p-4`}>
      <SectionTitle icon="calendar" name="Upcoming Deadlines" description="Confirmed statutory dates, plus tasks due soon." href="/calendar" action="View calendar" />
      <div className="mt-2">
        {soon.length === 0 ? <EmptyState message="Nothing due in the next two weeks." /> : soon.map((row) => {
          const late = row.days_remaining < 0;
          return (
            <Link key={row.task_id ?? `${row.client_id}-${row.statutory_due_date}`} href={row.task_id ? `/tasks/${row.task_id}` : "/calendar"} className="flex items-center gap-3 border-b border-[#EEF0F6] py-2.5 last:border-0">
              <span className="grid h-10 w-11 shrink-0 place-content-center rounded-lg bg-[#F0ECFF] text-center text-[#5130C4]">
                <b className="text-sm leading-none">{Number(row.statutory_due_date.slice(8, 10))}</b>
                <small className="mt-1 text-[8px] font-bold uppercase">{new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date(`${row.statutory_due_date.slice(0, 10)}T00:00:00Z`))}</small>
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[11px] text-[#252B47]">{row.title}</b>
                <small className="mt-0.5 block truncate text-[10px] text-[#7C829B]">{row.client_name}{!row.verified && " · date unconfirmed"}</small>
              </span>
              <Badge tone={late ? "danger" : row.days_remaining <= 7 ? "warning" : "success"}>{late ? `${Math.abs(row.days_remaining)}d late` : row.days_remaining === 0 ? "Due today" : "On track"}</Badge>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function TasksOverview({ stages }: { stages: FirmDashboard["pipeline"] }) {
  return (
    <section className={`${card} p-4`}>
      <SectionTitle icon="check-circle" name="Tasks Overview" description="Task status across your practice" href="/tasks" action="View tasks" />
      <div className="mt-2"><MiniBarChart stages={stages} /></div>
    </section>
  );
}

function WorkPipelinePanel({ rows }: { rows: ComplianceRow[] }) {
  return (
    <section className={`${card} p-4`}>
      <SectionTitle icon="check-circle" name="Task Status" description="Overall task distribution" href="/tasks" action="View all" />
      <div className="mt-2"><TaskStatusBars rows={rows ?? []} /></div>
    </section>
  );
}

function QuickActions() {
  const actions = [
    { label: "New Client", icon: "clients" as IconName, href: "/clients/new" },
    { label: "Create Task", icon: "check-square" as IconName, href: "/tasks/new" },
    { label: "New Invoice", icon: "file-text" as IconName, href: "/invoices/new" },
    { label: "Upload Document", icon: "upload" as IconName, href: "/documents" },
  ];
  return (
    <section className={`${card} p-4 overflow-hidden`}>
      <div className="flex items-center gap-3 bg-gradient-to-r from-[#FBF9FF] to-[#F0E9FF] p-3">
        <Icon name="check-circle" />
        <h2 className={title}>Quick Actions</h2>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3 p-2 sm:grid-cols-4">
        {actions.map((action) => (
          <Link key={action.label} href={action.href} className="flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-xl border border-[#E6E0FA] bg-white p-3 text-center text-[10px] font-semibold text-[#272D4A] shadow-[0_2px_5px_rgba(70,50,130,.035)] transition hover:-translate-y-0.5 hover:border-[#CDBDFF] hover:bg-[#FBF9FF]">
            <span className="text-[#713EE8]"><Icon name={action.icon} /></span>
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function PortfolioAndFinancial({ portfolio, financials }: { portfolio: FirmDashboard["portfolio"]; financials: FirmDashboard["financials"] }) {
  const p = portfolio ?? {};
  const items = [
    ["Active clients", p.clients_active ?? 0],
    ["Active engagements", p.engagements_active ?? 0],
    ["New clients (FY)", p.new_clients_this_fy ?? 0],
    ["Inactive clients", p.clients_inactive ?? 0],
  ] as const;
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <div className={`${card} p-4`}>
        <SectionTitle icon="clients" name="Client Portfolio" description={`${p.clients_total ?? 0} clients on the books`} href="/clients" />
        <div className="grid grid-cols-2 gap-3 mt-2">
          {items.map(([label, value]) => <div key={label} className="rounded-xl bg-[#F8F8FD] p-3"><p className="text-2xl font-bold text-[#202541]">{value}</p><p className="mt-1 text-[10px] text-[#7C829B]">{label}</p></div>)}
        </div>
      </div>
      <div className={`${card} p-4`}>
        <SectionTitle icon="wallet" name="Financial Overview" description={financials ? `${financials.period_label} · outstanding as at today` : "Financial figures"} href="/receivables" action="View report" />
        {!financials ? <EmptyState message="Financial figures are not available." /> : (
          <div className="grid grid-cols-2 gap-3 mt-2">
            {[
              ["Fees invoiced", formatMoney(financials.fees_invoiced)],
              ["Fees collected", formatMoney(financials.fees_collected)],
              ["Outstanding", formatMoney(financials.outstanding_total)],
              ["Unbilled work", formatMoney(financials.unbilled_value)],
            ].map(([label, value]) => <div key={label} className="rounded-xl bg-[#F8F8FD] p-3"><p className="break-words text-lg font-bold text-[#202541]">{value}</p><p className="mt-1 text-[10px] text-[#7C829B]">{label}</p></div>)}
          </div>
        )}
      </div>
    </section>
  );
}

function AttentionAndTeam({ data }: { data: FirmDashboard }) {
  const clients = (data.at_risk_clients ?? []).slice(0, 5);
  const team = [...(data.workload ?? [])].sort((a, b) => b.utilisation_percent - a.utilisation_percent).slice(0, 5);
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <div className={`${card} p-4`}>
        <SectionTitle icon="alert-circle" name="Clients Needing Attention" description="Ranked by risk, then by how much is late." href="/clients" />
        {clients.length ? clients.map((row) => {
          const issue = row.overdue_tasks > 0 ? `${row.overdue_tasks} overdue task(s)` : row.unverified_deadlines > 0 ? `${row.unverified_deadlines} unconfirmed date(s)` : row.open_document_requests > 0 ? `${row.open_document_requests} document request(s)` : `${row.open_tasks} open task(s)`;
          return <Link key={row.client_id} href={`/clients/${row.client_id}`} className="flex items-center justify-between gap-2 border-b border-[#EEF0F6] py-3 last:border-0"><span className="min-w-0"><b className="block truncate text-xs text-[#292F4C]">{row.client_name}</b><small className="text-[10px] text-[#858BA2]">{issue} · {row.client_code}</small></span><Badge tone={riskTone(row.risk_classification)}>{humanise(row.risk_classification)}</Badge></Link>;
        }) : <EmptyState message="No client needs attention." />}
      </div>
      <div className={`${card} p-4`}>
        <SectionTitle icon="clients" name="Team Workload" description="Complexity-weighted utilisation." href="/team" action="View team" />
        {team.length ? <div className="space-y-4 mt-2">{team.map((row) => <div key={row.user_id} className="flex items-center gap-3"><Avatar name={row.full_name} size="sm" /><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><b className="truncate text-xs text-[#292F4C]">{row.full_name}</b><b className="text-xs text-[#424965]">{formatPercent(row.utilisation_percent)}</b></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#E9EAF3]"><div className="h-full rounded-full bg-[#7545E9]" style={{ width: `${Math.min(100, row.utilisation_percent)}%` }} /></div><small className="text-[10px] text-[#858BA2]">{row.open_tasks} open tasks</small></div></div>)}</div> : <EmptyState message="No staff to show." />}
      </div>
    </section>
  );
}

function RecentActivity({ rows }: { rows: FirmDashboard["recent_activity"] }) {
  const items = (rows ?? []).slice(0, 5);
  return (
    <section className={`${card} p-4`}>
      <SectionTitle icon="history" name="Recent Activity" description="Latest updates across your practice." href="/reports" />
      {items.length ? <div className="grid gap-3 md:grid-cols-2 mt-2">{items.map((row) => <div key={row.id} className="flex items-start gap-3 rounded-xl bg-[#FAFAFE] p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#F0EAFF] text-[#6D3AE8]"><Icon name={activityIcon(row.entity_type)} /></span><div className="min-w-0 flex-1"><p className="text-xs font-medium text-[#303653]">{row.summary ?? `${humanise(row.action)} on ${humanise(row.entity_type)}`}</p><p className="mt-1 text-[10px] text-[#8A90A6]">{row.actor_label ?? "System"}{row.entity_label ? ` · ${row.entity_label}` : ""}</p></div><small className="shrink-0 text-[9px] text-[#9298AA]">{formatRelative(row.created_at)}</small></div>)}</div> : <EmptyState message="Nothing has happened yet." />}
    </section>
  );
}

function activityIcon(entityType: string): IconName {
  switch (entityType) {
    case "task": return "check-circle";
    case "client": return "clients";
    case "document":
    case "document_request": return "file-text";
    case "invoice":
    case "payment": return "file-text";
    case "service": return "check-circle";
    case "user": return "clients";
    default: return "history";
  }
}

export default function DashboardPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<FirmDashboard>("/reports/dashboard"),
  });
  const { data: session } = useSession();

  if (isPending) {
    return <main className="space-y-4"><Skeleton /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className={`${card} p-4`}><Skeleton /><div className="mt-3"><Skeleton /></div></div>)}</div><div className="grid gap-4 xl:grid-cols-2"><div className={`${card} p-4`}><Skeleton /></div><div className={`${card} p-4`}><Skeleton /></div></div></main>;
  }

  if (isError || !data) {
    return <div className="p-4"><ErrorState message={error instanceof ApiError ? error.message : "Could not load the dashboard. Please try again."} /></div>;
  }

  const name = session?.user?.full_name?.split(" ")[0];

  return (
    <main className="min-h-full space-y-4">
      {/* Hero greeting banner */}
      <section className="relative isolate overflow-hidden rounded-2xl border border-[#E7E3FA] bg-gradient-to-r from-[#F5F1FF] via-[#EDE9FF] to-[#DCD8FF] p-4 md:p-5">
        <div className="absolute -right-12 -top-24 -z-10 h-64 w-64 rounded-full bg-white/40 blur-3xl" />
        <div className="absolute right-[18%] top-[-90px] -z-10 h-64 w-64 rounded-full bg-[#A995FF]/25 blur-3xl" />
        <div className="relative max-w-[650px]">
          <h1 className="text-[26px] font-bold tracking-[-.045em] text-[#11162F] md:text-[32px]">
            {greeting()}{name ? "," : ""} <span className="text-[#6B3BE6]">{name || "there"}</span> <span>👋</span>
          </h1>
          <p className="mt-1 text-sm text-[#41496C]">Here&apos;s what&apos;s important for your practice today.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/65 px-3 py-2 text-[10px] font-semibold text-[#303653]"><Icon name="calendar" /> {dateLabel()}</span>
            {data.financial_year && <span className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/65 px-3 py-2 text-[10px] font-semibold text-[#303653]"><Icon name="file-text" /> FY {data.financial_year}</span>}
            <span className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/65 px-3 py-2 text-[10px] font-semibold text-[#303653]"><i className="h-2 w-2 rounded-full bg-emerald-500" /> Updated {formatRelative(data.generated_at)}</span>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-4 bottom-0 -z-10 hidden h-full w-[42%] items-end justify-center opacity-30 lg:flex">
          <svg viewBox="0 0 500 190" className="h-full w-full" fill="none" aria-hidden="true">
            <path d="M130 190V86L245 15L360 86V190" stroke="#7C70C8" strokeWidth="3"/>
            <path d="M160 190V91L245 40L330 91V190M130 112H360M130 145H360M200 65V190M245 40V190M290 65V190" stroke="#7C70C8" strokeWidth="2"/>
            <path d="M20 190L130 86L245 15L360 86L470 190" stroke="#A69BE9" strokeWidth="2"/>
          </svg>
        </div>
      </section>

      {/* Five daily priority cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon="clock" label="Overdue" value={data.totals.tasks_overdue} href="/tasks" colour="rose" />
        <StatCard icon="calendar" label="Due Today" value={data.totals.tasks_due_today} href="/calendar" colour="orange" />
        <StatCard icon="calendar" label="Due This Week" value={data.totals.tasks_due_this_week} href="/calendar" colour="blue" />
        <StatCard icon="check-circle" label="Awaiting Review" value={data.totals.awaiting_review} href="/tasks" colour="violet" />
        <StatCard icon="file-text" label="Missing Documents" value={data.totals.clients_with_missing_documents} hint={`${data.totals.open_document_requests} open request(s)`} href="/documents" colour="green" />
      </section>

      {/* Compliance and deadlines */}
      <section className="grid gap-4 2xl:grid-cols-[1.2fr_0.8fr]">
        <CompliancePanel rows={data.compliance} />
        <DeadlinesPanel rows={data.upcoming_deadlines} />
      </section>

      {/* Task charts and quick actions */}
      <section className="grid gap-4 2xl:grid-cols-[1fr_1fr_0.95fr]">
        <TasksOverview stages={data.pipeline} />
        <WorkPipelinePanel rows={data.compliance} />
        <QuickActions />
      </section>

      {/* Additional existing practice information */}
    <section className="grid gap-4 grid-cols-1">
        <PortfolioAndFinancial portfolio={data.portfolio} financials={data.financials} />
        <AttentionAndTeam data={data} />
      </section>
      <section className="grid">
        <RecentActivity rows={data.recent_activity} />
      </section>

      <p className="text-center text-[10px] text-[#A0A5B6]">
        {data.scope === "firm" ? "Firm-wide practice dashboard" : `Dashboard scoped to your ${data.scope}`}
      </p>
    </main>
  );
}
