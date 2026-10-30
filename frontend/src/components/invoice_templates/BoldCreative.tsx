"use client";

import { formatDate, formatMoney } from "@/lib/format";
import { invoiceStatusLabel } from "@/lib/status";
import type { InvoiceDetail } from "@/lib/types";

function boldParty({
  label,
  party,
}: {
  label: string;
  party: InvoiceDetail["client"] | InvoiceDetail["firm"] | null;
}) {
  if (!party) return null;
  return (
    <div className="space-y-1">
      <p className={`text-[10px] font-black uppercase tracking-widest text-slate-400`}>{label}</p>
      <p className="text-sm font-black text-slate-900 uppercase tracking-tight break-words">{party.name}</p>
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

export function BoldCreative({ invoice }: { invoice: InvoiceDetail }) {
  const accentColor = "#d97706";
  const interState = invoice.gst_tax_type === "inter_state";
  const hasTax = invoice.cgst_amount + invoice.sgst_amount + invoice.igst_amount > 0;
  const firm = invoice.firm;
  const client = invoice.client;

  return (
    <article className="print-sheet mx-auto w-full max-w-[210mm] bg-white p-8 text-slate-900 overflow-hidden">
      {/* ───────── HEADER: oversized typography, strong hierarchy ───────── */}
      <header className="flex items-start justify-between gap-8 mb-10 border-b-8 border-[#d97706] pb-4">
        <div className="min-w-0">
          <h1 className={`text-3xl font-black tracking-tight uppercase text-slate-900 break-words`}>
            {firm?.name ?? "THE FIRM"}
          </h1>
          <div className="mt-2 h-1 w-24 bg-[#d97706]" />
          {firm?.address_line1 && <p className="mt-3 text-[10px] text-slate-500 uppercase tracking-widest">{firm.address_line1}</p>}
          {firm?.address_line2 && <p className="text-[10px] text-slate-500 uppercase tracking-widest">{firm.address_line2}</p>}
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">
            {[firm?.city, firm?.state, firm?.pincode].filter(Boolean).join(", ")}
          </p>
          {firm?.gstin && (
            <p className="mt-2 text-[10px] text-slate-500 uppercase tracking-widest">
              GSTIN: <span className="font-mono">{firm.gstin}</span>{" "}
              {firm?.pan ? <><span className="text-slate-400"> · </span><span className="font-mono">PAN: {firm.pan}</span></> : null}
            </p>
          )}
        </div>
        <div className="text-right min-w-[140px]">
          <p className={`text-[10px] font-black uppercase tracking-widest text-[#d97706]`}>Tax Invoice</p>
          <p className={`tabular font-black text-3xl mt-1 text-[#d97706]`}>
            {invoice.invoice_number ?? "DRAFT"}
          </p>
          <div className="mt-4 space-y-1 text-[10px]">
            <div className="flex justify-between">
              <span className="text-slate-400 uppercase tracking-widest">Date</span>
              <span className="tabular text-slate-900 font-black">{formatDate(invoice.invoice_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 uppercase tracking-widest">Due</span>
              <span className="tabular text-slate-900 font-black">{formatDate(invoice.due_date)}</span>
            </div>
          </div>
          <p className={`mt-3 text-[10px] font-medium uppercase tracking-widest text-slate-500`}>
            {invoiceStatusLabel(invoice.status)}
          </p>
        </div>
      </header>

      {/* ───────── BILL TO + FROM ───────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
        <div>{boldParty({ label: "Bill to", party: client })}</div>
        <div>{boldParty({ label: "From", party: firm })}</div>
      </section>

      {/* Invoice particulars strip */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-8 border-b-4 border-[#d97706] pb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#d97706]">Place of supply</span>
          <span className="font-mono text-slate-900 font-black">{invoice.place_of_supply_state_code ?? "—"}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#d97706]">Tax type</span>
          <span className="text-slate-900 font-black">{interState ? "Inter-state" : "Intra-state"}</span>
        </div>
      </div>

      {/* ───────── LINE-ITEM TABLE ───────── */}
      <section className="mb-10 overflow-x-auto min-w-0">
        <table className="w-full text-xs border-collapse table-fixed">
          <thead>
            <tr className="border-b-2 border-[#d97706] bg-[#d97706]/10">
              <th className="w-[5%] text-left py-3 font-black text-[#d97706] uppercase tracking-widest">#</th>
              <th className="w-[38%] text-left py-3 font-black text-[#d97706] uppercase tracking-widest">Description</th>
              <th className="w-[12%] text-left py-3 font-black text-[#d97706] uppercase tracking-widest">HSN / SAC</th>
              <th className="w-[10%] text-right py-3 font-black text-[#d97706] uppercase tracking-widest pr-4">Qty</th>
              <th className="w-[17%] text-right py-3 font-black text-[#d97706] uppercase tracking-widest pr-4">Rate</th>
              <th className="w-[18%] text-right py-3 font-black text-[#d97706] uppercase tracking-widest pr-4">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td className="w-[5%] py-3 text-slate-600 tabular font-medium">{line.sequence}</td>
                <td className="w-[38%] py-3 text-slate-900 font-bold break-words overflow-hidden whitespace-normal">{line.description}</td>
                <td className="w-[12%] py-3 text-slate-600 font-mono break-all">{line.sac_code ?? "—"}</td>
                <td className="w-[10%] py-3 text-right text-slate-600 tabular pr-4 whitespace-nowrap">{line.quantity}</td>
                <td className="w-[17%] py-3 text-right text-slate-600 tabular pr-4 whitespace-nowrap">{formatMoney(line.unit_price)}</td>
                <td className="w-[18%] py-3 text-right font-bold tabular pr-4 whitespace-nowrap">{formatMoney(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ───────── EMPHASIZED GRAND TOTAL ───────── */}
      <section className="flex justify-end mb-10">
        <div className={`w-full max-w-xs bg-[#d97706] text-white rounded-lg p-6`}>
          <dl className="space-y-2">
            <div className="flex justify-between">
              <dt className="text-[10px] font-black uppercase tracking-widest opacity-80">Subtotal</dt>
              <dd className="tabular text-sm font-bold opacity-90">{formatMoney(invoice.subtotal)}</dd>
            </div>
            {invoice.discount_total > 0 && (
              <div className="flex justify-between">
                <dt className="text-[10px] font-black uppercase tracking-widest opacity-80">Discount</dt>
                <dd className="tabular text-sm font-bold opacity-90">−{formatMoney(invoice.discount_total)}</dd>
              </div>
            )}
            {hasTax && (
              <>
                <div className="flex justify-between">
                  <dt className="text-[10px] font-black uppercase tracking-widest opacity-80">Taxable value</dt>
                  <dd className="tabular text-sm font-bold opacity-90">{formatMoney(invoice.taxable_total)}</dd>
                </div>
                {interState ? (
                  <div className="flex justify-between">
                    <dt className="text-[10px] font-black uppercase tracking-widest opacity-80">IGST @ {invoice.tax_rate}%</dt>
                    <dd className="tabular text-sm font-bold opacity-90">{formatMoney(invoice.igst_amount)}</dd>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-[10px] font-black uppercase tracking-widest opacity-80">CGST @ {invoice.tax_rate / 2}%</dt>
                      <dd className="tabular text-sm font-bold opacity-90">{formatMoney(invoice.cgst_amount)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[10px] font-black uppercase tracking-widest opacity-80">SGST @ {invoice.tax_rate / 2}%</dt>
                      <dd className="tabular text-sm font-bold opacity-90">{formatMoney(invoice.sgst_amount)}</dd>
                    </div>
                  </>
                )}
              </>
            )}
            <div className="flex justify-between border-t border-white/20 pt-3 mt-2">
              <dt className="text-base font-black uppercase tracking-widest">Grand total</dt>
              <dd className={`tabular text-2xl font-black ${accentColor === "#d97706" ? "text-[#fcd34d]" : "text-white"}`}>
                {formatMoney(invoice.total)}
              </dd>
            </div>
            {invoice.amount_paid > 0 && (
              <>
                <div className="flex justify-between mt-3">
                  <dt className="text-[10px] font-black uppercase tracking-widest opacity-80">Received</dt>
                  <dd className="tabular text-sm font-bold opacity-90">{formatMoney(invoice.amount_paid)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-bold uppercase tracking-widest">Balance due</dt>
                  <dd className={`tabular text-sm font-bold ${accentColor === "#d97706" ? "text-[#fcd34d]" : "text-white"}`}>
                    {formatMoney(invoice.outstanding)}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </div>
      </section>

      {/* ───────── TERMS & NOTES ───────── */}
      {invoice.terms && (
        <section className="mb-6 border-t-2 border-[#d97706] pt-4">
          <p className={`text-[10px] font-black uppercase tracking-widest text-[#d97706] mb-2`}>Terms</p>
          <p className="whitespace-pre-wrap text-xs text-slate-700 font-bold">{invoice.terms}</p>
        </section>
      )}

      {/* ───────── FOOTER ───────── */}
      <footer className="mt-12 border-t-2 border-[#d97706] pt-6 flex justify-between items-end">
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest">{invoice.tax_note}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">
            Computer-generated invoice
            {invoice.invoice_number ? ` (${invoice.invoice_number})` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#d97706]">Authorised signatory</p>
          <div className="h-1 w-24 border-b border-[#d97706] mt-1" />
        </div>
      </footer>
    </article>
  );
}
