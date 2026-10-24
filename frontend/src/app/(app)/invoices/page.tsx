"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { GenerateInvoicesPanel, NewInvoiceForm } from "@/components/BillingForms";
import { InvoiceDetailDrawer } from "@/components/InvoiceDetailDrawer";
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
import { Icon } from "@/components/Icon";
import { DonutChart } from "@/components/charts";
import { api, buildQuery } from "@/lib/api";
import { cn, formatDate, formatMoney, humanise } from "@/lib/format";
import { useDebouncedValue, usePaging } from "@/lib/hooks";
import { invoiceStatusLabel, invoiceStatusTone } from "@/lib/status";
import type { BillingSummary, Invoice, Page } from "@/lib/types";

/**
 * The tabs, and the `group` each sends.
 *
 * "Sent" is the firm's word for an issued invoice — it has gone to the client. The
 * status column says `issued`, which is about the ledger, not about the post.
 */
const TABS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All Invoices" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "partially_paid", label: "Partially Paid" },
  { key: "paid", label: "Paid" },
  { key: "overdue", label: "Overdue" },
  { key: "credit_notes", label: "Credit Notes" },
];

/** Colour per status, shared by the donut and the table's badges. */
const STATUS_STROKE: Record<string, string> = {
  paid: "stroke-emerald-500",
  partially_paid: "stroke-amber-500",
  issued: "stroke-sky-500",
  draft: "stroke-slate-400",
};

/** The ageing bars run cool-to-hot as the money gets older. */
const AGEING_FILL: Record<string, string> = {
  current: "bg-slate-300",
  "1-30": "bg-amber-400",
  "31-60": "bg-orange-500",
  "61-90": "bg-rose-500",
  "90+": "bg-rose-700",
};

