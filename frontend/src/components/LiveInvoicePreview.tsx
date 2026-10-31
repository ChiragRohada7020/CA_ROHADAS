"use client";

import { formatDate, formatMoney } from "@/lib/format";
import { amountInWords, computeTotals, resolveTax } from "@/lib/billing";
import { getTemplateAccentColor } from "@/lib/invoice_templates";
import type { DraftLine } from "@/components/InvoiceLineTable";
import type { FirmBillingSettings, InvoiceTemplate, PartyDetails } from "@/lib/types";

export interface PreviewFormState {
  /** The selected client's details (null until one is chosen). */
  client: PartyDetails | null;
  firm: Pick<
    FirmBillingSettings,
    "name" | "legal_name" | "address_line1" | "address_line2" |
    "city" | "state" | "state_code" | "pincode" | "gstin" | "pan" |
    "email" | "phone" | "currency"
  > | null;
  invoiceNumber: string | null;
  invoiceDate: string;
  dueDate: string;
  invoiceType: string;
  financialYear: string;
  taxRate: number;
  lines: DraftLine[];
  terms: string;
  notes: string;
  template?: InvoiceTemplate;
  bankDetails: {
    bank_name: string;
    account_name: string;
    account_number: string;
    ifsc_code: string;
    upi_id: string;
    payment_reference: string;
  };
  taxNote: string | null;
}

const HEADER_CLASSES: Record<InvoiceTemplate, string> = {
  modern_gst: "bg-[#172B4D] text-white",
  wave: "bg-[#56C9C1] text-[#173F6B]",
  studio: "bg-[#101C2C] text-white",
  grid_v6: "bg-[#20262E] text-[#C7F36B]",
  fintech: "bg-[#635bff] text-white",
  corporate_premium: "border-t-4 border-[#1e3a5f] bg-[#f8fafc]",
  editorial: "border-b border-slate-300",
  ca_professional: "bg-[#0b3d2e] text-white",
  modern: "bg-[#2563eb] text-white",
  classic: "bg-[#1f4e79] text-white",
  minimal: "border-b border-slate-300",
  corporate: "bg-[#1a237e] text-white",
  compact: "bg-[#111827] text-white",
  elegant: "border-t border-[#d4a373] bg-[#fbf6ee] text-[#5c4a0d]",
  bold: "bg-[#1f2933] text-white",
  fresh: "border-b-2 border-[#0d9488] bg-white text-[#0f172a]",
  heritage: "border-t-2 border-[#7f1d1d] bg-[#fdf5f0] text-[#4c0a0a]",
};

const TEXT_COLORS: Record<InvoiceTemplate, string> = {
  modern_gst: "text-[#243247]",
  wave: "text-[#243746]",
  studio: "text-[#1B2A3A]",
  grid_v6: "text-[#202A34]",
  fintech: "text-[#0a0a2e]",
  corporate_premium: "text-[#1a1a2e]",
  editorial: "text-[#1a1a2a]",
  ca_professional: "text-[#0f1f1a]",
  modern: "text-slate-900",
  classic: "text-slate-900",
  minimal: "text-slate-900",
  corporate: "text-slate-900",
  compact: "text-slate-900",
  elegant: "text-[#5c4a0d]",
  bold: "text-[#030712]",
  fresh: "text-[#0f172a]",
  heritage: "text-[#4c0a0a]",
};

/**
 * Live, read-only invoice preview that mirrors `InvoiceSheet`.
 *
 * Renders from in-memory form state rather than a saved `InvoiceDetail`, so the
 * partner sees the effect of every keystroke. **All monetary values are computed
 * client-side for display only; the backend recomputes on save.**
 */
