"use client";

import { PageHeader } from "@/components/ui";
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

export function CreateInvoiceForm({ initial, onDone, onClose }: CreateInvoiceFormProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const isEdit = !!initial;
  const today = todayInIST();

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
    bank_name: "", account_name: "", account_number: "", ifsc_code: "", upi_id: "", payment_reference: "",
  });

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
  const clientServices = useMemo(() => flattenClientServices(clientDetail?.services), [clientDetail?.services]);

  const firm = useQuery({
    queryKey: ["billing", "settings"],
    queryFn: () => api.get<FirmBillingSettings>("/billing/settings"),
    staleTime: 10 * 60 * 1000,
  });

  const [template, setTemplate] = useState<InvoiceTemplate>(firm.data?.invoice_template ?? "modern");
  useEffect(() => {
    if (firm.data?.invoice_template && !initial) setTemplate(firm.data.invoice_template);
  }, [firm.data?.invoice_template, initial]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), 4000);
    return () => clearTimeout(timer);
  }, [saved]);

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
    mutationFn: (payload: InvoicePayload) => api.patch<InvoiceDetail>(`/invoices/${initial!.id}`, payload),
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

  const usableLines = lines.filter((line) => line.description.trim().length > 0);
  const financialYear = computeFinancialYear(invoiceDate);
  const invoiceNumberPreview = isEdit && initial ? initial.invoice_number ?? "(draft)" : "(draft)";
  const canSave = clientId !== "" && usableLines.length > 0 && dueDate >= invoiceDate;
  const activeMutation = create.isPending || update.isPending || issue.isPending;

  const errorMsg = create.isError ? create.error : update.isError ? update.error : issue.isError ? issue.error : null;

  const taxType = useMemo(() => {
    const firmState = firm.data?.state_code ?? null;
    const clientState = clientDetail?.state_code ?? null;
    return resolveTax(firmState, clientState, taxRate).taxType;
  }, [firm.data?.state_code, clientDetail?.state_code, taxRate]);

  const totals = useMemo(() => computeTotals(lines, taxRate, taxType), [lines, taxRate, taxType]);

  function toPreviewState(): PreviewFormState {
    return {
      client: toPartyDetails(clientDetail ?? null),
      firm: firm.data ? {
        name: firm.data.name, legal_name: firm.data.legal_name,
        address_line1: firm.data.address_line1 ?? null, address_line2: firm.data.address_line2 ?? null,
        city: firm.data.city ?? null, state: firm.data.state ?? null,
        state_code: firm.data.state_code ?? null, pincode: firm.data.pincode ?? null,
        gstin: firm.data.gstin ?? null, pan: firm.data.pan ?? null,
        email: firm.data.email ?? null, phone: firm.data.phone ?? null,
        currency: firm.data.currency,
      } : null,
      invoiceNumber: invoiceNumberPreview, invoiceDate, dueDate, invoiceType,
      financialYear, taxRate, lines, terms, notes,
      template: firm.data?.invoice_template ?? template, bankDetails, taxNote: null,
    };
  }

  const previewState = toPreviewState();

  const steps: Step[] = useMemo(
    () => [
      { label: "Client", icon: "user", complete: !!clientId },
      { label: "Line items", icon: "tag", complete: usableLines.length > 0 },
      { label: "Review", icon: "eye", complete: canSave },
    ],
    [clientId, usableLines.length, canSave],
  );
  const stepsComplete = steps.filter((s) => s.complete).length;

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }
  function addLine() { setLines((current) => [...current, blankLine()]); }
  function removeLine(key: string) { setLines((current) => current.filter((line) => line.key !== key)); }
  function updateBank(field: keyof BankDetails, value: string) { setBankDetails((current) => ({ ...current, [field]: value })); }

  function preparePayload(): InvoicePayload {
    return {
      client_id: clientId, invoice_date: invoiceDate, due_date: dueDate,
      lines: usableLines.map((line: DraftLine): InvoiceLineInput => ({
        description: line.description.trim(),
        quantity: Number(line.quantity ?? 1), unit_price: Number(line.unit_price ?? 0),
        discount: Number(line.discount ?? 0), sac_code: line.sac_code || null,
        is_taxable: line.is_taxable ?? true, service_id: line.service_id || null, task_id: line.task_id || null,
      })),
      tax_rate: taxRate, notes: notes.trim() || null, terms: terms.trim() || null, issue: false,
      bank_details: {
        bank_name: bankDetails.bank_name.trim() || null, account_name: bankDetails.account_name.trim() || null,
        account_number: bankDetails.account_number.trim() || null, ifsc_code: bankDetails.ifsc_code.trim() || null,
        upi_id: bankDetails.upi_id.trim() || null, payment_reference: bankDetails.payment_reference.trim() || null,
      },
    };
  }

  function handleSaveDraft() { const mutation = isEdit ? update : create; mutation.mutate(preparePayload()); }
  function handleSaveAndSend() {
    const payload = { ...preparePayload(), issue: true };
    if (isEdit) {
      update.mutate(payload, { onSuccess: (invoice) => { if (invoice.status !== "issued") issue.mutate(invoice.id); } });
    } else { create.mutate(payload); }
  }
  function handleClose() { onClose?.(); }

  const clientOptions = (clients.data?.items ?? []).map((row) => ({ value: row.id, label: `${row.client_code} · ${row.trade_name || row.legal_name}` }));
  function handleServiceSelect(key: string, service: ServiceOption | null) {
    if (!service) return;
    updateLine(key, { description: service.name, sac_code: service.sac_code, unit_price: Number(service.standard_fee ?? 0), service_id: service.id });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={isEdit ? "Edit invoice" : "New invoice"}
        subtitle={isEdit ? "Update an existing sale invoice." : "Create a sale invoice with a live preview."}
        action={
          <button type="button" className="btn btn-ghost px-5 py-2.5 text-[#8A90A6] hover:text-[#252B47] hover:bg-[#F3F3FA]" onClick={() => router.push("/invoices")}>
            Back to invoices
          </button>
        }
      />

      <section className="rounded-xl border border-[#E3E5F4] bg-white shadow-[0_3px_12px_rgba(40,42,90,.045)] p-6 md:p-8">
        <div className="flex h-[calc(100vh-16rem)] flex-col gap-6 md:flex-row">
          {/* Left: Form */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleSaveAndSend(); }}
            aria-label="Invoice form"
            className="flex w-full flex-col gap-5 overflow-y-auto pr-3"
          >
            {/* Section: Customer & dates */}
            <section className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div><SelectField label="Customer" value={clientId} onChange={setClientId} options={clientOptions} placeholder="Search customer…" required hint={selectedClientDetail.isPending ? "Loading…" : undefined} error={selectedClientDetail.isError ? "Could not load client details" : undefined} /></div>
                <div><TextField label="Date" type="date" value={invoiceDate} onChange={setInvoiceDate} required /></div>
                <div><TextField label="Due date" type="date" value={dueDate} onChange={setDueDate} required hint={dueDate < invoiceDate ? "Must be after the invoice date" : undefined} /></div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><TextField label="Tax rate (%)" type="number" value={String(taxRate)} onChange={(v) => setTaxRate(Number(v) || 0)} hint={taxType === "inter_state" ? "Inter-state tax (IGST)" : "Intra-state tax (CGST + SGST)"} /></div>
                <div><SelectField label="Invoice type" value={invoiceType} onChange={setInvoiceType} options={INVOICE_TYPES} /></div>
              </div>
            </section>

            {/* Section: Line items */}
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#858BA2]">Line Items</h3>
                <button type="button" onClick={addLine} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E3E2F2] bg-[#F8F5FF] px-2.5 py-1.5 text-[10px] font-semibold text-[#6D3AE8] hover:bg-[#F1ECFF] transition-colors">
                  <Icon name="plus" className="h-4 w-4" /> Add line
                </button>
              </div>
              <InvoiceLineTable lines={lines} taxRate={taxRate} onUpdate={updateLine} onAdd={addLine} onRemove={removeLine} clientServices={clientServices} clientServicesLoading={selectedClientDetail.isPending && !!clientId} />
            </section>

            {/* Section: Totals */}
            <div className="mt-2 w-64 space-y-2 rounded-xl border border-[#E3E2F2] bg-[#F1ECFF] p-3">
              <div className="flex justify-between text-sm">
                <span className="text-[#8A90A6]">Subtotal</span>
                <span className="tabular-nums font-medium text-[#11162F]">{formatMoney(totals.subtotal)}</span>
              </div>
              {totals.discountTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#8A90A6]">Discount</span>
                  <span className="tabular-nums text-[#6D3AE8]">−{formatMoney(totals.discountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-[#8A90A6]">Tax</span>
                <span className="tabular-nums text-[#11162F]">{formatMoney(totals.cgst + totals.sgst + totals.igst)}</span>
              </div>
              <div className="border-t border-[#E3E2F2] pt-2">
                <div className="flex justify-between text-base font-semibold">
                  <span className="text-[#11162F]">Total</span>
                  <span className="tabular-nums font-bold text-[#6D3AE8]">{formatMoney(totals.total)}</span>
                </div>
              </div>
            </div>

            {/* Section: Notes & terms */}
            <section className="mt-4 grid gap-3 md:grid-cols-2">
              <TextAreaField label="Notes" value={notes} onChange={setNotes} rows={3} placeholder="Additional notes for the customer..." />
              <TextAreaField label="Terms & conditions" value={terms} onChange={setTerms} rows={3} placeholder="Payment terms, warranty, etc..." />
            </section>

            {/* Section: Bank details */}
            <section className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#858BA2]">Bank / Payment details</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Bank name" value={bankDetails.bank_name} onChange={(v) => updateBank("bank_name", v)} placeholder="e.g. SBI" />
                <TextField label="Account number" value={bankDetails.account_number} onChange={(v) => updateBank("account_number", v)} placeholder="e.g. 1234567890" />
                <TextField label="Account holder" value={bankDetails.account_name} onChange={(v) => updateBank("account_name", v)} placeholder="Name as on the bank account" />
                <TextField label="IFSC code" value={bankDetails.ifsc_code} onChange={(v) => updateBank("ifsc_code", v)} placeholder="e.g. SBIN0001234" />
                <TextField label="UPI ID" value={bankDetails.upi_id} onChange={(v) => updateBank("upi_id", v)} placeholder="e.g. name@fam" />
                <TextField label="Payment reference" value={bankDetails.payment_reference} onChange={(v) => updateBank("payment_reference", v)} placeholder="e.g. Invoice ref / UTR" />
              </div>
            </section>

            {errorMsg && <FormError error={errorMsg} />}
            <FormSuccess message={saved} />

            {/* Actions */}
            <section className="mt-7 flex items-center justify-between gap-3 border-t border-[#EEF0F7] pt-5 bg-[#F8F5FF] rounded-b-xl px-4 py-4">
              <div className="flex items-center gap-2 text-xs text-[#8A90A6]">
                <span className="flex items-center gap-1"><span className={`flex h-2 w-2 rounded-full ${clientId ? "bg-[#6D3AE8]" : "bg-[#E3E2F2]"}`} /> Client: {clientId ? "done" : "missing"}</span>
                <span className="flex items-center gap-1"><span className={`flex h-2 w-2 rounded-full ${usableLines.length > 0 ? "bg-[#6D3AE8]" : "bg-[#E3E2F2]"}`} /> Lines: {usableLines.length}</span>
                <span className="flex items-center gap-1"><span className={`flex h-2 w-2 rounded-full ${canSave ? "bg-[#6D3AE8]" : "bg-[#E3E2F2]"}`} /> Ready: {stepsComplete}/{steps.length}</span>
              </div>

              <div className="flex gap-2">
                {onClose && (
                  <button type="button" className="btn btn-ghost px-5 py-2.5 text-[#8A90A6] hover:text-[#252B47] hover:bg-[#F3F3FA]" disabled={activeMutation} onClick={handleClose}>Cancel</button>
                )}
                <button type="button" className="btn btn-ghost px-5 py-2.5 text-[#8A90A6] hover:text-[#6D3AE8] hover:bg-[#F1ECFF]" disabled={activeMutation || !canSave} onClick={handleSaveDraft}>
                  {activeMutation ? "Saving…" : "Save draft"}
                </button>
                <button type="submit" disabled={activeMutation || !canSave} className="btn btn-primary px-6 py-2.5">
                  {activeMutation ? "Creating…" : isEdit ? "Update and send" : "Create and send"}
                </button>
              </div>
            </section>
          </form>

          {/* Right: Live preview */}
          <motion.div className="w-full min-w-[320px] max-w-[500px] overflow-y-auto border-l border-[#EEF0F7] pl-6">
            <LiveInvoicePreview state={previewState} onEditTax={() => setTaxRate((current) => (current === 0 ? 18 : current))} onDownloadPdf={() => { if (initial?.id) { window.open(`/print/invoices/${initial.id}`, "_blank"); } }} onSendClient={() => { if (initial?.id) { router.push(`/invoices/${initial.id}`); } }} onMoreActions={() => { if (initial?.id) { router.push(`/invoices/${initial.id}`); } }} />
          </motion.div>
        </div>
      </section>
    </div>
  );
}
