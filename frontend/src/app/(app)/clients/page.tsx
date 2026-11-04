"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, useEffect } from "react";

import {
  Badge,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
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

const TABS = [
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

function ClientAvatar({ name }: { name: string }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#EEE7FF] to-[#E2D8FF] text-xs font-bold text-[#6034D5] ring-1 ring-[#DCD0FF]">
      {initials(name)}
    </span>
  );
}

function OwnerAvatar({ name }: { name: string | null }) {
  if (!name) {
    return <span className="text-xs text-slate-400">Unassigned</span>;
  }

  return (
    <span className="flex items-center gap-1.5" title={name}>
      <span className="flex size-7 items-center justify-center rounded-full bg-violet-100 text-[10px] font-semibold text-violet-700">
        {initials(name)}
      </span>
      <span className="hidden text-xs text-slate-600 xl:inline">
        {name.split(" ")[0]}
      </span>
    </span>
  );
}

function ServiceChips({
  services,
}: {
  services: ClientListItem["services"];
}) {
  if (services.length === 0) {
    return <span className="text-xs text-[#8A90A6]">None</span>;
  }

  return (
    <span className="flex flex-wrap gap-1">
      {services.map((service, index) => (
        <span
          key={`${service.code}-${index}`}
          title={service.name}
          className="rounded-md border border-[#E9E1FF] bg-[#F6F2FF] px-2 py-1 font-mono text-[10px] font-semibold text-[#6840D7]"
        >
          {service.code}
        </span>
      ))}
    </span>
  );
}

function SummaryTiles({
  summary,
}: {
  summary: ClientSummary | undefined;
}) {
  const tiles = [
    {
      icon: "clients" as const,
      label: "Total Clients",
      value: summary?.total ?? 0,
      tone: "violet",
      trend: "Client portfolio",
    },
    {
      icon: "check-circle" as const,
      label: "Active Clients",
      value: summary?.active ?? 0,
      tone: "green",
      trend: "Currently engaged",
    },
    {
      icon: "circle-dot" as const,
      label: "Inactive Clients",
      value: summary?.inactive ?? 0,
      tone: "rose",
      trend: "Not currently active",
    },
    {
      icon: "plus" as const,
      label: "Prospects",
      value: summary?.prospects ?? 0,
      tone: "amber",
      trend: "Potential clients",
    },
  ];

  const tones: Record<string, string> = {
    violet: "bg-[#F0E9FF] text-[#713FE6]",
    green: "bg-[#E3F8EF] text-[#0B9B61]",
    rose: "bg-[#FFE9EF] text-[#E34B70]",
    amber: "bg-[#FFF1DF] text-[#E58A24]",
  };

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="group relative overflow-hidden rounded-2xl border border-[#E5E4F4] bg-white p-4 shadow-[0_4px_16px_rgba(40,38,90,.045)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_9px_24px_rgba(65,48,130,.09)]"
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "grid h-12 w-12 shrink-0 place-items-center rounded-xl",
                tones[tile.tone]
              )}
            >
              <Icon name={tile.icon} className="h-6 w-6" />
            </span>

            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#59617E]">
                {tile.label}
              </p>

              <p className="mt-1 text-[27px] font-bold leading-none tracking-[-.04em] text-[#171A32]">
                {tile.value.toLocaleString("en-IN")}
              </p>

              <p className="mt-1 text-[10px] text-[#9298AE]">
                {tile.trend}
              </p>
            </div>
          </div>

          <span className="pointer-events-none absolute -bottom-5 -right-3 h-16 w-16 rounded-full bg-[#F2EEFF] opacity-70 blur-xl" />
        </div>
      ))}
    </div>
  );
}

