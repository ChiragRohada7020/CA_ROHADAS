"use client";

import { formatDate, formatMoney } from "@/lib/format";
import { invoiceStatusLabel } from "@/lib/status";
import type { InvoiceDetail } from "@/lib/types";

function minimalParty({
  label,
  party,
}: {
  label: string;
  party: InvoiceDetail["client"] | InvoiceDetail["firm"] | null;
}) {
  if (!party) return null;
  return (
    <div className="space-y-1">
      <p className={`text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400`}>{label}</p>
      <p className="text-sm font-semibold text-slate-900 break-words">{party.name}</p>
      {party.address_line1 && <p className="text-[10px] text-slate-600 break-words">{party.address_line1}</p>}
      {party.address_line2 && <p className="text-[10px] text-slate-600 break-words">{party.address_line2}</p>}
      <p className="text-[10px] text-slate-600 break-words">
        {[party.city, party.state, party.pincode].filter(Boolean).join(", ")}
      </p>
      {party.gstin && (
        <p className="text-[10px] text-slate-600 break-words">
          GSTIN: <span className="font-mono break-all">{party.gstin}</span>{" "}
          {party.pan ? <><span className="text-slate-400"> · </span><span className="font-mono break-all">PAN: {party.pan}</span></> : null}
        </p>
      )}
      <p className="text-[10px] text-slate-600 break-words mt-1">
        {[party.email, party.phone].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

function ThinRule() {
  return <hr className="border-t border-slate-200 my-5" />;
}

export function MinimalArchitectural({ invoice }: { invoice: InvoiceDetail }) {
  const interState = invoice.gst_tax_type === "inter_state";
  const hasTax = invoice.cgst_amount + invoice.sgst_amount + invoice.igst_amount > 0;
  const firm = invoice.firm;
  const client = invoice.client;

  return (
    <article className="print-sheet mx-auto w-full max-w-[210mm] bg-white p-10 text-slate-900 overflow-hidden">
      {/* ───────── HEADER: strict grid, precise alignment ───────── */}
      <header className="grid grid-cols-4 gap-6 mb-8 border-b border-slate-200 pb-6">
        <div className="col-span-3 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">From</p>
          <h1 className="text-lg font-bold tracking-tight break-words">{firm?.name ?? "The firm"}</h1>
          {firm?.address_line1 && <p className="text-[10px] text-slate-600">{firm.address_line1}</p>}
          {firm?.address_line2 && <p className="text-[10px] text-slate-600">{firm.address_line2}</p>}
          <p className="text-[10px] text-slate-600">
            {[firm?.city, firm?.state, firm?.pincode].filter(Boolean).join(", ")}
          </p>
          {firm?.gstin && (
            <p className="mt-2 text-[10px] text-slate-600">
              GSTIN: <span className="font-mono">{firm.gstin}</span>{" "}
              {firm?.pan ? <><span className="text-slate-400"> · </span><span className="font-mono">PAN: {firm.pan}</span></> : null}
            </p>
          )}
        </div>
        <div className="col-span-1 text-right min-w-[100px]">
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">Invoice no.</p>
          <p className="tabular font-bold text-sm">{invoice.invoice_number ?? "DRAFT"}</p>
          <ThinRule />
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">Date</p>
          <p className="tabular text-slate-600">{formatDate(invoice.invoice_date)}</p>
          <ThinRule />
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">Due date</p>
          <p className="tabular text-slate-600">{formatDate(invoice.due_date)}</p>
        </div>
      </header>

      {/* ───────── BUYER (single column, minimal) ───────── */}
      <section className="mb-8">
        {minimalParty({ label: "Bill to", party: client })}
        <div className="mt-3 flex items-baseline gap-2 text-[10px]">
          <span className="font-medium text-slate-400 uppercase tracking-[0.1em]">Status</span>
          <span className="text-slate-600">{invoiceStatusLabel(invoice.status)}</span>
          {invoice.place_of_supply_state_code && (
            <span className="ml-2 font-mono text-slate-600">{invoice.place_of_supply_state_code}</span>
          )}
        </div>
      </section>

      {/* ───────── LINE-ITEM TABLE ───────── */}
      <section className="mb-8 overflow-x-auto min-w-0">
        <table className="w-full text-[10px] border-collapse table-fixed">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="w-[5%] text-left py-2.5 font-medium text-slate-400 uppercase tracking-[0.1em]">#</th>
              <th className="w-[38%] text-left py-2.5 font-medium text-slate-400 uppercase tracking-[0.1em]">Description</th>
              <th className="w-[12%] text-left py-2.5 font-medium text-slate-400 uppercase tracking-[0.1em]">HSN / SAC</th>
              <th className="w-[10%] text-right py-2.5 font-medium text-slate-400 uppercase tracking-[0.1em] pr-4">Qty</th>
              <th className="w-[17%] text-right py-2.5 font-medium text-slate-400 uppercase tracking-[0.1em] pr-4">Rate</th>
              <th className="w-[18%] text-right py-2.5 font-medium text-slate-400 uppercase tracking-[0.1em] pr-4">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td className="w-[5%] py-2.5 text-slate-600 tabular">{line.sequence}</td>
                <td className="w-[38%] py-2.5 text-slate-900 break-words overflow-hidden whitespace-normal">{line.description}</td>
                <td className="w-[12%] py-2.5 text-slate-600 font-mono break-all">{line.sac_code ?? "—"}</td>
                <td className="w-[10%] py-2.5 text-right text-slate-600 tabular pr-4 whitespace-nowrap">{line.quantity}</td>
                <td className="w-[17%] py-2.5 text-right text-slate-600 tabular pr-4 whitespace-nowrap">{formatMoney(line.unit_price)}</td>
                <td className="w-[18%] py-2.5 text-right font-medium tabular pr-4 whitespace-nowrap">{formatMoney(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ───────── CLEAN FINANCIAL SUMMARY ───────── */}
      <section className="flex justify-end">
        <div className="w-full max-w-xs">
          <dl className="space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.05em]">Subtotal</dt>
              <dd className="tabular text-[10px] text-slate-600">{formatMoney(invoice.subtotal)}</dd>
            </div>
            {invoice.discount_total > 0 && (
              <div className="flex justify-between">
                <dt className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.05em]">Discount</dt>
                <dd className="tabular text-[10px] text-slate-600">−{formatMoney(invoice.discount_total)}</dd>
              </div>
            )}
            {hasTax && (
              <>
                <div className="flex justify-between">
                  <dt className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.05em]">Taxable value</dt>
                  <dd className="tabular text-[10px] text-slate-600">{formatMoney(invoice.taxable_total)}</dd>
                </div>
                {interState ? (
                  <div className="flex justify-between">
                    <dt className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.05em]">IGST</dt>
                    <dd className="tabular text-[10px] text-slate-600">{formatMoney(invoice.igst_amount)}</dd>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.05em]">CGST</dt>
                      <dd className="tabular text-[10px] text-slate-600">{formatMoney(invoice.cgst_amount)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.05em]">SGST</dt>
                      <dd className="tabular text-[10px] text-slate-600">{formatMoney(invoice.sgst_amount)}</dd>
                    </div>
                  </>
                )}
              </>
            )}
            <div className="flex justify-between border-t border-slate-900 pt-2">
              <dt className="text-sm font-bold text-slate-900">Total</dt>
              <dd className="tabular text-sm font-bold text-slate-900">{formatMoney(invoice.total)}</dd>
            </div>
            {invoice.amount_paid > 0 && (
              <>
                <div className="flex justify-between">
                  <dt className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.05em]">Received</dt>
                  <dd className="tabular text-[10px] text-slate-500">{formatMoney(invoice.amount_paid)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-bold text-slate-900">Balance due</dt>
                  <dd className="tabular text-sm font-bold text-slate-900">{formatMoney(invoice.outstanding)}</dd>
                </div>
              </>
            )}
          </dl>
        </div>
      </section>

      {/* ───────── FOOTER ───────── */}
      <footer className="mt-12 border-t border-slate-200 pt-6">
        <p className="text-[10px] text-slate-500">{invoice.tax_note}</p>
        <p className="text-[10px] text-slate-500 mt-1">
          This is a computer-generated invoice
          {invoice.invoice_number ? ` (${invoice.invoice_number})` : ""}
        </p>
      </footer>
    </article>
  );
}
