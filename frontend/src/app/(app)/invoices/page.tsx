"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Filter,
  Plus,
  Clock,
  Calendar,
  FileText,
  PiggyBank,
  Wallet,
  AlertTriangle,
  CheckCircle,
  MoreHorizontal,
  ChevronDown,
  ArrowRight,
  CreditCard,
  Banknote,
  Percent,
  Tag,
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { cn, formatDate, formatMoney, humanise } from "@/lib/format";
import { useDebouncedValue, usePaging } from "@/lib/hooks";
import { invoiceStatusLabel, invoiceStatusTone } from "@/lib/status";
import type { BillingSummary, Invoice, Page } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/PageContainer";

const TABS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All Invoices" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "partially_paid", label: "Partially Paid" },
  { key: "paid", label: "Paid" },
  { key: "overdue", label: "Overdue" },
];

const STATUS_COLOURS: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-600 border-emerald-100",
  partially_paid: "bg-amber-50 text-amber-600 border-amber-100",
  issued: "bg-blue-50 text-blue-600 border-blue-100",
  draft: "bg-muted/50 text-muted-foreground border-border/30",
  cancelled: "bg-muted/50 text-muted-foreground border-border/30",
};

export default function BillingPage() {
  const paging = usePaging(10);
  const { filters, updateFilter, offset, setOffset, limit, page } = paging;
  const search = useDebouncedValue(filters.search ?? "");

  const [tab, setTab] = useState("all");
  const [adding, setAdding] = useState(false);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const scope = {
    search,
    client_id: filters.client_id,
    date_from: filters.date_from,
    date_to: filters.date_to,
  };

  const summary = useQuery({
    queryKey: ["invoices", "summary", scope],
    queryFn: () =>
      api.get<BillingSummary>(
        `/invoices/summary${buildQuery({
          search,
          client_id: filters.client_id,
          date_from: filters.date_from,
          date_to: filters.date_to,
        })}`,
      ),
  });

  const invoices = useQuery({
    queryKey: ["invoices", "list", { ...scope, tab, offset, limit }],
    queryFn: () =>
      api.get<Page<Invoice>>(
        `/invoices${buildQuery({
          search,
          client_id: filters.client_id,
          date_from: filters.date_from,
          date_to: filters.date_to,
          group: tab === "all" ? undefined : tab,
          limit,
          offset,
        })}`,
      ),
  });

  const rows = invoices.data?.items ?? [];
  const s = summary.data;

  function changeTab(key: string) {
    setTab(key);
    setOffset(0);
  }

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-6">
      <Toaster />

      <PageHeader
        title="Billing"
        subtitle="Create invoices, manage payments and track outstanding receivables."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setAdding(!adding)} className="px-5 py-2.5">
              {adding ? (
                <>
                  <Clock className="h-4 w-4 mr-2" /> Cancel
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" /> Create Invoice
                </>
              )}
            </Button>
            <Link href="/invoices/new">
              <Button variant="default" className="px-5 py-2.5">
                <CreditCard className="h-4 w-4 mr-2" />
                New Invoice
              </Button>
            </Link>
          </div>
        }
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Billing" }]}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Invoiced</p>
              <p className="tabular text-2xl font-bold text-foreground">
                {formatMoney(s?.invoiced_total ?? 0)}
              </p>
              <p className="text-[11px] text-muted-foreground">{s?.invoiced_count ?? 0} invoices</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <FileText className="h-5 w-5" />
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Paid</p>
              <p className="tabular text-2xl font-bold text-foreground">
                {formatMoney(s?.collected_total ?? 0)}
              </p>
              <p className="text-[11px] text-muted-foreground">{s?.collected_count ?? 0} settled</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle className="h-5 w-5" />
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Outstanding</p>
              <p className="tabular text-2xl font-bold text-foreground">
                {formatMoney(s?.outstanding_total ?? 0)}
              </p>
              <p className="text-[11px] text-muted-foreground">{s?.outstanding_count ?? 0} invoices</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Banknote className="h-5 w-5" />
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Overdue</p>
              <p className="tabular text-2xl font-bold text-foreground">
                {formatMoney(s?.overdue_total ?? 0)}
              </p>
              <p className="text-[11px] text-muted-foreground">{s?.overdue_count ?? 0} invoices</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center gap-1 border-b border-border px-4 pt-2 pb-1 overflow-x-auto">
          {TABS.map((entry) => {
            const isActive = entry.key === tab;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => changeTab(entry.key)}
                className={cn(
                  "whitespace-nowrap -mb-px border-b-2 px-3 py-1.5 text-xs font-medium transition-colors shrink-0",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg",
                )}
              >
                {entry.label}
                <span
                  className={cn(
                    "tabular ml-1.5 px-2 py-0.5 text-[10px] font-semibold rounded",
                    isActive ? "bg-primary/10 text-primary" : "bg-muted/40 text-muted-foreground",
                  )}
                >
                  {s?.tab_counts?.[entry.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-4 border-b border-border p-3 md:grid-cols-5">
          <label className="col-span-2 block md:col-span-1">
            <Input
              type="search"
              value={filters.search ?? ""}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateFilter("search", event.target.value)}
              placeholder="Search by invoice no., client…"
              aria-label="Search invoices"
              className="input"
            />
          </label>
          <Select
            value={filters.client_id ?? ""}
            onValueChange={(value) => updateFilter("client_id", value)}
          >
            <SelectTrigger className="input w-full">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Clients</SelectItem>
              {(s?.clients ?? []).map((client: any) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name ?? client.code ?? "Unknown"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="block">
            <Input
              type="date"
              value={filters.date_from ?? ""}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateFilter("date_from", event.target.value)}
              aria-label="From date"
              className="input"
            />
          </label>
          <label className="block">
            <Input
              type="date"
              value={filters.date_to ?? ""}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateFilter("date_to", event.target.value)}
              aria-label="To date"
              className="input"
            />
          </label>
          <button
            type="button"
            className="flex h-10 items-center rounded-lg border border-transparent bg-muted/30 px-3 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
            disabled={!hasFilters}
            onClick={() => paging.clearFilters()}
          >
            Clear
          </button>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title={hasFilters || tab !== "all" ? "No matching invoices" : "No invoices yet"}
            description={
              hasFilters || tab !== "all"
                ? "Try another tab or clear your filters."
                : "No invoices have been raised yet."
            }
            action={
              <Link href="/invoices/new">
                <Button>Create Invoice</Button>
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="hidden md:table-cell">Client</TableHead>
                  <TableHead className="hidden lg:table-cell">Service</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">Amount</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Due Date</TableHead>
                  <TableHead className="w-16 text-center">Payments</TableHead>
                  <TableHead className="w-16 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((invoice, index) => (
                  <TableRow
                    key={invoice.id}
                    className="transition-colors hover:bg-muted/30"
                  >
                    <TableCell className="w-10 tabular text-center text-xs text-muted-foreground">
                      {offset + index + 1}
                    </TableCell>
                    <TableCell className="min-w-[200px]">
                      <div className="flex flex-col">
                        <button
                          type="button"
                          className="text-left font-medium text-foreground hover:text-primary transition-colors"
                          onClick={() => setOpenInvoiceId(invoice.id)}
                        >
                          {invoice.invoice_number ?? "(draft)"}
                        </button>
                        <span className="mt-0.5 text-xs text-muted-foreground">
                          {invoice.client_name ?? "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell min-w-[160px]">
                      {invoice.services.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {invoice.services.slice(0, 2).map((svc, sidx) => (
                            <span
                              key={sidx}
                              className="inline-flex items-center rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/30"
                            >
                              {svc}
                            </span>
                          ))}
                          {invoice.services.length > 2 && (
                            <span className="inline-flex items-center rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60 border border-border/30">
                              +{invoice.services.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell tabular text-right text-muted-foreground">
                      {formatMoney(invoice.total)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell tabular text-right text-muted-foreground">
                      {formatMoney(invoice.amount_paid)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {invoice.outstanding > 0 ? (
                        <span
                          className={cn(
                            "font-medium",
                            invoice.is_overdue ? "text-destructive" : "text-foreground",
                          )}
                        >
                          {formatMoney(invoice.outstanding)}
                        </span>
                      ) : (
                        <span className="text-emerald-600">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={invoiceStatusTone(invoice.status) as any}
                        className="text-[10px] px-2.5 py-0.5"
                      >
                        {invoiceStatusLabel(invoice.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className={cn(
                        "text-xs",
                        invoice.is_overdue ? "text-destructive" : "text-muted-foreground",
                      )}>
                        {formatDate(invoice.due_date)}
                      </span>
                    </TableCell>
                    <TableCell className="w-16 text-center">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                        aria-label="Record payment"
                        title="Record payment"
                        onClick={() => {
                          setOpenInvoiceId(invoice.id);
                        }}
                      >
                        <Wallet className="h-4 w-4" />
                      </button>
                    </TableCell>
                    <TableCell className="w-16 text-right">
                      <div className="relative inline-block">
                        <button
                          type="button"
                          className="p-1.5 text-muted-foreground hover:bg-muted/30 hover:text-foreground rounded-md transition-colors"
                          aria-label={`Actions for ${invoice.invoice_number}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenInvoiceId(invoice.id);
                          }}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Pagination
          total={invoices.data?.meta.total ?? 0}
          limit={limit}
          offset={offset}
          page={page}
          hasMore={offset + rows.length < (invoices.data?.meta.total ?? 0)}
          onOffsetChange={setOffset}
        />
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Receivables Ageing</CardTitle>
            <CardDescription>What is owed, by how late it is</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div>
              {(s?.ageing?.length ?? 0) === 0 ? (
                <EmptyState title="Nothing outstanding" description="No invoices are currently outstanding." />
              ) : (
                <div className="flex h-40 items-end gap-2">
                  {s?.ageing.map((row: any) => (
                    <div key={row.bucket} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                      <span className="tabular text-[11px] font-medium text-muted-foreground">
                        {row.amount > 0 ? formatMoney(row.amount) : "—"}
                      </span>
                      <div
                        className="w-full rounded-t transition-all duration-500"
                        style={{
                          height: "0%",
                          backgroundColor:
                            row.bucket === "current" ? "hsl(var(--muted-foreground))/20" :
                            row.bucket === "1-30" ? "hsl(var(--brand-info))" :
                            row.bucket === "31-60" ? "hsl(var(--brand-warning))" :
                            "hsl(var(--destructive))",
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex gap-2 border-t border-border pt-2">
                {s?.ageing.map((row: any) => (
                  <div key={row.bucket} className="min-w-0 flex-1 text-center">
                    <p className="truncate text-[10px] text-muted-foreground">{row.label}</p>
                    <p className="tabular text-[10px] text-muted-foreground">{row.count}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoices by Status</CardTitle>
            <CardDescription>Counts and share of the book</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {(s?.by_status?.length ?? 0) === 0 ? (
              <EmptyState title="No invoices" description="No invoices to break down yet." />
            ) : (
              <div className="space-y-3">
                {(s?.by_status as any[]).map((row) => (
                  <div key={row.status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          row.status === "paid" ? "bg-emerald-500" :
                          row.status === "partially_paid" ? "bg-amber-500" :
                          row.status === "issued" ? "bg-blue-500" :
                          "bg-muted-foreground",
                        )}
                      />
                      <span className="text-sm text-foreground">{humanise(row.status)}</span>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-sm font-semibold text-foreground">
                        {row.count}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {Math.round(row.percent)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Payments</CardTitle>
            <CardDescription>Latest receipts recorded</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {(s?.recent_payments?.length ?? 0) === 0 ? (
              <EmptyState title="No receipts" description="No receipts have been recorded yet." />
            ) : (
              <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Date</TableHead>
                    <TableHead className="text-left">Client</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-left">Mode</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(s?.recent_payments as any[]).slice(0, 6).map((payment: any) => (
                    <TableRow key={payment.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(payment.paid_on)}
                      </TableCell>
                      <TableCell className="text-xs text-foreground">
                        {payment.client_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs tabular text-right text-foreground">
                        {formatMoney(payment.amount)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {humanise(payment.method)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
