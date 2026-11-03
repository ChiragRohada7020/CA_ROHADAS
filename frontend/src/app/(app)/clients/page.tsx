"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Filter,
  Plus,
  User,
  Building2,
  Clock,
  Trash2,
  Edit3,
  MoreHorizontal,
  ChevronRight,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Toaster,
  Pagination,
} from "@/components/ui";
import { api, buildQuery } from "@/lib/api";
import { cn, formatDate, humanise } from "@/lib/format";
import { useDebouncedValue, usePaging } from "@/lib/hooks";
import { clientStatusTone } from "@/lib/status";
import { initials, useUserDirectory } from "@/lib/users";
import type { ClientListItem, ClientSummary, Page } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/PageContainer";

const CLIENT_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "huf", label: "HUF" },
  { value: "proprietorship", label: "Proprietorship" },
  { value: "partnership", label: "Partnership" },
  { value: "llp", label: "LLP" },
  { value: "company", label: "Company" },
  { value: "trust", label: "Trust" },
  { value: "society", label: "Society" },
  { value: "aop", label: "AOP" },
  { value: "other", label: "Other" },
];

const TABS = [
  { key: "all", label: "All Clients", status: null },
  { key: "active", label: "Active", status: "active" },
  { key: "inactive", label: "Inactive", status: "inactive" },
  { key: "prospects", label: "Prospects", status: "prospect" },
  { key: "onboarding", label: "Onboarding", status: "onboarding" },
  { key: "on_hold", label: "On Hold", status: "on_hold" },
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
    case "onboarding":
      return summary.onboarding;
    case "on_hold":
      return summary.on_hold;
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
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

  const tones = [
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-rose-100 text-rose-700",
    "bg-amber-100 text-amber-700",
    "bg-violet-100 text-violet-700",
    "bg-indigo-100 text-indigo-700",
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % 997;
  }

  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg font-semibold", tones[hash % tones.length])}>
      {initials}
    </span>
  );
}

function OwnerAvatar({ name }: { name: string | null }) {
  if (!name) return <span className="text-xs text-muted-foreground">Unassigned</span>;
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase();
  return (
    <span className="flex items-center gap-1.5" title={name}>
      <span className="flex size-6 items-center justify-center rounded-full bg-violet-100 text-[10px] font-semibold text-violet-700">
        {initials}
      </span>
      <span className="hidden text-xs text-muted-foreground lg:inline">{name.split(" ")[0]}</span>
    </span>
  );
}

function ServiceChips({ services }: { services: ClientListItem["services"] }) {
  if (services.length === 0) {
    return <span className="text-xs text-muted-foreground">None</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {services.map((service, index) => (
        <span
          key={`${service.code}-${index}`}
          title={service.name}
          className="rounded bg-muted/40 px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground border border-border/30"
        >
          {service.code}
        </span>
      ))}
    </span>
  );
}

