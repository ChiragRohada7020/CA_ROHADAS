"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { RecordPaymentDrawer } from "@/components/RecordPaymentDrawer";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import {
  PageHeader,
  Card,
  StatCard,
  Badge,
  EmptyState,
  LoadingState,
  ErrorState,
} from "@/components/ui";
import { Icon } from "@/components/Icon";
import { TextField, TextAreaField, SelectField } from "@/components/form";
import { api } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import type { Page, Invoice, PaymentMethod, ReceivablesSummary } from "@/lib/types";

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

/** What the backend `GET /payments` endpoint actually returns — a flat array
 *  of payment objects.  The fields are flat (not nested) and there is no
 *  `status` field: every recorded payment is, by definition, "received".
 */
interface PaymentBackend {
  id: string;
  invoice_id: string;
  invoice_number: string | null;
  client_name: string | null;
  client_id: string | null;
  amount: number;
  paid_on: string | null;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  recorded_by_id: string | null;
  created_at: string | null;
}

interface PaymentRow {
  id: string;
  date: string;
  client: {
    id: string;
    name: string | null;
    code: string | null;
  };
  invoice: {
    id: string;
    number: string | null;
  };
  method: PaymentMethod;
  amount: number;
  reference: string | null;
  status: "received" | "pending" | "failed";
}

/** Transform a flat backend payment row into the nested shape the table expects. */
function mapPayment(p: PaymentBackend): PaymentRow {
  return {
    id: p.id,
    date: p.paid_on ?? p.created_at ?? "",
    client: {
      id: p.client_id ?? p.invoice_id ?? p.id,
      name: p.client_name,
      code: null,
    },
    invoice: {
      id: p.invoice_id,
      number: p.invoice_number,
    },
    method: p.method,
    amount: p.amount,
    reference: p.reference,
    status: "received" as const,
  };
}

