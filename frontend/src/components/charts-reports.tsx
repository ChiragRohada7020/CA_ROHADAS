"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  Label,
  ReferenceLine,
  ReferenceDot,
} from "recharts";

import { cn, formatMoney, formatPercent } from "@/lib/format";

/** shadcn/ui-style chart wrapper. Provides padding and a title area. */
export function ChartContainer({
  children,
  className,
  header,
}: {
  children: React.ReactNode;
  className?: string;
  header?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-4 p-4", className)}>
      {header && <div className="mb-1">{header}</div>}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/** Tooltip with a rupee prefix for monetary values. */
export function MoneyTooltip({ active, payload, label }: any): React.ReactNode {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="p-3 bg-slate-900/90 backdrop-blur-sm border border-slate-700 rounded-lg shadow-2xl text-sm">
        <p className="font-medium text-slate-200 mb-1">
          {label ?? data.month ?? data.name ?? ""}
        </p>
        {payload.map((entry: any, i: number) => {
          const d = entry.payload;
          const color = entry.color;
          const value =
            d.value !== undefined ? d.value : d.invoiced ?? d.collected ?? d.cgst ?? d.sgst ?? d.igst ?? d.total_tax ?? 0;
          return (
            <div key={i} className="flex items-center gap-2 text-slate-300">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="font-medium">{formatMoney(value)}</span>
              <span className="ml-auto">{d.label ?? d.name ?? entry.name}</span>
            </div>
          );
        })}
      </div>
    );
  }
  return <div />;
}

/** Standard recharts tooltip wrapper. */
export function ChartTooltip({ content = <MoneyTooltip /> }: { content?: React.ReactNode } = {}) {
  return <Tooltip content={() => content} cursor={{ strokeDasharray: "3 3" }} />;
}

/** Standard recharts legend wrapper. */
export function ChartLegend({ verticalAlign = "top", align = "right" }: any = {}) {
  return <Legend verticalAlign={verticalAlign} align={align} />;
}