export default function ClientsPage() {
  const paging = usePaging(25);

  const {
    filters,
    updateFilter,
    offset,
    setOffset,
    limit,
    page,
  } = paging;

  const search = useDebouncedValue(filters.search ?? "");
  const directory = useUserDirectory();

  const queryClient = useQueryClient();
  const toast = useToast();

  const [openId, setActionsOpen] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tab, setTab] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const activeTab = TABS.find((row) => row.key === tab) ?? TABS[0];

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
    queryFn: () =>
      api.get<ClientSummary>(`/clients/summary${buildQuery(scope)}`),
  });

  const clients = useQuery({
    queryKey: [
      "clients",
      { ...scope, status: activeTab.status, offset, limit },
    ],
    queryFn: () =>
      api.get<Page<ClientListItem>>(
        `/clients${buildQuery({
          ...scope,
          status: activeTab.status ?? "",
          limit,
          offset,
        })}`
      ),
  });

  const services = useQuery({
    queryKey: ["services", "catalogue"],
    queryFn: () => api.get<Page<ServiceRow>>("/services?limit=100"),
    staleTime: 10 * 60 * 1000,
  });

  const cities = useMemo(() => {
    const seen = new Set<string>();

    for (const row of clients.data?.items ?? []) {
      if (row.city) seen.add(row.city);
    }

    return [...seen].sort();
  }, [clients.data]);

  const rows = clients.data?.items ?? [];

  const allSelected =
    rows.length > 0 && rows.every((row) => selected.has(row.id));

  function toggleAll() {
    setSelected(
      allSelected ? new Set() : new Set(rows.map((row) => row.id))
    );
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
    setActionsOpen(null);
  }

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openId === null) return;

    function onOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setActionsOpen(null);
      }
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

      toast.push({
        type: "success",
        message: `Deleted ${name}.`,
      });

      void queryClient.invalidateQueries({
        queryKey: ["clients"],
      });
    } catch {
      toast.push({
        type: "error",
        message: `Could not delete ${name}.`,
      });
    } finally {
      setConfirmDelete(null);
      setDeletingId(null);
    }
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const s = summary.data;

  return (
    <div className="min-h-full space-y-5 bg-[#F7F8FC] p-4 md:p-5 xl:p-6">

      {/* Page heading */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold text-[#777E9B]">
            <span>Workspace</span>
            <Icon name="chevron-right" className="h-3 w-3" />
            <span className="text-[#343A58]">Clients</span>
          </div>

          <h1 className="text-[28px] font-bold tracking-[-.045em] text-[#171A32]">
            Clients
          </h1>

          <p className="mt-1 text-sm text-[#737A96]">
            Manage your clients, services, assignments and compliance in one place.
          </p>
        </div>

        <Link
          href="/clients/new"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#7543E9] to-[#5B31CC] px-5 py-3 text-sm font-semibold text-white shadow-[0_7px_18px_rgba(104,61,213,.22)] transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <Icon name="plus" className="h-4 w-4" />
          Add Client
        </Link>
      </div>

      {/* Summary cards */}
      <SummaryTiles summary={s} />

      {/* Main content */}
      <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_300px]">

        {/* Clients table */}
        <section className="min-w-0 overflow-hidden rounded-2xl border border-[#E4E6F2] bg-white shadow-[0_8px_28px_rgba(38,35,82,.055)]">

          {/* Tabs */}
          <div className="border-b border-[#EEF0F7] bg-white px-4 py-3">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {TABS.map((row) => {
                const isActive = row.key === tab;

                return (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => changeTab(row.key)}
                    className={cn(
                      "shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-semibold transition-all",
                      isActive
                        ? "bg-gradient-to-r from-[#7543E9] to-[#6032D4] text-white shadow-[0_5px_14px_rgba(104,61,213,.24)]"
                        : "text-[#69718F] hover:bg-[#F5F1FF] hover:text-[#6637D7]"
                    )}
                  >
                    {row.label}

                    <span
                      className={cn(
                        "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-[#F0EFF8] text-[#737A96]"
                      )}
                    >
                      {tabCount(s, row.key)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active filter indicator */}
          {hasFilters && (
            <div className="flex items-center justify-between gap-3 border-b border-[#EEF0F7] bg-[#F8F5FF] px-4 py-2.5">
              <p className="text-xs text-[#8A90A6]">
                Showing {clients.data?.meta.total ?? 0} of {s?.total ?? 0} clients
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

          {/* Selection indicator */}
          {selected.size > 0 && (
            <div className="flex items-center justify-between gap-3 border-b border-[#EEF0F7] bg-[#F1ECFF] px-4 py-2.5">
              <p className="text-xs font-medium text-[#6D3AE8]">
                {selected.size} selected
              </p>

              <button
                type="button"
                className="text-xs font-semibold text-[#6D3AE8] hover:underline"
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </button>
            </div>
          )}

          {clients.isPending && (
            <LoadingState label="Loading clients…" />
          )}

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

          {/* Table */}
          {rows.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[76rem]">
                  <thead className="bg-[#F4F2FB]">
                    <tr>
                      <th className="th w-8">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          aria-label="Select all clients on this page"
                        />
                      </th>
                      <th className="th w-10">#</th>
                      <th className="th">Client Name</th>
                      <th className="th">PAN</th>
                      <th className="th">GSTIN</th>
                      <th className="th">Type</th>
                      <th className="th">Location</th>
                      <th className="th">Services</th>
                      <th className="th">Partner</th>
                      <th className="th">Status</th>
                      <th className="th">Next Due Date</th>
                      <th className="th">Owner</th>
                      <th className="th w-20">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#EEF0F7]">
                    {rows.map((client, index) => (
                      <tr
                        key={client.id}
                        className={cn(
                          "transition-colors hover:bg-[#F8F6FF]",
                          selected.has(client.id) && "bg-[#F4F0FF]"
                        )}
                      >
                        <td className="td">
                          <input
                            type="checkbox"
                            checked={selected.has(client.id)}
                            onChange={() => toggleOne(client.id)}
                            aria-label={`Select ${client.legal_name}`}
                          />
                        </td>

                        <td className="td tabular text-xs text-[#8A90A6]">
                          {offset + index + 1}
                        </td>

                        <td className="td">
                          <span className="flex items-center gap-2">
                            <ClientAvatar name={client.legal_name} />

                            <Link
                              href={`/clients/${client.id}`}
                              className="font-semibold text-[#252B47] underline-offset-2 hover:text-[#6D3AE8] hover:underline"
                            >
                              {client.legal_name}
                            </Link>
                          </span>
                        </td>

                        <td className="td font-mono text-xs text-[#8A90A6]">
                          {client.pan ?? "—"}
                        </td>

                        <td className="td font-mono text-xs text-[#8A90A6]">
                          {client.gstin ?? "—"}
                        </td>

                        <td className="td text-xs text-[#303653]">
                          {humanise(client.client_type)}
                        </td>

                        <td className="td text-xs text-[#303653]">
                          {[client.city, client.state].filter(Boolean).join(", ") || "—"}
                        </td>

                        <td className="td">
                          <ServiceChips services={client.services} />
                        </td>

                        <td className="td text-xs text-[#8A90A6]">
                          {client.partner_name ?? "—"}
                        </td>

                        <td className="td">
                          <Badge tone={clientStatusTone(client.status)}>
                            {humanise(client.status)}
                          </Badge>
                        </td>

                        <td className="td tabular text-xs text-[#303653]">
                          {client.next_due_date
                            ? formatDate(client.next_due_date)
                            : <span className="text-[#8A90A6]">—</span>}
                        </td>

                        <td className="td">
                          <OwnerAvatar name={client.manager_name} />
                        </td>

                        <td className="td">
                          <div
                            id={`actions-menu-${client.id}`}
                            ref={openId === client.id ? menuRef : null}
                            className="relative inline-block"
                          >
                            <button
                              type="button"
                              className="rounded-lg p-2 text-[#8A90A6] transition hover:bg-[#F3F3FA] hover:text-[#252B47]"
                              aria-label={`Actions for ${client.legal_name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setActionsOpen((current) =>
                                  current === client.id ? null : client.id
                                );
                              }}
                            >
                              <Icon name="more-vertical" className="h-4 w-4" />
                            </button>

                            {openId === client.id && (
                              <div
                                role="menu"
                                className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-xl border border-[#E3E2F2] bg-white py-1 shadow-[0_14px_35px_rgba(35,30,80,.16)]"
                              >
                                <Link
                                  href={`/clients/${client.id}/edit`}
                                  role="menuitem"
                                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium text-[#252B47] transition-colors hover:bg-[#F3F3FA] hover:text-[#6D3AE8]"
                                  onClick={() => setActionsOpen(null)}
                                >
                                  <Icon name="pencil" className="h-3 w-3 text-[#6D3AE8]" />
                                  Edit
                                </Link>

                                <div className="my-1 border-t border-[#EEF0F7]" />

                                <button
                                  type="button"
                                  role="menuitem"
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setActionsOpen(null);
                                    setConfirmDelete({
                                      id: client.id,
                                      name: client.legal_name,
                                    });
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
        </section>

        {/* Filters and quick actions */}
        <aside className="space-y-4">

          <section className="overflow-hidden rounded-2xl border border-[#E4E2F3] bg-white shadow-[0_5px_18px_rgba(40,38,90,.05)]">
            <div className="flex items-center justify-between border-b border-[#EEF0F7] px-4 py-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[#171A32]">
                <Icon name="reports" className="h-4 w-4 text-[#713FE6]" />
                Filters
              </h2>

              {hasFilters && (
                <button
                  type="button"
                  onClick={() => {
                    paging.clearFilters();
                    setSelected(new Set());
                  }}
                  className="text-[10px] font-semibold text-[#6D3AE8] hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="space-y-3 p-4">
              <label className="block text-[11px] font-semibold text-[#424966]">
                Search clients
                <input
                  className="input mt-1.5 h-10 w-full rounded-xl border-[#E3E5F0] bg-white px-3 text-xs focus:border-[#9A7AEF] focus:ring-4 focus:ring-[#EEE8FF]"
                  type="search"
                  value={filters.search ?? ""}
                  onChange={(event) => updateFilter("search", event.target.value)}
                  placeholder="Name, code, PAN, GSTIN…"
                />
              </label>

              <label className="block text-[11px] font-semibold text-[#424966]">
                Client type
                <select
                  className="input mt-1.5 h-10 w-full rounded-xl border-[#E3E5F0] bg-white px-3 text-xs"
                  value={filters.client_type ?? ""}
                  onChange={(event) => updateFilter("client_type", event.target.value)}
                >
                  <option value="">All types</option>
                  {CLIENT_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {humanise(value)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-[11px] font-semibold text-[#424966]">
                Service
                <select
                  className="input mt-1.5 h-10 w-full rounded-xl border-[#E3E5F0] bg-white px-3 text-xs"
                  value={filters.service_code ?? ""}
                  onChange={(event) => updateFilter("service_code", event.target.value)}
                >
                  <option value="">All services</option>
                  {(services.data?.items ?? []).map((row) => (
                    <option key={row.code} value={row.code}>
                      {row.code}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-[11px] font-semibold text-[#424966]">
                Assigned partner / owner
                <select
                  className="input mt-1.5 h-10 w-full rounded-xl border-[#E3E5F0] bg-white px-3 text-xs"
                  value={filters.partner_id ?? ""}
                  onChange={(event) => updateFilter("partner_id", event.target.value)}
                >
                  <option value="">All users</option>
                  {directory.active.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-[11px] font-semibold text-[#424966]">
                City
                <select
                  className="input mt-1.5 h-10 w-full rounded-xl border-[#E3E5F0] bg-white px-3 text-xs"
                  value={filters.city ?? ""}
                  onChange={(event) => updateFilter("city", event.target.value)}
                >
                  <option value="">All cities</option>
                  {cities.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-[11px] font-semibold text-[#424966]">
                KYC status
                <select
                  className="input mt-1.5 h-10 w-full rounded-xl border-[#E3E5F0] bg-white px-3 text-xs"
                  value={filters.kyc_status ?? ""}
                  onChange={(event) => updateFilter("kyc_status", event.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="not_started">Not started</option>
                  <option value="documents_pending">Documents pending</option>
                  <option value="in_review">In review</option>
                  <option value="complete">Complete</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>

              <p className="rounded-lg bg-[#F7F4FF] px-3 py-2 text-[10px] text-[#77718F]">
                Filters update the client list automatically.
              </p>
            </div>
          </section>

          {/* Quick actions */}
          <section className="overflow-hidden rounded-2xl border border-[#E4E2F3] bg-white shadow-[0_5px_18px_rgba(40,38,90,.05)]">
            <div className="flex items-center gap-2 border-b border-[#EEF0F7] bg-gradient-to-r from-[#FBF9FF] to-[#F1EBFF] px-4 py-4">
              <Icon name="check-circle" className="h-4 w-4 text-[#713FE6]" />
              <h2 className="text-sm font-bold text-[#171A32]">
                Quick Actions
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-2 p-3">
              <Link
                href="/clients/new"
                className="flex min-h-[82px] flex-col items-center justify-center gap-2 rounded-xl border border-[#E8E0FF] bg-[#FBF9FF] px-2 py-3 text-center text-[10px] font-semibold text-[#343653] transition hover:border-[#C9B7FF] hover:bg-[#F4EEFF]"
              >
                <Icon name="plus" className="h-5 w-5 text-[#713FE6]" />
                New Client
              </Link>

              <Link
                href="/clients"
                onClick={() => {
                  paging.clearFilters();
                  setSelected(new Set());
                }}
                className="flex min-h-[82px] flex-col items-center justify-center gap-2 rounded-xl border border-[#E8E0FF] bg-[#FBF9FF] px-2 py-3 text-center text-[10px] font-semibold text-[#343653] transition hover:border-[#C9B7FF] hover:bg-[#F4EEFF]"
              >
                <Icon name="check-circle" className="h-5 w-5 text-[#713FE6]" />
                Reset List
              </Link>
            </div>
          </section>
        </aside>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) {
            void deleteOne(confirmDelete.id, confirmDelete.name);
          }
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