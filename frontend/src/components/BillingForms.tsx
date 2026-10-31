"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef } from "react";

import {
  CheckboxField,
  FormActions,
  FormError,
  FormSuccess,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/form";
import { InvoiceTemplateSelector } from "@/components/InvoiceTemplateSelector";
import { Badge, Card, ErrorState } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ServiceCombobox, flattenClientServices, type ServiceOption } from "@/components/ServiceCombobox";
import { api, buildQuery } from "@/lib/api";
import { addDays, formatDate, formatMoney, todayInIST } from "@/lib/format";
import { computeTotals, resolveTax } from "@/lib/billing";
import { paymentMethodLabel } from "@/lib/status";
import type {
  ClientDetail,
  ClientListItem,
  CreditNoteCreatePayload,
  FirmBillingSettings,
  GenerateResult,
  Invoice,
  InvoiceDetail,
  InvoiceLineInput,
  InvoiceSendResult,
  InvoiceTemplate,
  Page,
  PaymentMethod,
  ShareLinkResult,
} from "@/lib/types";

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

/**
 * Propose invoices for completed, unbilled work.
 *
 * The preview happens first and it is not a formality: an invoice carries a consecutive
 * number and has been sent to someone, so a mis-clicked "generate" is not something a
 * firm can quietly undo. The dry run is the default and the button that writes says so.
 */
