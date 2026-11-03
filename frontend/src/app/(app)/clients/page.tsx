"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, useEffect } from "react";

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  StatCard,
  useToast,
} from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ApiError, api, buildQuery } from "@/lib/api";
import { cn, formatDate, humanise } from "@/lib/format";
import { useDebouncedValue, usePaging } from "@/lib/hooks";
import { clientStatusTone } from "@/lib/status";
import { initials, useUserDirectory } from "@/lib/users";
import type { ClientListItem, ClientSummary, Page, ServiceRow } from "@/lib/types";

const CLIENT_TYPES = [
  "individual",
  "huf",
  "proprietorship",
  "partnership",
  "llp",
  "company",
  "trust",
  "society",
  "aop",
  "other",
] as const;

/**
 * The tabs, and the status each filters to.
 *
 * `null` means "no status filter", which is not the same as "every status": the list
 * endpoint hides closed clients unless asked for them, so the All tab counts everything
 * *except* closed. That keeps the tab's number equal to the rows beneath it — a tab
 * reading 256 above a table of 198 is worse than no number at all.
 */
const TABS: Array<{ key: string; label: string; status: string | null }> = [
  { key: "all", label: "All Clients", status: null },
  { key: "active", label: "Active", status: "active" },
  { key: "inactive", label: "Inactive", status: "inactive" },
  { key: "prospects", label: "Prospects", status: "prospect" },
];

function tabCount(summary: ClientSummary | undefined, key: string): number {
  if (!summary) return 0;
  switch (key) {
    case "active":
      return summary.active;
    case "inactive":
      return summary.inactive;
    case "prospects":
      return summary.prospects;
    default:
      return (
        summary.active +
        summary.inactive +
        summary.prospects +
        summary.onboarding +
        summary.on_hold
      );
  }
}

/** The coloured square that stands in for a client's logo. */
function ClientAvatar({ name }: { name: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-xs font-semibold text-blue-700">
      {initials(name)}
    </span>
  );
}

/** A person's initials in a circle, for the owner column. */
function OwnerAvatar({ name }: { name: string | null }) {
  if (!name) return <span className="text-xs text-hsl(var(--muted-foreground))">Unassigned</span>;
  return (
    <span className="flex items-center gap-1.5" title={name}>
      <span className="flex size-6 items-center justify-center rounded-full bg-hsl(var(--secondary)) text-[10px] font-semibold text-hsl(var(--secondary-foreground))">
        {initials(name)}
      </span>
      <span className="hidden text-xs text-hsl(var(--muted-foreground)) xl:inline">{name.split(" ")[0]}</span>
    </span>
  );
}

/**
 * The services column, as compact chips.
 *
 * The code rather than the full name: a row can hold four services, and "GST Returns,
 * Income Tax Return, TDS Returns, Tax Audit" turns a column into a paragraph. The code
 * is what a practitioner reads anyway.
 */
function ServiceChips({ services }: { services: ClientListItem["services"] }) {
  if (services.length === 0) {
    return <span className="text-xs text-hsl(var(--muted-foreground))">None</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {services.map((service, index) => (
        <span
          key={`${service.code}-${index}`}
          title={service.name}
          className="rounded bg-hsl(var(--secondary)) px-1.5 py-0.5 font-mono text-[10px] font-medium text-hsl(var(--secondary-foreground))"
        >
          {service.code}
        </span>
      ))}
    </span>
  );
}

/**
 * The eight headline figures.
 *
 * These use the shared `StatCard` rather than a local tile, and real icons rather than
 * emoji: an emoji glyph renders as a different picture on Windows, macOS and Android, so
 * the same screen looked different on every machine it was opened on.
 */
