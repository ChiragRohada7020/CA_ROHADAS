"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { InvoiceActions, PaymentForm } from "@/components/BillingForms";
import { Badge, Card, ErrorState, LoadingState, PageHeader, StatCard } from "@/components/ui";
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

  const invoice = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => api.get<InvoiceDetail>(`/invoices/${invoiceId}`),
  });

  if (invoice.isPending) return <LoadingState label="Loading the invoice…" />;
  if (invoice.isError) return <ErrorState message="Could not load this invoice." />;

  const row = invoice.data;
  const interState = row.gst_tax_type === "inter_state";
  const hasTax = row.cgst_amount + row.sgst_amount + row.igst_amount > 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title={row.invoice_number ?? "Draft invoice"}
        subtitle={`${row.client_name ?? "Unknown client"} · raised ${formatDate(row.invoice_date)}`}
        action={
          <div className="flex items-center gap-2">
            <Link href="/invoices" className="btn-ghost">
              Back to invoices
            </Link>
            <Link href={`/print/invoices/${row.id}`} className="btn-primary">
              Print
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={invoiceStatusTone(row.status)}>{invoiceStatusLabel(row.status)}</Badge>
        {row.is_overdue && <Badge tone="danger">{row.days_overdue} days overdue</Badge>}
        {row.outstanding > 0 && !row.is_overdue && row.status !== "draft" && (
          <Badge tone={ageingTone(row.ageing_bucket)}>Due {formatDate(row.due_date)}</Badge>
        )}
        {row.sent_at && <Badge tone="info">Sent {formatDateTime(row.sent_at)}</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total" value={formatMoney(row.total)} />
        <StatCard label="Received" value={formatMoney(row.amount_paid)} tone="success" />
        <StatCard
          label="Outstanding"
          value={formatMoney(row.outstanding)}
          tone={row.outstanding > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Due date"
          value={formatDate(row.due_date)}
          tone={row.is_overdue ? "danger" : "neutral"}
        />
      </div>

      <Card title="Lines">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem]">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Description</th>
                <th className="th">SAC</th>
                <th className="th">Qty</th>
                <th className="th">Rate</th>
                <th className="th">Discount</th>
                <th className="th">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {row.lines.map((line) => (
                <tr key={line.id}>
                  <td className="td">
                    {line.description}
                    {!line.is_taxable && (
                      <span className="ml-2 text-xs italic text-slate-500">not taxable</span>
                    )}
                  </td>
                  <td className="td font-mono text-xs">{line.sac_code ?? "—"}</td>
                  <td className="td tabular text-xs">{line.quantity}</td>
                  <td className="td tabular text-xs">{formatMoney(line.unit_price)}</td>
                  <td className="td tabular text-xs">
                    {line.discount > 0 ? formatMoney(line.discount) : "—"}
                  </td>
                  <td className="td tabular text-xs">{formatMoney(line.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50">
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
        <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">{row.tax_note}</p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <InvoiceActions invoice={row} />
        <PaymentForm invoice={row} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
              <div className="text-slate-600">
                GSTIN: <span className="font-mono">{row.client.gstin}</span>
              </div>
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
              <div className="text-slate-600">
                GSTIN: <span className="font-mono">{row.firm.gstin}</span>
              </div>
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
      </div>

      {(row.notes || row.terms) && (
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
      )}

      {row.cancelled_at && (
        <Card title="Cancellation">
          <p className="p-4 text-sm text-slate-600">
            Cancelled {formatDateTime(row.cancelled_at)}
            {row.cancelled_reason ? `: ${row.cancelled_reason}` : "."}
          </p>
        </Card>
      )}
    </div>
  );
}