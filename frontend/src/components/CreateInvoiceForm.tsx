"use client";

import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";

import { InvoiceLineTable, blankLine, type DraftLine } from "@/components/InvoiceLineTable";
import { LiveInvoicePreview, type PreviewFormState } from "@/components/LiveInvoicePreview";
import { Icon } from "@/components/Icon";
import { ServiceCombobox, flattenClientServices, type ServiceOption } from "@/components/ServiceCombobox";
import { FormError, FormSuccess, SelectField, TextAreaField, TextField } from "@/components/form";
import { api, buildQuery } from "@/lib/api";
import { InvoiceTemplateSelector } from "@/components/InvoiceTemplateSelector";
import { addDays, formatMoney, todayInIST } from "@/lib/format";
import { computeTotals, resolveTax } from "@/lib/billing";
import type {
  ClientDetail,
  ClientListItem,
  FirmBillingSettings,
  InvoiceDetail,
  InvoiceLineInput,
  InvoiceTemplate,
  Page,
  PartyDetails,
} from "@/lib/types";

interface CreateInvoiceFormProps {
  initial?: InvoiceDetail;
  onDone?: (invoice: InvoiceDetail) => void;
  onClose?: () => void;
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
    whatsapp_number: null,
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
  bank_details?: Record<string, string | null>;
  issue: boolean;
}

interface Step {
  label: string;
  icon: "user" | "tag" | "file-text" | "eye";
  complete: boolean;
}

const SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

