"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  StatCard,
} from "@/components/ui";
import { AddServiceForm, FREQUENCIES } from "@/components/ServiceForms";
import { ServiceDetailDrawer } from "@/components/ServiceDetailDrawer";
import { Icon } from "@/components/Icon";
import { ApiError, api, buildQuery } from "@/lib/api";
import { cn, humanise } from "@/lib/format";
import { useDebouncedValue, usePaging } from "@/lib/hooks";
import type {
  Page,
  ServiceCategory,
  ServiceCategoryOption,
  ServiceRow,
  ServiceSummary,
} from "@/lib/types";

/**
 * The tabs, as groups of categories.
 *
 * `categories` is empty for "All" and computed for "Other" — a new category added to the
 * enum lands in Other rather than vanishing from every tab. The counts come from
 * `/services/summary`, which groups them the same way.
 */
const TABS: Array<{ key: string; label: string; categories: ServiceCategory[] }> = [
  { key: "all", label: "All Services", categories: [] },
  { key: "taxation", label: "Taxation", categories: ["income_tax", "tds"] },
  { key: "gst", label: "GST", categories: ["gst"] },
  { key: "audit", label: "Audit", categories: ["audit"] },
  { key: "roc", label: "ROC", categories: ["roc"] },
  {
    key: "other",
    label: "Other",
    categories: ["accounting", "payroll", "advisory", "other"],
  },
];

/** Fallback wording if `/services/categories` has not answered yet. The server is the
 *  source; this only stops the first paint showing raw slugs. */
const CATEGORY_FALLBACK: Record<string, string> = {
  gst: "GST",
  income_tax: "Income tax",
  tds: "TDS",
  audit: "Audit",
  roc: "ROC / MCA",
  accounting: "Accounting",
  payroll: "Payroll",
  advisory: "Advisory",
  other: "Other",
};

