import { formatDate, formatMoney } from "@/lib/format";
import { invoiceStatusLabel } from "@/lib/status";
import type { InvoiceDetail } from "@/lib/types";

/**
 * The invoice as a document.
 *
 * One component serves both the staff print view and the client-facing share link, so
 * the client sees exactly what the firm prints. Two copies of a letterhead is how the
 * two quietly stop matching.
 *
 * Rendered as plain markup with no interactive parts, so a browser's print-to-PDF
 * produces the invoice and nothing else.
 */
export function InvoiceSheet({ invoice }: { invoice: InvoiceDetail }) {
  const interState = invoice.gst_tax_type === "inter_state";
  const hasTax = invoice.cgst_amount + invoice.sgst_amount + invoice.igst_amount > 0;
  const firm = invoice.firm;
  const client = invoice.client;

  return (
    <article className="print-sheet mx-auto w-full max-w-[210mm] bg-white p-6 text-slate-900">
      <header className="print-block flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">{firm?.name ?? "The firm"}</h1>
          {firm?.address_line1 && <p className="text-xs text-slate-600">{firm.address_line1}</p>}
          {firm?.address_line2 && <p className="text-xs text-slate-600">{firm.address_line2}</p>}
          <p className="text-xs text-slate-600">
            {[firm?.city, firm?.state, firm?.pincode].filter(Boolean).join(", ")}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {firm?.gstin && (
              <>
                GSTIN: <span className="font-mono">{firm.gstin}</span>
                {firm?.pan ? " · " : ""}
              </>
            )}
            {firm?.pan && (
              <>
                PAN: <span className="font-mono">{firm.pan}</span>
              </>
            )}
          </p>
          <p className="text-xs text-slate-600">
            {[firm?.email, firm?.phone].filter(Boolean).join(" · ")}
          </p>
        </div>

        <div className="text-right">
          <p className="text-lg font-semibold uppercase tracking-wide">Tax Invoice</p>
          <p className="tabular mt-1 text-sm">
            {invoice.invoice_number ?? "DRAFT — not yet numbered"}
          </p>
          <p className="mt-2 text-xs text-slate-600">
            Invoice date: <span className="tabular">{formatDate(invoice.invoice_date)}</span>
          </p>
          <p className="text-xs text-slate-600">
            Due date: <span className="tabular">{formatDate(invoice.due_date)}</span>
          </p>
          {invoice.status !== "issued" && (
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              {invoiceStatusLabel(invoice.status)}
            </p>
          )}
        </div>
      </header>

      <section className="print-block mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billed to</p>
        <p className="mt-1 text-sm font-medium">{client?.name}</p>
        {client?.address_line1 && <p className="text-xs text-slate-600">{client.address_line1}</p>}
        {client?.address_line2 && <p className="text-xs text-slate-600">{client.address_line2}</p>}
        <p className="text-xs text-slate-600">
          {[client?.city, client?.state, client?.pincode].filter(Boolean).join(", ")}
        </p>
        {client?.gstin && (
          <p className="text-xs text-slate-600">
            GSTIN: <span className="font-mono">{client.gstin}</span>
          </p>
        )}
        <p className="text-xs text-slate-600">
          Place of supply:{" "}
          <span className="font-mono">{invoice.place_of_supply_state_code ?? "not set"}</span>
        </p>
      </section>

      <table className="mt-5 w-full">
        <thead>
          <tr className="border-y border-slate-300 bg-slate-50">
            <th className="th">#</th>
            <th className="th">Description</th>
            <th className="th">SAC</th>
            <th className="th text-right">Qty</th>
            <th className="th text-right">Rate</th>
            <th className="th text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {invoice.lines.map((line) => (
            <tr key={line.id}>
              <td className="td text-xs">{line.sequence}</td>
              <td className="td text-xs">
                {line.description}
                {!line.is_taxable && <span className="ml-1 text-slate-500">(not taxable)</span>}
              </td>
              <td className="td font-mono text-xs">{line.sac_code ?? "—"}</td>
              <td className="td tabular text-right text-xs">{line.quantity}</td>
              <td className="td tabular text-right text-xs">{formatMoney(line.unit_price)}</td>
              <td className="td tabular text-right text-xs">{formatMoney(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="print-block mt-4 flex justify-end">
        <dl className="w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-600">Subtotal</dt>
            <dd className="tabular">{formatMoney(invoice.subtotal)}</dd>
          </div>
          {invoice.discount_total > 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-600">Discount</dt>
              <dd className="tabular">−{formatMoney(invoice.discount_total)}</dd>
            </div>
          )}
          {hasTax && (
            <>
              <div className="flex justify-between">
                <dt className="text-slate-600">Taxable value</dt>
                <dd className="tabular">{formatMoney(invoice.taxable_total)}</dd>
              </div>
              {interState ? (
                <div className="flex justify-between">
                  <dt className="text-slate-600">IGST @ {invoice.tax_rate}%</dt>
                  <dd className="tabular">{formatMoney(invoice.igst_amount)}</dd>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">CGST @ {invoice.tax_rate / 2}%</dt>
                    <dd className="tabular">{formatMoney(invoice.cgst_amount)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-600">SGST @ {invoice.tax_rate / 2}%</dt>
                    <dd className="tabular">{formatMoney(invoice.sgst_amount)}</dd>
                  </div>
                </>
              )}
            </>
          )}
          <div className="flex justify-between border-t border-slate-900 pt-1 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular">{formatMoney(invoice.total)}</dd>
          </div>
          {invoice.amount_paid > 0 && (
            <>
              <div className="flex justify-between text-xs text-slate-600">
                <dt>Received</dt>
                <dd className="tabular">{formatMoney(invoice.amount_paid)}</dd>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <dt>Balance due</dt>
                <dd className="tabular">{formatMoney(invoice.outstanding)}</dd>
              </div>
            </>
          )}
        </dl>
      </section>

      {invoice.terms && (
        <section className="print-block mt-6 border-t border-slate-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Payment terms
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{invoice.terms}</p>
        </section>
      )}

      {invoice.notes && (
        <section className="print-block mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{invoice.notes}</p>
        </section>
      )}

      <footer className="print-block mt-8 border-t border-slate-200 pt-3 text-xs text-slate-500">
        <p>{invoice.tax_note}</p>
        <p className="mt-1">
          This is a computer-generated invoice
          {invoice.invoice_number ? ` (${invoice.invoice_number})` : ""}.
        </p>
      </footer>
    </article>
  );
}