/** Full-page invoice creation with a live split-pane preview. */
export function CreateInvoiceForm({ initial, onDone, onClose }: CreateInvoiceFormProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
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

  const clientServices = useMemo(
    () => flattenClientServices(clientDetail?.services),
    [clientDetail?.services],
  );

  // ── Firm billing settings ────────────────────────────────
  const firm = useQuery({
    queryKey: ["billing", "settings"],
    queryFn: () => api.get<FirmBillingSettings>("/billing/settings"),
    staleTime: 10 * 60 * 1000,
  });

  const [template, setTemplate] = useState<InvoiceTemplate>(
    firm.data?.invoice_template ?? "modern"
  );
  // Update template when firm settings load
  useEffect(() => {
    if (firm.data?.invoice_template && !initial) {
      setTemplate(firm.data.invoice_template);
    }
  }, [firm.data?.invoice_template, initial]);

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
    isEdit && initial ? initial.invoice_number ?? "(draft)" : "(draft)";
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
      template: firm.data?.invoice_template ?? template,
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
      bank_details: {
        bank_name: bankDetails.bank_name.trim() || null,
        account_name: bankDetails.account_name.trim() || null,
        account_number: bankDetails.account_number.trim() || null,
        ifsc_code: bankDetails.ifsc_code.trim() || null,
        upi_id: bankDetails.upi_id.trim() || null,
        payment_reference: bankDetails.payment_reference.trim() || null,
      },
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

  function handleClose() {
    onClose?.();
  }

  const clientOptions = (clients.data?.items ?? []).map((row) => ({
    value: row.id,
    label: `${row.client_code} · ${row.trade_name || row.legal_name}`,
  }));

  function handleServiceSelect(key: string, service: ServiceOption | null) {
    if (!service) return;
    updateLine(key, {
      description: service.name,
      sac_code: service.sac_code,
      unit_price: Number(service.standard_fee ?? 0),
      service_id: service.id,
    });
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4 md:flex-row">
      {/* Left: Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSaveAndSend();
        }}
        aria-label="Invoice form"
        className="flex w-full flex-col gap-4 overflow-y-auto pr-2"
      >
        {/* Top row: customer, dates */}
        <motion.div
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.05 }}
        >
          <div>
            <SelectField
              label="Customer"
              value={clientId}
              onChange={setClientId}
              options={clientOptions}
              placeholder="Search customer…"
              required
              hint={selectedClientDetail.isPending ? "Loading…" : undefined}
              error={selectedClientDetail.isError ? "Could not load client details" : undefined}
            />
          </div>
          <div>
            <TextField
              label="Date"
              type="date"
              value={invoiceDate}
              onChange={setInvoiceDate}
              required
            />
          </div>
          <div>
            <TextField
              label="Due date"
              type="date"
              value={dueDate}
              onChange={setDueDate}
              required
              hint={dueDate < invoiceDate ? "Must be after the invoice date" : undefined}
            />
          </div>
        </motion.div>

        {/* Tax rate + invoice type */}
        <motion.div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.1 }}
        >
          <div>
            <TextField
              label="Tax rate (%)"
              type="number"
              value={String(taxRate)}
              onChange={(v) => setTaxRate(Number(v) || 0)}
              hint={taxType === "inter_state" ? "Inter-state tax (IGST)" : "Intra-state tax (CGST + SGST)"}
            />
          </div>
          <div>
            <SelectField
              label="Invoice type"
              value={invoiceType}
              onChange={setInvoiceType}
              options={INVOICE_TYPES}
            />
          </div>
        </motion.div>

        {/* Line items */}
        <motion.section
          className="space-y-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.15 }}
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Line Items
          </h3>
          <InvoiceLineTable
            lines={lines}
            taxRate={taxRate}
            onUpdate={updateLine}
            onAdd={addLine}
            onRemove={removeLine}
            clientServices={clientServices}
            clientServicesLoading={selectedClientDetail.isPending && !!clientId}
          />
        </motion.section>

        {/* Totals summary */}
        <motion.div
          className="flex justify-end"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.2 }}
        >
          <motion.div
            className="w-64 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3"
            whileHover={{ scale: 1.01, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Subtotal</span>
              <motion.span
                className="tabular-nums font-medium text-slate-900"
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                {formatMoney(totals.subtotal)}
              </motion.span>
            </div>
            {totals.discountTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Discount</span>
                <span className="tabular-nums text-emerald-600">−{formatMoney(totals.discountTotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Tax</span>
              <motion.span
                className="tabular-nums text-slate-900"
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                {formatMoney(totals.cgst + totals.sgst + totals.igst)}
              </motion.span>
            </div>
            <div className="border-t border-slate-200 pt-1.5">
              <div className="flex justify-between text-base font-semibold">
                <span className="text-slate-900">Total</span>
                <motion.span
                  className="tabular-nums font-bold text-sky-700"
                  initial={{ scale: 0.95, opacity: 0.5 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                >
                  {formatMoney(totals.total)}
                </motion.span>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Notes and terms */}
        <motion.div
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.25 }}
        >
          <TextAreaField
            label="Notes"
            value={notes}
            onChange={setNotes}
            rows={3}
            placeholder="Additional notes for the customer..."
          />
          <TextAreaField
            label="Terms & conditions"
            value={terms}
            onChange={setTerms}
            rows={3}
            placeholder="Payment terms, warranty, etc..."
          />
        </motion.div>

        {/* Bank details */}
        <motion.section
          className="space-y-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.3 }}
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Bank / Payment details
          </h3>
          <motion.div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            whileHover={{ boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <TextField
              label="Bank name"
              value={bankDetails.bank_name}
              onChange={(v) => updateBank("bank_name", v)}
              placeholder="e.g. SBI"
            />
            <TextField
              label="Account number"
              value={bankDetails.account_number}
              onChange={(v) => updateBank("account_number", v)}
              placeholder="e.g. 1234567890"
            />
            <TextField
              label="Account holder"
              value={bankDetails.account_name}
              onChange={(v) => updateBank("account_name", v)}
              placeholder="Name as on the bank account"
            />
            <TextField
              label="IFSC code"
              value={bankDetails.ifsc_code}
              onChange={(v) => updateBank("ifsc_code", v)}
              placeholder="e.g. SBIN0001234"
            />
            <TextField
              label="UPI ID"
              value={bankDetails.upi_id}
              onChange={(v) => updateBank("upi_id", v)}
              placeholder="e.g. name@fam"
            />
            <TextField
              label="Payment reference"
              value={bankDetails.payment_reference}
              onChange={(v) => updateBank("payment_reference", v)}
              placeholder="e.g. Invoice ref / UTR"
            />
          </motion.div>
        </motion.section>

        {/* Error + success */}
        {errorMsg && <FormError error={errorMsg} />}
        <FormSuccess message={saved} />

        {/* Actions */}
        <motion.div
          className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: 0.35 }}
        >
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span
                className={`flex h-2 w-2 rounded-full ${
                  clientId ? "bg-emerald-500" : "bg-slate-300"
                }`}
              />
              Client: {clientId ? "done" : "missing"}
            </span>
            <span
              className={`flex h-2 w-2 rounded-full ${
                usableLines.length > 0 ? "bg-emerald-500" : "bg-slate-300"
              }`}
            />
            <span className="flex items-center gap-1">
              <span />
              Lines: {usableLines.length}
            </span>
            <span
              className={`flex h-2 w-2 rounded-full ${
                canSave ? "bg-emerald-500" : "bg-slate-300"
              }`}
            />
            <span>Ready: {stepsComplete}/{steps.length}</span>
          </div>

          <div className="flex gap-2">
            {onClose && (
              <motion.button
                type="button"
                className="btn btn-ghost px-5 py-2.5"
                disabled={activeMutation}
                onClick={handleClose}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                Cancel
              </motion.button>
            )}
            <motion.button
              type="button"
              className="btn btn-ghost px-5 py-2.5"
              disabled={activeMutation || !canSave}
              onClick={handleSaveDraft}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              {activeMutation ? "Saving…" : "Save draft"}
            </motion.button>
            <motion.button
              type="submit"
              disabled={activeMutation || !canSave}
              className="btn btn-primary px-5 py-2.5"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              {activeMutation ? "Creating…" : isEdit ? "Update and send" : "Create and send"}
            </motion.button>
          </div>
        </motion.div>
      </form>

      {/* Right: Live preview */}
      <motion.div
        className="w-full min-w-[320px] max-w-[500px] overflow-y-auto"
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.2 }}
      >
        <LiveInvoicePreview
          state={previewState}
          onEditTax={() => setTaxRate((current) => (current === 0 ? 18 : current))}
          onDownloadPdf={() => {
            if (initial?.id) {
              window.open(`/print/invoices/${initial.id}`, "_blank");
            }
          }}
          onSendClient={() => {
            if (initial?.id) {
              router.push(`/invoices/${initial.id}`);
            }
          }}
          onMoreActions={() => {
            if (initial?.id) {
              router.push(`/invoices/${initial.id}`);
            }
          }}
        />
      </motion.div>
    </div>
  );
}
