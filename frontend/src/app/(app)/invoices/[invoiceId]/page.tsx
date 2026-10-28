"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { InvoiceActions, PaymentForm } from "@/components/BillingForms";
import { ServiceCombobox, type ServiceOption } from "@/components/ServiceCombobox";
import { TextField, SelectField } from "@/components/form";
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatCard } from "@/components/ui";
import { PermissionGate } from "@/components/PermissionGate";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { ageingTone, invoiceStatusLabel, invoiceStatusTone } from "@/lib/status";
import type { InvoiceDetail } from "@/lib/types";

/**
 * One invoice: what was billed, what has been received, and what can be done to it.
 *
 * The tax breakdown is shown as separate heads rather than a single "tax" line, because
 * that is what the client's accountant will reconcile against, and the reason it was
 * taxed this way is shown with it.
 */
export default function InvoiceDetailPage() {
  const params = useParams<{ invoiceId: string }>();
  const invoiceId = params.invoiceId;

  const queryClient = useQueryClient();
  const invoice = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => api.get<InvoiceDetail>(`/invoices/${invoiceId}`),
  });

  const sendReceipt = useMutation({
    mutationFn: (receiptId: string) => api.post(`/invoices/${invoiceId}/receipts/${receiptId}/email`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
  });
  const recurringSchedule = useMutation({
    mutationFn: (data: any) => api.post(`/invoices/${invoiceId}/recurring`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
  });
  const sendingReceipt = sendReceipt;

  const [recurringService, setRecurringService] = useState<ServiceOption | null>(null);
  const [recurringFee, setRecurringFee] = useState(0);
  const [recurringFrequency, setRecurringFrequency] = useState("month");
  const serviceOptions: ServiceOption[] = [];

  if (invoice.isPending)
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <LoadingState label="Loading the invoice…" />
      </motion.div>
    );
  if (invoice.isError)
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <ErrorState message="Could not load this invoice." />
      </motion.div>
    );

  const row = invoice.data;
  const interState = row.gst_tax_type === "inter_state";
  const hasTax = row.cgst_amount + row.sgst_amount + row.igst_amount > 0;

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <PageHeader
        title={row.invoice_number ?? "Draft invoice"}
        subtitle={`${row.client_name ?? "Unknown client"} · raised ${formatDate(row.invoice_date)}`}
        action={
          <div className="flex items-center gap-2">
            <Link href="/invoices" className="btn-ghost">
              Back to invoices
            </Link>
            <Link
              href={`/print/invoices/${row.id}`}
              className="btn-primary"
              data-animate
            >
              Print
            </Link>
          </div>
        }
      />

      <motion.div
        className="flex flex-wrap items-center gap-2"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut", delay: 0.1 }}
      >
        <Badge tone={invoiceStatusTone(row.status)}>{invoiceStatusLabel(row.status)}</Badge>
        {row.is_overdue && <Badge tone="danger">{row.days_overdue} days overdue</Badge>}
        {row.outstanding > 0 && !row.is_overdue && row.status !== "draft" && (
          <Badge tone={ageingTone(row.ageing_bucket)}>Due {formatDate(row.due_date)}</Badge>
        )}
        {row.sent_at && <Badge tone="info">Sent {formatDateTime(row.sent_at)}</Badge>}
      </motion.div>

      <motion.div
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut", delay: 0.15 }}
      >
        <PermissionGate code="invoice.read.financial">
          <>
            <motion.div whileHover={{ scale: 1.02 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
              <StatCard label="Total" value={formatMoney(row.total)} />
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
              <StatCard label="Received" value={formatMoney(row.amount_paid)} tone="success" />
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
              <StatCard
                label="Outstanding"
                value={formatMoney(row.outstanding)}
                tone={row.outstanding > 0 ? "warning" : "success"}
              />
            </motion.div>
          </>
        </PermissionGate>
        <motion.div whileHover={{ scale: 1.02 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
          <StatCard
            label="Due date"
            value={formatDate(row.due_date)}
            tone={row.is_overdue ? "danger" : "neutral"}
          />
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut", delay: 0.2 }}
      >
        <Card title="Lines">
          <PermissionGate code="invoice.read.financial">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem]">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    <th className="th">Description</th>
                    <th className="th">SAC</th>
                    <th className="th">Qty</th>
                    <th className="th">Rate</th>
                    <th className="th">Discount</th>
                    <th className="th">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {row.lines.map((line) => (
                    <motion.tr
                      key={line.id}
                      whileHover={{ backgroundColor: "rgba(241, 245, 249, 0.6)" }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    >
                      <td className="td text-slate-900 dark:text-slate-200">
                        {line.description}
                        {!line.is_taxable && (
                          <span className="ml-2 text-xs italic text-slate-500 dark:text-slate-500">not taxable</span>
                        )}
                      </td>
                      <td className="td font-mono text-xs text-slate-500 dark:text-slate-400">{line.sac_code ?? "—"}</td>
                      <td className="td tabular text-xs text-slate-600 dark:text-slate-400">{line.quantity}</td>
                      <td className="td tabular text-xs text-slate-600 dark:text-slate-400">{formatMoney(line.unit_price)}</td>
                      <td className="td tabular text-xs text-slate-600 dark:text-slate-400">
                        {line.discount > 0 ? formatMoney(line.discount) : "—"}
                      </td>
                      <td className="td tabular text-xs text-slate-900 dark:text-slate-200">{formatMoney(line.amount)}</td>
                    </motion.tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    <td className="td text-xs" colSpan={5}>
                      Subtotal
                    </td>
                    <td className="td tabular text-xs">{formatMoney(row.subtotal)}</td>
                  </tr>
                  {row.discount_total > 0 && (
                    <tr>
                      <td className="td text-xs" colSpan={5}>
                        Discount
                      </td>
                      <td className="td tabular text-xs">−{formatMoney(row.discount_total)}</td>
                    </tr>
                  )}
                  {hasTax && (
                    <>
                      <tr>
                        <td className="td text-xs" colSpan={5}>
                          Taxable value
                        </td>
                        <td className="td tabular text-xs">{formatMoney(row.taxable_total)}</td>
                      </tr>
                      {interState ? (
                        <tr>
                          <td className="td text-xs" colSpan={5}>
                            IGST @ {row.tax_rate}%
                          </td>
                          <td className="td tabular text-xs">{formatMoney(row.igst_amount)}</td>
                        </tr>
                      ) : (
                        <>
                          <tr>
                            <td className="td text-xs" colSpan={5}>
                              CGST @ {row.tax_rate / 2}%
                            </td>
                            <td className="td tabular text-xs">{formatMoney(row.cgst_amount)}</td>
                          </tr>
                          <tr>
                            <td className="td text-xs" colSpan={5}>
                              SGST @ {row.tax_rate / 2}%
                            </td>
                            <td className="td tabular text-xs">{formatMoney(row.sgst_amount)}</td>
                          </tr>
                        </>
                      )}
                    </>
                  )}
                  <tr>
                    <td className="td text-sm font-semibold" colSpan={5}>
                      Total
                    </td>
                    <td className="td tabular text-sm font-semibold">{formatMoney(row.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              {row.tax_note}
            </p>
          </PermissionGate>
        </Card>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut", delay: 0.25 }}
      >
        <InvoiceActions invoice={row} />
        <PaymentForm invoice={row} />
      </motion.div>

      <motion.div
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut", delay: 0.3 }}
      >
        <Card title="Billed to">
          <dl className="space-y-1 p-4 text-sm">
            <div className="font-medium text-slate-900">{row.client?.name}</div>
            {row.client?.address_line1 && (
              <div className="text-slate-600">{row.client.address_line1}</div>
            )}
            {row.client?.address_line2 && (
              <div className="text-slate-600">{row.client.address_line2}</div>
            )}
            <div className="text-slate-600">
              {[row.client?.city, row.client?.state, row.client?.pincode]
                .filter(Boolean)
                .join(", ")}
            </div>
            {row.client?.gstin && (
              <PermissionGate code="client.read.sensitive">
                <div className="text-slate-600">
                  GSTIN: <span className="font-mono">{row.client.gstin}</span>
                </div>
              </PermissionGate>
            )}
            {!row.client?.state_code && (
              <div className="text-xs text-amber-700">
                No state code on file. Set it before issuing — the place of supply decides the
                tax.
              </div>
            )}
          </dl>
        </Card>

        <Card title="From">
          <dl className="space-y-1 p-4 text-sm">
            <div className="font-medium text-slate-900">{row.firm?.name}</div>
            {row.firm?.address_line1 && (
              <div className="text-slate-600">{row.firm.address_line1}</div>
            )}
            {row.firm?.address_line2 && (
              <div className="text-slate-600">{row.firm.address_line2}</div>
            )}
            <div className="text-slate-600">
              {[row.firm?.city, row.firm?.state, row.firm?.pincode].filter(Boolean).join(", ")}
            </div>
            {row.firm?.gstin ? (
              <PermissionGate code="client.read.sensitive">
                <div className="text-slate-600">
                  GSTIN: <span className="font-mono">{row.firm.gstin}</span>
                </div>
              </PermissionGate>
            ) : (
              <div className="text-xs text-amber-700">
                No GSTIN on file, so this invoice carries no GST.{" "}
                <Link href="/invoices/settings" className="underline">
                  Add the firm&apos;s details
                </Link>
                .
              </div>
            )}
          </dl>
        </Card>
      </motion.div>

      {(row.notes || row.terms) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.35 }}
        >
          <Card title="Notes and terms">
            <div className="space-y-3 p-4 text-sm text-slate-700">
              {row.notes && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes</p>
                  <p className="whitespace-pre-wrap">{row.notes}</p>
                </div>
              )}
              {row.terms && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Payment terms
                  </p>
                  <p className="whitespace-pre-wrap">{row.terms}</p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      )}

      <Card title="Receipts" subtitle="Receipts issued against completed payments.">
        <div className="p-4">
          {row.receipts.length === 0 ? (
            <EmptyState
              title="No receipts yet"
              message="Receipts are issued from payments recorded on this invoice."
            />
          ) : (
            <div className="space-y-3">
              {row.receipts.map((receipt) => (
                <div
                  key={receipt.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                      {receipt.receipt_number}
                    </div>
                    <div className="text-xs text-slate-500">
                      Issued {formatDate(receipt.issued_at)}
                    </div>
                  </div>
                  <a
                    href={`/api/invoices/${row.id}/receipts/${receipt.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost px-3 py-2 text-sm"
                  >
                    <Icon name="download" className="h-4 w-4" />
                    Download
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card title="Email receipt" subtitle="Send the most recent receipt to the client's email.">
        <div className="p-4">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                Email the latest receipt to{' '}
                <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                  {row.client?.email ?? "No email on file"}
                </span>
              </div>
              {row.client?.email ? (
                <button
                  type="button"
                  className="btn-ghost text-sm"
                  disabled={sendingReceipt.isPending}
                  onClick={() => sendReceipt.mutate(row.receipts[0].id)}
                >
                  {sendingReceipt.isPending ? "Sending…" : "Send by email"}
                </button>
              ) : (
                <p className="text-xs text-slate-500">
                  Add an email address to the client before sending receipts by email.
                </p>
              )}
            </div>
            {sendReceipt.isError && (
              <p className="text-xs text-rose-700">{sendReceipt.error?.message}</p>
            )}
            {sendReceipt.isSuccess && (
              <p className="text-xs text-emerald-700">
                Receipt emailed successfully.
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card title="Recurring schedule" subtitle="Define recurring invoices from this one.">
        <div className="p-4">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Select a service
              </label>
              <ServiceCombobox
                value={recurringService?.id ?? ""}
                onChange={setRecurringService}
                clientServices={serviceOptions}
                placeholder="Choose a service"
              />
            </div>
            {recurringService && (
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Fee (₹)"
                  type="number"
                  value={String(recurringFee)}
                  onChange={(v) => setRecurringFee(parseFloat(v) || 0)}
                />
                <SelectField
                  label="Frequency"
                  value={recurringFrequency}
                  onChange={setRecurringFrequency}
                  options={[
                    { value: "month", label: "Monthly" },
                    { value: "quarter", label: "Quarterly" },
                    { value: "half", label: "Half-yearly" },
                    { value: "year", label: "Annually" },
                  ]}
                />
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={recurringSchedule.isPending || !recurringService}
                onClick={() => {
                  if (!recurringService) return;
                  recurringSchedule.mutate({
                    client_id: row.client_id,
                    service_id: recurringService.id,
                    amount: recurringFee,
                    frequency: recurringFrequency,
                  });
                  setRecurringFee(0);
                }}
              >
                {recurringSchedule.isPending ? "Creating…" : "Create recurring schedule"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setRecurringService(null);
                  setRecurringFee(0);
                }}
              >
                Clear
              </button>
            </div>
            {recurringSchedule.isError && (
              <p className="text-xs text-rose-700">{recurringSchedule.error?.message}</p>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
