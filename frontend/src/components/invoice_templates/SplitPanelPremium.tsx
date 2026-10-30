"use client";

import { formatDate, formatMoney } from "@/lib/format";
import { invoiceStatusLabel } from "@/lib/status";
import type { InvoiceDetail } from "@/lib/types";

function splitParty({
  label,
  party,
}: {
  label: string;
  party: InvoiceDetail["client"] | InvoiceDetail["firm"] | null;
}) {
  if (!party) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
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

function panel({
  title,
  accentColor,
  children,
}: {
  title: string;
  accentColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg p-5 border border-slate-200 bg-white`}>
      <p className={`text-xs font-bold uppercase tracking-wide mb-3 text-[${accentColor}]`}>{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function SplitPanelPremium({ invoice }: { invoice: InvoiceDetail }) {
  const accentColor = "#1e3a5f";
  const interState = invoice.gst_tax_type === "inter_state";
  const hasTax = invoice.cgst_amount + invoice.sgst_amount + invoice.igst_amount > 0;
  const firm = invoice.firm;
  const client = invoice.client;

  return (
    <article className="print-sheet mx-auto w-full max-w-[210mm] bg-white p-8 text-slate-900 overflow-hidden">
      {/* ───────── SPLIT HEADER: firm branding left, invoice metadata right ───────── */}
      <header className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10 border-b-2 border-[#1e3a5f] pb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-lg bg-[#1e3a5f] flex items-center justify-center`}>
              <span className="text-white font-bold text-xs">C</span>
            </div>
            <h1 className={`text-2xl font-bold tracking-tight text-[#1e3a5f] break-words`}>{firm?.name ?? "The firm"}</h1>
          </div>
          {firm?.address_line1 && <p className="text-xs text-slate-600">{firm.address_line1}</p>}
          {firm?.address_line2 && <p className="text-xs text-slate-600">{firm.address_line2}</p>}
          <p className="text-xs text-slate-600">
            {[firm?.city, firm?.state, firm?.pincode].filter(Boolean).join(", ")}
          </p>
          {firm?.gstin && (
            <p className="mt-2 text-xs text-slate-600">
              GSTIN: <span className="font-mono">{firm.gstin}</span>{" "}
              {firm?.pan ? <><span className="text-slate-400"> · </span><span className="font-mono">PAN: {firm.pan}</span></> : null}
            </p>
          )}
          <p className="text-xs text-slate-600 mt-1">
            {[firm?.email, firm?.phone].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right min-w-[140px]">
          <p className={`text-xs font-bold uppercase tracking-widest text-[#1e3a5f]`}>Tax Invoice</p>
          <p className={`tabular font-black text-2xl mt-1 text-[#1e3a5f]`}>
            {invoice.invoice_number ?? "DRAFT"}
          </p>
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Date</span>
              <span className="text-slate-900 tabular">{formatDate(invoice.invoice_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Due date</span>
              <span className="text-slate-900 tabular">{formatDate(invoice.due_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Status</span>
              <span className={`inline-flex items-center gap-1 rounded bg-slate-50 px-2 py-0.5 text-slate-700 font-medium`}>
                {invoiceStatusLabel(invoice.status)}
              </span>
            </div>
          </div>
          <div className="mt-6">
            <div className={`flex items-baseline gap-1 mb-1`}>
              <span className={`text-3xl font-black text-[#1e3a5f] tabular`}>
                {formatMoney(invoice.outstanding > 0 ? invoice.outstanding : invoice.total).replace(/[^0-9.,]/g, "")}
              </span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">due</span>
            </div>
            <p className="text-xs text-slate-600 mt-1">Amount payable</p>
          </div>
        </div>
      </header>

      {/* ───────── VISUALLY SEPARATE SECTIONS ───────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div>{splitParty({ label: "Bill to", party: client })}</div>
        <div>
          <p className={`text-xs font-bold uppercase tracking-wide mb-2 text-[#1e3a5f]`}>Invoice metadata</p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Tax type</span>
              <span className="text-slate-900 font-medium">{interState ? "Inter-state" : "Intra-state"}</span>
            </div>
            {invoice.place_of_supply_state_code && (
              <div className="flex justify-between">
                <span className="text-slate-600">Place of supply</span>
                <span className="font-mono text-slate-900 break-all">{invoice.place_of_supply_state_code}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-600">GST rate</span>
              <span className="tabular text-slate-900">{invoice.tax_rate}%</span>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── LINE-ITEM TABLE ───────── */}
      <section className="mb-8 overflow-x-auto min-w-0">
        <table className="w-full text-xs border-collapse table-fixed">
          <thead>
            <tr className="border-b-2 border-[#1e3a5f] bg-[#1e3a5f]/5">
              <th className="w-[5%] text-left py-3 font-bold text-[#1e3a5f] uppercase tracking-wider">#</th>
              <th className="w-[38%] text-left py-3 font-bold text-[#1e3a5f] uppercase tracking-wider">Description</th>
              <th className="w-[12%] text-left py-3 font-bold text-[#1e3a5f] uppercase tracking-wider">HSN / SAC</th>
              <th className="w-[10%] text-right py-3 font-bold text-[#1e3a5f] uppercase tracking-wider pr-4">Qty</th>
              <th className="w-[17%] text-right py-3 font-bold text-[#1e3a5f] uppercase tracking-wider pr-4">Rate</th>
              <th className="w-[18%] text-right py-3 font-bold text-[#1e3a5f] uppercase tracking-wider pr-4">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
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

      {/* ───────── PAYMENT SUMMARY PANEL ───────── */}
      <section className="flex justify-end mb-8">
        <div className={`w-full max-w-xs border border-[#1e3a5f]/30 rounded-lg p-5 bg-[#1e3a5f]/5`}>
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
            <div className="flex justify-between border-t border-[#1e3a5f] pt-2">
              <dt className="text-sm font-bold text-slate-900">Total</dt>
              <dd className="tabular text-sm font-bold text-[#1e3a5f]">{formatMoney(invoice.total)}</dd>
            </div>
            {invoice.amount_paid > 0 && (
              <>
                <div className="flex justify-between">
                  <dt className="text-xs text-slate-500">Received</dt>
                  <dd className="tabular text-xs text-slate-500">{formatMoney(invoice.amount_paid)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-slate-900">Balance due</dt>
                  <dd className="tabular text-sm font-medium text-slate-900">{formatMoney(invoice.outstanding)}</dd>
                </div>
              </>
            )}
          </dl>
        </div>
      </section>

      {/* ───────── BANK DETAILS & TERMS ───────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {invoice.bank_details && Object.values(invoice.bank_details).some((v: any) => v) && (
          <div>
            <p className={`text-xs font-bold uppercase tracking-wide mb-2 text-[#1e3a5f]`}>Payment details</p>
            <div className="space-y-1 text-xs">
              {(invoice.bank_details as any).bank_name && (
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-600">Bank</span>
                  <span className="text-slate-900 font-medium font-mono">{ (invoice.bank_details as any).bank_name }</span>
                </div>
              )}
              {(invoice.bank_details as any).account_number && (
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-600">Account number</span>
                  <span className="text-slate-900 font-medium font-mono">{ (invoice.bank_details as any).account_number }</span>
                </div>
              )}
              {(invoice.bank_details as any).ifsc_code && (
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-600">IFSC</span>
                  <span className="text-slate-900 font-medium font-mono">{ (invoice.bank_details as any).ifsc_code }</span>
                </div>
              )}
              {(invoice.bank_details as any).upi_id && (
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-600">UPI ID</span>
                  <span className="text-slate-900 font-medium font-mono">{ (invoice.bank_details as any).upi_id }</span>
                </div>
              )}
            </div>
          </div>
        )}
        {invoice.terms && (
          <div>
            <p className={`text-xs font-bold uppercase tracking-wide mb-2 text-[#1e3a5f]`}>Terms</p>
            <p className="whitespace-pre-wrap text-xs text-slate-700">{invoice.terms}</p>
          </div>
        )}
      </section>

      {/* ───────── FOOTER ───────── */}
      <footer className="mt-10 border-t border-slate-200 pt-4 flex justify-between items-center">
        <div>
          <p className="text-xs text-slate-500">{invoice.tax_note}</p>
          <p className="text-xs text-slate-500 mt-1">
            This is a computer-generated invoice
            {invoice.invoice_number ? ` (${invoice.invoice_number})` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Authorised signatory</p>
          <div className="h-1 w-20 border-b border-slate-300" />
        </div>
      </footer>
    </article>
  );
}
