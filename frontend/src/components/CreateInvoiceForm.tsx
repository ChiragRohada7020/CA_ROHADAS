"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";

import { InvoiceLineTable, blankLine, type DraftLine } from "@/components/InvoiceLineTable";
import { LiveInvoicePreview, type PreviewFormState } from "@/components/LiveInvoicePreview";
import { Icon } from "@/components/Icon";
import { FormError, FormSuccess, SelectField, TextAreaField, TextField } from "@/components/form";
import { Badge, Modal } from "@/components/ui";
import { api, buildQuery } from "@/lib/api";
import { addDays, formatMoney, todayInIST } from "@/lib/format";
import { computeTotals, resolveTax } from "@/lib/billing";
import { invoiceStatusLabel, invoiceStatusTone } from "@/lib/status";
import type {
  ClientDetail,
  ClientListItem,
  FirmBillingSettings,
  InvoiceDetail,
  InvoiceLineInput,
  Page,
  PartyDetails,
} from "@/lib/types";

interface CreateInvoiceFormProps {
  initial?: InvoiceDetail;
  onDone?: (invoice: InvoiceDetail) => void;
}

interface BankDetails {
  bank_name: string;
  account_name: string;
  account_number: string;
  ifsc_code: string;
  upi_id: string;
  payment_reference: string;
}

const INVOICE_TYPES: Array<{ value: string; label: string }> = [
  { value: "regular", label: "Regular Tax Invoice" },
  { value: "sez", label: "SEZ Invoice" },
  { value: "supply", label: "Supply Bill" },
  { value: "deemed", label: "Deemed Export" },
];

const DEFAULT_CREDIT_DAYS = 30;

function computeFinancialYear(invoiceDate: string, startMonth = 4): string {
  const [year, month] = invoiceDate.split("-").map(Number);
  const fyStart = month >= startMonth ? year : year - 1;
  return `${fyStart}-${String(fyStart + 1).slice(-2)}`;
}

/** Map a ClientDetail → PartyDetails for the preview. */
function toPartyDetails(client: ClientDetail | null): PartyDetails | null {
  if (!client) return null;
  const primaryContact = client.contacts?.find((c) => c.is_primary) ?? null;
  return {
    name: client.trade_name ?? client.legal_name ?? "",
    legal_name: client.legal_name ?? null,
    gstin: client.gstin ?? null,
    pan: client.pan ?? null,
    address_line1: client.address_line1 ?? null,
    address_line2: client.address_line2 ?? null,
    city: client.city ?? null,
    state: client.state ?? null,
    state_code: client.state_code ?? null,
    pincode: client.pincode ?? null,
    email: primaryContact?.email ?? null,
    phone: primaryContact?.phone ?? null,
  };
}

interface InvoicePayload {
  client_id: string;
  engagement_id?: string | null;
  invoice_date: string;
  due_date: string;
  lines: InvoiceLineInput[];
  tax_rate?: number;
  notes?: string | null;
  terms?: string | null;
  issue: boolean;
}

interface Step {
  label: string;
  icon: "user" | "tag" | "file-text" | "eye";
  complete: boolean;
}

