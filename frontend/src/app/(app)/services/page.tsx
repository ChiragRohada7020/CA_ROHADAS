"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { AddServiceForm, FREQUENCIES } from "@/components/ServiceForms";
import { ServiceDetailDrawer } from "@/components/ServiceDetailDrawer";
import { Icon } from "@/components/Icon";
import {
  Badge,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  Pagination,
  Skeleton,
  StatCard,
  Select,
  SearchInput,
  useToast,
} from "@/components/ui";
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

type ShortcutModifiers = { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean };

type Shortcut = { modifiers: ShortcutModifiers; key: string; target: string };

const defaultShortcuts: Record<string, Shortcut> = {
  "1": { modifiers: { ctrl: true, alt: false, shift: true, meta: false }, key: "1", target: "add" },
  "2": { modifiers: { ctrl: true, alt: false, shift: true, meta: false }, key: "2", target: "all" },
  "3": { modifiers: { ctrl: true, alt: false, shift: true, meta: false }, key: "3", target: "taxation" },
  "4": { modifiers: { ctrl: true, alt: false, shift: true, meta: false }, key: "4", target: "gst" },
  "5": { modifiers: { ctrl: true, alt: false, shift: true, meta: false }, key: "5", target: "audit" },
  "6": { modifiers: { ctrl: true, alt: false, shift: true, meta: false }, key: "6", target: "roc" },
  "7": { modifiers: { ctrl: true, alt: false, shift: true, meta: false }, key: "7", target: "other" },
  "8": { modifiers: { ctrl: true, alt: false, shift: true, meta: false }, key: "8", target: "search" },
  "9": { modifiers: { ctrl: true, alt: false, shift: true, meta: false }, key: "9", target: "clear" },
};

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

