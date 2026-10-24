"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  CheckboxField,
  FormActions,
  FormError,
  FormSuccess,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/form";
import { Badge, Card, ErrorState } from "@/components/ui";
import { api, buildQuery } from "@/lib/api";
import { addDays, formatDate, formatMoney, todayInIST } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/status";
import type {
  ClientListItem,
  FirmBillingSettings,
  GenerateResult,
  InvoiceDetail,
  InvoiceLineInput,
  InvoiceSendResult,
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
                  className="btn-primary"
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
 * Raise an invoice by hand.
 *
 * The running total shown here is the **subtotal only**, deliberately. GST is worked out
 * by the server from the firm's and the client's state codes, and re-implementing that
 * in the browser would create a second copy of the tax rules that could disagree with
 * the one that actually prints on the invoice. The server's answer appears as soon as
 * the invoice is saved.
 */
export function NewInvoiceForm({ onDone }: { onDone: (invoiceId: string) => void }) {
  const queryClient = useQueryClient();
  const today = todayInIST();

  const [clientId, setClientId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDays(today, 30));
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [issue, setIssue] = useState(false);

  const clients = useQuery({
    queryKey: ["clients", { for: "invoice-new" }],
    queryFn: () => api.get<Page<ClientListItem>>(`/clients${buildQuery({ limit: 200 })}`),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<InvoiceDetail>("/invoices", {
        client_id: clientId,
        invoice_date: invoiceDate,
        due_date: dueDate,
        notes: notes.trim() || null,
        terms: terms.trim() || null,
        issue,
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
  const canSubmit = clientId !== "" && usableLines.length > 0 && dueDate >= invoiceDate;

  const update = (key: string, patch: Partial<DraftLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  return (
    <form
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <h2 className="text-sm font-semibold text-slate-900">Raise an invoice</h2>
      {create.isError && <FormError error={create.error} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SelectField
          label="Client"
          value={clientId}
          onChange={setClientId}
          options={clientOptions}
          placeholder="Choose a client"
          required
          hint="The client's state decides CGST+SGST versus IGST."
        />
        <TextField
          label="Invoice date"
          type="date"
          value={invoiceDate}
          onChange={setInvoiceDate}
          required
        />
        <TextField label="Due date" type="date" value={dueDate} onChange={setDueDate} required />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-700">Lines</p>
        {lines.map((line) => (
          <div
            key={line.key}
            className="grid grid-cols-1 gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-12"
          >
            <div className="sm:col-span-5">
              <TextField
                label="Description"
                value={line.description}
                onChange={(value) => update(line.key, { description: value })}
                placeholder="GST return filing — Apr 2026"
                maxLength={300}
              />
            </div>
            <div className="sm:col-span-2">
              <TextField
                label="Qty"
                type="number"
                value={String(line.quantity ?? 1)}
                onChange={(value) => update(line.key, { quantity: Number(value) })}
              />
            </div>
            <div className="sm:col-span-2">
              <TextField
                label="Rate"
                type="number"
                value={String(line.unit_price ?? 0)}
                onChange={(value) => update(line.key, { unit_price: Number(value) })}
              />
            </div>
            <div className="sm:col-span-2">
              <TextField
                label="Discount"
                type="number"
                value={String(line.discount ?? 0)}
                onChange={(value) => update(line.key, { discount: Number(value) })}
              />
            </div>
            <div className="sm:col-span-1">
              <TextField
                label="SAC"
                value={line.sac_code ?? ""}
                onChange={(value) => update(line.key, { sac_code: value })}
                hint="9982"
              />
            </div>
            <div className="flex items-end justify-between gap-2 sm:col-span-12">
              <CheckboxField
                label="Taxable"
                checked={line.is_taxable ?? true}
                onChange={(checked) => update(line.key, { is_taxable: checked })}
                hint="Untick for a reimbursement, which is billed but not taxed."
              />
              {lines.length > 1 && (
                <button
                  type="button"
                  className="btn-ghost px-2 py-1 text-xs"
                  onClick={() =>
                    setLines((current) => current.filter((row) => row.key !== line.key))
                  }
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs"
          onClick={() => setLines((current) => [...current, blankLine()])}
        >
          Add a line
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextAreaField label="Notes" value={notes} onChange={setNotes} rows={2} maxLength={2000} />
        <TextAreaField
          label="Payment terms"
          value={terms}
          onChange={setTerms}
          rows={2}
          maxLength={2000}
          hint="Printed on the invoice. Bank details belong here."
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
        <div>
          <p className="tabular text-sm text-slate-700">
            Subtotal <strong>{formatMoney(subtotal)}</strong>
          </p>
          <p className="text-xs text-slate-500">
            GST is worked out by the server from the client&apos;s place of supply.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CheckboxField
            label="Issue immediately"
            checked={issue}
            onChange={setIssue}
            hint="Allocates the invoice number. Leave off to keep it a draft."
          />
          <FormActions submitLabel="Raise invoice" busy={create.isPending} disabled={!canSubmit} />
        </div>
      </div>
    </form>
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
  const [cancelReason, setCancelReason] = useState("");
  const [message, setMessage] = useState("");
  const [outcomes, setOutcomes] = useState<InvoiceSendResult | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

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

  const isDraft = invoice.status === "draft";
  const isCancelled = invoice.status === "cancelled";

  return (
    <Card title="Actions" subtitle={invoice.tax_note}>
      <div className="space-y-4 p-4">
        {isDraft && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              This is a draft, so it has no invoice number yet. Numbers are allocated on
              issue, which keeps the series consecutive — an abandoned draft leaves no gap.
            </p>
            {issue.isError && <FormError error={issue.error} />}
            <button
              type="button"
              className="btn-primary"
              disabled={issue.isPending}
              onClick={() => issue.mutate()}
            >
              {issue.isPending ? "Issuing…" : "Issue this invoice"}
            </button>
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
                className="btn-primary"
                disabled={send.isPending}
                onClick={() => send.mutate()}
              >
                {send.isPending ? "Sending…" : "Send to the client"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={shareLink.isPending}
                onClick={() => shareLink.mutate()}
              >
                {shareLink.isPending ? "Minting…" : "New client link"}
              </button>
              <Link href={`/print/invoices/${invoice.id}`} className="btn-ghost">
                Print
              </Link>
            </div>

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
                  className="btn-ghost"
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
      title="Receipts"
      subtitle={`${formatMoney(invoice.amount_paid)} received · ${formatMoney(invoice.outstanding)} outstanding`}
    >
      <div className="space-y-4 p-4">
        {invoice.payments.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Received</th>
                  <th className="th">Method</th>
                  <th className="th">Reference</th>
                  <th className="th">Amount</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="td text-xs">{formatDate(payment.paid_on)}</td>
                    <td className="td text-xs">{paymentMethodLabel(payment.method)}</td>
                    <td className="td text-xs">{payment.reference ?? "—"}</td>
                    <td className="td tabular text-xs">{formatMoney(payment.amount)}</td>
                    <td className="td text-right">
                      <button
                        type="button"
                        className="btn-ghost px-2 py-1 text-xs"
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

        {reverse.isError && <FormError error={reverse.error} />}

        {settled ? (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
            This invoice is fully paid.
          </p>
        ) : (
          <form
            className="space-y-3 border-t border-slate-200 pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              record.mutate();
            }}
          >
            <p className="text-xs font-medium text-slate-700">Record a receipt</p>
            {record.isError && <FormError error={record.error} />}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <TextField
                label="Amount"
                type="number"
                value={amount}
                onChange={setAmount}
                hint={`${formatMoney(invoice.outstanding)} outstanding`}
                required
              />
              <TextField label="Received on" type="date" value={paidOn} onChange={setPaidOn} />
              <SelectField
                label="Method"
                value={method}
                onChange={(value) => setMethod(value as PaymentMethod)}
                options={PAYMENT_METHODS}
              />
              <TextField
                label="Reference"
                value={reference}
                onChange={setReference}
                placeholder="UTR or cheque number"
                hint="What the bank statement will show."
              />
            </div>
            <TextField label="Notes" value={notes} onChange={setNotes} maxLength={500} />
            <FormActions
              submitLabel="Record receipt"
              busy={record.isPending}
              disabled={Number(amount) <= 0}
            />
          </form>
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