const STATUS_CONFIG: Record<string, { label: string; tone: string }> = {
  received: { label: "Received", tone: "success" },
  pending: { label: "Pending", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
};

const METHOD_ICONS: Record<string, string> = {
  bank_transfer: "bank",
  upi: "phone",
  cheque: "file-text",
  cash: "wallet",
  card: "credit-card",
  other: "file",
};

const CLIENT_COLORS = [
  "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
];

const TABS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All Payments" },
  { key: "received", label: "Received" },
  { key: "pending", label: "Pending" },
  { key: "failed", label: "Failed" },
  { key: "refunded", label: "Refunds" },
];

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<"all" | string>("all");
  const [methodFilter, setMethodFilter] = useState<"all" | PaymentMethod>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [showRecordDrawer, setShowRecordDrawer] = useState(false);

  const invoices = useQuery({
    queryKey: ["invoices", "list", { limit: 500 }],
    queryFn: () => api.get<Page<Invoice>>(`/invoices?limit=500`),
  });

  const paymentsQuery = useQuery({
    queryKey: ["payments", "list"],
    queryFn: () => api.get<PaymentBackend[]>("/payments"),
  });

  // Fetch receivables summary for Outstanding / Overdue figures
  const receivables = useQuery({
    queryKey: ["receivables", "summary"],
    queryFn: () => api.get<ReceivablesSummary>("/billing/receivables"),
  });

  const record = useMutation({
    mutationFn: (payload: {
      invoice_id: string;
      amount: number;
      method: string;
      reference: string | null;
      paid_on: string;
      notes: string | null;
    }) =>
      api.post(`/invoices/${payload.invoice_id}/payments`, {
        amount: payload.amount,
        method: payload.method,
        reference: payload.reference,
        paid_on: payload.paid_on,
        notes: payload.notes,
      }),
    onSuccess: () => {
      setSelectedInvoiceId("");
      setAmount("");
      setPaidOn("");
      setReference("");
      setNotes("");
      setRecordError(null);
      void queryClient.invalidateQueries({ queryKey: ["payments", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["invoices", "summary"] });
    },
    onError: (err: any) => {
      setRecordError(err.message || "Failed to record payment.");
    },
  });

  const issueReceipt = useMutation({
    mutationFn: (invoiceId: string) => api.post(`/invoices/${invoiceId}/receipts`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["payments", "list"] });
    },
  });

  // The backend returns a flat array; transform and compute derived values
  const rawPayments = paymentsQuery.data ?? [];
  const receivablesData = receivables.data;

  const summary = useMemo(() => {
    const payments = rawPayments.map(mapPayment);
    const total_received = payments.reduce((sum, p) => sum + p.amount, 0);
    const total_payments = payments.length;
    const received_count = payments.filter((p) => p.status === "received").length;

    return {
      total_received,
      total_payments,
      received_count,
      payments,
    };
  }, [rawPayments]);

  // Client-side filtering (backend ignores query params)
  const filteredPayments = useMemo(() => {
    return summary.payments.filter((p) => {
      // Status tab filter
      if (tab === "received" && p.status !== "received") return false;
      if (tab === "pending" && p.status !== "pending") return false;
      if (tab === "failed" && p.status !== "failed") return false;
      if (tab === "refunded") return false; // no refunds in current model

      // Search
      if (search) {
        const term = search.toLowerCase();
        const matches =
          p.invoice.number?.toLowerCase().includes(term) ||
          p.client.name?.toLowerCase().includes(term) ||
          p.id.toLowerCase().includes(term) ||
          p.reference?.toLowerCase().includes(term);
        if (!matches) return false;
      }

      // Client filter
      if (clientFilter !== "all" && p.client.id !== clientFilter) return false;

      // Method filter
      if (methodFilter !== "all" && p.method !== methodFilter) return false;

      // Date filter
      if (dateFrom && p.date < dateFrom) return false;
      if (dateTo && p.date > dateTo) return false;

      return true;
    });
  }, [summary.payments, tab, search, clientFilter, methodFilter, dateFrom, dateTo]);

  const paymentsAll = filteredPayments;
  const totalPages = Math.max(1, Math.ceil(paymentsAll.length / pageSize));
  const payments = paymentsAll.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const data = {
    total_received: summary.total_received,
    total_payments: summary.total_payments,
    received_count: summary.received_count,
    outstanding: receivablesData?.outstanding_total ?? 0,
    overdue: receivablesData?.overdue_total ?? 0,
  };

  const isLoading = paymentsQuery.isLoading || invoices.isLoading;

  const tabCounts = {
    all: data.total_payments,
    received: data.received_count,
    pending: 0,
    failed: 0,
    refunded: 0,
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRecordError(null);

    if (!selectedInvoiceId) {
      setRecordError("Please select an invoice.");
      return;
    }

    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setRecordError("Amount must be greater than zero.");
      return;
    }

    setRecording(true);
    record.mutate({
      invoice_id: selectedInvoiceId,
      amount: amt,
      method,
      reference: reference.trim() || null,
      paid_on: paidOn || new Date().toISOString(),
      notes: notes.trim() || null,
    });
  };

  const getClientColor = (clientId: string) => {
    let hash = 0;
    for (let i = 0; i < clientId.length; i++) {
      hash = clientId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return CLIENT_COLORS[Math.abs(hash) % CLIENT_COLORS.length];
  };

  if (isLoading) return <LoadingState label="Loading payments…" />;
  if (paymentsQuery.isError) return <ErrorState message="Could not load payments." />;

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <PageHeader
        title="Payments & Receipts"
        subtitle="Track all client payments, receipts, and outstanding amounts."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-ghost flex items-center gap-2"
              onClick={() => {
                const csv = ['Date,Client,Invoice,Method,Amount,Reference']
                  .concat(paymentsAll.map(p => [
                    p.date,
                    `"${(p.client.name||'').replace(/"/g,'""')}"`,
                    p.invoice.number || '',
                    p.method,
                    p.amount,
                    `"${(p.reference||'').replace(/"/g,'""')}"`
                  ].join(',')))
                  .join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'payments.csv';
                a.click();
              }}
            >
              <Icon name="download" className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
            <button
              type="button"
              className="btn-primary flex items-center gap-2"
              onClick={() => setShowRecordDrawer(true)}
            >
              <Icon name="plus" className="h-4 w-4" />
              Record Payment
            </button>
          </div>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Total Received"
          value={formatMoney(data.total_received)}
          hint={`${data.received_count} payments`}
          tone="success"
          icon={<Icon name="wallet" className="h-5 w-5" />}
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(data.outstanding)}
          hint="Unpaid invoices"
          tone="warning"
          icon={<Icon name="clock" className="h-5 w-5" />}
        />
        <StatCard
          label="Overdue"
          value={formatMoney(data.overdue)}
          hint={`${receivablesData?.by_client?.filter(c => c.overdue_outstanding > 0).length ?? 0} clients`}
          tone="danger"
          icon={<Icon name="alert-circle" className="h-5 w-5" />}
        />
        <StatCard
          label="Total Payments"
          value={data.total_payments}
          hint="All time"
          tone="neutral"
          icon={<Icon name="receipt" className="h-5 w-5" />}
        />
      </div>

      {/* Tab Filter */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1 px-4 py-3 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                tab === t.key
                  ? "px-3 py-2 text-sm font-medium border-b-2 border-sky-600 text-sky-700 dark:border-sky-500"
                  : "px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              }
            >
              {t.label} <span className="ml-1 text-xs">{tabCounts[t.key as keyof typeof tabCounts] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <Card title="Filters" className="p-0">
        <div className="p-3 space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Icon name="search" className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <TextField
                label=""
                placeholder="Search..."
                value={search}
                onChange={setSearch}
              />
            </div>
            <SelectField
              label=""
              value={clientFilter}
              onChange={setClientFilter}
              options={[
                { value: "all", label: "All Clients" },
                ...Array.from(new Map((paymentsAll || []).map(p => [p.client.id, p.client.name])).entries()).map(([id, name]) => ({ value: id, label: name ?? id })),
              ]}
            />
            <SelectField
              label=""
              value={methodFilter}
              onChange={(v) => setMethodFilter(v as "all" | PaymentMethod)}
              options={[
                { value: "all", label: "All Methods" },
                ...PAYMENT_METHODS,
              ]}
            />
            <TextField
              label=""
              type="date"
              value={dateFrom}
              onChange={setDateFrom}
              placeholder="From"
            />
            <TextField
              label=""
              type="date"
              value={dateTo}
              onChange={setDateTo}
              placeholder="To"
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-ghost text-xs px-2 py-1"
              onClick={() => {
                setTab("all");
                setSearch("");
                setClientFilter("all");
                setMethodFilter("all");
                setDateFrom("");
                setDateTo("");
              }}
            >
              <Icon name="x" className="h-3 w-3" />
              Clear
            </button>
          </div>
        </div>
      </Card>

      {/* Payments Table */}
      <Card title="Payments & Receipts" subtitle={`Showing ${payments.length} payments.`}>
        <div className="p-4 overflow-x-auto">
          {payments.length === 0 ? (
            <EmptyState
              title="No payments yet"
              message="Payments recorded against invoices will appear here."
            />
          ) : (
            <div className="min-w-[70rem]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th text-left w-12">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-500">
                        <input type="checkbox" className="h-4 w-4" />
                        Date
                      </label>
                    </th>
                    <th className="th text-left">Client</th>
                    <th className="th text-left">Invoice</th>
                    <th className="th text-left">Payment Method</th>
                    <th className="th text-right">Amount</th>
                    <th className="th text-left">Status</th>
                    <th className="th text-left">Reference No.</th>
                    <th className="th text-right w-14">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <tr key={p.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="td text-xs text-slate-600 dark:text-slate-400">
                        {formatDate(p.date)}
                      </td>
                      <td className="td">
                        <button
                          type="button"
                          onClick={() => {
                            if (p.client.id && p.client.id !== p.invoice.id) {
                              window.location.href = `/clients/${p.client.id}`;
                            } else if (p.invoice.id) {
                              window.location.href = `/invoices/${p.invoice.id}`;
                            }
                          }}
                          className="flex items-center gap-3 hover:opacity-80 text-left"
                        >
                          <span
                            className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium border border-white/20 ${getClientColor(p.client.id)}`}
                          >
                            {(p.client.name ?? "C").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                          </span>
                          <div>
                            <div className="text-xs font-medium text-slate-900 dark:text-white">
                              {p.client.name ?? "Unknown Client"}
                            </div>
                            {p.client.code && (
                              <div className="text-[10px] text-slate-500">{p.client.code}</div>
                            )}
                          </div>
                        </button>
                      </td>
                      <td className="td">
                        <div className="flex flex-col">
                          <div className="text-xs font-medium text-slate-900 dark:text-white font-mono">
                            {p.invoice.number ?? "—"}
                          </div>
                        </div>
                      </td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            <Icon name={METHOD_ICONS[p.method] as any} className="h-3 w-3" />
                          </div>
                          <span className="text-xs text-slate-600 dark:text-slate-400 capitalize">
                            {p.method.replace("_", " ")}
                          </span>
                        </div>
                      </td>
                      <td className="td tabular text-right">
                        <span className="text-xs font-medium text-slate-900 dark:text-white">
                          {formatMoney(p.amount)}
                        </span>
                      </td>
                      <td className="td">
                        <Badge tone={STATUS_CONFIG[p.status].tone as any}>
                          {STATUS_CONFIG[p.status].label}
                        </Badge>
                      </td>
                      <td className="td tabular text-right text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {p.reference ?? "—"}
                      </td>
                      <td className="td text-right">
                        <div className="relative inline-block" ref={openActionId === p.id ? dropdownRef : null}>
                          <button
                            type="button"
                            onClick={() => setOpenActionId(openActionId === p.id ? null : p.id)}
                            className="text-slate-400 hover:text-sky-600 dark:text-slate-500 dark:hover:text-sky-400"
                            aria-label="More actions"
                          >
                            <Icon name="more-vertical" className="h-4 w-4" />
                          </button>
                          {openActionId === p.id && (
                            <div className="absolute right-0 mt-2 w-48 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800 py-2 z-50">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionId(null);
                                  if (p.invoice.id) window.location.href = `/invoices/${p.invoice.id}`;
                                }}
                                className="flex w-full items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                              >
                                <Icon name="eye" className="h-4 w-4" />
                                View Invoice
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionId(null);
                                  if (p.invoice.id) {
                                    issueReceipt.mutate(p.invoice.id);
                                    setTimeout(() => {
                                      window.open(`/api/invoices/${p.invoice.id}/pdf`, '_blank');
                                    }, 500);
                                  }
                                }}
                                className="flex w-full items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                              >
                                <Icon name="download" className="h-4 w-4" />
                                Download Receipt
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionId(null);
                                  if (p.invoice.id) window.location.href = `/invoices/${p.invoice.id}`;
                                }}
                                className="flex w-full items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                              >
                                <Icon name="pencil" className="h-4 w-4" />
                                Edit
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Showing {paymentsAll.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, paymentsAll.length)} of {paymentsAll.length} payments
                </p>
                <div className="flex gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={
                        page === currentPage
                          ? "px-2.5 py-1.5 text-xs rounded-md bg-sky-600 text-white"
                          : "px-2.5 py-1.5 text-xs rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                      }
                    >
                      {page}
                    </button>
                  ))}
                  <button type="button" className="btn-ghost px-3 py-1.5 text-xs" disabled>
                    10 per page
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Record Payment Form */}
      <RecordPaymentDrawer
        open={showRecordDrawer}
        onClose={() => setShowRecordDrawer(false)}
      />
    </div>
  );
}

function getClientColor(clientId: string): string {
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = clientId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CLIENT_COLORS[Math.abs(hash) % CLIENT_COLORS.length];
}
