"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { InvoiceActions, PaymentForm } from "@/components/BillingForms";
import { Badge, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { ageingTone, invoiceStatusLabel, invoiceStatusTone } from "@/lib/status";
import type { InvoiceDetail } from "@/lib/types";

type DrawerTab = "lines" | "payments" | "actions";

/**
 * One invoice, as a slide-over.
 *
 * A drawer rather than a page because the ledger is the context: somebody chasing the
 * month's receivables wants to open an invoice, see what was billed and what has come
 * in, record a receipt, and move to the next one without losing their tab and filters.
 * `/invoices/{id}` still exists as a page for direct links and for printing.
 *
 * The tax breakdown is shown as separate heads rather than one "tax" line, because that
 * is what the client's accountant reconciles against.
 */
export function InvoiceDetailDrawer({
  invoiceId,
  onClose,
}: {
  invoiceId: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("lines");

  const invoice = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => api.get<InvoiceDetail>(`/invoices/${invoiceId}`),
  });

  const row = invoice.data;
  const hasTax = row ? row.cgst_amount + row.sgst_amount + row.igst_amount > 0 : false;

  const tabs: Array<{ key: DrawerTab; label: string; count?: number }> = [
    { key: "lines", label: "Lines", count: row?.lines.length },
    { key: "payments", label: "Payments", count: row?.payments.length },
    { key: "actions", label: "Actions" },
  ];

  return (
    <>
      <button
        type="button"
        aria-label="Close invoice details"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-slate-900/20"
      />
      <aside
        role="dialog"
        aria-label="Invoice details"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-xl"
      >
        <header className="border-b border-slate-200 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  {row?.invoice_number ?? "Draft invoice"}
                </h2>
                {row && (
                  <Badge tone={invoiceStatusTone(row.status)}>
                    {invoiceStatusLabel(row.status)}
                  </Badge>
                )}
                {row?.is_overdue && <Badge tone="danger">{row.days_overdue}d overdue</Badge>}
              </div>
              {row && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {row.client_name ?? "Unknown client"} · raised {formatDate(row.invoice_date)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-icon shrink-0"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {row && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded border border-slate-200 px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Total</p>
                <p className="tabular text-sm font-semibold text-slate-900">
                  {formatMoney(row.total)}
                </p>
              </div>
              <div className="rounded border border-slate-200 px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Received</p>
                <p className="tabular text-sm font-semibold text-emerald-700">
                  {formatMoney(row.amount_paid)}
                </p>
              </div>
              <div className="rounded border border-slate-200 px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">
                  Outstanding
                </p>
                <p
                  className={cn(
                    "tabular text-sm font-semibold",
                    row.outstanding > 0 ? "text-amber-700" : "text-emerald-700",
                  )}
                >
                  {formatMoney(row.outstanding)}
                </p>
              </div>
            </div>
          )}

          {row && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={row.is_overdue ? "danger" : ageingTone(row.ageing_bucket)}>
                Due {formatDate(row.due_date)}
              </Badge>
              {row.sent_at && <Badge tone="info">Sent {formatDateTime(row.sent_at)}</Badge>}
              {row.share_link_active && <Badge tone="neutral">Client link active</Badge>}
            </div>
          )}
        </header>

        <nav className="flex gap-1 border-b border-slate-200 px-3">
          {tabs.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              className={cn(
                "-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                entry.key === tab
                  ? "border-sky-600 text-sky-700"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {entry.label}
              {entry.count !== undefined && (
                <span className="tabular ml-1.5 text-[10px] text-slate-400">
                  {entry.count}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-4">
          {invoice.isPending ? (
            <LoadingState label="Loading the invoice…" />
          ) : invoice.isError || !row ? (
            <ErrorState message="Could not load this invoice." />
          ) : tab === "lines" ? (
            <div className="space-y-3">
              <div className="table-wrap">
                <table className="w-full min-w-[34rem]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th">Description</th>
                      <th className="th">SAC</th>
                      <th className="th text-right">Qty</th>
                      <th className="th text-right">Rate</th>
                      <th className="th text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {row.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="td text-slate-700">{line.description}</td>
                        <td className="td font-mono text-xs text-slate-500">
                          {line.sac_code ?? "—"}
                        </td>
                        <td className="td tabular text-right text-slate-600">
                          {line.quantity}
                        </td>
                        <td className="td tabular text-right text-slate-600">
                          {formatMoney(line.unit_price)}
                        </td>
                        <td className="td tabular text-right font-medium text-slate-800">
                          {formatMoney(line.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <dl className="ml-auto max-w-xs space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Subtotal</dt>
                  <dd className="tabular text-slate-800">{formatMoney(row.subtotal)}</dd>
                </div>
                {row.discount_total > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Discount</dt>
                    <dd className="tabular text-slate-800">
                      −{formatMoney(row.discount_total)}
                    </dd>
                  </div>
                )}
                {hasTax && (
                  <>
                    {row.cgst_amount > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-slate-500">CGST</dt>
                        <dd className="tabular text-slate-800">
                          {formatMoney(row.cgst_amount)}
                        </dd>
                      </div>
                    )}
                    {row.sgst_amount > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-slate-500">SGST</dt>
                        <dd className="tabular text-slate-800">
                          {formatMoney(row.sgst_amount)}
                        </dd>
                      </div>
                    )}
                    {row.igst_amount > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-slate-500">IGST</dt>
                        <dd className="tabular text-slate-800">
                          {formatMoney(row.igst_amount)}
                        </dd>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                  <dt className="text-slate-700">Total</dt>
                  <dd className="tabular text-slate-900">{formatMoney(row.total)}</dd>
                </div>
              </dl>

              <p className="text-xs text-slate-500">{row.tax_note}</p>

              {row.notes && (
                <div className="rounded border border-slate-200 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Notes</p>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{row.notes}</p>
                </div>
              )}
            </div>
          ) : tab === "payments" ? (
            <div className="space-y-4">
              {row.payments.length === 0 ? (
                <EmptyState
                  title="No receipts yet"
                  message="Nothing has been recorded against this invoice. Use the form below to record one."
                />
              ) : (
                <div className="table-wrap">
                  <table className="w-full min-w-[30rem]">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="th">Received</th>
                        <th className="th">Mode</th>
                        <th className="th">Reference</th>
                        <th className="th text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {row.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td className="td text-xs text-slate-600">
                            {formatDate(payment.paid_on)}
                          </td>
                          <td className="td text-xs capitalize text-slate-600">
                            {payment.method.replace(/_/g, " ")}
                          </td>
                          <td className="td font-mono text-xs text-slate-500">
                            {payment.reference ?? "—"}
                          </td>
                          <td className="td tabular text-right text-slate-800">
                            {formatMoney(payment.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <PaymentForm invoice={row} />
            </div>
          ) : (
            <div className="space-y-4">
              <InvoiceActions invoice={row} />
              <div className="flex flex-wrap gap-2">
                <Link href={`/invoices/${row.id}`} className="btn-ghost">
                  Open full page
                </Link>
                <Link href={`/print/invoices/${row.id}`} className="btn-ghost">
                  Print
                </Link>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