/** ₹42,50,000 — Indian grouping, which is how a fee is read here. */
function rupees(value: number, compact = false): string {
  if (compact && value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} Cr`;
  if (compact && value >= 100_000) return `₹${(value / 100_000).toFixed(2)} L`;
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const CATEGORY_TONE: Record<string, string> = {
  gst: "bg-sky-50 text-sky-700",
  income_tax: "bg-violet-50 text-violet-700",
  tds: "bg-amber-50 text-amber-700",
  audit: "bg-indigo-50 text-indigo-700",
  roc: "bg-rose-50 text-rose-700",
  accounting: "bg-cyan-50 text-cyan-700",
  payroll: "bg-emerald-50 text-emerald-700",
  advisory: "bg-orange-50 text-orange-700",
};

function CategoryBadge({
  category,
  labels,
}: {
  category: string;
  labels: Record<string, string>;
}) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium",
        CATEGORY_TONE[category] ?? "bg-slate-100 text-slate-600",
      )}
    >
      {labels[category] ?? CATEGORY_FALLBACK[category] ?? humanise(category)}
    </span>
  );
}

/**
 * The four headline figures.
 *
 * These use the shared `StatCard` with an icon rather than a local tile: the same shape
 * appears on the dashboard, the client list and the team screen, and a copy per screen is
 * how four subtly different tiles end up in one product.
 */
function SummaryTiles({ summary }: { summary: ServiceSummary | undefined }) {
  const tiles = [
    {
      icon: "check-circle" as const,
      tone: "info" as const,
      label: "Total Services",
      value: String(summary?.total_services ?? 0),
      hint: `${summary?.active_services ?? 0} active in firm library`,
    },
    {
      icon: "clients" as const,
      tone: "progress" as const,
      label: "Assigned to Clients",
      value: String(summary?.total_assignments ?? 0),
      hint: "Service instances",
    },
    {
      icon: "billing" as const,
      tone: "success" as const,
      label: "Total Annual Fees",
      value: rupees(summary?.total_annual_fees ?? 0, true),
      hint: "Across all clients",
    },
    {
      icon: "calendar" as const,
      tone: "warning" as const,
      label: "Recurring Services",
      value: String(summary?.recurring_services ?? 0),
      hint: "Auto-generate tasks",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <StatCard
          key={tile.label}
          icon={<Icon name={tile.icon} className="h-5 w-5" />}
          tone={tile.tone}
          label={tile.label}
          value={tile.value}
          hint={tile.hint}
        />
      ))}
    </div>
  );
}

export default function ServicesPage() {
  const paging = usePaging(10);
  const { filters, updateFilter, offset, setOffset, limit, page } = paging;
  const search = useDebouncedValue(filters.search ?? "");

  const [tab, setTab] = useState("all");
  const [openServiceId, setOpenServiceId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const activeTab = TABS.find((row) => row.key === tab) ?? TABS[0];

  // `buildQuery` is flat, but a tab spans several categories, so that one is repeated
  // by hand rather than dropped.
  const tabQuery = activeTab.categories.map((value) => `categories=${value}`).join("&");

  const summary = useQuery({
    queryKey: ["services", "summary", search],
    queryFn: () => api.get<ServiceSummary>(`/services/summary${buildQuery({ search })}`),
  });

  // The wording for a category lives on the server (`_CATEGORY_LABELS`). Reading it from
  // there rather than copying it means a renamed category cannot drift between the two.
  const categories = useQuery({
    queryKey: ["services", "categories"],
    queryFn: () => api.get<ServiceCategoryOption[]>("/services/categories"),
    staleTime: 10 * 60 * 1000,
  });
  const categoryLabels = Object.fromEntries(
    (categories.data ?? []).map((row) => [row.value, row.label]),
  );

  const services = useQuery({
    queryKey: [
      "services",
      "list",
      { search, category: filters.category, status: filters.status, tab, offset, limit },
    ],
    queryFn: () =>
      api.get<Page<ServiceRow>>(
        `/services${buildQuery({
          search,
          category: filters.category,
          status: filters.status,
          frequency: filters.frequency,
          include_inactive: true,
          limit,
          offset,
        })}${tabQuery ? `&${tabQuery}` : ""}`,
      ),
  });

  const rows = services.data?.items ?? [];
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const s = summary.data;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)));
  }

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeTab(key: string) {
    setTab(key);
    setOffset(0);
    setSelected(new Set());
  }

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Services"
        subtitle="Manage your service catalogue, client assignments and recurring work."
        action={
          <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
            <Icon name="plus" className="h-4 w-4" />
            Add Service
          </button>
        }
      />

      <SummaryTiles summary={s} />

      {adding && (
        <Card title="Add a service" subtitle="It joins the catalogue and every picker">
          <AddServiceForm onDone={() => setAdding(false)} />
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-3 pt-2">
          {TABS.map((entry) => {
            const isActive = entry.key === tab;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => changeTab(entry.key)}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "border-sky-600 text-sky-700"
                    : "border-transparent text-slate-500 hover:text-slate-800",
                )}
              >
                {entry.label}
                <span
                  className={cn(
                    "tabular ml-1.5 rounded px-1.5 py-0.5 text-[10px]",
                    isActive ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {s?.tab_counts[entry.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-slate-200 p-3 md:grid-cols-4">
          <label className="col-span-2 block">
            <input
              className="input py-1.5"
              type="search"
              value={filters.search ?? ""}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Search services…"
              aria-label="Search services"
            />
          </label>
          <select
            className="input py-1.5"
            value={filters.category ?? ""}
            onChange={(event) => updateFilter("category", event.target.value)}
            aria-label="Category"
          >
            <option value="">Category</option>
            {(categories.data ?? []).map((row) => (
              <option key={row.value} value={row.value}>
                {row.label}
              </option>
            ))}
          </select>
          <select
            className="input py-1.5"
            value={filters.frequency ?? ""}
            onChange={(event) => updateFilter("frequency", event.target.value)}
            aria-label="Frequency"
          >
            <option value="">Frequency</option>
            {FREQUENCIES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
          <select
            className="input py-1.5"
            value={filters.status ?? ""}
            onChange={(event) => updateFilter("status", event.target.value)}
            aria-label="Status"
          >
            <option value="">Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {hasFilters && (
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-600">
              Showing {services.data?.meta.total ?? 0} of {s?.total_services ?? 0} services
            </p>
            <button
              type="button"
              className="text-xs font-medium text-sky-700 hover:underline"
              onClick={() => {
                paging.clearFilters();
                setSelected(new Set());
              }}
            >
              Clear
            </button>
          </div>
        )}

        {selected.size > 0 && (
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-sky-50 px-3 py-2">
            <p className="text-xs font-medium text-sky-900">{selected.size} selected</p>
            <button
              type="button"
              className="text-xs font-medium text-sky-700 hover:underline"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </button>
          </div>
        )}

        {services.isPending ? (
          <LoadingState label="Loading the catalogue…" />
        ) : services.isError ? (
          <ErrorState
            message={
              services.error instanceof ApiError
                ? services.error.message
                : "Could not load the service catalogue."
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            message={
              hasFilters || tab !== "all"
                ? "No services match these filters. Try another tab or clear them."
                : "No services in the catalogue yet. Add your first one to start attaching it to clients."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all services on this page"
                    />
                  </th>
                  <th className="th w-10">#</th>
                  <th className="th">Service Name</th>
                  <th className="th">Category</th>
                  <th className="th">Frequency</th>
                  <th className="th text-right">Default Fee</th>
                  <th className="th text-right">Assigned Clients</th>
                  <th className="th">Status</th>
                  <th className="th w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, index) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="td">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleOne(row.id)}
                        aria-label={`Select ${row.name}`}
                      />
                    </td>
                    <td className="td tabular text-xs text-slate-400">{offset + index + 1}</td>
                    <td className="td">
                      <button
                        type="button"
                        className="text-left font-medium text-slate-900 underline-offset-2 hover:text-sky-700 hover:underline"
                        onClick={() => setOpenServiceId(row.id)}
                      >
                        {row.name}
                      </button>
                      <span className="block font-mono text-[10px] text-slate-400">
                        {row.code}
                      </span>
                    </td>
                    <td className="td">
                      <CategoryBadge category={row.category} labels={categoryLabels} />
                    </td>
                    <td className="td text-xs text-slate-600">
                      {row.default_frequency ? humanise(row.default_frequency) : "One-off"}
                    </td>
                    <td className="td tabular text-right text-slate-700">
                      {row.standard_fee == null ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        rupees(row.standard_fee)
                      )}
                    </td>
                    <td className="td text-right">
                      <span
                        className={cn(
                          "tabular inline-block min-w-7 rounded px-1.5 py-0.5 text-xs",
                          row.client_count > 0
                            ? "bg-slate-100 font-medium text-slate-700"
                            : "text-slate-300",
                        )}
                      >
                        {row.client_count}
                      </span>
                    </td>
                    <td className="td">
                      <Badge tone={row.is_active ? "success" : "neutral"}>
                        {row.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="td text-right">
                      <button
                        type="button"
                        className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        onClick={() => setOpenServiceId(row.id)}
                        aria-label={`Open ${row.name}`}
                      >
                        ⋮
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-3 py-2">
          <p className="text-xs text-slate-500">
            {services.data
              ? `Showing ${services.data.meta.total === 0 ? 0 : offset + 1} to ${offset + rows.length} of ${services.data.meta.total} services`
              : "—"}
          </p>
          <Pagination
            total={services.data?.meta.total ?? 0}
            limit={limit}
            offset={offset}
            page={page}
            hasMore={offset + rows.length < (services.data?.meta.total ?? 0)}
            onOffsetChange={setOffset}
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Service Categories"
          subtitle="How the catalogue is spread"
          action={
            <button
              type="button"
              className="text-xs font-medium text-sky-700 hover:underline"
              onClick={() => setAdding(true)}
            >
              + Add Category
            </button>
          }
        >
          {(s?.by_category.length ?? 0) === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-500">No categories in use yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {s?.by_category.map((row) => (
                <li key={row.value}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                    onClick={() => updateFilter("category", row.value)}
                  >
                    <CategoryBadge category={row.value} labels={categoryLabels} />
                    <span className="flex-1 text-sm text-slate-700">{row.label}</span>
                    <span className="tabular text-xs text-slate-500">
                      {row.service_count} service{row.service_count === 1 ? "" : "s"}
                    </span>
                    <span className="tabular w-20 text-right text-xs text-slate-500">
                      {row.client_count} clients
                    </span>
                    <span className="text-slate-300" aria-hidden>
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Assignment Summary"
          subtitle="What each service is worth a year"
          action={
            <button
              type="button"
              className="text-xs font-medium text-sky-700 hover:underline"
              onClick={() => setOpenServiceId(s?.assignments[0]?.service_id ?? null)}
              disabled={!s?.assignments.length}
            >
              View All
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Service</th>
                  <th className="th text-right">Total Clients</th>
                  <th className="th text-right">Active</th>
                  <th className="th text-right">Inactive</th>
                  <th className="th text-right">Annual Fees</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {s?.assignments.slice(0, 6).map((row) => (
                  <tr key={row.service_id} className="hover:bg-slate-50">
                    <td className="td">
                      <button
                        type="button"
                        className="font-medium text-slate-900 underline-offset-2 hover:text-sky-700 hover:underline"
                        onClick={() => setOpenServiceId(row.service_id)}
                      >
                        {row.code}
                      </button>
                    </td>
                    <td className="td tabular text-right text-slate-700">{row.total_clients}</td>
                    <td className="td tabular text-right font-medium text-emerald-700">
                      {row.active_clients}
                    </td>
                    <td className="td tabular text-right text-slate-500">
                      {row.inactive_clients}
                    </td>
                    <td className="td tabular text-right text-slate-700">
                      {row.annual_fees === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        rupees(row.annual_fees)
                      )}
                    </td>
                  </tr>
                ))}
                {(s?.assignments.length ?? 0) === 0 && (
                  <tr>
                    <td className="td py-6 text-center text-sm text-slate-500" colSpan={5}>
                      Nothing in the catalogue yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {openServiceId && (
        <ServiceDetailDrawer
          serviceId={openServiceId}
          onClose={() => setOpenServiceId(null)}
        />
      )}
    </div>
  );
}