function SummaryTiles({ summary }: { summary: ClientSummary | undefined }) {
  const tiles = [
    { icon: "clients" as const, tone: "info" as const, label: "Total Clients", value: summary?.total ?? 0 },
    { icon: "check-circle" as const, tone: "success" as const, label: "Active Clients", value: summary?.active ?? 0 },
    { icon: "circle-dot" as const, tone: "neutral" as const, label: "Inactive Clients", value: summary?.inactive ?? 0 },
    { icon: "plus" as const, tone: "warning" as const, label: "New This Year", value: summary?.new_this_year ?? 0 },
    { icon: "file-text" as const, tone: "info" as const, label: "GST Clients", value: summary?.gst_clients ?? 0 },
    { icon: "reports" as const, tone: "progress" as const, label: "ITR Clients", value: summary?.itr_clients ?? 0 },
    { icon: "documents" as const, tone: "warning" as const, label: "TDS Clients", value: summary?.tds_clients ?? 0 },
    { icon: "building" as const, tone: "danger" as const, label: "MCA/ROC Clients", value: summary?.roc_clients ?? 0 },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-8">
      {tiles.map((tile) => (
        <StatCard
          key={tile.label}
          icon={<Icon name={tile.icon} className="h-5 w-5" />}
          tone={tile.tone}
          label={tile.label}
          value={tile.value}
        />
      ))}
    </div>
  );
}

