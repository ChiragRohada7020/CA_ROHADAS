"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Select,
  SearchInput,
  Skeleton,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
  useToast,
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
function SummaryTiles({
  summary,
  pending,
}: {
  summary: ServiceSummary | undefined;
  pending: boolean;
}) {
  if (pending) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

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

/**
 * The row's overflow menu. Mirrors `tasks/RowActionsMenu`: a `more-vertical` button that
 * opens a `role="menu"` dropdown, closes on outside click or Escape, and offers the
 * actions a catalogue row actually supports. Retire is a PATCH setting `is_active: false`
 * on the catalogue service — there is no DELETE endpoint for a service row.
 */
function RowActionsMenu({
  row,
  onOpen,
  onRetire,
  onView,
}: {
  row: ServiceRow;
  onOpen: () => void;
  onRetire: () => void;
  onView: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        aria-label={`More actions for ${row.name}`}
      >
        <Icon name="more-vertical" className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              onOpen();
            }}
          >
            <Icon name="eye" className="h-3 w-3" />
            Open service
          </button>
          <Link
            href={`/services/${row.id}`}
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
            onClick={() => {
              setOpen(false);
              onView(row.id);
            }}
          >
            <Icon name="file-text" className="h-3 w-3" />
            View full page
          </Link>
          <div className="my-1 border-t border-slate-100" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-rose-700 hover:bg-rose-50"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              setConfirmRetire(true);
            }}
          >
            <Icon name="trash" className="h-3 w-3" />
            Retire…
          </button>
        </div>
      )}
      <ConfirmDialog
        open={confirmRetire}
        onClose={() => setConfirmRetire(false)}
        onConfirm={() => {
          setConfirmRetire(false);
          onRetire();
        }}
        title="Retire this service?"
        description={`Retired services hide from pickers but keep their history. "${row.name}" will no longer appear in catalogues.`}
        confirmText="Retire"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}

