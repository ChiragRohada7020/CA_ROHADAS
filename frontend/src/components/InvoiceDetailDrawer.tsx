"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { InvoiceActions, PaymentForm } from "@/components/BillingForms";
import { CreditNoteList } from "@/components/CreditNoteList";
import { Badge, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { ageingTone, invoiceStatusLabel, invoiceStatusTone } from "@/lib/status";
import type { InvoiceDetail } from "@/lib/types";

type DrawerTab = "lines" | "payments" | "actions" | "credit_notes" | "history";

const TAB_VARIANTS = {
  inactive: { color: "#647489", borderColor: "transparent" },
  active: { color: "#0284c7", borderColor: "#0284c7" },
};

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
  initialTab = "lines",
}: {
  invoiceId: string;
  onClose: () => void;
  initialTab?: DrawerTab;
}) {
  const [tab, setTab] = useState<DrawerTab>(initialTab);

  const invoice = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => api.get<InvoiceDetail>(`/invoices/${invoiceId}`),
  });

  const row = invoice.data;
  const hasTax = row ? row.cgst_amount + row.sgst_amount + row.igst_amount > 0 : false;

  const tabs: Array<{ key: DrawerTab; label: string; count?: number }> = [
    { key: "lines", label: "Line items", count: row?.line_count },
    { key: "payments", label: "Payments", count: row?.payments?.length },
    { key: "credit_notes", label: "Credit Notes" },
    { key: "history", label: "History" },
    { key: "actions", label: "Actions" },
  ];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-40 bg-slate-900/20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <button
          type="button"
          aria-label="Close invoice details"
          onClick={onClose}
          className="absolute inset-0 cursor-default"
        />
        <motion.aside
          role="dialog"
          aria-label="Invoice details"
          className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-xl"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "tween", duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <header className="border-b border-slate-200 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <motion.h2
                    className="text-sm font-semibold text-slate-900"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: 0.1 }}
                  >
                    {row?.invoice_number ?? "Draft invoice"}
                  </motion.h2>
                  <AnimatePresence>
                    {row && (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      >
                        <Badge tone={invoiceStatusTone(row.status)}>
                          {invoiceStatusLabel(row.status)}
                        </Badge>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {row?.is_overdue && (
                    <Badge tone="danger">{row.days_overdue}d overdue</Badge>
                  )}
                </div>
                <AnimatePresence>
                  {row && (
                    <motion.p
                      className="mt-0.5 text-xs text-slate-500"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, delay: 0.15 }}
                    >
                      {row.client_name ?? "Unknown client"} · raised {formatDate(row.invoice_date)}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              <motion.button
                type="button"
                onClick={onClose}
                className="btn-icon shrink-0"
                aria-label="Close"
                whileHover={{ scale: 1.1, rotate: 90 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                ✕
              </motion.button>
            </div>

            <AnimatePresence>
              {row && (
                <motion.div
                  className="mt-3 grid grid-cols-3 gap-2"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: "easeOut", delay: 0.2 }}
                >
                  <motion.div
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                    whileHover={{ scale: 1.03, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Total</p>
                    <p className="tabular text-sm font-semibold text-slate-900">
                      {formatMoney(row.total)}
                    </p>
                  </motion.div>
                  <motion.div
                    className="rounded-xl border border-slate-200 bg-emerald-50 px-3 py-2"
                    whileHover={{ scale: 1.03, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Received</p>
                    <p className="tabular text-sm font-semibold text-emerald-700">
                      {formatMoney(row.amount_paid)}
                    </p>
                  </motion.div>
                  <motion.div
                    className="rounded-xl border border-slate-200 bg-amber-50 px-3 py-2"
                    whileHover={{ scale: 1.03, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
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
                  </motion.div>
                </motion.div>
              )}

              {row && (
                <motion.div
                  className="mt-2 flex flex-wrap items-center gap-2"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: "easeOut", delay: 0.25 }}
                >
                  <Badge tone={row.is_overdue ? "danger" : ageingTone(row.ageing_bucket)}>
                    Due {formatDate(row.due_date)}
                  </Badge>
                  {row.sent_at && <Badge tone="info">Sent {formatDateTime(row.sent_at)}</Badge>}
                  {row.share_link_active && <Badge tone="neutral">Client link active</Badge>}
                </motion.div>
              )}
            </AnimatePresence>
          </header>

          <motion.nav
            className="flex gap-1 border-b border-slate-200 px-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: "easeOut", delay: 0.3 }}
          >
            {tabs.map((entry) => {
              const isActive = entry.key === tab;
              return (
                <motion.button
                  key={entry.key}
                  type="button"
                  layout
                  onClick={() => setTab(entry.key)}
                  className={cn(
                    "relative cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "border-sky-600 text-sky-700"
                      : "border-transparent text-slate-500 hover:text-slate-800",
                  )}
                  whileTap={{ scale: 0.97 }}
                >
                  {entry.label}
                  <motion.span
                    className={cn(
                      "tabular ml-1.5 rounded px-1.5 py-0.5 text-[10px]",
                      isActive
                        ? "bg-sky-100 text-sky-700"
                        : "bg-slate-100 text-slate-500",
                    )}
                    initial={{ scale: 0.8, opacity: 0.5 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
                    {entry.count ?? ""}
                  </motion.span>
                  {isActive && (
                    <motion.div
                      className="absolute bottom-0 left-0 h-0.5 w-full bg-sky-600"
                      layoutId="tab-underline"
                    />
                  )}
                </motion.button>
              );
            })}
          </motion.nav>

          <div className="flex-1 overflow-y-auto p-4">
            <AnimatePresence mode="wait">
              {invoice.isPending ? (
                <LoadingState label="Loading the invoice…" />
              ) : invoice.isError || !row ? (
                <ErrorState message="Could not load this invoice." />
              ) : (
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                >
                  {tab === "lines" ? (
                    <LinesTab row={row} hasTax={hasTax} interState={row.gst_tax_type === "inter_state"} />
                  ) : tab === "payments" ? (
                    <PaymentsTab row={row} />
                  ) : tab === "credit_notes" ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-900">Credit Notes</p>
                        {(row.status === 'issued' || row.status === 'partially_paid' || row.status === 'paid') && (
                          <Link href={`/invoices/${invoiceId}/credit-notes/new`} className="btn btn-primary px-5 py-2.5">Raise Credit Note</Link>
                        )}
                      </div>
                      <CreditNoteList />
                    </div>
                  ) : tab === "history" ? (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-slate-900">History</p>
                      <p className="text-sm text-slate-500">Audit history will appear here.</p>
                    </div>
                  ) : (
                    <ActionsTab row={row} />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}

function LinesTab({
  row,
  hasTax,
  interState,
}: {
  row: InvoiceDetail;
  hasTax: boolean;
  interState: boolean;
}) {
  const items: Array<{ label: string; amount: number; sub?: boolean }> = [
    { label: "Subtotal", amount: row.subtotal },
  ];
  if (row.discount_total > 0) {
    items.push({ label: "Discount", amount: -row.discount_total });
  }
  if (hasTax) {
    items.push({ label: "Taxable value", amount: row.taxable_total, sub: true });
    if (interState) {
      items.push({ label: `IGST @ ${row.tax_rate}%`, amount: row.igst_amount, sub: true });
    } else {
      items.push({ label: `CGST @ ${row.tax_rate / 2}%`, amount: row.cgst_amount, sub: true });
      items.push({ label: `SGST @ ${row.tax_rate / 2}%`, amount: row.sgst_amount, sub: true });
    }
  }
  const total = row.total;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
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
            {row.lines.map((line, i) => (
              <motion.tr
                key={line.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, ease: "easeOut", delay: 0.05 * i }}
              >
                <td className="td text-slate-700">
                  {line.description}
                  {!line.is_taxable && (
                    <span className="ml-2 text-xs italic text-slate-500">(not taxable)</span>
                  )}
                </td>
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
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ml-auto max-w-xs rounded-lg border border-slate-200 bg-slate-50 p-3">
        <dl className="space-y-1 text-sm">
          {items.map((item) => (
            <div key={item.label} className="flex justify-between">
              <dt
                className={cn(
                  "text-slate-500",
                  item.sub && "text-xs",
                )}
              >
                {item.label}
              </dt>
              <dd
                className={cn(
                  "tabular text-slate-800",
                  item.sub && "text-xs",
                )}
              >
                {item.amount < 0 ? "−" : ""}
                {formatMoney(Math.abs(item.amount))}
              </dd>
            </div>
          ))}
          <div className="border-t border-slate-200 pt-1 font-semibold">
            <dt className="text-slate-700">Total</dt>
            <dd className="tabular text-slate-900">{formatMoney(total)}</dd>
          </div>
        </dl>
      </div>

      <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {row.tax_note}
      </p>

      {row.notes && (
        <motion.div
          className="rounded-lg border border-slate-200 bg-slate-50 p-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.2 }}
        >
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Notes</p>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{row.notes}</p>
        </motion.div>
      )}
    </div>
  );
}

function PaymentsTab({ row }: { row: InvoiceDetail }) {
  return (
    <div className="space-y-4">
      {row.payments.length === 0 && (
        <div className="flex flex-col items-center py-8 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-sky-600">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7h18M3 7v10h18V7zM7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
              <circle cx="12" cy="14" r="2" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-900">No payments recorded yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Record the first payment received from the client to update invoice balance and generate a receipt.
          </p>
        </div>
      )}
      <PaymentForm invoice={row} />
      {row.receipts.length > 0 && (
        <div className="rounded-lg border border-slate-200">
          <div className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase text-slate-500">
            Receipts issued
          </div>
          <table className="w-full divide-y divide-slate-100">
            <tbody>
              {row.receipts.map((receipt) => (
                <tr key={receipt.id} className="group hover:bg-slate-50">
                  <td className="td text-xs text-slate-600">
                    {formatDate(receipt.issued_at)}
                  </td>
                  <td className="td text-xs font-medium text-slate-900">
                    {receipt.receipt_number}
                  </td>
                  <td className="td text-xs text-slate-500">
                    Linked to payment
                  </td>
                  <td className="td text-right">
                    <a
                      href={`/api/invoices/${row.id}/receipts/${receipt.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-ghost px-2 py-1 text-xs hover:underline"
                    >
                      Download PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ActionsTab({ row }: { row: InvoiceDetail }) {
  const queryClient = useQueryClient();
  const reminder = useMutation({
    mutationFn: () => api.post(`/invoices/${row.id}/reminder`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoice", row.id] });
    },
  });
  const receipt = useMutation({
    mutationFn: () =>
      api.post(`/invoices/${row.id}/receipt`, {
        payment_id:
          row.payments.length > 0
            ? row.payments[row.payments.length - 1].id
            : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoice", row.id] });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
  return (
    <div className="space-y-4">
      <InvoiceActions invoice={row} />
      <div className="flex flex-wrap gap-2">
        <Link href={`/invoices/${row.id}`} className="btn btn-ghost px-5 py-2.5">
          Open full page
        </Link>
        <a href={`/api/invoices/${row.id}/pdf`} target="_blank" rel="noreferrer" className="btn btn-ghost px-5 py-2.5">
          Download PDF
        </a>
        <Link href={`/print/invoices/${row.id}`} className="btn btn-ghost px-5 py-2.5">
          Print / Share
        </Link>
        {(row.status === 'issued' || row.status === 'partially_paid' || row.status === 'paid') && (
          <Link href={`/invoices/${row.id}/credit-notes/new`} className="btn btn-ghost px-5 py-2.5">
            Raise Credit Note
          </Link>
        )}
        {(row.status === 'issued' || row.status === 'partially_paid') && (
          <button type="button" className="btn btn-ghost px-5 py-2.5" disabled={reminder.isPending} onClick={() => reminder.mutate()}>
            {reminder.isPending ? "Sending…" : "Send Reminder"}
          </button>
        )}
        {row.status === 'paid' && (
          <button type="button" className="btn btn-ghost px-5 py-2.5" disabled={receipt.isPending} onClick={() => receipt.mutate()}>
            {receipt.isPending ? "Issuing…" : "Issue Receipt"}
          </button>
        )}
      </div>
    </div>
  );
}