export default function ClientsPage() {
  const paging = usePaging(25);
  const { filters, updateFilter, offset, setOffset, limit, page } = paging;
  const search = useDebouncedValue(filters.search ?? "");
  const directory = useUserDirectory();

  const queryClient = useQueryClient();
  const toast = useToast();
  const [openId, setActionsOpen] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [tab, setTab] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const activeTab = TABS.find((row) => row.key === tab) ?? TABS[0];

  // The filters that narrow *what is being looked at*, as opposed to which slice of it the
  // tab shows. The summary is built from these alone, so the tab counts keep describing
  // the whole filtered set rather than collapsing to whichever tab you are standing on.
  const scope = {
    search,
    client_type: filters.client_type,
    service_code: filters.service_code,
    city: filters.city,
    partner_id: filters.partner_id,
    kyc_status: filters.kyc_status,
  };

  const summary = useQuery({
    queryKey: ["clients", "summary", scope],
    queryFn: () => api.get<ClientSummary>(`/clients/summary${buildQuery(scope)}`),
  });

  const clients = useQuery({
    queryKey: ["clients", { ...scope, status: activeTab.status, offset, limit }],
    queryFn: () =>
      api.get<Page<ClientListItem>>(
        `/clients${buildQuery({ ...scope, status: activeTab.status ?? "", limit, offset })}`,
      ),
  });

  const services = useQuery({
    queryKey: ["services", "catalogue"],
    queryFn: () => api.get<Page<ServiceRow>>("/services?limit=100"),
    staleTime: 10 * 60 * 1000,
  });

  // Cities come from the rows already loaded rather than a dedicated endpoint: a firm has
  // tens of clients, not thousands, and a filter offering a city with nothing behind it is
  // a dead end.
  const cities = useMemo(() => {
    const seen = new Set<string>();
    for (const row of clients.data?.items ?? []) if (row.city) seen.add(row.city);
    return [...seen].sort();
  }, [clients.data]);

  const rows = clients.data?.items ?? [];
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

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
    // A selection made under one tab has no meaning under another.
    setSelected(new Set());
    setActionsOpen(null);
  }

  // Close an open actions menu when the user clicks elsewhere or hits Escape.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openId === null) return;
    function onOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setActionsOpen(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setActionsOpen(null);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  async function deleteOne(id: string, name: string) {
    setDeletingId(id);
    try {
      await api.delete(`/clients/${id}`);
      toast.push({ type: "success", message: `Deleted ${name}.` });
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch {
      toast.push({ type: "error", message: `Could not delete ${name}.` });
    } finally {
      setConfirmDelete(null);
      setDeletingId(null);
    }
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const s = summary.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clients"
        subtitle="Manage all your clients and their services."
        action={
          <Link href="/clients/new" className="btn btn-primary px-5 py-2.5">
            <Icon name="plus" className="h-4 w-4" />
            Add Client
          </Link>
        }
      />

      <SummaryTiles summary={s} />

      <Card>
        <div className="flex items-center gap-1 border-b border-border px-3 pt-2 pb-1 overflow-x-auto">
          {TABS.map((row) => {
            const isActive = row.key === tab;
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => changeTab(row.key)}
                className={cn(
                  "whitespace-nowrap -mb-px border-b-2 px-3 py-1.5 text-xs font-medium transition-colors duration-150 shrink-0",
                  isActive
                    ? "border-primary text-primary-foreground"
                    : "border-transparent text-hsl(var(--muted-foreground)) hover:text-hsl(var(--foreground)) hover:bg-hsl(var(--secondary))/50 rounded",
                )}
              >
                {row.label}
                <span
                  className={cn(
                    "tabular ml-1.5 px-1.5 py-0.5 text-[10px] font-semibold",
                    isActive ? "bg-primary/10 text-primary rounded" : "bg-hsl(var(--muted))/50 text-hsl(var(--muted-foreground)) rounded",
                  )}
                >
                  {tabCount(s, row.key)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-border p-3 md:grid-cols-3 xl:grid-cols-6">
          <label className="col-span-2 block md:col-span-1">
            <input
              className="input py-1.5"
              type="search"
              value={filters.search ?? ""}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Search clients…"
              aria-label="Search clients"
            />
          </label>
          <select
            className="select py-1.5"
            value={filters.client_type ?? ""}
            onChange={(event) => updateFilter("client_type", event.target.value)}
            aria-label="Client type"
          >
            <option value="">Client Type</option>
            {CLIENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {humanise(value)}
              </option>
            ))}
          </select>
          <select
            className="select py-1.5"
            value={filters.service_code ?? ""}
            onChange={(event) => updateFilter("service_code", event.target.value)}
            aria-label="Service"
          >
            <option value="">Service</option>
            {(services.data?.items ?? []).map((row) => (
              <option key={row.code} value={row.code}>
                {row.code}
              </option>
            ))}
          </select>
          <select
            className="select py-1.5"
            value={filters.city ?? ""}
            onChange={(event) => updateFilter("city", event.target.value)}
            aria-label="Location"
          >
            <option value="">Location</option>
            {cities.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            className="select py-1.5"
            value={filters.partner_id ?? ""}
            onChange={(event) => updateFilter("partner_id", event.target.value)}
            aria-label="Partner"
          >
            <option value="">Partner</option>
            {directory.active.map((row) => (
              <option key={row.id} value={row.id}>
                {row.full_name}
              </option>
            ))}
          </select>
          <select
            className="select py-1.5"
            value={filters.kyc_status ?? ""}
            onChange={(event) => updateFilter("kyc_status", event.target.value)}
            aria-label="KYC status"
          >
            <option value="">KYC</option>
            <option value="not_started">Not started</option>
            <option value="documents_pending">Documents pending</option>
            <option value="in_review">In review</option>
            <option value="complete">Complete</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {hasFilters && (
          <div className="flex items-center justify-between gap-3 border-b border-border bg-hsl(var(--secondary))/30 px-3 py-2">
            <p className="text-xs text-hsl(var(--muted-foreground))">
              Showing {clients.data?.meta.total ?? 0} of {s?.total ?? 0} clients
            </p>
            <button
              type="button"
              className="text-xs font-medium text-primary-foreground hover:underline"
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
          <div className="flex items-center justify-between gap-3 border-b border-border bg-hsl(var(--secondary))/30 px-3 py-2">
            <p className="text-xs font-medium text-hsl(var(--foreground))">
              {selected.size} selected
            </p>
            <button
              type="button"
              className="text-xs font-medium text-hsl(var(--muted-foreground)) hover:underline"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </button>
          </div>
        )}

        {clients.isPending && <LoadingState label="Loading clients…" />}
        {clients.isError && (
          <ErrorState
            message={
              clients.error instanceof ApiError
                ? clients.error.message
                : "Could not load clients."
            }
          />
        )}
        {clients.isSuccess && rows.length === 0 && (
          <EmptyState
            message={
              hasFilters
                ? "No client matches those filters."
                : "No clients yet. Add the first one to get started."
            }
          />
        )}

        {rows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[72rem]">
                <thead className="table-header">
                  <tr className="table-header-row">
                    <th className="table-head w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Select all clients on this page"
                      />
                    </th>
                    <th className="table-head w-10">#</th>
                    <th className="table-head">Client Name</th>
                    <th className="table-head">PAN</th>
                    <th className="table-head">GSTIN</th>
                    <th className="table-head">Type</th>
                    <th className="table-head">Location</th>
                    <th className="table-head">Services</th>
                    <th className="table-head">Partner</th>
                    <th className="table-head">Status</th>
                    <th className="table-head">Next Due Date</th>
                    <th className="table-head">Owner</th>
                    <th className="table-head w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {rows.map((client, index) => (
                    <tr
                      key={client.id}
                      className={cn(
                        "table-row",
                        selected.has(client.id) && "table-row-selected",
                      )}
                    >
                      <td className="table-cell">
                        <input
                          type="checkbox"
                          checked={selected.has(client.id)}
                          onChange={() => toggleOne(client.id)}
                          aria-label={`Select ${client.legal_name}`}
                        />
                      </td>
                      <td className="table-cell tabular text-xs text-hsl(var(--muted-foreground))">{offset + index + 1}</td>
                      <td className="table-cell">
                        <span className="flex items-center gap-2">
                          <ClientAvatar name={client.legal_name} />
                          <Link
                            href={`/clients/${client.id}`}
                            className="font-medium text-hsl(var(--foreground)) underline-offset-2 hover:underline"
                          >
                            {client.legal_name}
                          </Link>
                        </span>
                      </td>
                      <td className="table-cell font-mono text-xs text-hsl(var(--muted-foreground))">{client.pan ?? "—"}</td>
                      <td className="table-cell font-mono text-xs text-hsl(var(--muted-foreground))">
                        {client.gstin ?? "—"}
                      </td>
                      <td className="table-cell text-xs">{humanise(client.client_type)}</td>
                      <td className="table-cell text-xs">
                        {[client.city, client.state].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="table-cell">
                        <ServiceChips services={client.services} />
                      </td>
                      <td className="table-cell text-xs text-hsl(var(--muted-foreground))">{client.partner_name ?? "—"}</td>
                      <td className="table-cell">
                        <Badge tone={clientStatusTone(client.status)}>
                          {humanise(client.status)}
                        </Badge>
                      </td>
                      <td className="table-cell tabular text-xs">
                        {client.next_due_date ? (
                          formatDate(client.next_due_date)
                        ) : (
                          <span className="text-hsl(var(--muted-foreground))">—</span>
                        )}
                      </td>
                      <td className="table-cell">
                        <OwnerAvatar name={client.manager_name} />
                      </td>
                      <td className="table-cell">
                        <div
                          id={`actions-menu-${client.id}`}
                          ref={openId === client.id ? menuRef : null}
                          className="relative inline-block"
                        >
                          <button
                            type="button"
                            className="btn-icon text-hsl(var(--muted-foreground)) hover:bg-hsl(var(--secondary)) hover:text-hsl(var(--foreground))"
                            aria-label={`Actions for ${client.legal_name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActionsOpen((current) => (current === client.id ? null : client.id));
                            }}
                          >
                            <Icon name="more-vertical" className="h-4 w-4" />
                          </button>
                          {openId === client.id && (
                            <div
                              role="menu"
                              className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
                            >
                              <Link
                                href={`/clients/${client.id}/edit`}
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-hsl(var(--foreground)) hover:bg-hsl(var(--secondary)) transition-colors"
                                onClick={() => setActionsOpen(null)}
                              >
                                <Icon name="pencil" className="h-3 w-3" />
                                Edit
                              </Link>
                              <div className="my-1 separator separator-horizontal" />
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/5 transition-colors"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActionsOpen(null);
                                  setConfirmDelete({ id: client.id, name: client.legal_name });
                                }}
                              >
                                <Icon name="trash" className="h-3 w-3" />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              limit={limit}
              total={clients.data?.meta.total ?? 0}
              hasMore={clients.data?.meta.has_more ?? false}
              offset={offset}
              onOffsetChange={setOffset}
            />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) void deleteOne(confirmDelete.id, confirmDelete.name);
        }}
        title={`Delete "${confirmDelete?.name}"?`}
        description="Deleting a client cannot be undone. Its records will no longer appear in lists."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={deletingId === confirmDelete?.id}
      />
    </div>
  );
}