export default function ServicesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const paging = usePaging(10);
  const { filters, updateFilter, offset, setOffset, limit, page } = paging;
  const search = useDebouncedValue(filters.search ?? "");

  const [tab, setTab] = useState("all");
  const [openServiceId, setOpenServiceId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRetireOpen, setBulkRetireOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const bulkMenuRef = useRef<HTMLDivElement>(null);

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

  /** Retire a catalogue service by PATCHing `is_active: false`. The backend has no
 *  DELETE endpoint for a service row — retiring is an update, not a removal. */
  async function retireOne(id: string): Promise<boolean> {
    try {
      await api.patch(`/services/${id}`, { is_active: false });
      toast.push({ type: "success", message: "Service retired." });
      void queryClient.invalidateQueries({ queryKey: ["services"] });
      return true;
    } catch {
      toast.push({ type: "error", message: "Could not retire service." });
      return false;
    }
  }

  function bulkRetire() {
    selected.forEach(retireOne);
    setBulkRetireOpen(false);
    setSelected(new Set());
  }

  /** Change the category of every selected service. Uses `Promise.allSettled` so a single
   *  failure does not block the others, then reports successes and failures in a toast. */
  async function bulkChangeCategory(
    selectedIds: Set<string>,
    newCategory: string,
  ) {
    if (!newCategory || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(
      ids.map((id) => api.patch(`/services/${id}`, { category: newCategory })),
    );
    const successes = results.filter((r) => r.status === "fulfilled").length;
    const failures = results.length - successes;
    if (failures > 0) {
      toast.push({
        type: "error",
        message: `Could not update category for ${failures} service(s).`,
      });
    } else {
      toast.push({ type: "success", message: `${successes} service(s) updated.` });
    }
    void queryClient.invalidateQueries({ queryKey: ["services"] });
    setSelected(new Set());
    setBulkCategory("");
    setBulkMenuOpen(false);
  }

  const hasFilters = Object.values(filters).some(Boolean);

  function onTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const order = TABS.map((entry) => entry.key);
    const current = order.indexOf(tab);
    let next = current;
    if (event.key === "ArrowLeft") next = Math.max(0, current - 1);
    else if (event.key === "ArrowRight") next = Math.min(order.length - 1, current + 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = order.length - 1;
    if (next !== current) changeTab(order[next]);
  }

  useEffect(() => {
    if (!bulkMenuOpen) return;
    function onOutside(event: MouseEvent) {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(event.target as Node)) {
        setBulkMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [bulkMenuOpen]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Services"
        subtitle="Manage your service catalogue, client assignments and recurring work."
        action={
          <Button icon={<Icon name="plus" className="h-4 w-4" />} onClick={() => setAdding(true)}>
            Add Service
          </Button>
        }
      />

      <SummaryTiles summary={s} pending={summary.isPending} />

      {adding && (
        <Card title="Add a service" subtitle="It joins the catalogue and every picker">
          <AddServiceForm onDone={() => setAdding(false)} />
        </Card>
      )}

      <Card>
        <div
          role="tablist"
          aria-label="Service catalogue tabs"
          className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-3 pt-2"
          onKeyDown={onTabKeyDown}
        >
          {TABS.map((entry) => {
            const isActive = entry.key === tab;
            return (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
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
          <div className="col-span-2 block">
            <SearchInput
              value={filters.search ?? ""}
              onChange={(value) => updateFilter("search", value)}
              placeholder="Search services…"
              hideLabel
              aria-label="Search services"
            />
          </div>
          <Select
            label="Category"
            value={filters.category ?? ""}
            onChange={(value) => updateFilter("category", value)}
            options={categories.data ?? []}
            placeholder="Category"
            hideLabel
          />
          <Select
            label="Frequency"
            value={filters.frequency ?? ""}
            onChange={(value) => updateFilter("frequency", value)}
            options={FREQUENCIES}
            placeholder="Frequency"
            hideLabel
          />
          <Select
            label="Status"
            value={filters.status ?? ""}
            onChange={(value) => updateFilter("status", value)}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
            placeholder="Status"
            hideLabel
          />
        </div>

        {hasFilters && (
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-600">
              Showing {services.data?.meta.total ?? 0} of {s?.total_services ?? 0} services
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                paging.clearFilters();
                setSelected(new Set());
              }}
            >
              Clear
            </Button>
          </div>
        )}

        {selected.size > 0 && (
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-sky-50 px-3 py-2">
            <p className="text-xs font-medium text-sky-900">{selected.size} selected</p>
            <div className="flex items-center gap-2">
              <div ref={bulkMenuRef} className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Icon name="chevron-down" className="h-3 w-3" />}
                  iconPosition="right"
                  onClick={() => setBulkMenuOpen((open) => !open)}
                >
                  Bulk actions
                </Button>
                {bulkMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      disabled={selected.size === 0}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => {
                        setBulkMenuOpen(false);
                        setBulkRetireOpen(true);
                      }}
                    >
                      Retire…
                    </button>
                    <div className="px-3 py-1.5">
                      <Select
                        label="Change category"
                        value={bulkCategory}
                        onChange={(value) => bulkChangeCategory(selected, value)}
                        options={categories.data ?? []}
                        placeholder="Change category…"
                        hideLabel
                      />
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      disabled
                      aria-label="Export not available yet"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-400 disabled:cursor-not-allowed"
                    >
                      Export codes
                    </button>
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </Button>
            </div>
          </div>
        )}

        {services.isPending ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-4 rounded" variant="rectangular" />
                <Skeleton className="h-3 w-10" variant="text" />
                <Skeleton className="h-4 w-40" variant="text" />
                <Skeleton className="h-3 w-16" variant="text" />
                <Skeleton className="h-3 w-12" variant="text" />
                <Skeleton className="h-3 w-16" variant="text" />
                <Skeleton className="size-4 rounded-full" variant="circular" />
                <Skeleton className="h-3 w-8" variant="text" />
              </div>
            ))}
          </div>
        ) : services.isError ? (
          <ErrorState
            message={
              services.error instanceof ApiError
                ? services.error.message
                : "Could not load the service catalogue."
            }
            action={
              <Button variant="ghost" size="sm" onClick={() => services.refetch()}>
                Retry
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title={
              hasFilters || tab !== "all" ? undefined : "No services in the catalogue yet."
            }
            message={
              hasFilters || tab !== "all"
                ? "No services match those filters. Try another tab, or clear them."
                : "Add your first one to start attaching it to clients."
            }
            action={
              hasFilters || tab !== "all" ? (
                <Button variant="ghost" size="sm" onClick={() => paging.clearFilters()}>
                  Clear filters
                </Button>
              ) : (
                <Button
                  icon={<Icon name="plus" className="h-4 w-4" />}
                  onClick={() => setAdding(true)}
                >
                  Add service
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[64rem]">
              <TableHeader>
                <tr>
                  <TableHead className="w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all services on this page"
                    />
                  </TableHead>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Service Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead className="text-right">Default Fee</TableHead>
                  <TableHead className="text-right">Assigned Clients</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </tr>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      "hover:bg-slate-50",
                      selected.has(row.id) && "bg-[#F0F9FF]",
                    )}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleOne(row.id)}
                        aria-label={`Select ${row.name}`}
                      />
                    </TableCell>
                    <TableCell className="tabular text-xs text-slate-400">
                      {offset + index + 1}
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
                      <CategoryBadge category={row.category} labels={categoryLabels} />
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {row.default_frequency ? humanise(row.default_frequency) : "One-off"}
                    </TableCell>
                    <TableCell className="tabular text-right text-slate-700">
                      {row.standard_fee == null ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        rupees(row.standard_fee)
                      )}
                    </TableCell>
                    <TableCell className="text-right">
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
                    </TableCell>
                    <TableCell>
                      <Badge tone={row.is_active ? "success" : "neutral"}>
                        {row.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActionsMenu
                        row={row}
                        onOpen={() => setOpenServiceId(row.id)}
                        onRetire={() => retireOne(row.id)}
                        onView={() => {}}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
        >
          {(s?.by_category.length ?? 0) === 0 ? (
            <EmptyState message="No categories in use yet." />
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
            <Button
              variant="ghost"
              size="sm"
              disabled={!s?.assignments.length}
              aria-label={s?.assignments.length ? "View all assignments" : "No assignments to view"}
              onClick={() => setOpenServiceId(s?.assignments[0]?.service_id ?? null)}
            >
              View All
            </Button>
          }
        >
          <div className="overflow-x-auto">
            <Table className="min-w-[32rem]">
              <TableHeader>
                <tr>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Total Clients</TableHead>
                  <TableHead className="text-right">Active</TableHead>
                  <TableHead className="text-right">Inactive</TableHead>
                  <TableHead className="text-right">Annual Fees</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {s?.assignments.slice(0, 6).map((row) => (
                  <TableRow key={row.service_id} className="hover:bg-slate-50">
                    <TableCell>
                      <button
                        type="button"
                        className="font-medium text-slate-900 underline-offset-2 hover:text-sky-700 hover:underline"
                        onClick={() => setOpenServiceId(row.service_id)}
                      >
                        {row.code}
                      </button>
                    </TableCell>
                    <TableCell className="tabular text-right text-slate-700">
                      {row.total_clients}
                    </TableCell>
                    <TableCell className="tabular text-right font-medium text-emerald-700">
                      {row.active_clients}
                    </TableCell>
                    <TableCell className="tabular text-right text-slate-500">
                      {row.inactive_clients}
                    </TableCell>
                    <TableCell className="tabular text-right text-slate-700">
                      {row.annual_fees === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        rupees(row.annual_fees)
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {(s?.assignments.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6">
                      <EmptyState message="Nothing in the catalogue yet." />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={bulkRetireOpen}
        onClose={() => setBulkRetireOpen(false)}
        onConfirm={bulkRetire}
        title="Retire selected services?"
        description={`Retired services hide from pickers but keep their history. ${selected.size} selected.`}
        confirmText="Retire"
        cancelText="Cancel"
        variant="danger"
      />

      {openServiceId && (
        <ServiceDetailDrawer
          serviceId={openServiceId}
          onClose={() => setOpenServiceId(null)}
        />
      )}
    </div>
  );
}


