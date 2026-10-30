"use client";

import { formatDate, formatMoney } from "@/lib/format";
import { invoiceStatusLabel } from "@/lib/status";
import type { InvoiceDetail } from "@/lib/types";

function partyCard({
  label,
  party,
  accentColor,
}: {
  label: string;
  party: InvoiceDetail["client"] | InvoiceDetail["firm"] | null;
  accentColor: string;
}) {
  if (!party) return null;
  return (
    <div className={`border rounded-lg p-4 ${accentColor ? `border-[${accentColor}]/20` : "border-slate-200"}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${accentColor ? `text-[${accentColor}]` : "text-slate-500"}`}>
        {label}
      </p>
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

function amountChip({ label, value, accentColor, isTotal = false }: { label: string; value: string; accentColor: string; isTotal?: boolean }) {
  return (
    <div className="flex flex-col">
      <p className={`text-xs font-semibold uppercase tracking-wide ${isTotal ? "text-slate-900" : "text-slate-500"}`}>{label}</p>
      <div className={`tabular font-semibold ${isTotal ? "text-lg text-slate-900" : "text-sm text-slate-600"}`}>
        {isTotal && accentColor ? <span className={`text-[${accentColor}]`}>{value}</span> : value}
      </div>
    </div>
  );
}

export function ModernFintech({ invoice }: { invoice: InvoiceDetail }) {
  const accentColor = "#635bff";
  const interState = invoice.gst_tax_type === "inter_state";
  const hasTax = invoice.cgst_amount + invoice.sgst_amount + invoice.igst_amount > 0;
  const firm = invoice.firm;
  const client = invoice.client;

  return (
    <article className="print-sheet mx-auto w-full max-w-[210mm] bg-white p-8 text-slate-900 overflow-hidden">
      {/* ───────── HEADER: asymmetric — firm left, invoice # + amount right ───────── */}
      <header className="flex flex-wrap items-start justify-between gap-6 mb-8 border-b-2 border-[#635bff] pb-4">
        <div className="min-w-0">
          <h1 className={`text-2xl font-bold tracking-tight text-[#635bff] break-words`}>{firm?.name ?? "The firm"}</h1>
          {firm?.address_line1 && <p className="text-xs text-slate-600 break-words">{firm.address_line1}</p>}
          {firm?.address_line2 && <p className="text-xs text-slate-600 break-words">{firm.address_line2}</p>}
          <p className="text-xs text-slate-600 break-words">
            {[firm?.city, firm?.state, firm?.pincode].filter(Boolean).join(", ")}
          </p>
          {firm?.gstin && (
            <p className="mt-1 text-xs text-slate-600 break-words">
              GSTIN: <span className="font-mono break-all">{firm.gstin}</span>{" "}
              {firm?.pan ? <><span className="text-slate-400"> · </span><span className="font-mono break-all">PAN: {firm.pan}</span></> : null}
            </p>
          )}
          <p className="text-xs text-slate-600 break-words mt-1">
            {[firm?.email, firm?.phone].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right min-w-[120px]">
          <p className={`text-xs font-semibold uppercase tracking-wide text-[#635bff]`}>Tax Invoice</p>
          <p className={`tabular font-bold text-lg mt-1 ${accentColor === "#635bff" ? "text-[#635bff]" : "text-slate-900"}`}>
            {invoice.invoice_number ?? "DRAFT"}
          </p>
          <p className="mt-2 text-xs text-slate-600 break-words">
            Invoice date: <span className="tabular break-all">{formatDate(invoice.invoice_date)}</span>
          </p>
          <p className="text-xs text-slate-600 break-words">
            Due date: <span className="tabular break-all">{formatDate(invoice.due_date)}</span>
          </p>
          <div className="mt-3 pt-3 border-t border-slate-200">
            {amountChip({
              label: "Amount due",
              value: formatMoney(invoice.outstanding > 0 ? invoice.outstanding : invoice.total),
              accentColor,
              isTotal: true,
            })}
          </div>
        </div>
      </header>

      {/* ───────── TWO-COLUMN: bill-to + invoice metadata ───────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div>{partyCard({ label: "Bill to", party: client, accentColor })}</div>
        <div className={`bg-[#635bff]/5 rounded-lg p-4 border border-[#635bff]/10`}>
          <p className={`text-xs font-semibold uppercase tracking-wide mb-2 text-[#635bff]`}>Invoice details</p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600 break-words">Status</span>
              <span className={`font-medium text-slate-900 break-words`}>{invoiceStatusLabel(invoice.status)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 break-words">Tax type</span>
              <span className="font-medium text-slate-900 break-words">{interState ? "Inter-state" : "Intra-state"}</span>
            </div>
            {invoice.place_of_supply_state_code && (
              <div className="flex justify-between">
                <span className="text-slate-600 break-words">Place of supply</span>
                <span className="font-mono font-medium break-all">{invoice.place_of_supply_state_code}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ───────── LINE-ITEM TABLE ───────── */}
      <section className="mb-8 overflow-x-auto min-w-0">
        <table className="w-full text-xs border-collapse table-fixed">
          <thead>
            <tr className="border-b border-[#635bff] bg-[#635bff]/5">
              <th className="w-[5%] text-left py-2 font-bold text-[#635bff] uppercase tracking-wider">#</th>
              <th className="w-[38%] text-left py-2 font-bold text-[#635bff] uppercase tracking-wider">Description</th>
              <th className="w-[12%] text-left py-2 font-bold text-[#635bff] uppercase tracking-wider">SAC / HSN</th>
              <th className="w-[10%] text-right py-2 font-bold text-[#635bff] uppercase tracking-wider pr-4">Qty</th>
              <th className="w-[17%] text-right py-2 font-bold text-[#635bff] uppercase tracking-wider pr-4">Rate</th>
              <th className="w-[18%] text-right py-2 font-bold text-[#635bff] uppercase tracking-wider pr-4">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td className="w-[5%] py-3 text-slate-600 tabular">{line.sequence}</td>
                <td className="w-[38%] py-3 text-slate-900 font-medium break-words overflow-hidden whitespace-normal">{line.description}</td>
                <td className="w-[12%] py-3 text-slate-600 font-mono break-all">{line.sac_code ?? "—"}</td>
                <td className="w-[10%] py-3 text-right text-slate-600 tabular pr-4 whitespace-nowrap">{line.quantity}</td>
                <td className="w-[17%] py-3 text-right text-slate-600 tabular pr-4 whitespace-nowrap">{formatMoney(line.unit_price)}</td>
                <td className="w-[18%] py-3 text-right font-semibold tabular pr-4 whitespace-nowrap">{formatMoney(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ───────── TOTALS PANEL ───────── */}
      <section className={`flex justify-end mb-8`}>
        <div className={`w-full max-w-xs bg-[#635bff]/5 border border-[#635bff]/20 rounded-lg p-5`}>
          <dl className="space-y-2">
            <div className="flex justify-between">
              <dt className="text-xs text-slate-600 break-words">Subtotal</dt>
              <dd className="tabular text-sm text-slate-600">{formatMoney(invoice.subtotal)}</dd>
            </div>
            {invoice.discount_total > 0 && (
              <div className="flex justify-between">
                <dt className="text-xs text-slate-600 break-words">Discount</dt>
                <dd className="tabular text-sm text-slate-600">−{formatMoney(invoice.discount_total)}</dd>
              </div>
            )}
            {hasTax && (
              <>
                <div className="flex justify-between">
                  <dt className="text-xs text-slate-600 break-words">Taxable value</dt>
                  <dd className="tabular text-sm text-slate-600">{formatMoney(invoice.taxable_total)}</dd>
                </div>
                {interState ? (
                  <div className="flex justify-between">
                    <dt className="text-xs text-slate-600 break-words">IGST @ {invoice.tax_rate}%</dt>
                    <dd className="tabular text-sm text-slate-600">{formatMoney(invoice.igst_amount)}</dd>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-xs text-slate-600 break-words">CGST @ {invoice.tax_rate / 2}%</dt>
                      <dd className="tabular text-sm text-slate-600">{formatMoney(invoice.cgst_amount)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-xs text-slate-600 break-words">SGST @ {invoice.tax_rate / 2}%</dt>
                      <dd className="tabular text-sm text-slate-600">{formatMoney(invoice.sgst_amount)}</dd>
                    </div>
                  </>
                )}
              </>
            )}
            <div className="flex justify-between border-t border-[#635bff] pt-2">
              <dt className="text-sm font-bold text-slate-900 break-words">Total</dt>
              <dd className="tabular text-sm font-bold text-[#635bff]">{formatMoney(invoice.total)}</dd>
            </div>
            {invoice.amount_paid > 0 && (
              <>
                <div className="flex justify-between">
                  <dt className="text-xs text-slate-500 break-words">Received</dt>
                  <dd className="tabular text-xs text-slate-500">{formatMoney(invoice.amount_paid)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-slate-900 break-words">Balance due</dt>
                  <dd className="tabular text-sm font-medium text-slate-900">{formatMoney(invoice.outstanding)}</dd>
                </div>
              </>
            )}
          </dl>
        </div>
      </section>

      {/* ───────── PAYMENT INFORMATION ───────── */}
      {invoice.bank_details && Object.values(invoice.bank_details).some((v: any) => v) && (
        <section className={`border-t border-[#635bff]/20 pt-6`}>
          <p className={`text-xs font-semibold uppercase tracking-wide mb-3 text-[#635bff]`}>Payment information</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {(invoice.bank_details as any).bank_name && (
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600 break-words">Bank</span>
                <span className="text-slate-900 font-medium break-words">{ (invoice.bank_details as any).bank_name }</span>
              </div>
            )}
            {(invoice.bank_details as any).account_name && (
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600 break-words">Account name</span>
                <span className="text-slate-900 font-medium break-words">{ (invoice.bank_details as any).account_name }</span>
              </div>
            )}
            {(invoice.bank_details as any).account_number && (
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600 break-words">Account number</span>
                <span className="font-mono break-all text-slate-900">{ (invoice.bank_details as any).account_number }</span>
              </div>
            )}
            {(invoice.bank_details as any).ifsc_code && (
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600 break-words">IFSC</span>
                <span className="font-mono break-all text-slate-900">{ (invoice.bank_details as any).ifsc_code }</span>
              </div>
            )}
            {(invoice.bank_details as any).upi_id && (
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600 break-words">UPI ID</span>
                <span className="font-mono break-all text-slate-900">{ (invoice.bank_details as any).upi_id }</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ───────── FOOTER ───────── */}
      <footer className="mt-10 border-t border-slate-200 pt-4">
        <p className="text-xs text-slate-500 break-words">{invoice.tax_note}</p>
        <p className="text-xs text-slate-500 mt-1 break-words">
          This is a computer-generated invoice
          {invoice.invoice_number ? ` (${invoice.invoice_number})` : ""}
        </p>
      </footer>
    </article>
  );
}