function SummaryTiles({ summary }: { summary: ClientSummary | undefined }) {
  const tiles = [
    { icon: User, tone: "bg-blue-50 text-blue-600", label: "Total Clients", value: summary?.total ?? 0 },
    { icon: CheckCircle, tone: "bg-emerald-50 text-emerald-600", label: "Active Clients", value: summary?.active ?? 0 },
    { icon: User, tone: "bg-muted/50 text-muted-foreground", label: "Inactive Clients", value: summary?.inactive ?? 0 },
    { icon: Plus, tone: "bg-amber-50 text-amber-600", label: "New This Year", value: summary?.new_this_year ?? 0 },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <Card key={tile.label} className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{tile.label}</p>
                <p className="tabular text-2xl font-bold text-foreground">{tile.value}</p>
              </div>
              <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", tile.tone)}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default function ClientsPage() {
  const paging = usePaging(25);
  const { filters, updateFilter, offset, setOffset, limit, page } = paging;
  const search = useDebouncedValue(filters.search ?? "");
  const directory = useUserDirectory();

  const queryClient = useQueryClient();
  const [openId, setActionsOpen] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
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
    queryFn: () => api.get<Page<any>>("/services?limit=100"),
    staleTime: 10 * 60 * 1000,
  });

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
    setSelected(new Set());
    setActionsOpen(null);
  }

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
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch {
      // error handled by toast in a real app
    } finally {
      setConfirmDelete(null);
      setDeletingId(null);
    }
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const s = summary.data;

  return (
    <div className="space-y-6">
      <Toaster />

      <PageHeader
        title="Clients"
        subtitle="Manage all your clients and their services."
        action={
          <Link href="/clients/new">
            <Button className="px-5 py-2.5">
              <Plus className="h-4 w-4 mr-2" />
              Add Client
            </Button>
          </Link>
        }
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Clients" }]}
      />

      <SummaryTiles summary={s} />

      <Card>
        <div className="flex items-center gap-1 border-b border-border px-4 pt-3 pb-1 overflow-x-auto">
          {TABS.map((row) => {
            const isActive = row.key === tab;
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => changeTab(row.key)}
                className={cn(
                  "whitespace-nowrap -mb-px border-b-2 px-3 py-1.5 text-xs font-medium transition-colors shrink-0",
                  isActive
                    ? "border-hsl(var(--primary)) text-hsl(var(--primary))"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg",
                )}
              >
                {row.label}
                <span
                  className={cn(
                    "tabular ml-1.5 px-2 py-0.5 text-[10px] font-semibold rounded",
                    isActive ? "bg-primary/10 text-hsl(var(--primary))" : "bg-muted/40 text-muted-foreground",
                  )}
                >
                  {tabCount(s, row.key)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-4 border-b border-border p-4 md:grid-cols-3 lg:grid-cols-6">
          <label className="col-span-2 block md:col-span-1">
            <Input
              type="search"
              value={filters.search ?? ""}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateFilter("search", event.target.value)}
              placeholder="Search clients…"
              aria-label="Search clients"
              className="input"
            />
          </label>
          <Select
            value={filters.client_type ?? ""}
            onValueChange={(value) => updateFilter("client_type", value)}
          >
            <SelectTrigger className="input w-full">
              <SelectValue placeholder="Client Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Types</SelectItem>
              {CLIENT_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.service_code ?? ""}
            onValueChange={(value) => updateFilter("service_code", value)}
          >
            <SelectTrigger className="input w-full">
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Services</SelectItem>
              {(services.data?.items ?? []).map((row: any) => (
                <SelectItem key={row.code} value={row.code}>
                  {row.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.city ?? ""}
            onValueChange={(value) => updateFilter("city", value)}
          >
            <SelectTrigger className="input w-full">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Locations</SelectItem>
              {cities.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.partner_id ?? ""}
            onValueChange={(value) => updateFilter("partner_id", value)}
          >
            <SelectTrigger className="input w-full">
              <SelectValue placeholder="Partner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Partners</SelectItem>
              {directory.active.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.kyc_status ?? ""}
            onValueChange={(value) => updateFilter("kyc_status", value)}
          >
            <SelectTrigger className="input w-full">
              <SelectValue placeholder="KYC Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All KYC</SelectItem>
              <SelectItem value="not_started">Not Started</SelectItem>
              <SelectItem value="documents_pending">Documents Pending</SelectItem>
              <SelectItem value="in_review">In Review</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {hasFilters && (
          <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-2">
            <p className="text-xs text-muted-foreground">
              Showing {clients.data?.meta.total ?? 0} of {s?.total ?? 0} clients
            </p>
            <button
              type="button"
              className="text-xs font-medium text-hsl(var(--primary)) hover:underline"
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
          <div className="flex items-center justify-between gap-3 border-b border-border bg-blue-50 px-4 py-2">
            <p className="text-xs font-medium text-blue-900">{selected.size} selected</p>
            <button
              type="button"
              className="text-xs font-medium text-blue-700 hover:underline"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </button>
          </div>
        )}

        {clients.isPending ? (
          <div className="p-8 text-center">
            <div className="h-4 w-24 bg-muted rounded animate-pulse mx-auto mb-2" />
            <div className="h-4 w-16 bg-muted rounded animate-pulse mx-auto" />
          </div>
        ) : clients.isError ? (
          <div className="p-8 text-center text-destructive">
            Could not load clients.
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No matching clients" : "No clients yet"}
            description={
              hasFilters
                ? "Try adjusting your filters or clear them to see all clients."
                : "Add your first client to get started."
            }
            action={
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Client
              </Button>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table className="min-w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Select all clients"
                      />
                    </TableHead>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Client Name</TableHead>
                    <TableHead className="hidden sm:table-cell">PAN</TableHead>
                    <TableHead className="hidden sm:table-cell">GSTIN</TableHead>
                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                    <TableHead className="hidden md:table-cell">Location</TableHead>
                    <TableHead className="hidden lg:table-cell">Services</TableHead>
                    <TableHead className="hidden xl:table-cell">Partner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Next Due</TableHead>
                    <TableHead className="w-20 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((client, index) => (
                    <TableRow
                      key={client.id}
                      className={cn(
                        "transition-colors hover:bg-muted/30",
                        selected.has(client.id) && "bg-blue-50/60",
                      )}
                    >
                      <TableCell className="w-8">
                        <input
                          type="checkbox"
                          checked={selected.has(client.id)}
                          onChange={() => toggleOne(client.id)}
                          aria-label={`Select ${client.legal_name}`}
                        />
                      </TableCell>
                      <TableCell className="w-10 tabular text-xs text-muted-foreground">
                        {offset + index + 1}
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        <div className="flex items-center gap-2.5">
                          <ClientAvatar name={client.legal_name} />
                          <div>
                            <Link
                              href={`/clients/${client.id}`}
                              className="font-medium text-foreground hover:text-hsl(var(--primary)) transition-colors"
                            >
                              {client.legal_name}
                            </Link>
                            <span className="ml-1 font-mono text-xs text-muted-foreground">
                              {client.client_code}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell font-mono text-xs text-muted-foreground">
                        {client.pan ?? "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell font-mono text-xs text-muted-foreground">
                        {client.gstin ?? "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs">
                        {humanise(client.client_type)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {[client.city, client.state].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <ServiceChips services={client.services} />
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                        {client.partner_name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={clientStatusTone(client.status) as any} className="text-[10px]">
                          {humanise(client.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell tabular text-xs text-muted-foreground">
                        {client.next_due_date ? formatDate(client.next_due_date) : "—"}
                      </TableCell>
                      <TableCell className="w-20 text-right">
                        <div className="relative inline-block">
                          <button
                            type="button"
                            className="p-1.5 text-muted-foreground hover:bg-muted/30 hover:text-foreground rounded-md transition-colors"
                            aria-label={`Actions for ${client.legal_name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActionsOpen((current) => (current === client.id ? null : client.id));
                            }}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {openId === client.id && (
                            <AnimatePresence>
                              <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                className="absolute right-0 mt-2 w-48 rounded-xl border border-border bg-popover p-1 shadow-lg z-50"
                              >
                                <Link
                                  href={`/clients/${client.id}/edit`}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left text-foreground hover:bg-muted/50 transition-colors"
                                  onClick={() => setActionsOpen(null)}
                                >
                                  <Edit3 className="h-4 w-4 mr-2" />
                                  Edit
                                </Link>
                                <Separator className="my-1" />
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left text-destructive hover:bg-rose-50 transition-colors"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setActionsOpen(null);
                                    setConfirmDelete({ id: client.id, name: client.legal_name });
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </button>
                              </motion.div>
                            </AnimatePresence>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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

      <Dialog open={confirmDelete !== null} onOpenChange={open => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Client?</DialogTitle>
            <DialogDescription>
              Deleting "{confirmDelete?.name}" cannot be undone. Its records will no longer appear in lists.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setConfirmDelete(null)} variant="outline">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (confirmDelete) void deleteOne(confirmDelete.id, confirmDelete.name);
              }}
              variant="destructive"
              disabled={deletingId === confirmDelete?.id}
            >
              {deletingId === confirmDelete?.id ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
