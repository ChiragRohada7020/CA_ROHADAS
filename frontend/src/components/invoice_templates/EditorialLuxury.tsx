"use client";

import { formatDate, formatMoney } from "@/lib/format";
import { invoiceStatusLabel } from "@/lib/status";
import type { InvoiceDetail } from "@/lib/types";

function editorialParty({
  label,
  party,
}: {
  label: string;
  party: InvoiceDetail["client"] | InvoiceDetail["firm"] | null;
}) {
  if (!party) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold italic tracking-wider text-slate-500 uppercase">{label}</p>
      <p className="text-sm font-semibold italic text-slate-900 break-words">{party.name}</p>
      {party.address_line1 && <p className="text-xs text-slate-600 italic break-words">{party.address_line1}</p>}
      {party.address_line2 && <p className="text-xs text-slate-600 italic break-words">{party.address_line2}</p>}
      <p className="text-xs text-slate-600 italic break-words">
        {[party.city, party.state, party.pincode].filter(Boolean).join(", ")}
      </p>
      {party.gstin && (
        <p className="text-xs text-slate-600 italic break-words">
          GSTIN: <span className="font-mono break-all">{party.gstin}</span>{" "}
          {party.pan ? <><span className="text-slate-400"> · </span><span className="font-mono break-all">PAN: {party.pan}</span></> : null}
        </p>
      )}
      <p className="text-xs text-slate-600 italic break-words mt-1">
        {[party.email, party.phone].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

function rule() {
  return <hr className="border-t border-slate-300 my-6" />;
}

export function EditorialLuxury({ invoice }: { invoice: InvoiceDetail }) {
  const interState = invoice.gst_tax_type === "inter_state";
  const hasTax = invoice.cgst_amount + invoice.sgst_amount + invoice.igst_amount > 0;
  const firm = invoice.firm;
  const client = invoice.client;

  return (
    <article className="print-sheet mx-auto w-full max-w-[210mm] bg-white p-10 text-slate-900 overflow-hidden">
      {/* ───────── HEADER: large invoice heading, sophisticated composition ───────── */}
      <header className="flex items-start justify-between gap-8 mb-10">
        <div className="min-w-0">
          <h1 className="text-4xl font-bold italic tracking-tight text-slate-900 break-words">
            {firm?.name ?? "The firm"}
          </h1>
          {firm?.address_line1 && <p className="text-sm text-slate-600 italic">{firm.address_line1}</p>}
          {firm?.address_line2 && <p className="text-sm text-slate-600 italic">{firm.address_line2}</p>}
          <p className="text-sm text-slate-600 italic">
            {[firm?.city, firm?.state, firm?.pincode].filter(Boolean).join(", ")}
          </p>
          {firm?.gstin && (
            <p className="mt-2 text-sm text-slate-600 italic">
              GSTIN: <span className="font-mono">{firm.gstin}</span>{" "}
              {firm?.pan ? <><span className="text-slate-400"> · </span><span className="font-mono">PAN: {firm.pan}</span></> : null}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold uppercase tracking-widest text-slate-500 italic">Tax invoice</p>
          <p className="tabular font-bold text-lg mt-2">INV-{invoice.invoice_number ?? "—"}</p>
          <p className="mt-4 text-sm text-slate-600 italic">
            Invoice date: <span className="tabular">{formatDate(invoice.invoice_date)}</span>
          </p>
          <p className="text-sm text-slate-600 italic">
            Due date: <span className="tabular">{formatDate(invoice.due_date)}</span>
          </p>
        </div>
      </header>
      rule();

      {/* ───────── UNBOXED BILLING INFO (two-column, no boxes) ───────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-10">
        <div>{editorialParty({ label: "Bill to", party: client })}</div>
        <div>
          <p className="text-xs font-bold italic tracking-widest text-slate-500 uppercase mb-2">From</p>
          {editorialParty({ label: "", party: firm })}
        </div>
      </section>

      {/* Invoice metadata strip */}
      <div className="flex flex-wrap justify-between items-baseline gap-4 mb-2 border-b border-slate-300 pb-4">
        <div className="text-xs text-slate-500 italic uppercase tracking-wider">
          Status: {invoiceStatusLabel(invoice.status)}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-slate-600 italic">Place of supply:</span>
          <span className="font-mono text-slate-900">{invoice.place_of_supply_state_code ?? "—"}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-slate-600 italic">Tax type:</span>
          <span className="text-slate-900">{interState ? "Inter-state" : "Intra-state"}</span>
        </div>
      </div>

      {/* ───────── LINE-ITEM TABLE ───────── */}
      <section className="mt-10 mb-10 overflow-x-auto min-w-0">
        <table className="w-full text-sm border-collapse table-fixed">
          <thead>
            <tr className="border-b border-slate-300">
              <th className="w-[5%] text-left py-3 font-medium text-slate-500 uppercase tracking-wider">S.No</th>
              <th className="w-[38%] text-left py-3 font-medium text-slate-500 uppercase tracking-wider">Description of goods / services</th>
              <th className="w-[12%] text-left py-3 font-medium text-slate-500 uppercase tracking-wider">HSN / SAC</th>
              <th className="w-[10%] text-right py-3 font-medium text-slate-500 uppercase tracking-wider pr-4">Qty</th>
              <th className="w-[17%] text-right py-3 font-medium text-slate-500 uppercase tracking-wider pr-4">Rate</th>
              <th className="w-[18%] text-right py-3 font-medium text-slate-500 uppercase tracking-wider pr-4">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td className="w-[5%] py-3 text-slate-600 tabular">{line.sequence}</td>
                <td className="w-[38%] py-3 text-slate-900 break-words overflow-hidden whitespace-normal">{line.description}</td>
                <td className="w-[12%] py-3 text-slate-600 font-mono break-all">{line.sac_code ?? "—"}</td>
                <td className="w-[10%] py-3 text-right text-slate-600 tabular pr-4 whitespace-nowrap">{line.quantity}</td>
                <td className="w-[17%] py-3 text-right text-slate-600 tabular pr-4 whitespace-nowrap">{formatMoney(line.unit_price)}</td>
                <td className="w-[18%] py-3 text-right font-semibold tabular pr-4 whitespace-nowrap">{formatMoney(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ───────── EDITORIAL TOTALS SECTION ───────── */}
      <section className="flex justify-end">
        <div className="w-full max-w-xs">
          <div className="flex justify-between border-b border-slate-300 pb-2 mb-4">
            <span className="text-sm text-slate-500 italic">Taxable value</span>
            <span className="tabular text-sm font-medium text-slate-900">{formatMoney(invoice.taxable_total)}</span>
          </div>
          {hasTax && (
            <>
              {interState ? (
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-slate-500 italic">IGST @ {invoice.tax_rate}%</span>
                  <span className="tabular text-sm font-medium text-slate-900">{formatMoney(invoice.igst_amount)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-slate-500 italic">CGST @ {invoice.tax_rate / 2}%</span>
                    <span className="tabular text-sm font-medium text-slate-900">{formatMoney(invoice.cgst_amount)}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-slate-500 italic">SGST @ {invoice.tax_rate / 2}%</span>
                    <span className="tabular text-sm font-medium text-slate-900">{formatMoney(invoice.sgst_amount)}</span>
                  </div>
                </>
              )}
            </>
          )}
          <div className="flex justify-between border-t border-slate-900 pt-3">
            <span className="text-base font-bold italic text-slate-900">Total</span>
            <span className="tabular text-base font-bold italic text-slate-900">{formatMoney(invoice.total)}</span>
          </div>
          {invoice.amount_paid > 0 && (
            <>
              <div className="flex justify-between mt-3">
                <span className="text-xs text-slate-500 italic">Received</span>
                <span className="tabular text-xs font-medium text-slate-600">{formatMoney(invoice.amount_paid)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-sm font-semibold text-slate-900">Balance due</span>
                <span className="tabular text-sm font-semibold text-slate-900">{formatMoney(invoice.outstanding)}</span>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ───────── FOOTER ───────── */}
      <footer className="mt-12 border-t border-slate-300 pt-6">
        <p className="text-xs text-slate-500 italic">{invoice.tax_note}</p>
        <p className="text-xs text-slate-500 italic mt-1">
          This is a computer-generated invoice
          {invoice.invoice_number ? ` (INV-${invoice.invoice_number})` : ""}
        </p>
      </footer>
    </article>
  );
}
