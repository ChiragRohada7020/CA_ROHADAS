"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import {
  ChartContainer,
  ComplianceChart,
  GstSummaryChart,
  AgeingChart,
  RevenueTrendChart,
  TaskStatusChart,
  WorkloadChart,
} from "@/components/charts-reports";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatCard,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { Icon } from "@/components/Icon";
import {
  addDays,
  formatDate,
  formatMoney,
  formatPercent,
  humanise,
  todayInIST,
} from "@/lib/format";
import {
  ageingTone,
  clientStatusTone,
  daysRemainingLabel,
  daysRemainingTone,
  riskTone,
  taskStatusLabel,
  taskStatusTone,
  utilisationTone,
} from "@/lib/status";
import type {
  AgeingBucketRow,
  ClientRiskRow,
  ComplianceCategoryRow,
  DeadlineAlertRow,
  FirmDashboard,
  GstSummaryResponse,
  MonthlyTrendRow,
  ReceivablesSummary,
  StatusSlice,
  WorkloadBar,
  WorkloadRow,
} from "@/lib/types";

/** Date range preset labels → days back from today. */
const RANGE_PRESETS: Record<string, number> = {
  "1m": 30,
  "3m": 90,
  "6m": 180,
  "1y": 365,
};

export default function ReportsPage() {
  const [range, setRange] = useState<"1m" | "3m" | "6m" | "1y" | "custom">("6m");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const today = todayInIST();

  // Resolve the effective date range from the preset / custom inputs.
  const resolvedFrom = range === "custom" && fromDate ? fromDate : undefined;
  const resolvedTo = range === "custom" && toDate ? toDate : undefined;

  const dashboard = useQuery<FirmDashboard>({
    queryKey: ["reports", "dashboard"],
    queryFn: () => api.get<FirmDashboard>("/reports/dashboard"),
  });

  const trends = useQuery<MonthlyTrendRow[]>({
    queryKey: ["reports", "monthly-trends", resolvedFrom, resolvedTo],
    queryFn: () =>
      api.get<MonthlyTrendRow[]>(
        `/reports/monthly-trends${
          resolvedFrom || resolvedTo
            ? `?${new URLSearchParams(
                Object.fromEntries(
                  [
                    ["from_date", resolvedFrom],
                    ["to_date", resolvedTo],
                  ].filter(([, v]) => Boolean(v))
                )
              )}`
            : ""
        }`,
      ),
  });

  const gst = useQuery<GstSummaryResponse>({
    queryKey: ["reports", "gst-summary", resolvedFrom, resolvedTo],
    queryFn: () =>
      api.get<GstSummaryResponse>(
        `/reports/gst-summary${
          resolvedFrom || resolvedTo
            ? `?${new URLSearchParams(
                Object.fromEntries(
                  [
                    ["from_date", resolvedFrom],
                    ["to_date", resolvedTo],
                  ].filter(([, v]) => Boolean(v))
                )
              )}`
            : ""
        }`,
      ),
  });

  const workload = useQuery<WorkloadRow[]>({
    queryKey: ["reports", "workload"],
    queryFn: () => api.get<WorkloadRow[]>("/reports/workload"),
  });

  const atRisk = useQuery<ClientRiskRow[]>({
    queryKey: ["reports", "at-risk"],
    queryFn: () => api.get<ClientRiskRow[]>("/reports/at-risk-clients"),
  });

  const deadlines = useQuery<DeadlineAlertRow[]>({
    queryKey: ["reports", "upcoming-deadlines"],
    queryFn: () =>
      api.get<DeadlineAlertRow[]>("/reports/upcoming-deadlines?days=30"),
  });

  const receivables = useQuery<ReceivablesSummary>({
    queryKey: ["receivables"],
    queryFn: () => api.get<ReceivablesSummary>("/billing/receivables"),
  });

  const firstError = [
    dashboard,
    trends,
    gst,
    workload,
    atRisk,
    deadlines,
    receivables,
  ].find((entry) => entry.isError);

  const d = dashboard.data;
  const totals = d?.totals;
  const financials = d?.financials;

  const statusSlices: StatusSlice[] = (d?.tasks_by_status ?? []).map((row) => ({
    status: row.status,
    label: taskStatusLabel(row.status),
    count: row.count,
    value: row.count,
  }));

  const ageingBuckets: AgeingBucketRow[] = Object.entries(
    receivables.data?.ageing ?? {},
  ).map(([bucket, amount]) => ({
    bucket,
    label: bucket
      .split("-")
      .map((p) => humanise(p))
      .join(" ") ||
      (bucket === "current" ? "Not yet due" : bucket),
    amount,
    count: receivables.data?.ageing_counts?.[bucket] ?? 0,
  }));

  const workloadBars: WorkloadBar[] = (workload.data ?? []).map((row) => ({
    name: row.full_name,
    open: row.open_tasks,
    overdue: row.overdue_tasks,
    utilisation: row.utilisation_percent,
  }));

  const gstRows = gst.data?.months ?? [];
  const gstTotals = gst.data?.totals ?? { cgst: 0, sgst: 0, igst: 0, total_tax: 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Firm reports"
        subtitle="Every figure is derived at read time from live backend data."
        action={
          <div className="flex items-center gap-3">
            <Select
              label="Range"
              value={range}
              onChange={(v) => setRange(v as "1m" | "3m" | "6m" | "1y" | "custom")}
              options={[
                { value: "1m", label: "1 month" },
                { value: "3m", label: "3 months" },
                { value: "6m", label: "6 months" },
                { value: "1y", label: "1 year" },
                { value: "custom", label: "Custom" },
              ]}
            />
            {range === "custom" && (
              <>
                <Input
                  label="From"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  max={today}
                  className="w-[130px] text-xs"
                />
                <Input
                  label="To"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  max={today}
                  className="w-[130px] text-xs"
                />
                <Button
                  type="button"
                  onClick={() => {
                    setFromDate("");
                    setToDate("");
                  }}
                  size="sm"
                  className="ml-2 h-8"
                >
                  Clear
                </Button>
              </>
            )}
          </div>
        }
      />

      {firstError && (
        <ErrorState
          message={
            firstError.error instanceof ApiError
              ? firstError.error.message
              : "Some reports could not be loaded."
          }
        />
      )}

      {/* ── KPI row ── */}
      <Card title="Firm at a glance" subtitle="Totals as of today">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Total clients"
            value={totals?.clients_total ?? 0}
            icon={<Icon name="clients" />}
          />
          <StatCard
            label="Active clients"
            value={totals?.clients_active ?? 0}
            tone="success"
            icon={<Icon name="clients" />}
          />
          <StatCard
            label="Open tasks"
            value={totals?.tasks_open ?? 0}
            icon={<Icon name="tasks" />}
          />
          <StatCard
            label="Overdue tasks"
            value={totals?.tasks_overdue ?? 0}
            tone={totals?.tasks_overdue ?? 0 > 0 ? "danger" : "success"}
            icon={<Icon name="tasks" />}
          />
          <StatCard
            label="Due this week"
            value={totals?.tasks_due_this_week ?? 0}
            tone={totals?.tasks_due_this_week ?? 0 > 0 ? "warning" : "success"}
            icon={<Icon name="tasks" />}
          />
          <StatCard
            label="Fees invoiced"
            value={formatMoney(financials?.fees_invoiced ?? 0)}
            icon={<Icon name="file-text" />}
          />
          <StatCard
            label="Outstanding"
            value={formatMoney(financials?.outstanding_total ?? 0)}
            tone={
              financials?.outstanding_total ?? 0 > 0 ? "warning" : "success"
            }
            icon={<Icon name="file-text" />}
          />
        </div>
      </Card>

      {/* ── Primary charts row ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Revenue: invoiced vs collected"
          subtitle="Monthly trend across the selected range"
        >
          {trends.isPending && <LoadingState label="Loading…" />}
          {trends.isSuccess && trends.data.length === 0 && (
            <EmptyState message="No billing history in this range." />
          )}
          {trends.isSuccess && trends.data.length > 0 && (
            <RevenueTrendChart data={trends.data} />
          )}
        </Card>

        <Card
          title="GST: CGST / SGST / IGST"
          subtitle="Monthly GST collected by tax type"
        >
          {gst.isPending && <LoadingState label="Loading…" />}
          {gst.isSuccess && gst.data.months.length === 0 && (
            <EmptyState message="No GST data in this range." />
          )}
          {gst.isSuccess && gst.data.months.length > 0 && (
            <GstSummaryChart data={gst.data.months} />
          )}
        </Card>
      </div>

      {/* ── Secondary charts row ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Tasks by status"
          subtitle="Open work across the firm"
        >
          {dashboard.isPending && <LoadingState label="Loading…" />}
          {dashboard.isSuccess && statusSlices.length === 0 && (
            <EmptyState message="No tasks yet." />
          )}
          {dashboard.isSuccess && statusSlices.length > 0 && (
            <TaskStatusChart data={statusSlices} />
          )}
        </Card>

        <Card
          title="Compliance by category"
          subtitle="Work that is overdue, due soon, or in progress"
        >
          {dashboard.isPending && <LoadingState label="Loading…" />}
          {dashboard.isSuccess &&
            ((d?.compliance.length ?? 0) === 0 && (
              <EmptyState message="No compliance work tracked." />
            ))}
          {dashboard.isSuccess &&
            ((d?.compliance.length ?? 0) > 0 && (
              <ComplianceChart data={d?.compliance ?? []} />
            ))}
        </Card>
      </div>

      {/* ── Tertiary charts row ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Receivables ageing"
          subtitle="Outstanding amounts by how long they have been overdue"
        >
          {receivables.isPending && <LoadingState label="Loading…" />}
          {receivables.isSuccess && ageingBuckets.length === 0 && (
            <EmptyState message="No outstanding receivables." />
          )}
          {receivables.isSuccess && ageingBuckets.length > 0 && (
            <AgeingChart data={ageingBuckets} />
          )}
        </Card>

        <Card
          title="Team workload"
          subtitle="Open tasks and overdue items by person"
        >
          {workload.isPending && <LoadingState label="Loading…" />}
          {workload.isSuccess && workload.data.length === 0 && (
            <EmptyState message="No staff to show." />
          )}
          {workload.isSuccess && workload.data.length > 0 && (
            <WorkloadChart data={workloadBars} />
          )}
        </Card>
      </div>

      {/* ── GST totals strip ── */}
      <Card title="GST summary" subtitle="Aggregate figures for the selected range">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 p-4 text-sm">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              CGST
            </p>
            <p className="tabular font-semibold text-sky-700">
              {formatMoney(gstTotals.cgst)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              SGST
            </p>
            <p className="tabular font-semibold text-violet-700">
              {formatMoney(gstTotals.sgst)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              IGST
            </p>
            <p className="tabular font-semibold text-sky-700">
              {formatMoney(gstTotals.igst)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Total tax
            </p>
            <p className="tabular font-semibold text-slate-900">
              {formatMoney(gstTotals.total_tax)}
            </p>
          </div>
        </div>
      </Card>

      {/* ── Tables row ── */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Clients needing attention" subtitle="Worst first">
          {atRisk.isPending && <LoadingState label="Loading…" />}
          {atRisk.isSuccess && atRisk.data.length === 0 && (
            <EmptyState message="No client is currently flagged." />
          )}
          {atRisk.isSuccess && atRisk.data.length > 0 && (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f7f6f3]">
                  <tr>
                    <th className="th">Client</th>
                    <th className="th">Risk</th>
                    <th className="th">Overdue</th>
                    <th className="th">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {atRisk.data.slice(0, 10).map((row) => (
                    <tr key={row.client_id}>
                      <td className="td">
                        <span className="font-medium text-slate-900">
                          {row.client_name}
                        </span>
                        <span className="ml-1 text-xs text-slate-400">
                          {row.client_code}
                        </span>
                      </td>
                      <td className="td">
                        <Badge tone={riskTone(row.risk_classification)}>
                          {humanise(row.risk_classification)}
                        </Badge>
                      </td>
                      <td className="td tabular">
                        {row.overdue_tasks > 0 ? (
                          <span className="font-medium text-rose-700">
                            {row.overdue_tasks}
                          </span>
                        ) : (
                          0
                        )}
                      </td>
                      <td className="td tabular">{row.open_tasks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Deadlines in the next 30 days">
          {deadlines.isPending && <LoadingState label="Loading…" />}
          {deadlines.isSuccess && deadlines.data.length === 0 && (
            <EmptyState message="Nothing due in the next 30 days." />
          )}
          {deadlines.isSuccess && deadlines.data.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {deadlines.data.slice(0, 10).map((row, index) => (
                <li
                  key={row.task_id ?? `${row.client_id}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {row.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {row.client_name}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular text-xs text-slate-500">
                      {formatDate(row.statutory_due_date)}
                    </span>
                    <Badge tone={daysRemainingTone(row.days_remaining)}>
                      {daysRemainingLabel(row.days_remaining)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Outstanding fees" subtitle="Ageing snapshot">
          {receivables.isPending && <LoadingState label="Loading…" />}
          {receivables.isSuccess && (
            <div className="grid grid-cols-2 gap-3 p-4 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Invoiced
                </p>
                <p className="tabular font-semibold text-slate-900">
                  {formatMoney(receivables.data.invoiced_total)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Collected
                </p>
                <p className="tabular font-semibold text-emerald-700">
                  {formatMoney(receivables.data.collected_total)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Outstanding
                </p>
                <p className="tabular font-semibold text-amber-700">
                  {formatMoney(receivables.data.outstanding_total)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Overdue
                </p>
                <p className="tabular font-semibold text-rose-700">
                  {formatMoney(receivables.data.overdue_total)}
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card title="Recent activity" subtitle="Latest task completions across the firm">
        {dashboard.isPending && <LoadingState label="Loading…" />}
        {dashboard.isSuccess &&
          ((d?.recent_activity.length ?? 0) === 0 && (
            <EmptyState message="No recent activity." />
          ))}
        {dashboard.isSuccess &&
          ((d?.recent_activity.length ?? 0) > 0 && (
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {(d?.recent_activity ?? []).map((row) => (
                <div key={row.id} className="flex items-start gap-3 px-4 py-3">
                  <Icon name="tasks" className="h-4 w-4 text-slate-400 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-900">{row.entity_label}</p>
                    <p className="text-xs text-slate-500">
                      {row.action} · {formatDate(row.created_at ?? "")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ))}
      </Card>
    </div>
  );
}
