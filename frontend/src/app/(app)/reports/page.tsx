"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import ReactECharts from "echarts-for-react";
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


type AnyRow = Record<string, unknown>;
const readNumber = (row: AnyRow, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  }
  return 0;
};
const readLabel = (row: AnyRow, keys: string[], fallback: string) => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
};
const chartBase = {
  animationDuration: 750,
  textStyle: { fontFamily: "inherit", color: "#64748b" },
  grid: { left: 8, right: 18, top: 28, bottom: 8, containLabel: true },
  tooltip: {
    trigger: "axis",
    backgroundColor: "#17132b",
    borderWidth: 0,
    textStyle: { color: "#fff", fontSize: 12 },
    padding: [10, 13],
  },
};
function ChartPanel({ option, height = 290 }: { option: object; height?: number }) {
  return <div className="w-full min-w-0"><ReactECharts option={option as any} style={{ height, width: "100%" }} opts={{ renderer: "svg" }} notMerge lazyUpdate /></div>;
}
function RevenueEChart({ data }: { data: MonthlyTrendRow[] }) {
  const rows = data as unknown as AnyRow[];
  const labels = rows.map((r, i) => readLabel(r, ["month_label", "month", "period", "label"], `Period ${i + 1}`));
  const invoiced = rows.map(r => readNumber(r, ["invoiced", "fees_invoiced", "invoice_total", "total_invoiced"]));
  const collected = rows.map(r => readNumber(r, ["collected", "fees_collected", "collection_total", "total_collected"]));
  return <ChartPanel option={{ ...chartBase, legend: { top: 0, right: 8, icon: "roundRect", textStyle: { color: "#64748b", fontSize: 11 } }, grid: { ...chartBase.grid, top: 38 }, xAxis: { type: "category", boundaryGap: false, data: labels, axisLine: { lineStyle: { color: "#e9e5f2" } }, axisTick: { show: false }, axisLabel: { color: "#8b8798", fontSize: 10 } }, yAxis: { type: "value", splitLine: { lineStyle: { color: "#f0edf5", type: "dashed" } }, axisLabel: { color: "#8b8798", fontSize: 10 } }, series: [{ name: "Invoiced", type: "line", smooth: true, symbol: "circle", symbolSize: 7, data: invoiced, lineStyle: { width: 3, color: "#7c3aed" }, itemStyle: { color: "#7c3aed", borderColor: "#fff", borderWidth: 2 }, areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(124,58,237,.22)" }, { offset: 1, color: "rgba(124,58,237,0)" }] } } }, { name: "Collected", type: "line", smooth: true, symbol: "circle", symbolSize: 6, data: collected, lineStyle: { width: 3, color: "#0d9488" }, itemStyle: { color: "#0d9488" } }] }} />;
}
function GstEChart({ data }: { data: GstSummaryResponse["months"] }) {
  const rows = data as unknown as AnyRow[];
  const labels = rows.map((r, i) => readLabel(r, ["month_label", "month", "period", "label"], `Period ${i + 1}`));
  const series = ["cgst", "sgst", "igst"].map((key, i) => ({ name: key.toUpperCase(), type: "bar", stack: "tax", barMaxWidth: 22, data: rows.map(r => readNumber(r, [key, key.toUpperCase()])), itemStyle: { color: ["#8b5cf6", "#a78bfa", "#c4b5fd"][i], borderRadius: [4, 4, 0, 0] } }));
  return <ChartPanel option={{ ...chartBase, legend: { top: 0, right: 8, icon: "roundRect", textStyle: { color: "#64748b", fontSize: 10 } }, grid: { ...chartBase.grid, top: 38 }, xAxis: { type: "category", data: labels, axisLine: { lineStyle: { color: "#e9e5f2" } }, axisTick: { show: false }, axisLabel: { color: "#8b8798", fontSize: 10 } }, yAxis: { type: "value", splitLine: { lineStyle: { color: "#f0edf5", type: "dashed" } }, axisLabel: { color: "#8b8798", fontSize: 10 } }, series }} />;
}
function DonutEChart({ data }: { data: StatusSlice[] }) {
  return <ChartPanel height={280} option={{ ...chartBase, tooltip: { ...chartBase.tooltip, trigger: "item" }, legend: { orient: "vertical", right: 8, top: "middle", itemWidth: 9, itemHeight: 9, textStyle: { color: "#64748b", fontSize: 11 } }, series: [{ type: "pie", radius: ["57%", "78%"], center: ["35%", "52%"], avoidLabelOverlap: true, itemStyle: { borderColor: "#fff", borderWidth: 4, borderRadius: 7 }, label: { show: true, position: "center", formatter: `{total|${data.reduce((n, x) => n + x.count, 0)}}\\n{small|Total tasks}`, rich: { total: { fontSize: 25, fontWeight: 700, color: "#211936", lineHeight: 32 }, small: { fontSize: 10, color: "#9992a8" } } }, labelLine: { show: false }, data: data.map((x, i) => ({ name: x.label, value: x.count, itemStyle: { color: ["#7c3aed", "#0d9488", "#f59e0b", "#ef4444", "#a78bfa", "#64748b"][i % 6] } })) }] }} />;
}
function HorizontalEChart({ labels, series }: { labels: string[]; series: { name: string; data: number[]; color: string }[] }) {
  return <ChartPanel height={Math.max(260, labels.length * 38 + 70)} option={{ ...chartBase, grid: { left: 8, right: 24, top: 12, bottom: 8, containLabel: true }, xAxis: { type: "value", splitLine: { lineStyle: { color: "#f0edf5", type: "dashed" } }, axisLabel: { color: "#9992a8", fontSize: 10 } }, yAxis: { type: "category", data: labels, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#615a70", fontSize: 11, width: 125, overflow: "truncate" } }, series: series.map(s => ({ name: s.name, type: "bar", data: s.data, barMaxWidth: 13, itemStyle: { color: s.color, borderRadius: [0, 6, 6, 0] } })) }} />;
}

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
    <div className="mx-auto w-full max-w-[1680px] space-y-7 bg-[#f7f6fb] px-3 pb-10 sm:px-5 lg:px-7">


      <section className="relative isolate overflow-hidden rounded-[28px] border border-[#e9e3f5] bg-[linear-gradient(115deg,#211536_0%,#39205f_52%,#6941a5_100%)] px-6 py-7 text-white shadow-[0_24px_60px_-35px_rgba(49,24,82,.65)] sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-violet-300/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-200">ROHADAS CA · ANALYTICS</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-3xl">Firm performance, at a glance</h2>
            <p className="mt-1 max-w-2xl text-sm text-violet-100">Monitor revenue, GST, compliance, receivables and team capacity from one live reporting workspace.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white backdrop-blur">
            <span className="size-2 rounded-full bg-emerald-500" /> Live data
          </div>
        </div>
      </section>

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
        <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 sm:px-6">
        <div
          className="group flex min-h-[128px] flex-col items-start justify-between gap-3 rounded-2xl border p-4 text-left transition-all duration-200 border-[#ECEAF2] bg-white hover:-translate-y-0.5 hover:border-[#D3C4F7] hover:shadow-[0_8px_18px_rgba(55,43,100,.07)]"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F0EAFE] text-[#7042D8]">
            <Icon name="clients" className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-[#171A32]">Total clients</span>
            <span className="tabular-nums text-2xl font-bold tracking-tight text-[#171A32]">
              {totals?.clients_total ?? 0}
            </span>
          </div>
        </div>

        <div
          className="group flex min-h-[128px] flex-col items-start justify-between gap-3 rounded-2xl border p-4 text-left transition-all duration-200 border-[#ECEAF2] bg-white hover:-translate-y-0.5 hover:border-[#D3C4F7] hover:shadow-[0_8px_18px_rgba(55,43,100,.07)]"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#ECFDF3] text-[#16A36A]">
            <Icon name="clients" className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-[#171A32]">Active clients</span>
            <span className="tabular-nums text-2xl font-bold tracking-tight text-[#171A32]">
              {totals?.clients_active ?? 0}
            </span>
          </div>
        </div>

        <div
          className="group flex min-h-[128px] flex-col items-start justify-between gap-3 rounded-2xl border p-4 text-left transition-all duration-200 border-[#ECEAF2] bg-white hover:-translate-y-0.5 hover:border-[#D3C4F7] hover:shadow-[0_8px_18px_rgba(55,43,100,.07)]"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F3F4F6] text-[#374151]">
            <Icon name="tasks" className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-[#171A32]">Open tasks</span>
            <span className="tabular-nums text-2xl font-bold tracking-tight text-[#171A32]">
              {totals?.tasks_open ?? 0}
            </span>
          </div>
        </div>

        <div
          className="group flex min-h-[128px] flex-col items-start justify-between gap-3 rounded-2xl border p-4 text-left transition-all duration-200 border-[#ECEAF2] bg-white hover:-translate-y-0.5 hover:border-[#D3C4F7] hover:shadow-[0_8px_18px_rgba(55,43,100,.07)]"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#FEE2E2] text-[#DC2626]">
            <Icon name="tasks" className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-[#171A32]">Overdue tasks</span>
            <span className="tabular-nums text-2xl font-bold tracking-tight text-[#171A32]">
              {totals?.tasks_overdue ?? 0}
            </span>
          </div>
        </div>

        <div
          className="group flex min-h-[128px] flex-col items-start justify-between gap-3 rounded-2xl border p-4 text-left transition-all duration-200 border-[#ECEAF2] bg-white hover:-translate-y-0.5 hover:border-[#D3C4F7] hover:shadow-[0_8px_18px_rgba(55,43,100,.07)]"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#FEF3C7] text-[#D97706]">
            <Icon name="tasks" className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-[#171A32]">Due this week</span>
            <span className="tabular-nums text-2xl font-bold tracking-tight text-[#171A32]">
              {totals?.tasks_due_this_week ?? 0}
            </span>
          </div>
        </div>

        <div
          className="group flex min-h-[128px] flex-col items-start justify-between gap-3 rounded-2xl border p-4 text-left transition-all duration-200 border-[#ECEAF2] bg-white hover:-translate-y-0.5 hover:border-[#D3C4F7] hover:shadow-[0_8px_18px_rgba(55,43,100,.07)]"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F5F3FF] text-[#7C3AED]">
            <Icon name="file-text" className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-[#171A32]">Fees invoiced</span>
            <span className="tabular-nums text-2xl font-bold tracking-tight text-[#171A32]">
              {formatMoney(financials?.fees_invoiced ?? 0)}
            </span>
          </div>
        </div>

        <div
          className="group flex min-h-[128px] flex-col items-start justify-between gap-3 rounded-2xl border p-4 text-left transition-all duration-200 border-[#ECEAF2] bg-white hover:-translate-y-0.5 hover:border-[#D3C4F7] hover:shadow-[0_8px_18px_rgba(55,43,100,.07)]"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF7ED] text-[#D97706]">
            <Icon name="file-text" className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-[#171A32]">Outstanding</span>
            <span className="tabular-nums text-2xl font-bold tracking-tight text-[#171A32]">
              {formatMoney(financials?.outstanding_total ?? 0)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Primary charts row ── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 [&>*:first-child]:xl:col-span-8 [&>*:last-child]:xl:col-span-4 [&>*]:min-w-0 [&>*]:overflow-hidden [&>*]:rounded-[24px] [&>*]:border [&>*]:border-[#eee9f5] [&>*]:shadow-[0_12px_35px_-28px_rgba(76,29,149,0.35)]">
        <Card
          title="Revenue: invoiced vs collected"
          subtitle="Monthly trend across the selected range"
        >
          {trends.isPending && <LoadingState label="Loading…" />}
          {trends.isSuccess && trends.data.length === 0 && (
            <EmptyState message="No billing history in this range." />
          )}
          {trends.isSuccess && trends.data.length > 0 && (
            <RevenueEChart data={trends.data} />
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
            <GstEChart data={gst.data.months} />
          )}
        </Card>
      </div>

      {/* ── Secondary charts row ── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 [&>*]:min-w-0 [&>*]:overflow-hidden [&>*]:rounded-[24px] [&>*]:border [&>*]:border-[#eee9f5] [&>*]:shadow-[0_12px_35px_-28px_rgba(76,29,149,0.35)]">
        <Card
          title="Tasks by status"
          subtitle="Open work across the firm"
        >
          {dashboard.isPending && <LoadingState label="Loading…" />}
          {dashboard.isSuccess && statusSlices.length === 0 && (
            <EmptyState message="No tasks yet." />
          )}
          {dashboard.isSuccess && statusSlices.length > 0 && (
            <DonutEChart data={statusSlices} />
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
              <HorizontalEChart
                labels={(d?.compliance ?? []).map((r, i) => readLabel(r as unknown as AnyRow, ["category", "name", "label"], `Category ${i + 1}`))}
                series={[
                  { name: "Overdue", color: "#ef4444", data: (d?.compliance ?? []).map(r => readNumber(r as unknown as AnyRow, ["overdue", "overdue_count"])) },
                  { name: "Due soon", color: "#f59e0b", data: (d?.compliance ?? []).map(r => readNumber(r as unknown as AnyRow, ["due_soon", "due_soon_count"])) },
                  { name: "In progress", color: "#8b5cf6", data: (d?.compliance ?? []).map(r => readNumber(r as unknown as AnyRow, ["in_progress", "in_progress_count"])) },
                ]}
              />
            ))}
        </Card>
      </div>

      {/* ── Tertiary charts row ── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 [&>*]:min-w-0 [&>*]:overflow-hidden [&>*]:rounded-[24px] [&>*]:border [&>*]:border-[#eee9f5] [&>*]:shadow-[0_12px_35px_-28px_rgba(76,29,149,0.35)]">
        <Card
          title="Receivables ageing"
          subtitle="Outstanding amounts by how long they have been overdue"
        >
          {receivables.isPending && <LoadingState label="Loading…" />}
          {receivables.isSuccess && ageingBuckets.length === 0 && (
            <EmptyState message="No outstanding receivables." />
          )}
          {receivables.isSuccess && ageingBuckets.length > 0 && (
            <HorizontalEChart
              labels={ageingBuckets.map(r => r.label)}
              series={[{ name: "Outstanding", color: "#8b5cf6", data: ageingBuckets.map(r => r.amount) }]}
            />
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
            <HorizontalEChart
              labels={workloadBars.map(r => r.name)}
              series={[
                { name: "Open", color: "#8b5cf6", data: workloadBars.map(r => r.open) },
                { name: "Overdue", color: "#ef4444", data: workloadBars.map(r => r.overdue) },
              ]}
            />
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
            <p className="tabular font-semibold text-violet-700">
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
            <p className="tabular font-semibold text-violet-700">
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
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3 [&>*]:min-w-0 [&>*]:overflow-hidden [&>*]:rounded-[24px] [&>*]:border [&>*]:border-[#eee9f5] [&>*]:shadow-[0_12px_35px_-28px_rgba(76,29,149,0.35)]">
        <Card title="Clients needing attention" subtitle="Worst first">
          {atRisk.isPending && <LoadingState label="Loading…" />}
          {atRisk.isSuccess && atRisk.data.length === 0 && (
            <EmptyState message="No client is currently flagged." />
          )}
          {atRisk.isSuccess && atRisk.data.length > 0 && (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gradient-to-r from-violet-50 to-slate-50">
                  <tr>
                    <th className="th">Client</th>
                    <th className="th">Risk</th>
                    <th className="th">Overdue</th>
                    <th className="th">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-violet-100/80">
                  {atRisk.data.slice(0, 10).map((row) => (
                    <tr key={row.client_id} className="transition-colors hover:bg-violet-50/50">
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
            <ul className="divide-y divide-violet-100/80">
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
            <div className="max-h-80 overflow-y-auto divide-y divide-violet-100/80">
              {(d?.recent_activity ?? []).map((row) => (
                <div key={row.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-violet-50/50">
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