export function CreateInvoiceForm({ initial, onDone }: CreateInvoiceFormProps) {
  const queryClient = useQueryClient();
  const isEdit = !!initial;
  const today = todayInIST();

  // ── Form state ───────────────────────────────────────────
  const [clientId, setClientId] = useState(initial?.client_id ?? "");
  const [invoiceDate, setInvoiceDate] = useState(initial?.invoice_date ?? today);
  const [dueDate, setDueDate] = useState(initial?.due_date ?? addDays(today, DEFAULT_CREDIT_DAYS));
  const [invoiceType, setInvoiceType] = useState("regular");
  const [taxRate, setTaxRate] = useState(initial?.tax_rate ?? 18);
  const [lines, setLines] = useState<DraftLine[]>(
    initial?.lines
      ? initial.lines.map((l) => ({ ...l, key: l.id, is_taxable: l.is_taxable ?? true }))
      : [blankLine()],
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [terms, setTerms] = useState(initial?.terms ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [bankDetails, setBankDetails] = useState<BankDetails>({
    bank_name: "",
    account_name: "",
    account_number: "",
    ifsc_code: "",
    upi_id: "",
    payment_reference: "",
  });

  // ── Client data ──────────────────────────────────────────
  const clients = useQuery({
    queryKey: ["clients", { for: "invoice-create" }],
    queryFn: () => api.get<Page<ClientListItem>>(`/clients${buildQuery({ limit: 200 })}`),
    staleTime: 60 * 1000,
  });

  const selectedClientDetail = useQuery<ClientDetail>({
    queryKey: ["client", clientId],
    queryFn: () => api.get<ClientDetail>(`/clients/${clientId}`),
    enabled: !!clientId,
    staleTime: 60 * 1000,
  });

  const clientDetail = selectedClientDetail.data;

  const clientServices = useMemo(() => {
    const { flattenClientServices } = require("@/components/ServiceCombobox");
    return flattenClientServices(clientDetail?.services);
  }, [clientDetail?.services]);

  // ── Firm billing settings ────────────────────────────────
  const firm = useQuery({
    queryKey: ["billing", "settings"],
    queryFn: () => api.get<FirmBillingSettings>("/billing/settings"),
    staleTime: 10 * 60 * 1000,
  });

  // ── Auto-dismiss success message ─────────────────────────
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), 4000);
    return () => clearTimeout(timer);
  }, [saved]);

  // ── Mutations ────────────────────────────────────────────
  const create = useMutation({
    mutationFn: (payload: InvoicePayload) => api.post<InvoiceDetail>("/invoices", payload),
    onSuccess: (invoice) => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["invoices", "summary"] });
      setSaved(`Invoice created as ${invoice.invoice_number ?? "draft"}.`);
      onDone?.(invoice);
    },
  });

  const update = useMutation({
    mutationFn: (payload: InvoicePayload) =>
      api.patch<InvoiceDetail>(`/invoices/${initial!.id}`, payload),
    onSuccess: (invoice) => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["invoice", initial!.id] });
      setSaved("Invoice updated.");
      onDone?.(invoice);
    },
  });

  const issue = useMutation({
    mutationFn: (invoiceId: string) => api.post<InvoiceDetail>(`/invoices/${invoiceId}/issue`),
    onSuccess: (invoice) => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["invoice", invoice.id] });
      setSaved(`Invoice ${invoice.invoice_number} issued.`);
      onDone?.(invoice);
    },
  });

  // ── Derived state ────────────────────────────────────────
  const usableLines = lines.filter((line) => line.description.trim().length > 0);
  const financialYear = computeFinancialYear(invoiceDate);
  const invoiceNumberPreview =
    isEdit && initial ? initial.invoice_number ?? "(draft)" : "(draft) — not yet numbered";
  const canSave = clientId !== "" && usableLines.length > 0 && dueDate >= invoiceDate;
  const activeMutation = create.isPending || update.isPending || issue.isPending;

  const errorMsg = create.isError
    ? create.error
    : update.isError
      ? update.error
      : issue.isError
        ? issue.error
        : null;

  // ── Live financial totals ─────────────────────────────────
  const taxType = useMemo(() => {
    const firmState = firm.data?.state_code ?? null;
    const clientState = clientDetail?.state_code ?? null;
    return resolveTax(firmState, clientState, taxRate).taxType;
  }, [firm.data?.state_code, clientDetail?.state_code, taxRate]);

  const totals = useMemo(
    () => computeTotals(lines, taxRate, taxType),
    [lines, taxRate, taxType],
  );

  const taxResolution = useMemo(() => {
    const firmState = firm.data?.state_code ?? null;
    const clientState = clientDetail?.state_code ?? null;
    return resolveTax(firmState, clientState, taxRate);
  }, [firm.data?.state_code, clientDetail?.state_code, taxRate]);

  function toPreviewState(): PreviewFormState {
    return {
      client: toPartyDetails(clientDetail ?? null),
      firm: firm.data
        ? {
            name: firm.data.name,
            legal_name: firm.data.legal_name,
            address_line1: firm.data.address_line1 ?? null,
            address_line2: firm.data.address_line2 ?? null,
            city: firm.data.city ?? null,
            state: firm.data.state ?? null,
            state_code: firm.data.state_code ?? null,
            pincode: firm.data.pincode ?? null,
            gstin: firm.data.gstin ?? null,
            pan: firm.data.pan ?? null,
            email: firm.data.email ?? null,
            phone: firm.data.phone ?? null,
            currency: firm.data.currency,
          }
        : null,
      invoiceNumber: invoiceNumberPreview,
      invoiceDate,
      dueDate,
      invoiceType,
      financialYear,
      taxRate,
      lines,
      terms,
      notes,
      bankDetails,
      taxNote: null,
    };
  }

  const previewState = toPreviewState();

  // ── Steps progress ────────────────────────────────────────
  const steps: Step[] = useMemo(
    () => [
      { label: "Client", icon: "user", complete: !!clientId },
      { label: "Line items", icon: "tag", complete: usableLines.length > 0 },
      { label: "Review", icon: "eye", complete: canSave },
    ],
    [clientId, usableLines.length, canSave],
  );
  const stepsComplete = steps.filter((s) => s.complete).length;

  // ── Line & bank management ──────────────────────────────
  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    setLines((current) => [...current, blankLine()]);
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  function updateBank(field: keyof BankDetails, value: string) {
    setBankDetails((current) => ({ ...current, [field]: value }));
  }

  // ── Submit ───────────────────────────────────────────────
  function preparePayload(): InvoicePayload {
    return {
      client_id: clientId,
      invoice_date: invoiceDate,
      due_date: dueDate,
      lines: usableLines.map((line: DraftLine): InvoiceLineInput => ({
        description: line.description.trim(),
        quantity: Number(line.quantity ?? 1),
        unit_price: Number(line.unit_price ?? 0),
        discount: Number(line.discount ?? 0),
        sac_code: line.sac_code || null,
        is_taxable: line.is_taxable ?? true,
        service_id: line.service_id || null,
        task_id: line.task_id || null,
      })),
      tax_rate: taxRate,
      notes: notes.trim() || null,
      terms: terms.trim() || null,
      issue: false,
    };
  }

  function handleSaveDraft() {
    const payload = preparePayload();
    const mutation = isEdit ? update : create;
    mutation.mutate(payload);
  }

  function handleSaveAndSend() {
    const payload = { ...preparePayload(), issue: true };
    if (isEdit) {
      update.mutate(payload, {
        onSuccess: (invoice) => {
          if (invoice.status !== "issued") {
            issue.mutate(invoice.id);
          }
        },
      });
    } else {
      create.mutate(payload);
    }
  }

  const clientOptions = (clients.data?.items ?? []).map((row) => ({
    value: row.id,
    label: `${row.client_code} · ${row.trade_name || row.legal_name}`,
  }));

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">
            {isEdit ? (initial!.invoice_number ?? "Edit invoice") : "Create Invoice"}
          </h1>
          <p className="page-subtitle">
            {isEdit
              ? "Edit this draft before issuing. Issued invoices cannot be edited."
              : "Generate a GST-compliant invoice for your client."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={invoiceStatusTone(initial?.status ?? "draft")}>
            {invoiceStatusLabel(initial?.status ?? "draft")}
          </Badge>
        </div>
      </div>

      {/* ── Progress indicator ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {stepsComplete}/{steps.length} sections complete
          </span>
          <span className="font-medium text-slate-600">
            {canSave ? "Ready to save" : "Complete the form to continue"}
          </span>
        </div>
        <div className="step-bar">
          <div
            className="step-bar-fill"
            style={{ width: `${(stepsComplete / steps.length) * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.label} className="flex items-center gap-1.5">
              <div
                className={`step-dot ${step.complete ? "step-dot-complete" : "step-dot-incomplete"}`}
              >
                {step.complete ? (
                  <Icon name="check-circle" className="h-3 w-3" />
                ) : (
                  <Icon name={step.icon} className="h-3 w-3" />
                )}
              </div>
              <span
                className={`text-xs font-medium ${step.complete ? "text-slate-900" : "text-slate-400"}`}
              >
                {step.label}
              </span>
              {index < steps.length - 1 && (
                <div className="mx-2 hidden h-0.5 w-6 bg-slate-200 sm:block" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Sticky Financial Summary ── */}
      <div className="sticky top-0 z-10 mb-4">
        <div className="financial-summary">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Financial Summary</h3>
              <p className="text-xs text-slate-500">
                {usableLines.length > 0
                  ? `${taxResolution.reason.split(" → ")[0]} tax applied`
                  : "Add line items to see totals"}
              </p>
            </div>
            {usableLines.length > 0 && (
              <div className="text-right">
                <p className="text-xs text-slate-500">Total</p>
                <p className="tabular text-2xl font-bold text-sky-700">
                  {formatMoney(totals.total)}
                </p>
              </div>
            )}
          </div>

          {usableLines.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Subtotal</span>
                <span className="tabular font-medium">{formatMoney(totals.subtotal)}</span>
              </div>
              {totals.discountTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Discount</span>
                  <span className="tabular font-medium">−{formatMoney(totals.discountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">Taxable</span>
                <span className="tabular font-medium">{formatMoney(totals.taxableTotal)}</span>
              </div>
              {totals.cgst > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-600">CGST</span>
                    <span className="tabular font-medium">{formatMoney(totals.cgst)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">SGST</span>
                    <span className="tabular font-medium">{formatMoney(totals.sgst)}</span>
                  </div>
                </>
              )}
              {totals.igst > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">IGST</span>
                  <span className="tabular font-medium">{formatMoney(totals.igst)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="h-px bg-slate-200" />

      {/* ── Client Details & Invoice Information (side by side) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Client Details ── */}
        <div className="invoice-section invoice-section-accent-client">
          <div className="invoice-section-header">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <Icon name="user" className="h-4 w-4" />
            </div>
            <div>
              <h3 className="invoice-section-title">Client Details</h3>
              <p className="invoice-section-subtitle">Who the invoice is billed to</p>
            </div>
          </div>
          <div className="p-5">
            <SelectField
              label="Client"
              value={clientId}
              onChange={setClientId}
              options={clientOptions}
              placeholder="Choose a client"
              required
              hint="The client's state decides CGST+SGST versus IGST."
            />

            {selectedClientDetail.isPending && clientId && (
              <p className="mt-2 text-sm text-slate-500">Loading client details…</p>
            )}

            {clientDetail && (
              <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-sky-600 ring-1 ring-sky-200">
                    {(clientDetail.trade_name ?? clientDetail.legal_name ?? "?").charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">
                      {clientDetail.trade_name ?? clientDetail.legal_name ?? "Unnamed"}
                    </p>
                    {clientDetail.gstin && (
                      <p className="mt-0.5 text-xs text-slate-600">
                        GSTIN: <span className="font-mono">{clientDetail.gstin}</span>
                      </p>
                    )}
                    {clientDetail.address_line1 && (
                      <p className="text-xs text-slate-500">
                        {clientDetail.address_line1}
                        {clientDetail.address_line2 && `, ${clientDetail.address_line2}`}
                      </p>
                    )}
                    <p className="text-xs text-slate-500">
                      {[clientDetail.city, clientDetail.state].filter(Boolean).join(", ")}{" "}
                      {clientDetail.state_code && (
                        <span className="font-mono">({clientDetail.state_code})</span>
                      )}
                      {clientDetail.pincode && ` — ${clientDetail.pincode}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-ghost-sky mt-2 px-2 py-1 text-xs"
                  onClick={() => setShowPreview(true)}
                >
                  <Icon name="pencil" className="h-3 w-3" />
                  <span className="ml-1">Edit client details</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Invoice Information (with GST rate) ── */}
        <div className="invoice-section invoice-section-accent-invoice">
          <div className="invoice-section-header">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Icon name="calendar" className="h-4 w-4" />
            </div>
            <div>
              <h3 className="invoice-section-title">Invoice Information</h3>
              <p className="invoice-section-subtitle">Date, type, tax rate, and financial year</p>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="Invoice date"
                type="date"
                value={invoiceDate}
                onChange={setInvoiceDate}
                required
                hint={`Financial year: ${financialYear}`}
              />
              <TextField
                label="Due date"
                type="date"
                value={dueDate}
                onChange={setDueDate}
                required
                hint={`Default: ${DEFAULT_CREDIT_DAYS} days after invoice date`}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="GST rate (%)"
                type="number"
                value={String(taxRate)}
                onChange={(value) => setTaxRate(Math.max(0, Number(value)))}
                hint="Defaults to the firm's configured rate (18%)."
                maxLength={5}
              />
              <SelectField
                label="Invoice type"
                value={invoiceType}
                onChange={setInvoiceType}
                options={INVOICE_TYPES}
                required
              />
            </div>

            {/* Tax resolution hint */}
            <div className="rounded-md bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
              <p className="text-xs font-medium text-slate-700">Tax resolution</p>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                <li>
                  Firm state: <span className="font-medium">{firm.data?.state_code ?? "not set"}</span>
                </li>
                <li>
                  Client state: <span className="font-medium">{clientDetail?.state_code ?? "—"}</span>
                </li>
                <li>
                  Tax type:{" "}
                  <span className="font-medium">
                    {clientDetail && firm.data
                      ? clientDetail.state_code === firm.data.state_code
                        ? "Intra-state (CGST + SGST)"
                        : "Inter-state (IGST)"
                      : "Computed on save"}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ── Items & Services ── */}
      <div className="invoice-section invoice-section-accent-items">
        <div className="invoice-section-header">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <Icon name="tag" className="h-4 w-4" />
          </div>
          <div>
            <h3 className="invoice-section-title">Items & Services</h3>
            <p className="invoice-section-subtitle">What your client is being charged for</p>
          </div>
        </div>
        <div className="p-5">
          <InvoiceLineTable
            lines={lines}
            taxRate={taxRate}
            onUpdate={updateLine}
            onAdd={addLine}
            onRemove={removeLine}
            clientServices={clientServices}
            clientServicesLoading={selectedClientDetail.isPending}
          />
          {usableLines.length > 0 && (
            <button
              type="button"
              className="btn-ghost-sky px-2 py-1 text-xs"
              onClick={() => alert("Load lines from a saved service template (Phase 2)")}
            >
              <Icon name="file-text" className="h-3 w-3" />
              <span className="ml-1">Load from service template</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Payment & Notes + Bank Details (side by side) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Payment & Notes ── */}
        <div className="invoice-section invoice-section-accent-payment">
          <div className="invoice-section-header">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <Icon name="share" className="h-4 w-4" />
            </div>
            <div>
              <h3 className="invoice-section-title">Payment & Notes</h3>
              <p className="invoice-section-subtitle">Terms, notes, and payment instructions</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <TextAreaField
              label="Payment terms"
              value={terms}
              onChange={setTerms}
              rows={3}
              maxLength={2000}
              hint="Printed on the invoice. Include bank details here or in the section below."
            />
            <TextAreaField
              label="Notes"
              value={notes}
              onChange={setNotes}
              rows={2}
              maxLength={2000}
              hint="Internal notes — not printed on the invoice."
            />
          </div>
        </div>

        {/* ── Bank / Payment Details ── */}
        <div className="invoice-section invoice-section-accent-bank">
          <div className="invoice-section-header">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <Icon name="building" className="h-4 w-4" />
            </div>
            <div>
              <h3 className="invoice-section-title">Bank / Payment Details</h3>
              <p className="invoice-section-subtitle">How the client can pay</p>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField
                label="Bank name"
                value={bankDetails.bank_name}
                onChange={(v) => updateBank("bank_name", v)}
                maxLength={100}
              />
              <TextField
                label="Account holder name"
                value={bankDetails.account_name}
                onChange={(v) => updateBank("account_name", v)}
                maxLength={100}
              />
              <TextField
                label="Account number"
                value={bankDetails.account_number}
                onChange={(v) => updateBank("account_number", v)}
                maxLength={30}
              />
              <TextField
                label="IFSC code"
                value={bankDetails.ifsc_code}
                onChange={(v) => updateBank("ifsc_code", v)}
                maxLength={11}
                hint="e.g. SBIN0001234"
              />
              <TextField
                label="UPI ID"
                value={bankDetails.upi_id}
                onChange={(v) => updateBank("upi_id", v)}
                maxLength={100}
                hint="e.g. name@upi"
              />
              <TextField
                label="Payment reference"
                value={bankDetails.payment_reference}
                onChange={(v) => updateBank("payment_reference", v)}
                maxLength={100}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Form actions ── */}
      <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
        {errorMsg && <FormError error={errorMsg} />}
        {saved && <FormSuccess message={saved} />}
        <button
          type="button"
          className="btn-ghost-sky"
          onClick={() => setShowPreview(true)}
          disabled={usableLines.length === 0}
        >
          <Icon name="eye" className="h-4 w-4" />
          <span className="ml-1">Preview</span>
        </button>
        <button
          type="button"
          className="btn-ghost-sky"
          onClick={handleSaveDraft}
          disabled={!canSave || activeMutation}
        >
          {activeMutation ? (
            <>
              <span className="mr-1">⏉</span>
              <span>Saving…</span>
            </>
          ) : (
            <>
              <Icon name="file-text" className="h-4 w-4" />
              <span className="ml-1">{isEdit ? "Save Changes" : "Save Draft"}</span>
            </>
          )}
        </button>
        <button
          type="button"
          className="btn-primary-gradient"
          onClick={handleSaveAndSend}
          disabled={!canSave || (create.isPending || issue.isPending)}
        >
          {create.isPending || issue.isPending ? (
            <>
              <span className="mr-1">⏉</span>
              <span>Saving…</span>
            </>
          ) : (
            <>
              <Icon name="share" className="h-4 w-4" />
              <span className="ml-1">{isEdit ? "Issue & Send" : "Save & Send"}</span>
            </>
          )}
        </button>
      </div>

      {/* ── Preview modal ── */}
      <Modal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        title="Invoice preview"
        size="xl"
      >
        <div className="max-h-[90vh] overflow-y-auto p-6">
          <LiveInvoicePreview state={previewState} />
        </div>
      </Modal>
    </div>
  );
}
