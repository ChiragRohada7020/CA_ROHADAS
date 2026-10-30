"use client";

import { formatDate, formatMoney } from "@/lib/format";
import { invoiceStatusLabel } from "@/lib/status";
import type { InvoiceDetail } from "@/lib/types";

function corporateParty({
  label,
  party,
}: {
  label: string;
  party: InvoiceDetail["client"] | InvoiceDetail["firm"] | null;
}) {
  if (!party) return null;
  return (
    <div className="space-y-1">
      <p className={`text-xs font-bold uppercase tracking-wide text-slate-500`}>{label}</p>
      <p className="text-sm font-semibold text-slate-900 break-words">{party.name}</p>
      {party.address_line1 && <p className="text-xs text-slate-600 break-words">{party.address_line1}</p>}
      {party.address_line2 && <p className="text-xs text-slate-600 break-words">{party.address_line2}</p>}
      <p className="text-xs text-slate-600 break-words">
        {[party.city, party.state, party.pincode].filter(Boolean).join(", ")}
      </p>
      {party.gstin && (
        <p className="text-xs text-slate-600 break-words">
          GSTIN: <span className="font-mono break-all">{party.gstin}</span>{" "}
          {party.pan ? <><span className="text-slate-400"> · </span><span className="font-mono break-all">PAN: {party.pan}</span></> : null}
        </p>
      )}
      <p className="text-xs text-slate-600 break-words mt-1">
        {[party.email, party.phone].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

export function CorporateGST({ invoice }: { invoice: InvoiceDetail }) {
  const interState = invoice.gst_tax_type === "inter_state";
  const hasTax = invoice.cgst_amount + invoice.sgst_amount + invoice.igst_amount > 0;
  const firm = invoice.firm;
  const client = invoice.client;

  return (
    <article className="print-sheet mx-auto w-full max-w-[210mm] bg-white p-8 text-slate-900 overflow-hidden">
      {/* ───────── HEADER: firm left, invoice meta right ───────── */}
      <header className="flex items-start justify-between gap-8 mb-6 border-b-4 border-[#1a237e] pb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-[#1a237e] uppercase break-words">
            {firm?.name ?? "The firm"}
          </h1>
          {firm?.address_line1 && <p className="text-xs text-slate-600">{firm.address_line1}</p>}
          {firm?.address_line2 && <p className="text-xs text-slate-600">{firm.address_line2}</p>}
          <p className="text-xs text-slate-600">
            {[firm?.city, firm?.state, firm?.pincode].filter(Boolean).join(", ")}
          </p>
          {firm?.gstin && (
            <p className="mt-1 text-xs text-slate-600">
              GSTIN: <span className="font-mono">{firm.gstin}</span>{" "}
              {firm?.pan ? <><span className="text-slate-400"> · </span><span className="font-mono">PAN: {firm.pan}</span></> : null}
            </p>
          )}
          <p className="text-xs text-slate-600 mt-1">
            {[firm?.email, firm?.phone].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right min-w-[130px]">
          <p className="text-lg font-bold uppercase tracking-widest text-[#1a237e]">Tax Invoice</p>
          <p className="tabular mt-1 text-sm font-mono font-bold">{invoice.invoice_number ?? "DRAFT"}</p>
          <p className="mt-2 text-xs text-slate-600">
            Invoice date: <span className="tabular">{formatDate(invoice.invoice_date)}</span>
          </p>
          <p className="text-xs text-slate-600">
            Due date: <span className="tabular">{formatDate(invoice.due_date)}</span>
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {invoiceStatusLabel(invoice.status)}
          </p>
        </div>
      </header>

      {/* ───────── SELLER & BUYER (structured two-column) ───────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div>{corporateParty({ label: "From (Seller)", party: firm })}</div>
        <div>{corporateParty({ label: "To (Buyer)", party: client })}</div>
      </section>

      {/* ───────── GST INVOICE PARTICULARS ───────── */}
      <section className="mb-8 border border-[#c5cae9] rounded-lg p-4 bg-[#f8f9fc]">
        <p className="text-xs font-bold uppercase tracking-wide mb-3 text-[#1a237e]">GST invoice particulars</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-600">Place of supply</span>
            <span className="font-mono text-slate-900">{invoice.place_of_supply_state_code ?? "—"}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-600">Reverse charge</span>
            <span className="text-slate-900 font-medium">No</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-600">Tax type</span>
            <span className="text-slate-900 font-medium">{interState ? "Inter-state (IGST)" : "Intra-state (CGST + SGST)"}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span className="text-slate-600">GST rate</span>
            <span className="tabular text-slate-900 font-medium">{invoice.tax_rate}%</span>
          </div>
        </div>
      </section>

      {/* ───────── LINE-ITEM TABLE ───────── */}
      <section className="mb-8 overflow-x-auto min-w-0">
        <table className="w-full text-sm border-collapse table-fixed">
          <thead>
            <tr className="border-b-2 border-[#1a237e] bg-[#1a237e]/5">
              <th className="w-[5%] text-left py-3 font-bold text-[#1a237e] uppercase tracking-wider">S.No</th>
              <th className="w-[38%] text-left py-3 font-bold text-[#1a237e] uppercase tracking-wider">Description of goods / services</th>
              <th className="w-[12%] text-left py-3 font-bold text-[#1a237e] uppercase tracking-wider">HSN / SAC</th>
              <th className="w-[10%] text-right py-3 font-bold text-[#1a237e] uppercase tracking-wider pr-4">Qty</th>
              <th className="w-[17%] text-right py-3 font-bold text-[#1a237e] uppercase tracking-wider pr-4">Rate</th>
              <th className="w-[18%] text-right py-3 font-bold text-[#1a237e] uppercase tracking-wider pr-4">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
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

      {/* ───────── AMOUNT DUE PANEL ───────── */}
      <section className="flex justify-end mb-8">
        <div className={`w-full max-w-xs border-2 border-[#1a237e] rounded-lg p-5 bg-[#f8f9fc]`}>
          <dl className="space-y-2">
            <div className="flex justify-between">
              <dt className="text-xs text-slate-600">Subtotal</dt>
              <dd className="tabular text-sm text-slate-600">{formatMoney(invoice.subtotal)}</dd>
            </div>
            {invoice.discount_total > 0 && (
              <div className="flex justify-between">
                <dt className="text-xs text-slate-600">Discount</dt>
                <dd className="tabular text-sm text-slate-600">−{formatMoney(invoice.discount_total)}</dd>
              </div>
            )}
            {hasTax && (
              <>
                <div className="flex justify-between">
                  <dt className="text-xs text-slate-600">Taxable value</dt>
                  <dd className="tabular text-sm text-slate-600">{formatMoney(invoice.taxable_total)}</dd>
                </div>
                {interState ? (
                  <div className="flex justify-between">
                    <dt className="text-xs text-slate-600">IGST @ {invoice.tax_rate}%</dt>
                    <dd className="tabular text-sm text-slate-600">{formatMoney(invoice.igst_amount)}</dd>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-xs text-slate-600">CGST @ {invoice.tax_rate / 2}%</dt>
                      <dd className="tabular text-sm text-slate-600">{formatMoney(invoice.cgst_amount)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-xs text-slate-600">SGST @ {invoice.tax_rate / 2}%</dt>
                      <dd className="tabular text-sm text-slate-600">{formatMoney(invoice.sgst_amount)}</dd>
                    </div>
                  </>
                )}
              </>
            )}
            <div className="flex justify-between border-t-2 border-[#1a237e] pt-2">
              <dt className="text-sm font-bold text-[#1a237e]">Grand Total</dt>
              <dd className="tabular text-sm font-bold text-[#1a237e]">{formatMoney(invoice.total)}</dd>
            </div>
            {invoice.amount_paid > 0 && (
              <>
                <div className="flex justify-between">
                  <dt className="text-xs text-slate-500">Amount paid</dt>
                  <dd className="tabular text-xs text-slate-500">{formatMoney(invoice.amount_paid)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-bold text-[#1a237e]">Balance due</dt>
                  <dd className="tabular text-sm font-bold text-[#1a237e]">{formatMoney(invoice.outstanding)}</dd>
                </div>
              </>
            )}
          </dl>
        </div>
      </section>

      {/* ───────── BANK DETAILS ───────── */}
      {invoice.bank_details && Object.values(invoice.bank_details).some((v: any) => v) && (
        <section className="mb-8 border-t-2 border-[#1a237e] pt-4">
          <p className="text-xs font-bold uppercase tracking-wide mb-3 text-[#1a237e]">Bank details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {(invoice.bank_details as any).bank_name && (
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600">Bank name</span>
                <span className="text-slate-900 font-medium">{ (invoice.bank_details as any).bank_name }</span>
              </div>
            )}
            {(invoice.bank_details as any).account_name && (
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600">Account name</span>
                <span className="text-slate-900 font-medium">{ (invoice.bank_details as any).account_name }</span>
              </div>
            )}
            {(invoice.bank_details as any).account_number && (
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600">Account number</span>
                <span className="font-mono text-slate-900">{ (invoice.bank_details as any).account_number }</span>
              </div>
            )}
            {(invoice.bank_details as any).ifsc_code && (
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600">IFSC code</span>
                <span className="font-mono text-slate-900">{ (invoice.bank_details as any).ifsc_code }</span>
              </div>
            )}
            {(invoice.bank_details as any).upi_id && (
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600">UPI ID</span>
                <span className="font-mono text-slate-900">{ (invoice.bank_details as any).upi_id }</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ───────── TERMS & DECLARATION ───────── */}
      {invoice.terms && (
        <section className="mb-6 border-t border-slate-200 pt-4">
          <p className="text-xs font-bold uppercase tracking-wide mb-2 text-slate-500">Declaration</p>
          <p className="whitespace-pre-wrap text-xs text-slate-700 italic">{invoice.terms}</p>
        </section>
      )}

      {/* ───────── SIGNATURE ───────── */}
      <section className="mt-10 border-t border-slate-200 pt-6">
        <div className="flex justify-between items-end">
          <div className="text-center w-1/3">
            <div className="h-1 w-24 border-b border-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-500 uppercase tracking-wide">Authorised Signatory</p>
          </div>
          <div className="text-center w-1/3">
            <div className="h-1 w-24 border-b border-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-500 uppercase tracking-wide">Date</p>
          </div>
          <div className="text-center w-1/3">
            <div className="h-1 w-24 border-b border-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-500 uppercase tracking-wide">Stamp</p>
          </div>
        </div>
      </section>

      {/* ───────── FOOTER ───────── */}
      <footer className="mt-10 border-t border-slate-200 pt-4">
        <p className="text-xs text-slate-500">{invoice.tax_note}</p>
        <p className="text-xs text-slate-500 mt-1">
          This is a computer-generated invoice
          {invoice.invoice_number ? ` (${invoice.invoice_number})` : ""}
        </p>
      </footer>
    </article>
  );
}