/** Monetary axis tick formatter (₹). */
export function moneyTick(value: number): string {
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(1)}Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(1)}L`;
  if (value >= 1e3) return `₹${(value / 1e3).toFixed(1)}K`;
  return `₹${value}`;
}

/** Number axis tick formatter. */
export function countTick(value: number): string {
  return value.toLocaleString("en-IN");
}

// ─────────────────────────────────────────────────────────────────────────────
// Revenue trend: monthly invoiced vs collected (line chart)
// ─────────────────────────────────────────────────────────────────────────────

export interface RevenueTrendRow {
  month: string;
  month_key: string;
  invoiced: number;
  collected: number;
  tasks_created?: number;
  tasks_completed?: number;
}

export function RevenueTrendChart({
  data,
  height = 260,
}: {
  data: RevenueTrendRow[];
  height?: number;
}) {
  const safeData = data ?? [];
  const hasData = safeData.length > 0;

  return (
    <ChartContainer header={<h3 className="text-sm font-semibold text-slate-900">Monthly revenue vs collections</h3>}>
      {hasData ? (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={safeData} margin={{ top: 20, right: 30, bottom: 30, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis
              tickFormatter={moneyTick}
              tick={{ fontSize: 10 }}
              domain={["auto", "auto"]}
            />
            <Tooltip content={<MoneyTooltip />} cursor={{ strokeDasharray: "3 3" }} />
            <Legend verticalAlign="top" align="right" />
            <Line
              type="monotone"
              dataKey="invoiced"
              name="Invoiced"
              stroke="#0ea5e9"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "#0ea5e9", fill: "#0ea5e9" }}
            />
            <Line
              type="monotone"
              dataKey="collected"
              name="Collected"
              stroke="#059669"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "#059669", fill: "#059669" }}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[260px] flex flex-col items-center justify-center text-slate-400">
          No billing history yet.
        </div>
      )}
    </ChartContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GST summary: CGST / SGST / IGST by month (grouped bar chart)
// ─────────────────────────────────────────────────────────────────────────────

export interface GstSummaryRow {
  month: string;
  month_key: string;
  cgst: number;
  sgst: number;
  igst: number;
  total_tax: number;
}

export function GstSummaryChart({
  data,
  height = 260,
}: {
  data: GstSummaryRow[];
  height?: number;
}) {
  const safeData = data ?? [];
  const hasData = safeData.some((d) => d.total_tax > 0);

  return (
    <ChartContainer header={<h3 className="text-sm font-semibold text-slate-900">GST by month</h3>}>
      {hasData ? (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={safeData} margin={{ top: 20, right: 30, bottom: 30, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={moneyTick} tick={{ fontSize: 10 }} />
            <Tooltip content={<MoneyTooltip />} cursor={{ strokeDasharray: "3 3" }} />
            <Legend verticalAlign="top" align="right" />
            <Bar dataKey="cgst" name="CGST" stackId="a" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="sgst" name="SGST" stackId="a" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            <Bar dataKey="igst" name="IGST" stackId="a" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[260px] flex flex-col items-center justify-center text-slate-400">
          No GST data yet.
        </div>
      )}
    </ChartContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Receivables ageing: buckets bar chart
// ─────────────────────────────────────────────────────────────────────────────

export interface AgeingBucketRow {
  bucket: string;
  label: string;
  amount: number;
  count: number;
}

export function AgeingChart({
  data,
  height = 260,
}: {
  data: AgeingBucketRow[];
  height?: number;
}) {
  const safeData = data ?? [];
  const hasData = safeData.some((d) => d.amount > 0);

  const BUCKET_COLOURS: Record<string, string> = {
    current: "#64748b",
    "1-30": "#0ea5e9",
    "31-60": "#d97706",
    "61-90": "#f43f5e",
    "90+": "#be123c",
    not_due: "#94a3b8",
    due_today: "#f59e0b",
  };

  return (
    <ChartContainer header={<h3 className="text-sm font-semibold text-slate-900">Receivables ageing</h3>}>
      {hasData ? (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={safeData} margin={{ top: 20, right: 20, bottom: 30, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={moneyTick} tick={{ fontSize: 10 }} />
            <Tooltip content={<MoneyTooltip />} cursor={{ strokeDasharray: "3 3" }} />
            {safeData.map((row, i) => (
              <Bar
                key={row.bucket}
                dataKey="amount"
                fill={BUCKET_COLOURS[row.bucket] ?? "#94a3b8"}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[260px] flex flex-col items-center justify-center text-slate-400">
          No outstanding receivables.
        </div>
      )}
    </ChartContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Task status donut
// ─────────────────────────────────────────────────────────────────────────────

export interface StatusSlice {
  status: string;
  label: string;
  count: number;
  value: number;
}

const STATUS_COLOURS: Record<string, string> = {
  not_started: "#94a3b8",
  assigned: "#3b82f6",
  in_progress: "#2563eb",
  waiting_for_client: "#d97706",
  waiting_for_internal: "#ea580c",
  ready_for_review: "#7c3aed",
  changes_requested: "#f43f5e",
  ready_for_approval: "#a855f7",
  approved: "#10b981",
  ready_to_file: "#0891b2",
  filed: "#059669",
  delivered: "#059669",
  completed: "#10b981",
  cancelled: "#64748b",
};

export function TaskStatusChart({
  data,
  size = 240,
}: {
  data: StatusSlice[];
  size?: number;
}) {
  const safeData = data ?? [];
  const total = safeData.reduce((s, d) => s + d.count, 0);
  const hasData = total > 0;

  // Group slices under 5% into "Other" so the donut isn't cluttered with slivers.
  const grouped = safeData.filter(
    (d) => total > 0 && (d.count / total) * 100 >= 5,
  );
  const otherCount =
    total > 0
      ? safeData.reduce(
          (s, d) =>
            s + ((d.count / total) * 100 < 5 ? d.count : 0),
          0,
        )
      : 0;
  const chartData: StatusSlice[] = [
    ...grouped,
    ...(otherCount > 0
      ? [
          {
            status: "other",
            label: "Other",
            count: otherCount,
            value: otherCount,
          },
        ]
      : []),
  ];

  return (
    <ChartContainer header={<h3 className="text-sm font-semibold text-slate-900">Tasks by status</h3>}>
      {hasData ? (
        <div className="flex items-center justify-between gap-4 md:flex-col md:items-start">
          <div className="relative shrink-0 flex-1 max-w-[280px]">
            <ResponsiveContainer width="100%" height={size}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={75}
                  outerRadius={105}
                  fill="#8884d8"
                  labelLine={false}
                  label={({ name, percent }: any) => {
                    const p = percent ?? 0;
                    if (p < 6) return null;
                    return `${name}: ${p.toFixed(0)}%`;
                  }}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={STATUS_COLOURS[entry.status] ?? "#94a3b8"}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload as StatusSlice;
                      const pct = total ? ((d.count / total) * 100).toFixed(0) : "0";
                      return (
                        <div className="p-3 bg-slate-900/90 backdrop-blur-sm border border-slate-700 rounded-lg shadow-2xl text-sm">
                          <div className="font-medium text-slate-200">{d.label}</div>
                          <div className="text-slate-300">
                            {d.count} task(s) ({pct}%)
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend verticalAlign="bottom" align="center" />
              </PieChart>
            </ResponsiveContainer>
            {/* Centre total overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="tabular text-2xl font-semibold text-slate-900">{total}</span>
              <span className="mt-0.5 text-[11px] text-slate-500">Total tasks</span>
            </div>
          </div>

          <div className="flex-1 min-w-[14rem] space-y-2">
            {chartData.map((entry) => {
              const pct = total ? Math.round((entry.count / total) * 100) : 0;
              return (
                <div
                  key={entry.status}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-[#f7f6f3] cursor-default"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_COLOURS[entry.status] ?? "#94a3b8" }}
                    />
                    <span className="text-sm text-slate-700">{entry.label}</span>
                  </div>
                  <div className="flex items-end gap-1 text-sm tabular">
                    <span className="font-semibold text-slate-900">{entry.count}</span>
                    <span className="text-xs text-slate-400">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="h-[260px] flex flex-col items-center justify-center text-slate-400">
          No tasks yet.
        </div>
      )}
    </ChartContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compliance by category (bar chart)
// ─────────────────────────────────────────────────────────────────────────────

export interface ComplianceCategoryRow {
  category: string;
  label: string;
  total: number;
  overdue: number;
  due_soon: number;
  in_progress: number;
  completed: number;
}

export function ComplianceChart({
  data,
  height = 260,
}: {
  data: ComplianceCategoryRow[];
  height?: number;
}) {
  const safeData = data ?? [];
  const hasData = safeData.some((d) => d.total > 0);

  return (
    <ChartContainer header={<h3 className="text-sm font-semibold text-slate-900">Compliance by category</h3>}>
      {hasData ? (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={safeData} margin={{ top: 20, right: 30, bottom: 30, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} />
            <Legend verticalAlign="top" align="right" />
            <Bar dataKey="completed" name="Completed" fill="#059669" radius={[4, 4, 0, 0]} />
            <Bar dataKey="in_progress" name="In progress" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="due_soon" name="Due soon" fill="#d97706" radius={[4, 4, 0, 0]} />
            <Bar dataKey="overdue" name="Overdue" fill="#f43f5e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[260px] flex flex-col items-center justify-center text-slate-400">
          No compliance work tracked.
        </div>
      )}
    </ChartContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Team workload (bar chart)
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkloadBar {
  name: string;
  open: number;
  overdue: number;
  utilisation: number;
}

export function WorkloadChart({
  data,
  height = 260,
}: {
  data: WorkloadBar[];
  height?: number;
}) {
  const safeData = data ?? [];
  const hasData = safeData.length > 0;

  return (
    <ChartContainer header={<h3 className="text-sm font-semibold text-slate-900">Team workload</h3>}>
      {hasData ? (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={safeData} margin={{ top: 20, right: 30, bottom: 30, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} />
            <Legend verticalAlign="top" align="right" />
            <Bar dataKey="open" name="Open tasks" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            <Bar dataKey="overdue" name="Overdue" fill="#f43f5e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[260px] flex flex-col items-center justify-center text-slate-400">
          No staff to show.
        </div>
      )}
    </ChartContainer>
  );
}