export default function BillingPage() {
  const paging = usePaging(10);
  const { filters, updateFilter, offset, setOffset, limit, page } = paging;
  const search = useDebouncedValue(filters.search ?? "");

  const [tab, setTab] = useState("all");
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);

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
          group: tab === "all" || tab === "credit_notes" ? undefined : tab,
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
  // Credit notes live in their own table, so that tab is a link rather than a filter.
  const showingCreditNotes = tab === "credit_notes";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Billing"
        subtitle="Create invoices, manage payments and track outstanding receivables."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/invoices/settings" className="btn-ghost">
              <Icon name="settings" className="h-4 w-4" />
              Invoice Template
            </Link>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setGenerating(!generating)}
            >
              Bulk Actions
            </button>
            <Link href="/invoices/new">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setAdding(!adding)}
              >
                <Icon name="plus" className="h-4 w-4" />
                {adding ? "Cancel" : "Create Invoice"}
              </button>
            </Link>
          </div>
        }
      />

      {summary.isError && (
        <ErrorState
          message={
            summary.error instanceof Error
              ? summary.error.message
              : "Could not load the billing figures."
          }
        />
      )}

      <SummaryTiles summary={s} />

      {generating && <GenerateInvoicesPanel />}
      {adding && (
        <NewInvoiceForm
          onDone={(invoiceId) => {
            setAdding(false);
            setOpenInvoiceId(invoiceId);
          }}
        />
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
                  "-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors",
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

        <div className="grid grid-cols-2 gap-2 border-b border-slate-200 p-3 md:grid-cols-5">
          <label className="col-span-2 block">
            <input
              className="input py-1.5"
              type="search"
              value={filters.search ?? ""}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Search by invoice no., client…"
              aria-label="Search invoices"
            />
          </label>
          <select
            className="input py-1.5"
            value={filters.client_id ?? ""}
            onChange={(event) => updateFilter("client_id", event.target.value)}
            aria-label="Client"
          >
            <option value="">Client</option>
            {(s?.clients ?? []).map((client) => (
              <option key={client.id} value={client.id}>
                {client.name ?? client.code ?? "Unknown"}
              </option>
            ))}
          </select>
          <label className="block">
            <input
              className="input py-1.5"
              type="date"
              value={filters.date_from ?? ""}
              onChange={(event) => updateFilter("date_from", event.target.value)}
              aria-label="From date"
            />
          </label>
          <label className="block">
            <input
              className="input py-1.5"
              type="date"
              value={filters.date_to ?? ""}
              onChange={(event) => updateFilter("date_to", event.target.value)}
              aria-label="To date"
            />
          </label>
          <button
            type="button"
            className="btn-ghost py-1.5"
            disabled={!hasFilters}
            onClick={() => paging.clearFilters()}
          >
            Clear
          </button>
        </div>


        {showingCreditNotes ? (
          <EmptyState
            title="Credit notes"
            message="Credit notes are raised from an invoice's page. None have been issued for these clients yet."
          />
        ) : invoices.isPending ? (
          <LoadingState label="Loading invoices…" />
        ) : invoices.isError ? (
          <EmptyState message="Could not load invoices." />
        ) : rows.length === 0 ? (
          <EmptyState
            message={
              hasFilters || tab !== "all"
                ? "No invoices match these filters. Try another tab or clear them."
                : "No invoices have been raised yet."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[72rem]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th w-8">
                    <input type="checkbox" aria-label="Select all invoices on this page" />
                  </th>
                  <th className="th w-10">#</th>
                  <th className="th">Invoice No.</th>
                  <th className="th">Date</th>
                  <th className="th">Client</th>
                  <th className="th">Services</th>
                  <th className="th text-right">Amount</th>
                  <th className="th text-right">Paid</th>
                  <th className="th text-right">Balance</th>
                  <th className="th">Status</th>
                  <th className="th">Due Date</th>
                  <th className="th w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((invoice, index) => (
                  <tr key={invoice.id} className="hover:bg-slate-50">
                    <td className="td">
                      <input
                        type="checkbox"
                        aria-label={`Select ${invoice.invoice_number ?? "draft"}`}
                      />
                    </td>
                    <td className="td tabular text-xs text-slate-400">
                      {offset + index + 1}
                    </td>
                    <td className="td">
                      <button
                        type="button"
                        className="font-medium text-slate-900 underline-offset-2 hover:text-sky-700 hover:underline"
                        onClick={() => setOpenInvoiceId(invoice.id)}
                      >
                        {invoice.invoice_number ?? "(draft)"}
                      </button>
                    </td>
                    <td className="td text-xs text-slate-600">
                      {formatDate(invoice.invoice_date)}
                    </td>
                    <td className="td text-xs text-slate-700">
                      {invoice.client_name ?? "—"}
                    </td>
                    <td className="td text-xs text-slate-600">
                      {invoice.services.length === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <span className="line-clamp-2">{invoice.services.join(", ")}</span>
                      )}
                    </td>
                    <td className="td tabular text-right text-slate-700">
                      {formatMoney(invoice.total)}
                    </td>
                    <td className="td tabular text-right text-slate-600">
                      {formatMoney(invoice.amount_paid)}
                    </td>
                    <td className="td tabular text-right">
                      {invoice.outstanding > 0 ? (
                        <span
                          className={cn(
                            "font-medium",
                            invoice.is_overdue ? "text-rose-700" : "text-slate-800",
                          )}
                        >
                          {formatMoney(invoice.outstanding)}
                        </span>
                      ) : (
                        <span className="text-emerald-700">—</span>
                      )}
                    </td>
                    <td className="td">
                      <Badge tone={invoiceStatusTone(invoice.status)}>
                        {invoiceStatusLabel(invoice.status)}
                      </Badge>
                    </td>
                    <td
                      className={cn(
                        "td text-xs",
                        invoice.is_overdue ? "text-rose-700" : "text-slate-600",
                      )}
                    >
                      {formatDate(invoice.due_date)}
                    </td>
                    <td className="td text-right">
                      <button
                        type="button"
                        className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        onClick={() => setOpenInvoiceId(invoice.id)}
                        aria-label="Open invoice"
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

        <Pagination
          total={invoices.data?.meta.total ?? 0}
          limit={limit}
          offset={offset}
          page={page}
          hasMore={offset + rows.length < (invoices.data?.meta.total ?? 0)}
          onOffsetChange={setOffset}
        />
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Receivables Aging" subtitle="What is owed, by how late it is">
          <AgeingPanel summary={s} />
        </Card>

        <Card title="Invoices by Status" subtitle="Counts and share of the book">
          {(s?.by_status.length ?? 0) === 0 ? (
            <EmptyState message="No invoices to break down yet." />
          ) : (
            <div className="p-4">
              <DonutChart
                total={s?.by_status.reduce((sum, row) => sum + row.count, 0) ?? 0}
                totalLabel="Invoices"
                size={148}
                segments={(s?.by_status ?? []).map((row) => ({
                  key: row.status,
                  label: `${row.label} — ${row.count} (${Math.round(row.percent)}%)`,
                  value: row.count,
                  className: STATUS_STROKE[row.status] ?? "stroke-slate-400",
                }))}
              />
            </div>
          )}
        </Card>

        <Card
          title="Recent Payments"
          subtitle="Latest receipts recorded"
          action={
            <Link
              href="/receivables"
              className="text-xs font-medium text-sky-700 hover:underline"
            >
              View All
            </Link>
          }
        >
          {(s?.recent_payments.length ?? 0) === 0 ? (
            <EmptyState message="No receipts have been recorded yet." />
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Client</th>
                  <th className="th text-right">Amount</th>
                  <th className="th">Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(s?.recent_payments ?? []).slice(0, 6).map((payment) => (
                  <tr key={payment.id} className="hover:bg-slate-50">
                    <td className="td text-xs text-slate-600">
                      {formatDate(payment.paid_on)}
                    </td>
                    <td className="td text-xs text-slate-700">
                      {payment.client_name ?? "—"}
                    </td>
                    <td className="td tabular text-right text-slate-800">
                      {formatMoney(payment.amount)}
                    </td>
                    <td className="td text-xs text-slate-500">{humanise(payment.method)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {openInvoiceId && (
        <InvoiceDetailDrawer
          invoiceId={openInvoiceId}
          onClose={() => setOpenInvoiceId(null)}
        />
      )}
    </div>
  );
}


function SummaryTiles({ summary }: { summary: BillingSummary | undefined }) {
  const tiles = [
    {
      icon: "billing" as const,
      tone: "info" as const,
      label: "Total Invoices",
      value: formatMoney(summary?.invoiced_total ?? 0),
      hint: `${summary?.invoiced_count ?? 0} invoices`,
    },
    {
      icon: "check-circle" as const,
      tone: "success" as const,
      label: "Paid",
      value: formatMoney(summary?.collected_total ?? 0),
      hint: `${summary?.collected_count ?? 0} settled`,
    },
    {
      icon: "clock" as const,
      tone: "warning" as const,
      label: "Outstanding",
      value: formatMoney(summary?.outstanding_total ?? 0),
      hint: `${summary?.outstanding_count ?? 0} invoices`,
    },
    {
      icon: "alert-triangle" as const,
      tone: "danger" as const,
      label: "Overdue",
      value: formatMoney(summary?.overdue_total ?? 0),
      hint: `${summary?.overdue_count ?? 0} invoices`,
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
 * Receivables ageing, as bars.
 *
 * Scaled against the largest bucket rather than a fixed ceiling, so the shape is
 * readable whether the firm is owed ₹6,000 or ₹60,00,000. The amount sits above each
 * bar because the bar alone does not say how much.
 */
function AgeingPanel({ summary }: { summary: BillingSummary | undefined }) {
  const buckets = summary?.ageing ?? [];
  const peak = Math.max(...buckets.map((row) => row.amount), 1);
  const total = buckets.reduce((sum, row) => sum + row.amount, 0);

  if (total === 0) {
    return <EmptyState message="Nothing is outstanding, so there is nothing to age." />;
  }

  return (
    <div className="p-4">
      <div className="flex h-40 items-end gap-3">
        {buckets.map((row) => (
          <div key={row.bucket} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="tabular text-[11px] font-medium text-slate-600">
              {row.amount > 0 ? formatMoney(row.amount) : "—"}
            </span>
            <div
              className={cn(
                "w-full rounded-t transition-all",
                row.amount > 0 ? (AGEING_FILL[row.bucket] ?? "bg-slate-400") : "bg-slate-100",
              )}
              style={{ height: `${Math.max((row.amount / peak) * 100, row.amount > 0 ? 4 : 2)}%` }}
              title={`${row.label}: ${formatMoney(row.amount)} across ${row.count} invoice(s)`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3 border-t border-slate-100 pt-2">
        {buckets.map((row) => (
          <div key={row.bucket} className="min-w-0 flex-1 text-center">
            <p className="truncate text-[10px] text-slate-500">{row.label}</p>
            <p className="tabular text-[10px] text-slate-400">{row.count}</p>
          </div>
        ))}
      </div>
    </div>
  );
}