function rupees(value: number, compact = false): string {
  if (compact && value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} Cr`;
  if (compact && value >= 100_000) return `₹${(value / 100_000).toFixed(2)} L`;
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const CATEGORY_TONE: Record<string, string> = {
  gst: "bg-[#F0F7FF] text-[#1D4ED8]",
  income_tax: "bg-[#F5F0FF] text-[#7543E9]",
  tds: "bg-[#FFF4DE] text-[#D97736]",
  audit: "bg-[#EEF2FF] text-[#4F46E5]",
  roc: "bg-[#FFF1F2] text-[#BE123C]",
  accounting: "bg-[#F0FDFA] text-[#0E7490]",
  payroll: "bg-[#F0FDF4] text-[#15803D]",
  advisory: "bg-[#FFFBEB] text-[#B45309]",
};

function CategoryBadge({ category, labels }: { category: string; labels: Record<string, string> }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium",
        CATEGORY_TONE[category] ?? "bg-[#F1F3F5] text-[#6B7280]",
      )}
    >
      {labels[category] ?? CATEGORY_FALLBACK[category] ?? humanise(category)}
    </span>
  );
}

function SummaryTiles({ summary, pending }: { summary: ServiceSummary | undefined; pending: boolean }) {
  if (pending) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const tiles = [
    {
      icon: "check-circle",
      tone: "violet",
      label: "Total Services",
      value: summary ? String(summary.total_services ?? 0) : "0",
      hint: summary ? `${summary.active_services ?? 0} active` : "—",
    },
    {
      icon: "clients",
      tone: "indigo",
      label: "Assigned to Clients",
      value: summary ? String(summary.total_assignments ?? 0) : "0",
      hint: summary ? "Service instances" : "—",
    },
    {
      icon: "billing",
      tone: "progress",
      label: "Total Annual Fees",
      value: summary ? rupees(summary.total_annual_fees ?? 0, true) : "₹0",
      hint: summary ? "Across all clients" : "—",
    },
    {
      icon: "calendar",
      tone: "amber",
      label: "Recurring Services",
      value: summary ? String(summary.recurring_services ?? 0) : "0",
      hint: summary ? "Auto-generate tasks" : "—",
    },
  ];

  const TONE_BG: Record<string, string> = {
    violet: "bg-[#F0E9FF] text-[#713FE6]",
    indigo: "bg-[#EBEEFF] text-[#5B31CC]",
    progress: "bg-[#F1ECFF] text-[#6D3AE8]",
    amber: "bg-[#FFF1DF] text-[#D97736]",
  };

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="relative overflow-hidden rounded-[18px] border border-[#E3E5F4] bg-white p-4 shadow-[0_3px_12px_rgba(40,42,90,.045)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_9px_24px_rgba(65,48,130,.09)]"
        >
          <div className="flex flex-col items-start gap-1">
            <span className="text-[10px] font-semibold text-[#59617E] uppercase tracking-[.1em]">
              {tile.label}
            </span>
            <span className="tabular-nums text-[22px] font-bold leading-none tracking-[-.02em] text-[#171A32]">
              {tile.value}
            </span>
            <span className="text-[10px] text-[#9298AE]">{tile.hint}</span>
          </div>
          <div className="flex size-10 items-center justify-center rounded-lg absolute -right-2 -top-2">
            <span className={cn("grid h-8 w-8 place-items-center rounded-lg", TONE_BG[tile.tone])}>
              <Icon name={tile.icon as any} className="h-4 w-4" />
            </span>
          </div>
          <span className="pointer-events-none absolute -bottom-5 -right-3 h-16 w-16 rounded-full bg-[#F2EEFF] opacity-70 blur-xl" />
        </div>
      ))}
    </div>
  );
}

function RowActionsMenu({ row, onOpen, onRetire, onView }: { row: ServiceRow; onOpen: () => void; onRetire: () => void; onView: (id: string) => void }) {
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
        className="rounded p-1 text-[#94A3B8] hover:bg-[#F5F1FF] hover:text-[#454B68]"
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
          className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-lg border border-[#E4E6F2] bg-white shadow-[0_8px_28px_rgba(38,35,82,.055)]"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#454B68] hover:bg-[#F5F1FF]"
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
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#454B68] hover:bg-[#F5F1FF]"
            onClick={() => {
              setOpen(false);
              onView(row.id);
            }}
          >
            <Icon name="file-text" className="h-3 w-3" />
            View full page
          </Link>
          <div className="my-1 border-t border-[#EEF0F7]" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#DC2626] hover:bg-[#FEF2F2]"
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
  const paging = usePaging(25);
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

  // ============================================================================
  // KEYBOARD SHORTCUTS
  // ============================================================================
  const searchRef = useRef<HTMLInputElement>(null);
  const shortcutsRef = useRef<Record<string, Shortcut>>(defaultShortcuts);

  const [localShortcuts, setLocalShortcuts] = useState<Record<string, Shortcut>>(() => {
    try {
      const raw = localStorage.getItem("service-shortcuts");
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...defaultShortcuts, ...parsed };
      }
    } catch {}
    return defaultShortcuts;
  });
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  function formatShortcut(s: Shortcut): string {
    const parts: string[] = [];
    if (s.modifiers.ctrl) parts.push("Ctrl");
    if (s.modifiers.alt) parts.push("Alt");
    if (s.modifiers.shift) parts.push("Shift");
    if (s.modifiers.meta) parts.push("Cmd");
    parts.push(s.key.toUpperCase());
    return parts.join("+");
  }

  function matchesShortcut(event: KeyboardEvent, s: Shortcut): boolean {
    return (
      event.ctrlKey === s.modifiers.ctrl &&
      event.altKey === s.modifiers.alt &&
      event.shiftKey === s.modifiers.shift &&
      event.metaKey === s.modifiers.meta &&
      event.key.toLowerCase() === s.key.toLowerCase()
    );
  }

  function handleShortcut(target: string) {
    switch (target) {
      case "add":
        setAdding(true);
        break;
      case "all":
        changeTab("all");
        break;
      case "taxation":
        changeTab("taxation");
        break;
      case "gst":
        changeTab("gst");
        break;
      case "audit":
        changeTab("audit");
        break;
      case "roc":
        changeTab("roc");
        break;
      case "other":
        changeTab("other");
        break;
      case "search":
        searchRef.current?.focus();
        break;
      case "clear":
        paging.clearFilters();
        setSelected(new Set());
        break;
    }
  }

  // Single keyboard listener added ONCE on mount
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const key = event.key.toLowerCase();

      // Ignore modifier-only keys
      if (["control", "alt", "shift", "meta"].includes(key)) return;

      Object.values(shortcutsRef.current).forEach((s) => {
        if (matchesShortcut(event, s)) {
          event.preventDefault();
          event.stopPropagation();
          handleShortcut(s.target);
        }
      });
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Sync ref with local state whenever it changes
  useEffect(() => {
    shortcutsRef.current = localShortcuts;
  }, [localShortcuts]);

  // Persist shortcuts to localStorage so they survive refreshes
  useEffect(() => {
    try {
      localStorage.setItem("service-shortcuts", JSON.stringify(localShortcuts));
    } catch {}
  }, [localShortcuts]);

  const activeTab = TABS.find((row) => row.key === tab) ?? TABS[0];

  const tabQuery = activeTab.categories.map((value) => `categories=${value}`).join("&");

  const summary = useQuery({
    queryKey: ["services", "summary", search],
    queryFn: () => api.get<ServiceSummary>(`/services/summary${buildQuery({ search })}`),
  });

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

  async function bulkChangeCategory(selectedIds: Set<string>, newCategory: string) {
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
    <div className="min-h-full space-y-5 bg-[#F8F8FD] p-4 md:space-y-6 md:p-5 xl:p-6">
      {/* Dashboard-matched page hero */}
      <section className="relative isolate overflow-hidden rounded-[22px] border border-[#E5DFFC] bg-gradient-to-r from-[#F5F1FF] via-[#EEE9FF] to-[#DFDAFF] px-5 py-5 shadow-[0_5px_20px_rgba(75,53,145,.045)] sm:px-7 sm:py-6">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-24 h-64 w-64 rounded-full bg-white/45 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 right-[28%] h-48 w-48 rounded-full bg-[#B9A6FF]/25 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold tracking-wide text-[#77749A]">
              <span>Workspace</span>
              <Icon name="chevron-right" className="h-3 w-3" />
              <span className="text-[#5D43A1]">Service catalogue</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-white/75 text-[#6D3AE8] shadow-sm">
                <Icon name="file-text" className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-[25px] font-extrabold leading-tight tracking-[-.045em] text-[#171A32] sm:text-[29px]">
                  Services
                </h1>
                <p className="mt-1 max-w-2xl text-[12px] leading-5 text-[#6F7190] sm:text-[13px]">
                  Manage your service catalogue, client assignments and recurring work from one place.
                </p>
              </div>
            </div>
          </div>
          <div className="relative flex shrink-0 flex-wrap items-center gap-2">
            <div className="hidden items-center gap-2 rounded-xl border border-white/80 bg-white/55 px-3 py-2 text-[10px] font-semibold text-[#6D5A9B] sm:flex">
              <span className="size-1.5 rounded-full bg-[#32A879]" />
              Catalogue overview
            </div>
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-[#7543E9] to-[#5B31CC] px-5 py-2.5 text-[12px] font-bold text-white shadow-[0_7px_18px_rgba(104,61,213,.24)] transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-[#7543E9]/20"
              onClick={() => setAdding(true)}
            >
              <Icon name="plus" className="h-4 w-4" />
              Add service
            </button>
            <button
              type="button"
              onClick={() => setShowShortcuts(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[#ECEAF4] bg-[#FCFBFF] px-3 py-2.5 text-xs font-semibold text-[#454B68] hover:bg-[#F5F0FF] hover:border-[#CFC0F8] transition"
            >
              <Icon name="settings" className="h-3 w-3" />
              Shortcuts
            </button>
          </div>
        </div>
      </section>

      {/* Summary tiles */}
      <SummaryTiles summary={s} pending={summary.isPending} />

      {/* Add service modal */}
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a service"
        icon="plus"
        size="md"
      >
        <AddServiceForm onDone={() => setAdding(false)} />
      </Modal>

      {/* Main card */}
      <section className="overflow-hidden rounded-[20px] border border-[#E3E5F4] bg-white shadow-[0_4px_18px_rgba(40,42,90,.045)]">
        {/* Tabs */}
        <div className="border-b border-[#EEF0F7] bg-[#FCFBFF] px-4 py-3">
          <div className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((entry) => {
              const isActive = entry.key === tab;
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => changeTab(entry.key)}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-semibold transition-all",
                    isActive
                      ? "bg-gradient-to-r from-[#7543E9] to-[#6032D4] text-white shadow-[0_5px_14px_rgba(104,61,213,.24)]"
                      : "text-[#69718F] hover:bg-[#F5F1FF] hover:text-[#6637D7]"
                  )}
                >
                  {entry.label}

                  <span
                    className={cn(
                      "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-[#F0EFF8] text-[#737A96]"
                    )}
                  >
                    {s?.tab_counts[entry.key] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-2 gap-3 border-b border-[#EEF0F7] px-4 py-3 sm:grid-cols-4">
            <div className="col-span-2">
            <SearchInput
              ref={searchRef}
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
            <div className="flex items-center justify-between gap-3 border-b border-[#EEF0F7] bg-[#F8F5FF] px-4 py-2.5">
              <p className="text-xs text-[#8A90A6]">
                Showing {services.data?.meta.total ?? 0} of {s?.total_services ?? 0} services
              </p>
              <button
                type="button"
                className="text-xs font-semibold text-[#6D3AE8] hover:underline"
                onClick={() => {
                  paging.clearFilters();
                  setSelected(new Set());
                }}
              >
                Clear filters
              </button>
            </div>
          )}

          {selected.size > 0 && (
            <div className="flex items-center justify-between gap-3 border-b border-[#EEF0F7] bg-[#F0E9FF] px-4 py-2.5">
              <p className="text-xs font-medium text-[#713FE6]">{selected.size} selected</p>
              <div className="flex items-center gap-2">
                <div ref={bulkMenuRef} className="relative">
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-xl border border-[#ECEAF4] bg-[#FCFBFF] px-4 py-2.5 text-xs font-semibold text-[#454B68] hover:bg-[#F5F0FF] hover:border-[#CFC0F8] transition"
                    onClick={() => setBulkMenuOpen((open) => !open)}
                  >
                    Bulk actions
                    <Icon name="chevron-down" className="h-3 w-3" />
                  </button>
                  {bulkMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-lg border border-[#E4E6F2] bg-white shadow-[0_10px_28px_rgba(38,35,82,.08)]"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        disabled={selected.size === 0}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#454B68] hover:bg-[#F5F1FF] disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                          setBulkMenuOpen(false);
                          setBulkRetireOpen(true);
                        }}
                      >
                        <Icon name="trash" className="h-3 w-3" />
                        Retire…
                      </button>
                      <div className="px-3 py-2">
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
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#9CA3AF] disabled:cursor-not-allowed"
                      >
                        <Icon name="download" className="h-3 w-3" />
                        Export codes
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="text-xs font-semibold text-[#6D3AE8] hover:underline"
                  onClick={() => setSelected(new Set())}
                >
                  Clear selection
                </button>
              </div>
            </div>
          )}

          {services.isPending && <LoadingState label="Loading services…" />}

          {services.isError && (
            <ErrorState message="Could not load the service catalogue." />
          )}

          {rows.length === 0 && (
            <EmptyState
              title={hasFilters || tab !== "all" ? undefined : "No services in the catalogue yet."}
              message={
                hasFilters || tab !== "all"
                  ? "No services match those filters. Try another tab, or clear them."
                  : "Add your first one to start attaching it to clients."
              }
              action={
                hasFilters || tab !== "all" ? (
                  <button
                    type="button"
                    className="rounded-xl border border-[#ECEAF4] bg-[#FCFBFF] px-4 py-2 text-xs font-semibold text-[#454B68] hover:bg-[#F5F0FF] hover:border-[#CFC0F8] transition"
                    onClick={() => paging.clearFilters()}
                  >
                    Clear filters
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rounded-xl bg-gradient-to-r from-[#7543E9] to-[#5B31CC] px-4 py-2 text-xs font-semibold text-white shadow-[0_5px_14px_rgba(104,61,213,.22)] hover:-translate-y-0.5 hover:shadow-lg"
                    onClick={() => setAdding(true)}
                  >
                    <Icon name="plus" className="h-4 w-4 mr-1" />
                    Add service
                  </button>
                )
              }
            />
          )}

          {rows.length > 0 && (
            <div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[68rem]">
                  <thead className="bg-[#F7F5FC]">
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
                      <th className="th">Clients</th>
                      <th className="th">Status</th>
                      <th className="th w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0EEF5]">
                    {rows.map((row, index) => (
                      <tr
                        key={row.id}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-[#FAF8FF]",
                          selected.has(row.id) && "bg-[#F1EAFF]",
                        )}
                        onClick={() => setOpenServiceId(row.id)}
                      >
                        <td className="td">
                          <input
                            type="checkbox"
                            checked={selected.has(row.id)}
                            onChange={() => toggleOne(row.id)}
                            aria-label={`Select ${row.name}`}
                          />
                        </td>
                        <td className="td tabular text-xs text-[#94A3B8]">
                          {offset + index + 1}
                        </td>
                        <td className="td">
                          <button
                            type="button"
                            className="font-medium text-[#171A3D] hover:underline"
                            onClick={() => setOpenServiceId(row.id)}
                          >
                            {row.name}
                          </button>
                          <span className="block font-mono text-[10px] text-[#94A3B8]">
                            {row.code}
                          </span>
                        </td>
                        <td className="td">
                          <CategoryBadge category={row.category} labels={categoryLabels} />
                        </td>
                        <td className="td text-xs text-[#64748B]">
                          {row.default_frequency ? humanise(row.default_frequency) : "One-off"}
                        </td>
                        <td className="td tabular text-right text-[#64748B]">
                          {row.standard_fee == null ? (
                            <span className="text-[#94A3B8]">—</span>
                          ) : (
                            rupees(row.standard_fee)
                          )}
                        </td>
                        <td className="td tabular text-right text-xs text-[#64748B]">
                          {row.client_count}
                        </td>
                        <td className="td">
                          <Badge tone={row.is_active ? "success" : "neutral"} className="text-[10px]">
                            {row.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="td" onClick={(event) => event.stopPropagation()}>
                          <RowActionsMenu
                            row={row}
                            onOpen={() => setOpenServiceId(row.id)}
                            onRetire={() => retireOne(row.id)}
                            onView={() => {}}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                total={services.data?.meta.total ?? 0}
                limit={limit}
                offset={offset}
                page={page}
                hasMore={offset + rows.length < (services.data?.meta.total ?? 0)}
                onOffsetChange={setOffset}
              />
            </div>
          )}
        </div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Service Categories */}
        <section className="overflow-hidden rounded-[20px] border border-[#E3E5F4] bg-white shadow-[0_4px_18px_rgba(40,42,90,.045)]">
          <div className="flex items-center justify-between border-b border-[#EEF0F7] bg-[#F8F6FF] px-4 py-3">
            <div className="flex items-center gap-2">
              <Icon name="receipt" className="h-4 w-4 text-[#7543E9]" />
              <h3 className="text-sm font-bold text-[#171A32]">Service Categories</h3>
            </div>
          </div>
          <div className="p-4">
            {(s?.by_category.length ?? 0) === 0 ? (
              <EmptyState message="No categories in use yet." />
            ) : (
              <ul className="divide-y divide-[#EEF0F7]">
                {s?.by_category.map((row) => (
                  <li key={row.value}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[#F8F6FF] transition-colors"
                      onClick={() => updateFilter("category", row.value)}
                    >
                      <div className="flex items-center gap-2">
                        <CategoryBadge category={row.value} labels={categoryLabels} />
                        <span className="flex-1 text-sm text-[#171A32]">{row.label}</span>
                        <span className="tabular text-xs text-[#6D3AE8] font-semibold">{row.service_count}</span>
                      </div>
                      <span className="tabular text-xs text-[#9CA3AF]">{row.client_count} clients</span>
                      <Icon name="chevron-right" className="h-3 w-3 text-[#9CA3AF]" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Assignment Summary */}
        <section className="overflow-hidden rounded-[20px] border border-[#E3E5F4] bg-white shadow-[0_4px_18px_rgba(40,42,90,.045)]">
          <div className="flex items-center justify-between border-b border-[#EEF0F7] bg-[#F8F6FF] px-4 py-3">
            <div className="flex items-center gap-2">
              <Icon name="clients" className="h-4 w-4 text-[#7543E9]" />
              <h3 className="text-sm font-bold text-[#171A32]">Assignment Summary</h3>
            </div>
            <button
              type="button"
              className="p-1.5 cursor-pointer text-[#9CA3AF] hover:text-[#6D3AE8] hover:bg-[#F5F1FF] rounded-lg transition"
              disabled={!(s?.assignments.length ?? 0)}
              aria-label={s?.assignments.length ? "View all assignments" : "No assignments to view"}
            >
              <Icon name="chevron-right" className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem]">
                <thead className="bg-[#F7F5FC]">
                  <tr>
                    <th className="th">Service</th>
                    <th className="th text-right">Clients</th>
                    <th className="th text-right">Active</th>
                    <th className="th text-right">Annual Fees</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EEF5]">
                  {s?.assignments.slice(0, 6).map((row) => (
                    <tr
                      key={row.service_id}
                      className="cursor-pointer transition-colors duration-150 hover:bg-[#FAF8FF]"
                      onClick={() => setOpenServiceId(row.service_id)}
                    >
                      <td className="td">
                        <span className="font-medium text-[#171A3D]">{row.code}</span>
                      </td>
                      <td className="td tabular text-right text-[#64748B]">{row.total_clients}</td>
                      <td className="td tabular text-right font-medium text-[#16A34A]">
                        {row.active_clients}
                      </td>
                      <td className="td tabular text-right text-[#64748B]">
                        {row.annual_fees === 0 ? (
                          <span className="text-[#94A3B8]">—</span>
                        ) : (
                          rupees(row.annual_fees)
                        )}
                      </td>
                    </tr>
                  ))}
                  {(s?.assignments.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6">
                        <EmptyState message="Nothing in the catalogue yet." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {(s?.assignments.length ?? 0) > 6 && (
              <div className="pt-3 text-right">
                <button
                  type="button"
                  className="text-xs font-semibold text-[#6D3AE8] hover:underline"
                  onClick={() => setOpenServiceId(s?.assignments[0]?.service_id ?? null)}
                >
                  View all assignments
                </button>
              </div>
            )}
          </div>
        </section>
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

      {/* Shortcuts modal */}
      <Modal
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        title="Keyboard shortcuts"
        size="md"
      >
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowShortcuts(false)}
              className="inline-flex items-center gap-2 text-xs font-semibold text-[#737A96] hover:text-[#6637D7]"
            >
              <Icon name="arrow-left" className="h-3.5 w-3.5" />
              Back
            </button>
          </div>
          <p className="text-xs text-[#858BA4]">
            Click a row, then press any key combination (e.g. <span className="font-semibold">Alt+K</span>, <span className="font-semibold">Ctrl+Shift+S</span>, <span className="font-semibold">F2</span>).
          </p>
          <div className="space-y-3">
            {[
              { key: "1", label: "Add service", target: "add" },
              { key: "2", label: "All services", target: "all" },
              { key: "3", label: "Taxation", target: "taxation" },
              { key: "4", label: "GST", target: "gst" },
              { key: "5", label: "Audit", target: "audit" },
              { key: "6", label: "ROC", target: "roc" },
              { key: "7", label: "Other", target: "other" },
              { key: "8", label: "Focus search", target: "search" },
              { key: "9", label: "Clear filters", target: "clear" },
            ].map((item) => {
              const s = shortcutsRef.current[item.key];
              const isEditing = editingShortcutId === item.key;
              return (
                <div key={item.key} className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[#252B47]">{item.label}</span>
                  <div className="flex items-center gap-1">
                    {isEditing ? (
                      <input
                        type="text"
                        autoFocus
                        maxLength={1}
                        className="w-8 h-6 text-center text-xs font-mono border border-[#7042D8] bg-[#F0EAFE] px-1 outline-none focus:ring-1 focus:ring-[#7042D8]/30"
                        onKeyDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const key = e.key.toLowerCase();
                          if (["control", "alt", "shift", "meta"].includes(key)) return;
                          const next = {
                            ...shortcutsRef.current,
                            [item.key]: {
                              modifiers: {
                                ctrl: e.ctrlKey,
                                alt: e.altKey,
                                shift: e.shiftKey,
                                meta: e.metaKey,
                              },
                              key,
                              target: item.target,
                            },
                          };
                          shortcutsRef.current = next;
                          setLocalShortcuts(next);
                          setEditingShortcutId(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingShortcutId(item.key)}
                        className={`flex items-center gap-1 px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors ${isEditing ? "bg-[#F0EAFE] border-[#7042D8] text-[#7042D8]" : "bg-[#FAFAFE] border-[#E3E2F2] text-[#6B7280] hover:border-[#C0ADE8]"}`}
                      >
                        {formatShortcut(s)}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const next = {
                          ...shortcutsRef.current,
                          [item.key]: {
                            modifiers: { ctrl: true, alt: false, shift: true, meta: false },
                            key: item.key,
                            target: item.target,
                          },
                        };
                        shortcutsRef.current = next;
                        setLocalShortcuts(next);
                        setEditingShortcutId(null);
                      }}
                      className="text-xs text-[#858BA4] hover:text-[#DC2626] p-1"
                      title="Reset"
                    >
                      ↺
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-[#858BA4]">
            Use <span className="font-semibold">Tab</span> to move between fields.
          </p>
        </div>
      </Modal>
    </div>
  );
}