export function GenerateInvoicesPanel() {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [from, setFrom] = useState("");
  const [result, setResult] = useState<GenerateResult | null>(null);

  const clients = useQuery({
    queryKey: ["clients", { for: "invoice-generate" }],
    queryFn: () => api.get<Page<ClientListItem>>(`/clients${buildQuery({ limit: 200 })}`),
  });

  const generate = useMutation({
    mutationFn: (apply: boolean) =>
      api.post<GenerateResult>("/invoices/generate", {
        client_id: clientId || null,
        completed_from: from || null,
        apply,
      }),
    onSuccess: (data) => {
      setResult(data);
      if (!data.dry_run) {
        void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      }
    },
  });

  const clientOptions = (clients.data?.items ?? []).map((row) => ({
    value: row.id,
    label: `${row.client_code} · ${row.trade_name || row.legal_name}`,
  }));

  const previews = result?.invoices ?? [];
  const billableTotal = previews.reduce((sum, row) => sum + row.total, 0);

  return (
    <Card
      title="Generate invoices from completed work"
      subtitle="Completed work that has not been billed. Work already on a live invoice is never proposed again."
    >
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SelectField
            label="Client"
            value={clientId}
            onChange={setClientId}
            options={clientOptions}
            placeholder="Every client"
          />
          <TextField
            label="Completed on or after"
            type="date"
            value={from}
            onChange={setFrom}
            hint="Optional. Work with no completion date is left out rather than guessed."
          />
          <div className="flex items-end">
            <button
              type="button"
              className="btn-ghost w-full"
              disabled={generate.isPending}
              onClick={() => generate.mutate(false)}
            >
              {generate.isPending ? "Checking…" : "Preview"}
            </button>
          </div>
        </div>

        {generate.isError && <FormError error={generate.error} />}

        {result && (
          <div className="space-y-3">
            {result.notes.map((note) => (
              <p
                key={note}
                className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200"
              >
                {note}
              </p>
            ))}

            {previews.length === 0 && <p className="text-sm text-slate-500">Nothing to invoice.</p>}

            {previews.map((preview) => (
              <div key={preview.client_id} className="rounded-md border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">
                    {preview.client_name ?? "Unknown client"}
                  </p>
                  <p className="tabular text-sm text-slate-700">
                    {preview.line_count} line(s) · {formatMoney(preview.subtotal)} +{" "}
                    {formatMoney(preview.tax_amount)} tax ={" "}
                    <strong>{formatMoney(preview.total)}</strong>
                  </p>
                </div>
                <p className="mt-1 text-xs text-slate-500">{preview.tax_note}</p>
                <ul className="mt-2 space-y-1">
                  {preview.lines.map((line) => (
                    <li key={line.task_id} className="text-xs text-slate-600">
                      <span className="font-medium">{line.description}</span> ·{" "}
                      <span className="tabular">{formatMoney(line.unit_price)}</span> ·{" "}
                      <span className="text-slate-400">{line.fee_source}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {result.unbillable.length > 0 && (
              <div className="rounded-md bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
                <p className="text-xs font-semibold text-slate-700">
                  Not billed — no agreed fee ({result.unbillable.length})
                </p>
                <ul className="mt-1 space-y-1">
                  {result.unbillable.map((line) => (
                    <li key={line.task_id} className="text-xs text-slate-600">
                      <span className="font-medium">{line.task_title}</span>
                      {line.note && <> — {line.note}</>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {previews.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  className="btn btn-primary px-5 py-2.5"
                  disabled={generate.isPending}
                  onClick={() => generate.mutate(true)}
                >
                  {generate.isPending
                    ? "Creating…"
                    : `Create ${previews.length} draft invoice(s) for ${formatMoney(billableTotal)}`}
                </button>
                {!result.dry_run && (
                  <span className="text-xs text-emerald-700">
                    Created {result.created_invoice_ids.length} draft invoice(s). Review and
                    issue them from the list.
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}


interface DraftLine extends InvoiceLineInput {
  key: string;
}

function blankLine(): DraftLine {
  return {
    key: Math.random().toString(36).slice(2),
    description: "",
    quantity: 1,
    unit_price: 0,
    discount: 0,
    is_taxable: true,
  };
}

/**
 * Raise an invoice by hand — Hisaabo-style right slide-over popup.
 * Opens on the invoices list page (/invoices) and stays on the same URL.
 */
export function NewInvoiceForm({ onDone, onClose }: { onDone: (invoiceId: string) => void; onClose?: () => void }) {
  const queryClient = useQueryClient();
  const today = todayInIST();

  const [clientId, setClientId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDays(today, 30));
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [isOpen, setIsOpen] = useState(true);

  // Fetch the firm's default tax rate so the slide-over form does not
  // silently hardcode 18% — the full-page CreateInvoiceForm already reads
  // this, and the two entry points must agree.
  const settings = useQuery({
    queryKey: ["billing", "settings"],
    queryFn: () => api.get<FirmBillingSettings>("/billing/settings"),
    staleTime: 5 * 60 * 1000,
  });

  const firmSettings = settings.data;
  const defaultTaxRate = firmSettings?.default_gst_rate ?? 18;

  // Prevent the page behind the slide-over from scrolling and close on Escape.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const clients = useQuery({
    queryKey: ["clients", { for: "invoice-new" }],
    queryFn: () => api.get<Page<ClientListItem>>(`/clients${buildQuery({ limit: 200 })}`),
  });

  const clientDetail = useQuery<ClientDetail>({
    queryKey: ["client", clientId],
    queryFn: () => api.get<ClientDetail>(`/clients/${clientId}`),
    enabled: !!clientId,
    staleTime: 60 * 1000,
  });

  const clientServices = useMemo(() => {
    return flattenClientServices(clientDetail.data?.services);
  }, [clientDetail.data?.services]);

  const create = useMutation({
    mutationFn: () =>
      api.post<InvoiceDetail>("/invoices", {
        client_id: clientId,
        invoice_date: invoiceDate,
        due_date: dueDate,
        notes: notes.trim() || null,
        terms: terms.trim() || null,
        tax_rate: defaultTaxRate,
        lines: lines
          .filter((line) => line.description.trim().length > 0)
          .map((line) => ({
            description: line.description.trim(),
            quantity: Number(line.quantity ?? 1),
            unit_price: Number(line.unit_price ?? 0),
            discount: Number(line.discount ?? 0),
            sac_code: line.sac_code || null,
            is_taxable: line.is_taxable ?? true,
            service_id: line.service_id || null,
            task_id: line.task_id || null,
          })),
      }),
    onSuccess: (invoice) => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      onDone(invoice.id);
    },
  });

  const clientOptions = (clients.data?.items ?? []).map((row) => ({
    value: row.id,
    label: `${row.client_code} · ${row.trade_name || row.legal_name}`,
  }));

  const usableLines = lines.filter((line) => line.description.trim().length > 0);
  const subtotal = usableLines.reduce(
    (sum, line) =>
      sum + Number(line.quantity ?? 1) * Number(line.unit_price ?? 0) - Number(line.discount ?? 0),
    0,
  );
  // Use the shared billing service so the slide-over agrees with the
  // full-page CreateInvoiceForm and the backend — never hardcode 18%.
  const computedTotals = computeTotals(usableLines, defaultTaxRate, "intra_state");
  const canSubmit = clientId !== "" && usableLines.length > 0 && dueDate >= invoiceDate;

  const update = (key: string, patch: Partial<DraftLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  function lineAmount(line: DraftLine): number {
    const qty = Number(line.quantity ?? 1);
    const rate = Number(line.unit_price ?? 0);
    const disc = Number(line.discount ?? 0);
    return qty * rate - disc;
  }

  function handleServiceSelect(key: string, service: ServiceOption | null) {
    if (!service) return;
    update(key, {
      description: service.name,
      sac_code: service.sac_code,
      unit_price: Number(service.standard_fee ?? 0),
      service_id: service.id,
    });
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-end bg-black/30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Click outside panel to close, stay on same URL */}
          <motion.button
            type="button"
            className="absolute inset-0 z-0"
            onClick={() => onClose?.()}
            aria-label="Close panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="New invoice"
            className="z-10 flex h-full w-full max-w-[720px] flex-col border-l border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.3, ease: "easeOut" }}
          >
          <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200">
            <div>
            <h2 className="text-lg font-bold text-slate-900">
                 New Invoice
               </h2>
               <p className="mt-0.5 text-xs text-slate-500">
                 Create a new sale invoice
               </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => onClose?.()}
              className="p-1.5 rounded hover:bg-slate-100 transition-colors text-slate-500"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>

           <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} aria-label="New Invoice" className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-5">
              {/* Top row: customer, dates */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                 <div>
                   <label className="invoice-form-label">Customer *</label>
                   <SelectField
                    label="Customer"
                    value={clientId}
                    onChange={setClientId}
                    options={clientOptions}
                    placeholder="Search customer…"
                    required
                    hint=""
                  />
                </div>
                <div>
                   <label className="invoice-form-label">Date</label>
                   <TextField
                    label="Date"
                    type="date"
                    value={invoiceDate}
                    onChange={setInvoiceDate}
                    required
                    hint=""
                  />
                </div>
                <div>
                   <label className="invoice-form-label">Due date</label>
                   <TextField
                    label="Due date"
                    type="date"
                    value={dueDate}
                    onChange={setDueDate}
                    required
                    hint=""
                  />
                </div>
              </div>

              {/* Line items */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                   <h3 className="invoice-form-section-title">Line Items</h3>
                </div>
                <div className="rounded-xl overflow-hidden border border-slate-200">
                  {/* Header row */}
                  <div
                    className="grid gap-2 px-3 py-2 text-xs font-medium bg-slate-50 text-slate-500"
                    style={{
                      gridTemplateColumns: "3fr 80px 80px 68px 68px 84px 32px",
                    }}
                  >
                    <span>Product</span>
                    <span className="text-right">Qty</span>
                    <span className="text-right">Price</span>
                    <span className="text-right">Tax %</span>
                    <span className="text-right">Disc %</span>
                    <span className="text-right">Amount</span>
                    <span />
                  </div>

                  {/* Line item rows */}
                  <div className="divide-y divide-slate-200">
                    {lines.map((line, index) => {
                      const amount = lineAmount(line);
                      const showRemove = lines.length > 1;
                      const isRowEmpty = !line.description.trim();

                      return (
                        <div key={line.key}>
                          <div
                             className="grid gap-2 px-4 py-2.5 items-center"
                             style={{
                               gridTemplateColumns: "3fr 80px 80px 68px 68px 84px 32px",
                               background: isRowEmpty ? "bg-slate-50" : "transparent",
                             }}
                          >
                            {/* Product + Item name combined searchable dropdown */}
                            <div className="min-w-0">
                              <ServiceCombobox
                                value={line.service_id ?? ""}
                                onChange={(s: ServiceOption | null) => handleServiceSelect(line.key, s)}
                                clientServices={clientServices}
                                loading={clientDetail.isPending && !!clientId}
                                dark
                                placeholder={isRowEmpty ? "Search product or custom item" : line.description}
                                dropdownMinWidth={360}
                              />
                            </div>

                            {/* Qty */}
                            <div>
                              <input
                                type="number"
                                min="0.001"
                                step="any"
                                className="invoice-form-input text-right"
                                value={String(line.quantity ?? 1)}
                                onChange={(e) => update(line.key, { quantity: Number(e.target.value) })}
                              />
                            </div>

                            {/* Price */}
                            <div>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="invoice-form-input text-right"
                                value={String(line.unit_price ?? 0)}
                                onChange={(e) => update(line.key, { unit_price: Number(e.target.value) })}
                              />
                            </div>

                            {/* Tax % */}
                            <div>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="invoice-form-input text-right"
                                value={line.is_taxable ? String(18) : "0"}
                                onChange={(e) => update(line.key, { is_taxable: Number(e.target.value) > 0 })}
                              />
                            </div>

                            {/* Discount % */}
                            <div>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                className="invoice-form-input text-right"
                                value={String(line.discount ?? 0)}
                                onChange={(e) => update(line.key, { discount: Number(e.target.value) })}
                              />
                            </div>

                            {/* Amount */}
                            <div className="text-right text-sm font-semibold tabular-nums text-slate-900">
                              {isRowEmpty ? "—" : formatMoney(amount)}
                            </div>

                            {/* Delete */}
                            <div className="text-center">
                              {showRemove && (
                                <button
                                  type="button"
                                  className="p-1 rounded hover:bg-slate-100 text-[var(--h-brand-600)] transition-colors"
                                  onClick={(e) => { e.preventDefault(); setLines((current) => current.filter((row) => row.key !== line.key)); }}
                                  aria-label="Remove line item"
                                >
                                  <Icon name="x" className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Notes under line */}
                          <div className="px-3 pb-2">
                            <textarea
                              value={line.description}
                              onChange={(e) => update(line.key, { description: e.target.value })}
                              placeholder="Notes for this line (optional)"
                              rows={1}
                              maxLength={500}
                              className="invoice-form-textarea"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add row link */}
                  <div className="px-3 py-2.5 bg-slate-50">
                    <button
                      type="button"
                      className="invoice-form-add-item"
                      onClick={(e) => { e.preventDefault(); setLines((current) => [...current, blankLine()]); }}
                    >
                      <Icon name="plus" className="h-4 w-4" />
                      Add line item
                    </button>
                  </div>
                </div>
              </section>

              {/* Totals summary */}
              <div className="flex justify-end">
                <div className="w-72 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700">Subtotal</span>
                    <span className="tabular-nums font-medium text-slate-900">
                      {formatMoney(subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700">Tax</span>
                    <span className="tabular-nums text-slate-900">
                      {formatMoney(computedTotals.cgst + computedTotals.sgst + computedTotals.igst)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex justify-between">
                    <span className="text-base font-semibold text-slate-900">Total</span>
                    <span className="text-xl font-bold tabular-nums text-[var(--h-brand-600)]">
                      {formatMoney(computedTotals.total)}
                    </span>
                  </div>
                </div>
              </div>

               {/* Notes and terms */}
               <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                 <div>
                   <label className="invoice-form-label">Notes</label>
                   <textarea
                     value={notes}
                     onChange={(e) => setNotes(e.target.value)}
                     rows={3}
                     placeholder="Additional notes for the customer..."
                     className="invoice-form-textarea"
                   />
                 </div>
                 <div>
                   <label className="invoice-form-label">Terms & conditions</label>
                   <textarea
                     value={terms}
                     onChange={(e) => setTerms(e.target.value)}
                     rows={3}
                     placeholder="Payment terms, warranty, etc..."
                     className="invoice-form-textarea"
                   />
                 </div>
               </div>
            </div>

             {/* Footer */}
            <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between border-t border-slate-200 bg-slate-50">
              {create.isError && <FormError error={create.error} />}
              <div className="flex-1" />
              <div className="flex gap-3">
                <button
                  type="button"
                  className="invoice-form-cancel"
                  onClick={(e) => { e.preventDefault(); onClose?.(); }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={create.isPending || !canSubmit}
                  className="invoice-form-submit"
                >
                  {create.isPending ? "Creating…" : "Create Invoice"}
                </button>
              </div>
            </div>
          </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
/**
 * What can be done to an invoice, given where it is.
 *
 * Each button is only offered when the API would accept it, and the reason a button is
 * missing is stated rather than left to be guessed — an invoice that silently cannot be
 * sent is a support call.
 */
export function InvoiceActions({ invoice }: { invoice: InvoiceDetail }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [cancelReason, setCancelReason] = useState("");
  const [message, setMessage] = useState("");
  const [outcomes, setOutcomes] = useState<InvoiceSendResult | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState(invoice.client?.whatsapp_number || "");
  const [whatsappSent, setWhatsappSent] = useState<boolean | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    void queryClient.invalidateQueries({ queryKey: ["invoice", invoice.id] });
  };

  const issue = useMutation({
    mutationFn: () => api.post<InvoiceDetail>(`/invoices/${invoice.id}/issue`),
    onSuccess: refresh,
  });

  const cancel = useMutation({
    mutationFn: () =>
      api.post<InvoiceDetail>(`/invoices/${invoice.id}/cancel`, { reason: cancelReason.trim() }),
    onSuccess: () => {
      setCancelReason("");
      refresh();
    },
  });

  const send = useMutation({
    mutationFn: () =>
      api.post<InvoiceSendResult>(`/invoices/${invoice.id}/send`, {
        message: message.trim() || null,
      }),
    onSuccess: (data) => {
      setOutcomes(data);
      setShareUrl(data.share_url);
      refresh();
    },
  });

  const shareLink = useMutation({
    mutationFn: () => api.post<ShareLinkResult>(`/invoices/${invoice.id}/share-link`),
    onSuccess: (data) => {
      setShareUrl(data.share_url);
      refresh();
    },
  });

  const whatsappSend = useMutation({
    mutationFn: () =>
      api.post<{ invoice_id: string; invoice_number: string | null; recipient: string | null; status: string; detail: string }>(
        `/whatsapp/send-invoice/${invoice.id}`,
        { message: message.trim() || null },
      ),
    onSuccess: () => {
      setWhatsappSent(true);
      refresh();
    },
    onError: () => {
      setWhatsappSent(false);
    },
  });

  const deleteInvoice = useMutation({
    mutationFn: () => api.delete<{ deleted: boolean; invoice_id: string }>(`/invoices/${invoice.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      router.push("/invoices");
    },
  });

  const isDraft = invoice.status === "draft";
  const isCancelled = invoice.status === "cancelled";
  const whatsappNumber = invoice.client?.whatsapp_number || "";

  return (
    <Card title="Actions" subtitle={invoice.tax_note}>
      <div className="space-y-4 p-4">
         {isDraft && (
           <div className="space-y-3">
             <p className="text-xs text-slate-500">
               This is a draft, so it has no invoice number yet. Numbers are allocated on
               issue, which keeps the series consecutive — an abandoned draft leaves no gap.
             </p>

             {/* Message field + Send button: issues and sends in one step. */}
             <TextAreaField
               label="Message to the client"
               value={message}
               onChange={setMessage}
               rows={3}
               maxLength={2000}
               hint="Leave blank to send the standard wording, which includes the invoice details and a link."
             />
             {send.isError && <FormError error={send.error} />}
<div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn btn-primary px-5 py-2.5"
                  disabled={send.isPending}
                  onClick={() => send.mutate()}
                >
                  {send.isPending ? "Sending…" : "Issue and send"}
                </button>
                {issue.isError && <FormError error={issue.error} />}
                <button
                  type="button"
                  className="btn btn-ghost px-5 py-2.5"
                  disabled={issue.isPending}
                  onClick={() => issue.mutate()}
                >
                  {issue.isPending ? "Issuing…" : "Issue only"}
                </button>
                <Link href={`/invoices/${invoice.id}/edit`} className="btn btn-ghost px-5 py-2.5">
                  Edit
                </Link>
                <Link href={`/print/invoices/${invoice.id}`} className="btn btn-ghost px-5 py-2.5">
                  Print
                </Link>
                {isDraft && (
                  <button
                    type="button"
                    className="btn btn-danger px-5 py-2.5"
                    disabled={deleteInvoice.isPending}
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    {deleteInvoice.isPending ? "Deleting…" : "Delete draft"}
                  </button>
                )}
              </div>

              {showDeleteConfirm && (
                <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3">
                  <p className="text-sm font-medium text-rose-800">
                    Delete this draft invoice?
                  </p>
                  <p className="mt-1 text-xs text-rose-700">
                    This cannot be undone. Drafts have no invoice number yet, so deleting
                    one leaves no gap in the series.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="btn btn-danger px-5 py-2.5"
                      disabled={deleteInvoice.isPending}
                      onClick={() => deleteInvoice.mutate()}
                    >
                      Yes, delete it
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost px-5 py-2.5"
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Keep it
                    </button>
                  </div>
                </div>
              )}

             {outcomes && (
               <ul className="space-y-1 rounded-md bg-slate-50 p-3 text-xs ring-1 ring-inset ring-slate-200">
                 {outcomes.outcomes.map((row) => (
                   <li key={row.channel} className="flex items-start gap-2">
                     <Badge tone={row.status === "queued" ? "success" : "warning"}>
                       {row.channel}
                     </Badge>
                     <span className="text-slate-700">
                       {row.recipient ?? "no recipient"} — {row.status}
                       {row.detail && <span className="text-slate-500"> · {row.detail}</span>}
                     </span>
                   </li>
                 ))}
               </ul>
             )}

             {shareUrl && (
               <p className="break-all rounded-md bg-sky-50 p-3 text-xs text-sky-900 ring-1 ring-inset ring-sky-200">
                 Client link: <span className="font-mono">{shareUrl}</span>
                 <br />
                 Minting a new link withdraws the previous one, so a link that reached the
                 wrong person can be taken back.
               </p>
             )}
             {shareLink.isError && <FormError error={shareLink.error} />}
           </div>
         )}

        {!isDraft && !isCancelled && (
          <div className="space-y-3">
            <TextAreaField
              label="Message to the client"
              value={message}
              onChange={setMessage}
              rows={3}
              maxLength={2000}
              hint="Leave blank to send the standard wording, which includes the invoice details and a link."
            />
            {send.isError && <FormError error={send.error} />}
<div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn btn-primary px-5 py-2.5"
                  disabled={send.isPending}
                  onClick={() => send.mutate()}
                >
                  {send.isPending ? "Sending…" : "Send to the client"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-5 py-2.5"
                  disabled={shareLink.isPending}
                  onClick={() => shareLink.mutate()}
                >
                  {shareLink.isPending ? "Minting…" : "New client link"}
                </button>
                <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer" className="btn btn-ghost px-5 py-2.5">
                  <Icon name="download" className="h-4 w-4" />
                  Download PDF
                </a>
                {(invoice.status === 'issued' || invoice.status === 'partially_paid' || invoice.status === 'paid') && (
                  <Link href={`/invoices/${invoice.id}/credit-notes/new`} className="btn btn-ghost px-5 py-2.5">
                    <Icon name="file-text" className="h-4 w-4" />
                    Raise Credit Note
                  </Link>
                )}
                <PdfTemplateDownload invoice={invoice} />
                <button
                  type="button"
                  className="btn btn-ghost px-5 py-2.5"
                  onClick={() => window.open(`/print/invoices/${invoice.id}`, "_blank")}
                >
                  Open for sharing
                </button>
                {invoice.status === 'draft' && (
                  <Link href={`/invoices/${invoice.id}/edit`} className="btn btn-ghost px-5 py-2.5">
                    Edit
                  </Link>
                )}
                <Link href={`/print/invoices/${invoice.id}`} className="btn btn-ghost px-5 py-2.5">
                  Print
                </Link>
              </div>

            {whatsappNumber && (
              <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-700">Send via WhatsApp</p>
                <div className="flex items-center gap-2">
                  <TextField
                    label="Phone number"
                    value={whatsappPhone}
                    onChange={setWhatsappPhone}
                    placeholder="+91 98765 43210"
                  />
                  <button
                    type="button"
                    className="btn btn-primary px-5 py-2.5"
                    disabled={whatsappSend.isPending || !whatsappPhone.trim()}
                    onClick={() => whatsappSend.mutate()}
                  >
                    {whatsappSend.isPending ? "Sending…" : "Send PDF"}
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  The invoice PDF will be sent as a WhatsApp document to{" "}
                  <span className="font-medium">{whatsappPhone || whatsappNumber}</span>.
                </p>
                {whatsappSent !== null && (
                  <p className={whatsappSent ? "text-xs text-emerald-700" : "text-xs text-rose-700"}>
                    {whatsappSent ? "Invoice sent via WhatsApp." : "Failed to send via WhatsApp."}
                  </p>
                )}
              </div>
            )}
            {!whatsappNumber && (
              <p className="text-xs text-slate-500">
                No WhatsApp number on file for this client. Add one on the client
                detail page to enable WhatsApp invoice sharing.
              </p>
            )}

            {outcomes && (
              <ul className="space-y-1 rounded-md bg-slate-50 p-3 text-xs ring-1 ring-inset ring-slate-200">
                {outcomes.outcomes.map((row) => (
                  <li key={row.channel} className="flex items-start gap-2">
                    <Badge tone={row.status === "queued" ? "success" : "warning"}>
                      {row.channel}
                    </Badge>
                    <span className="text-slate-700">
                      {row.recipient ?? "no recipient"} — {row.status}
                      {row.detail && <span className="text-slate-500"> · {row.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {shareUrl && (
              <p className="break-all rounded-md bg-sky-50 p-3 text-xs text-sky-900 ring-1 ring-inset ring-sky-200">
                Client link: <span className="font-mono">{shareUrl}</span>
                <br />
                Minting a new link withdraws the previous one, so a link that reached the
                wrong person can be taken back.
              </p>
            )}
            {shareLink.isError && <FormError error={shareLink.error} />}

            <div className="border-t border-slate-200 pt-3">
              <p className="text-xs text-slate-500">
                Issued invoices cannot be edited — every copy of one has already been sent to
                someone. Cancel it and raise a corrected one instead.
              </p>
              {cancel.isError && <FormError error={cancel.error} />}
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div className="min-w-[16rem] flex-1">
                  <TextField
                    label="Reason for cancelling"
                    value={cancelReason}
                    onChange={setCancelReason}
                    placeholder="Raised against the wrong client"
                    maxLength={500}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost px-5 py-2.5"
                  disabled={cancel.isPending || cancelReason.trim().length < 3}
                  onClick={() => cancel.mutate()}
                >
                  {cancel.isPending ? "Cancelling…" : "Cancel invoice"}
                </button>
              </div>
            </div>
          </div>
        )}

        {isCancelled && (
          <p className="text-sm text-slate-600">
            Cancelled{invoice.cancelled_reason ? `: ${invoice.cancelled_reason}` : "."} The
            number {invoice.invoice_number} stays on the record — the series has to remain
            intact — and its work is free to be billed again.
          </p>
        )}

        {invoice.share_link_active && !shareUrl && !isCancelled && (
          <p className="text-xs text-slate-500">
            A client-facing link exists. Minting a new one replaces it.
          </p>
        )}
      </div>
    </Card>
  );
}


/**
 * Record a receipt against an invoice.
 *
 * The amount box defaults to whatever is still outstanding, because the common case is
 * a client settling in full and making someone retype the number is how a paisa gets
 * mistyped. Partial amounts are the same form with a smaller number.
 */
export function PaymentForm({ invoice }: { invoice: InvoiceDetail }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(String(invoice.outstanding));
  const [paidOn, setPaidOn] = useState(todayInIST());
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const record = useMutation({
    mutationFn: () =>
      api.post<InvoiceDetail>(`/invoices/${invoice.id}/payments`, {
        amount: Number(amount),
        paid_on: paidOn,
        method,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      setReference("");
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["invoice", invoice.id] });
      void queryClient.invalidateQueries({ queryKey: ["receivables"] });
    },
  });

  const reverse = useMutation({
    mutationFn: (paymentId: string) =>
      api.delete<InvoiceDetail>(`/invoices/${invoice.id}/payments/${paymentId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["invoice", invoice.id] });
      void queryClient.invalidateQueries({ queryKey: ["receivables"] });
    },
  });

  if (invoice.status === "draft") {
    return (
      <Card title="Receipts" subtitle="No payments can be recorded yet.">
        <p className="px-4 py-6 text-sm text-slate-500">
          This invoice is a draft and has no number, so there is nothing for a client to
          have paid against. Issue it first.
        </p>
      </Card>
    );
  }

  if (invoice.status === "cancelled") {
    return (
      <Card title="Receipts">
        <p className="px-4 py-6 text-sm text-slate-500">
          This invoice is cancelled. Any money received against it belongs on a credit note.
        </p>
      </Card>
    );
  }

  const settled = invoice.outstanding <= 0;

  return (
    <Card
      title="Record payment"
      subtitle={`${formatMoney(invoice.amount_paid)} received · ${formatMoney(invoice.outstanding)} outstanding`}
      action={
        <Badge tone="info" className="flex items-center gap-1.5">
          <Icon name="info" className="h-3 w-3" />
          <span className="tabular">
            {formatMoney(invoice.outstanding)} outstanding
          </span>
        </Badge>
      }
    >
      <div className="space-y-4 p-4">
        {settled ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
            This invoice is fully paid.
          </p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              record.mutate();
            }}
          >
            {record.isError && <FormError error={record.error} />}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="relative">
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Amount <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-slate-500">
                    ₹
                  </span>
                  <input
                    type="number"
                    className="input pl-8"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    min="0"
                    step="0.01"
                  />
                </div>
                <p className="mt-1 block text-xs text-slate-500">
                  {formatMoney(invoice.outstanding)} outstanding
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Received on
                </label>
                <div className="relative">
                  <input
                    type="date"
                    className="input"
                    value={paidOn}
                    onChange={(e) => setPaidOn(e.target.value)}
                  />
                  <Icon name="calendar" className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Method
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <Icon name="wallet" className="h-4 w-4" />
                  </span>
                  <select
                    className="input pl-10"
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  >
                    {PAYMENT_METHODS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Reference
                </label>
                <input
                  type="text"
                  className="input"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="UTR or cheque number"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Notes <span className="text-slate-400">(Optional)</span>
                </label>
                <textarea
                  className="input min-h-[80px] resize-y"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                  placeholder="What was this payment for?"
                />
              </div>

              <div className="flex items-center gap-2 sm:col-span-4">
                <button
                  type="submit"
                  className="btn-primary rounded-md px-5 py-2.5 text-sm font-medium"
                  disabled={record.isPending || Number(amount) <= 0}
                >
                  {record.isPending ? "Recording…" : "Record payment"}
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setAmount(String(invoice.outstanding));
                    setReference("");
                    setNotes("");
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          </form>
        )}

        {reverse.isError && <FormError error={reverse.error} />}

        {invoice.payments.length > 0 && (
          <div className="overflow-x-auto">
            <p className="mb-2 text-xs font-medium text-slate-700">Payments recorded</p>
            <table className="w-full min-w-[36rem]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Received</th>
                  <th className="th">Method</th>
                  <th className="th">Reference</th>
                  <th className="th text-right">Amount</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="td text-xs">{formatDate(payment.paid_on)}</td>
                    <td className="td text-xs">{paymentMethodLabel(payment.method)}</td>
                    <td className="td text-xs">{payment.reference ?? "—"}</td>
                    <td className="td tabular text-right text-xs">{formatMoney(payment.amount)}</td>
                    <td className="td text-right">
                      <button
                        type="button"
                        className="btn-ghost rounded-xl px-2 py-1 text-xs"
                        disabled={reverse.isPending}
                        onClick={() => reverse.mutate(payment.id)}
                      >
                        Reverse
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}


/**
 * The firm's own letterhead and tax identity.
 *
 * These are the tenant's own details, which is also what the client-facing letterhead
 * prints from — one place to change them, rather than two that can disagree.
 */
export function BillingSettingsForm() {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState<string | null>(null);

  const settings = useQuery({
    queryKey: ["billing", "settings"],
    queryFn: () => api.get<FirmBillingSettings>("/billing/settings"),
  });

  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const current = settings.data;

  const save = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      api.patch<FirmBillingSettings>("/billing/settings", payload),
    onSuccess: (data) => {
      setDraft(null);
      setSaved(
        data.gst_registered
          ? "Saved. Invoices will now carry GST on professional fees."
          : "Saved. No GSTIN is on file, so invoices carry no GST.",
      );
      void queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
  });

  if (settings.isPending) return <Card title="Firm billing details">Loading…</Card>;
  if (settings.isError || !current) {
    return (
      <Card title="Firm billing details">
        <ErrorState message="Could not load the firm's billing details." />
      </Card>
    );
  }

  const value = (field: keyof FirmBillingSettings) =>
    draft?.[field] ?? String(current[field] ?? "");

  const set = (field: string, next: string) =>
    setDraft((previous) => ({ ...previous, [field]: next }));

  return (
    <Card
      title="Firm billing details"
      subtitle="Printed on every invoice as the letterhead, and used to decide GST."
    >
      <form
        className="space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const payload: Record<string, string> = {};
          for (const [field, next] of Object.entries(draft ?? {})) {
            payload[field] = next;
          }
          save.mutate(payload);
        }}
      >
        {!current.gst_registered && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
            No GSTIN is on file, so invoices raised today carry no GST at all. If the firm is
            registered, add the GSTIN below — the tax on a new invoice is decided by the
            firm&apos;s state code against the client&apos;s.
          </p>
        )}
        {save.isError && <FormError error={save.error} />}
        <FormSuccess message={saved} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextField
            label="Legal name"
            value={value("legal_name")}
            onChange={(next) => set("legal_name", next)}
            hint="The name that appears on the invoice."
            maxLength={250}
          />
          <TextField
            label="GSTIN"
            value={value("gstin")}
            onChange={(next) => set("gstin", next)}
            maxLength={15}
            hint="15 characters. Leave blank if the firm is not registered."
          />
          <TextField
            label="PAN"
            value={value("pan")}
            onChange={(next) => set("pan", next)}
            maxLength={10}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Address line 1"
            value={value("address_line1")}
            onChange={(next) => set("address_line1", next)}
            maxLength={250}
          />
          <TextField
            label="Address line 2"
            value={value("address_line2")}
            onChange={(next) => set("address_line2", next)}
            maxLength={250}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <TextField
            label="City"
            value={value("city")}
            onChange={(next) => set("city", next)}
            maxLength={100}
          />
          <TextField
            label="State"
            value={value("state")}
            onChange={(next) => set("state", next)}
            maxLength={100}
          />
          <TextField
            label="State code"
            value={value("state_code")}
            onChange={(next) => set("state_code", next)}
            maxLength={2}
            hint="e.g. 27 for Maharashtra."
          />
          <TextField
            label="PIN code"
            value={value("pincode")}
            onChange={(next) => set("pincode", next)}
            maxLength={10}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <TextField
            label="Email"
            type="email"
            value={value("email")}
            onChange={(next) => set("email", next)}
            maxLength={255}
          />
          <TextField
            label="Phone"
            type="tel"
            value={value("phone")}
            onChange={(next) => set("phone", next)}
            maxLength={20}
          />
          <TextField
            label="Invoice prefix"
            value={value("invoice_prefix")}
            onChange={(next) => set("invoice_prefix", next)}
            maxLength={10}
            hint={`Numbers look like ${current.invoice_prefix}/${new Date().getFullYear()}-xx/0001.`}
          />
          <TextField
            label="Default GST rate (%)"
            type="number"
            value={value("default_gst_rate")}
            onChange={(next) => set("default_gst_rate", next)}
            hint="18% on professional fees."
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium text-slate-700">PDF template</label>
          <InvoiceTemplateSelector
            value={value("invoice_template") as any}
            onChange={(t) => set("invoice_template", t)}
            scrollX
          />
          <p className="mt-2 text-xs text-slate-500">
            Choose the PDF layout for invoices. This becomes the firm default; each invoice can
            still override it when you create it.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <p className="text-xs text-slate-500">
            Next invoice number: <span className="tabular">{current.next_invoice_number}</span>.
            Numbers are allocated on issue and never reused.
          </p>
          <FormActions submitLabel="Save details" busy={save.isPending} disabled={draft === null} />
        </div>
      </form>
    </Card>
  );
}

/**
 * Download PDF with a template selector — shows a dropdown of available invoice
 * templates, and downloads the PDF using the selected template.
 */
function PdfTemplateDownload({ invoice }: { invoice: InvoiceDetail }) {
  const [open, setOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<InvoiceTemplate>("modern");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const handleDownload = () => {
    window.open(`/api/invoices/${invoice.id}/pdf?template=${selectedTemplate}`, "_blank");
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="btn btn-ghost px-5 py-2.5"
        onClick={() => {
          setOpen(!open);
          if (!open) setSelectedTemplate("modern");
        }}
      >
        <Icon name="download" className="h-4 w-4" />
        Download PDF
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-sm font-medium text-slate-700">Choose PDF template</h3>
            <div className="mb-4 max-h-[460px] overflow-y-auto">
              <InvoiceTemplateSelector
                value={selectedTemplate}
                onChange={(t) => setSelectedTemplate(t)}
                premiumOnly={false}
                invoice={invoice}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                className="btn btn-ghost px-4 py-2"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary px-4 py-2"
                onClick={handleDownload}
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
/**
 * Inline dropdown of quick actions for an invoice row in the list table.
 * Uses the full InvoiceActions component for the heavy operations, and adds
 * a compact menu for Download PDF, Share, Credit Note, Open full page.
 */
export function InvoiceRowActions({
  invoice,
  onOpen,
  onChanged,
  receiptBtn,
}: {
  invoice: Invoice;
  onOpen: () => void;
  onChanged: () => void;
  receiptBtn?: { pending: boolean; on: () => void };
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const canCredit = invoice.status !== "draft" && invoice.status !== "cancelled";

  const handleIssue = () => {
    setOpen(false);
    setIssuing(true);
    void queryClient.cancelQueries({ queryKey: ["invoices"] });
    api.post(`/invoices/${invoice.id}/issue`).then((updated: any) => {
      setIssuing(false);
      // Optimistically update every cached invoice list in place so the row keeps
      // its current position rather than being refetched + re-sorted.
      const queries = queryClient.getQueryCache().findAll({ queryKey: ["invoices"] });
      queries.forEach((q) => {
        const qd: any = q.state.data;
        if (!qd?.items) return;
        queryClient.setQueryData(q.options.queryKey as string[], {
          ...qd,
          items: qd.items.map((it: Invoice) =>
            it.id === invoice.id
              ? { ...it, status: "issued", invoice_number: updated?.invoice_number ?? it.invoice_number }
              : it
          ),
        });
      });
      void queryClient.invalidateQueries({ queryKey: ["invoices", "summary"] });
      void queryClient.invalidateQueries({ queryKey: ["invoice", invoice.id] });
      onChanged();
    });
  };

  return (
    <div ref={ref} className="relative inline-block text-right">
      <button
        type="button"
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        onClick={() => setOpen(!open)}
        aria-label="Invoice actions"
      >
        <Icon name="ellipsis" className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-1 w-44 origin-top-right rounded-md border border-slate-200 bg-white shadow-lg"
        >
          <div className="py-1 text-sm">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                window.open(`/api/invoices/${invoice.id}/pdf`, "_blank");
              }}
            >
              <Icon name="download" className="h-4 w-4" />
              Download PDF
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                router.push(`/print/invoices/${invoice.id}`);
              }}
            >
              <Icon name="file-text" className="h-4 w-4" />
              Share / Print
            </button>
            {canCredit && (
              <Link
                href={`/invoices/${invoice.id}/credit-notes/new`}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setOpen(false);
                  onChanged();
                }}
              >
                <Icon name="file-text" className="h-4 w-4" />
                Create Credit Note
              </Link>
            )}
            {invoice.status === "draft" && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sky-700 hover:bg-sky-50"
                onClick={handleIssue}
                disabled={issuing}
              >
                <motion.span
                  animate={issuing ? { scale: [1, 1.2, 1], rotate: [0, 20, 0] } : { scale: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  <Icon name="check-circle" className="h-4 w-4" />
                </motion.span>
                Issue Invoice
              </button>
            )}
            {invoice.status === "paid" && receiptBtn && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setOpen(false);
                  receiptBtn.on();
                }}
                disabled={receiptBtn.pending}
              >
                <Icon name="receipt" className="h-4 w-4" />
                Receipt
              </button>
            )}
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                onOpen();
              }}
            >
              <Icon name="eye" className="h-4 w-4" />
              Open full page
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


/**
 * Raise a credit note against an issued/paid invoice.
 *
 * A credit note reduces the amount the client owes — it can be issued
 * (final) or kept as draft. Drafts can be cancelled; issued ones are
 * applied to reduce the invoice's outstanding balance.
 */
export function CreditNoteForm({
  invoice,
  onSuccess,
}: {
  invoice: InvoiceDetail;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CreditNoteCreatePayload["items"]>([
    {
      description: "Credit adjustment",
      quantity: 1,
      unit_price: 0,
      amount: 0,
      is_taxable: true,
    },
  ]);
  const [reason, setReason] = useState("");
  const [noteType, setNoteType] = useState<"credit" | "debit">("credit");
  const [taxRate, setTaxRate] = useState(invoice.tax_rate || 0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemsInitialized, setItemsInitialized] = useState(false);

  const computeTotalsFromItems = () => {
    let subtotal = 0;
    let taxableTotal = 0;
    for (const item of items) {
      subtotal += item.quantity * item.unit_price - (item.discount || 0);
      if (item.is_taxable !== false) {
        taxableTotal += item.quantity * item.unit_price - (item.discount || 0);
      }
    }
    const taxAmount = taxableTotal * (taxRate / 100);
    return { subtotal, taxableTotal, taxAmount, total: subtotal + taxAmount };
  };

  const { subtotal, taxableTotal, taxAmount, total } = computeTotalsFromItems();

  const createCreditNote = useMutation({
    mutationFn: () =>
      api.post("/credit-notes", {
        invoice_id: invoice.id,
        reason: reason.trim() || null,
        items,
        tax_rate: taxRate,
        note_type: noteType,
      }),
    onSuccess: () => {
      setCreating(false);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["invoice", invoice.id] });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      onSuccess?.();
    },
    onError: (err: any) => {
      setCreating(false);
      setError(err.message || "Failed to create credit note.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amt = Number(total);
    if (!amt || amt <= 0) {
      setError("Credit note amount must be greater than zero.");
      return;
    }
    setCreating(true);
    createCreditNote.mutate();
  };

  return (
    <div>
      <button
        type="button"
        className="btn-ghost flex items-center gap-2 text-sm text-slate-600 hover:text-sky-700"
        onClick={() => {
          setError(null);
          setOpen(true);
          if (!itemsInitialized && invoice.lines?.length) {
            setItems(
              invoice.lines.map((line) => ({
                description: line.description,
                quantity: line.quantity,
                unit_price: line.unit_price,
                amount: line.amount,
                discount: line.discount || 0,
                is_taxable: line.is_taxable ?? true,
                sac_code: line.sac_code ?? undefined,
              })),
            );
            setItemsInitialized(true);
          }
        }}
      >
        <Icon name="file-text" className="h-4 w-4" /> Raise Credit Note
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-none"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.3 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-2xl bg-white border-l border-slate-200 shadow-2xl"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">
                Raise Credit Note
              </h2>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600"
                onClick={() => setOpen(false)}
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
              {error && (
                <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-800 ring-1 ring-inset ring-rose-200">
                  {error}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Credit note type
                  </label>
                  <select
                    className="input"
                    value={noteType}
                    onChange={(e) => setNoteType(e.target.value as any)}
                  >
                    <option value="credit">Credit (reduce amount owed)</option>
                    <option value="debit">Debit (increase amount owed)</option>
                  </select>
                </div>
                <TextField
                  label="Reason"
                  value={reason}
                  onChange={setReason}
                  placeholder="e.g. Overcharged, service not rendered"
                  maxLength={500}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <TextField
                    label="Tax rate (%)"
                    type="number"
                    value={String(taxRate)}
                    onChange={(v) => setTaxRate(parseFloat(v) || 0)}
                  />
                  <div className="flex items-end">
                    <span className="mr-2 text-sm font-medium text-slate-700">
                      Total:
                    </span>
                    <span className="text-sm font-semibold text-slate-900">
                      {formatMoney(total)}
                    </span>
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="th text-left">Description</th>
                        <th className="th text-right">Qty</th>
                        <th className="th text-right">Rate (₹)</th>
                        <th className="th text-right">Amount (₹)</th>
                        <th className="th w-12" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((item, idx) => (
                        <tr key={idx} className="group">
                          <td className="td p-2">
                            <TextField
                              label="Description"
                              value={item.description}
                              onChange={(v) => {
                                const next = [...items];
                                next[idx] = { ...next[idx], description: v };
                                setItems(next);
                              }}
                              placeholder="Description"
                            />
                          </td>
                          <td className="td p-2 text-right">
                            <TextField
                              label="Qty"
                              type="number"
                              value={String(item.quantity)}
                              onChange={(v) => {
                                const next = [...items];
                                next[idx] = { ...next[idx], quantity: parseFloat(v) || 0 };
                                setItems(next);
                              }}
                            />
                          </td>
                          <td className="td p-2 text-right">
                            <TextField
                              label="Rate (₹)"
                              type="number"
                              value={String(item.unit_price)}
                              onChange={(v) => {
                                const next = [...items];
                                next[idx] = { ...next[idx], unit_price: parseFloat(v) || 0 };
                                setItems(next);
                              }}
                            />
                          </td>
                          <td className="td p-2 text-right font-medium text-slate-900">
                            {formatMoney(item.quantity * item.unit_price - (item.discount || 0))}
                          </td>
                          <td className="td p-2 text-right">
                            <button
                              type="button"
                              className="text-rose-600 hover:text-rose-800 text-xs"
                              onClick={() => {
                                setItems(items.filter((_, i) => i !== idx));
                              }}
                              disabled={items.length === 1
              }
                            >
                              <Icon name="trash" className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td className="td p-2" colSpan={4}>
                          <button
                            type="button"
                            className="w-full text-left text-xs text-sky-600 hover:text-sky-700"
                            onClick={() => {
                              setItems([
                                ...items,
                                {
                                  description: "Credit adjustment",
                                  quantity: 1,
                                  unit_price: 0,
                                  amount: 0,
                                  is_taxable: true,
                                },
                              ]);
                            }}
                          >
                            <Icon name="plus" className="h-3 w-3" /> Add line
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost px-5 py-2.5"
                  onClick={() => setOpen(false)}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary px-5 py-2.5"
                  onClick={handleSubmit}
                  disabled={creating || total <= 0}
                >
                  {creating ? "Creating…" : "Create Credit Note"}
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