export function LiveInvoicePreview({
  state,
  onEditTax,
  onDownloadPdf,
  onSendClient,
  onMoreActions,
}: {
  state: PreviewFormState;
  onEditTax?: () => void;
  onDownloadPdf?: () => void;
  onSendClient?: () => void;
  onMoreActions?: () => void;
}) {
  const firm = state.firm;
  const client = state.client;
  const template = state.template ?? "modern";
  const accentColor = getTemplateAccentColor(template);
  const headerClass = HEADER_CLASSES[template] ?? HEADER_CLASSES.modern;
  const textColor = TEXT_COLORS[template] ?? TEXT_COLORS.modern;

  const firmStateCode = firm?.state_code ?? null;
  const clientStateCode = client?.state_code ?? null;
  const taxType = state.taxRate > 0 ? resolveTax(firmStateCode, clientStateCode, state.taxRate).taxType : "none";

  const totals = computeTotals(state.lines, state.taxRate, taxType);
  const hasTax = totals.cgst + totals.sgst + totals.igst > 0;
  const interState = taxType === "inter_state";
  const isIntra = taxType === "intra_state";

  const taxReason =
    state.taxNote ??
    (taxType === "none"
      ? "GST is not applied: the firm or the client has no state code on file."
      : resolveTax(firmStateCode, clientStateCode, state.taxRate).reason);

  const billableLines = state.lines.filter((l) => l.description.trim().length > 0);

  return (
    <article className={`force-light w-full max-w-[210mm] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ${textColor}`}>
      <header className={`relative p-6 pb-4 ${headerClass}`}>
        <div className="absolute top-4 right-4 flex flex-wrap items-center gap-1 no-print">
          {onDownloadPdf && (
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-xs"
              onClick={onDownloadPdf}
            >
              Download PDF
            </button>
          )}
          {onSendClient && (
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-xs"
              onClick={onSendClient}
            >
              Send to client
            </button>
          )}
          {onMoreActions && (
            <button
              type="button"
              className="btn-ghost px-1 py-1 text-xs"
              onClick={onMoreActions}
            >
              …
            </button>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-bold tracking-tight" style={{ color: template === "fintech" || template === "editorial" ? accentColor : undefined }}>
              {firm?.name ?? "The firm"}
            </h1>
            {firm?.legal_name && (
              <span className="text-xs text-slate-500">{firm.legal_name}</span>
            )}
          </div>
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

        <div className="mt-4 text-right">
          <p className="text-lg font-semibold uppercase tracking-wide">
            {state.invoiceType === "sez" ? "SEZ Invoice" :
             state.invoiceType === "supply" ? "Supply Bill" :
             state.invoiceType === "deemed" ? "Deemed Export" :
             "Tax Invoice"}
          </p>
          <p className="tabular mt-1 text-sm">
            {state.invoiceNumber ?? "(draft) — not yet numbered"}
          </p>
          <p className="mt-2 text-xs text-slate-600">
            Invoice date: <span className="tabular">{formatDate(state.invoiceDate)}</span>
          </p>
          <p className="text-xs text-slate-600">
            Due date: <span className="tabular">{formatDate(state.dueDate)}</span>
          </p>
          {state.financialYear && (
            <p className="text-xs text-slate-600">
              Financial year: <span className="tabular">{state.financialYear}</span>
            </p>
          )}
        </div>
      </header>

      <section className="p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billed to</p>
        <p className="mt-1 text-sm font-medium">
          {client?.name ?? <em className="text-slate-400">No client selected</em>}
        </p>
        {client && (
          <>
            {client.address_line1 && <p className="text-xs text-slate-600">{client.address_line1}</p>}
            {client.address_line2 && <p className="text-xs text-slate-600">{client.address_line2}</p>}
            <p className="text-xs text-slate-600">
              {[client.city, client.state, client.pincode].filter(Boolean).join(", ")}
            </p>
            {client.gstin && (
              <p className="text-xs text-slate-600">
                GSTIN: <span className="font-mono">{client.gstin}</span>
              </p>
            )}
            <p className="text-xs text-slate-600">
              Place of supply:{" "}
              <span className="font-mono">
                {client.state_code ? `${client.state_code} — ${client.state}` : "not set"}
              </span>
            </p>
          </>
        )}
      </section>

      <div className="px-6">
        <table className="w-full">
          <thead>
            <tr className="border-y border-slate-300 bg-slate-50">
              <th className="th w-6">#</th>
              <th className="th">Description</th>
              <th className="th w-16">SAC</th>
              <th className="th w-12 text-right">Qty</th>
              <th className="th w-16 text-right">Rate</th>
              <th className="th w-16 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {billableLines.map((line, index) => {
              const qty = Number(line.quantity ?? 1);
              const rate = Number(line.unit_price ?? 0);
              const disc = Number(line.discount ?? 0);
              const amount = qty * rate - disc;
              return (
                <tr key={line.key}>
                  <td className="td text-xs text-slate-400 tabular">{index + 1}</td>
                  <td className="td text-xs">
                    {line.description}
                    {!line.is_taxable && <span className="ml-1 text-slate-500">(not taxable)</span>}
                  </td>
                  <td className="td font-mono text-xs">{line.sac_code || "9982"}</td>
                  <td className="td tabular text-right text-xs">
                    {qty % 1 === 0 ? String(qty) : qty.toFixed(2)}
                  </td>
                  <td className="td tabular text-right text-xs">{formatMoney(rate)}</td>
                  <td className="td tabular text-right text-xs">
                    {formatMoney(amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="px-6 pt-4">
        <dl className="w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">Subtotal</dt>
              <dd className="tabular">{formatMoney(totals.subtotal)}</dd>
            </div>
            {totals.discountTotal > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-600">Discount</dt>
                <dd className="tabular">−{formatMoney(totals.discountTotal)}</dd>
              </div>
            )}
            {hasTax && (
              <>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Taxable value</dt>
                  <dd className="tabular">{formatMoney(totals.taxableTotal)}</dd>
                </div>
                {interState ? (
                  <div className="flex justify-between">
                    <dt className="text-slate-600">IGST @ {state.taxRate}%</dt>
                    <dd className="tabular">{formatMoney(totals.igst)}</dd>
                  </div>
                ) : isIntra ? (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">CGST @ {state.taxRate / 2}%</dt>
                      <dd className="tabular">{formatMoney(totals.cgst)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">SGST @ {state.taxRate / 2}%</dt>
                      <dd className="tabular">{formatMoney(totals.sgst)}</dd>
                    </div>
                  </>
                ) : null}
              </>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular">{formatMoney(totals.total)}</dd>
            </div>
          </dl>

          <p className="mt-4 text-xs text-slate-500">{taxReason}</p>
        </section>

      {state.notes && (
        <section className="px-6 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{state.notes}</p>
        </section>
      )}

      {state.terms && (
        <section className="px-6 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Payment terms
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{state.terms}</p>
        </section>
      )}

      {(state.bankDetails.bank_name || state.bankDetails.account_number || state.bankDetails.upi_id) && (
        <section className="px-6 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Bank / Payment details
          </p>
          <dl className="mt-1 space-y-0.5 text-xs text-slate-600">
            {state.bankDetails.bank_name && (
              <div><span className="font-medium">Bank:</span> {state.bankDetails.bank_name}</div>
            )}
            {state.bankDetails.account_name && (
              <div><span className="font-medium">Account holder:</span> {state.bankDetails.account_name}</div>
            )}
            {state.bankDetails.account_number && (
              <div><span className="font-medium">Account #:</span> <span className="font-mono">{state.bankDetails.account_number}</span></div>
            )}
            {state.bankDetails.ifsc_code && (
              <div><span className="font-medium">IFSC:</span> <span className="font-mono">{state.bankDetails.ifsc_code}</span></div>
            )}
            {state.bankDetails.upi_id && (
              <div><span className="font-medium">UPI:</span> <span className="font-mono">{state.bankDetails.upi_id}</span></div>
            )}
            {state.bankDetails.payment_reference && (
              <div><span className="font-medium">Reference:</span> {state.bankDetails.payment_reference}</div>
            )}
          </dl>
        </section>
      )}

      <footer className="px-6 pt-4 text-xs text-slate-500">
        <p>{taxReason}</p>
        <p className="mt-1">
          This is a computer-generated invoice
          {state.invoiceNumber ? ` (${state.invoiceNumber})` : ""}.
        </p>
        <p className="mt-1 mt-2 border-t border-slate-200 pt-2 text-xs font-semibold">
          Amount in words: <em>{amountInWords(totals.total)}</em>
        </p>
      </footer>
    </article>
  );
}
