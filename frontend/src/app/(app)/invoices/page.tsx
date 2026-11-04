"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, type Variants } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
  FileText, Wallet, AlertCircle, Layers, Plus,
  Search, CalendarDays, ChevronDown,
  Zap, Settings, CreditCard, Receipt, ArrowUpRight,
} from "lucide-react";

import { GenerateInvoicesPanel, NewInvoiceForm, InvoiceRowActions } from "@/components/BillingForms";
import { InvoiceDetailDrawer } from "@/components/InvoiceDetailDrawer";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui";
import { Icon, type IconName } from "@/components/Icon";
import { cn, formatDate, formatMoney } from "@/lib/format";
import { api, buildQuery } from "@/lib/api";
import { useDebouncedValue, usePaging } from "@/lib/hooks";
import { invoiceStatusLabel, invoiceStatusTone } from "@/lib/status";
import type { BillingSummary, Invoice, Page } from "@/lib/types";

const stats = [
  { label: "Fees Invoiced", value: "₹3,000.00", sub: "1 invoice(s)", icon: FileText, color: "violet" },
  { label: "Fees Collected", value: "₹4,000.00", sub: "Payments received", icon: Wallet, color: "green" },
  { label: "Outstanding", value: "₹47,000.00", sub: "Pending collection", icon: AlertCircle, color: "rose" },
  { label: "Unbilled Work", value: "₹0.00", sub: "0 completed tasks", icon: Layers, color: "blue" },
];

const statusStyle: Record<string, string> = {
  Paid: "bg-emerald-50 text-emerald-700",
  "Partially Paid": "bg-amber-50 text-amber-700",
  Overdue: "bg-rose-50 text-rose-700",
  Sent: "bg-blue-50 text-blue-700",
  Draft: "bg-slate-100 text-slate-600",
};

export default function BillingOverview() {
  const paging = usePaging(10);
  const { filters, updateFilter, offset, setOffset, limit, page } = paging;
  const search = useDebouncedValue(filters.search ?? "");

  const [tab, setTab] = useState("all");
  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const queryClient = useQueryClient();
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [openTab, setOpenTab] = useState<string>("lines");

  const issueReceipt = useMutation({
    mutationFn: (invoiceId: string) => api.post(`/invoices/${invoiceId}/receipt`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoice"] });
    },
  });

  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("new") === "1") {
        setAdding(true);
      }
    }
  }, []);

  const scope = {
    search,
    client_id: filters.client_id,
    date_from: filters.date_from,
    date_to: filters.date_to,
  };

  const summary = useQuery({
    queryKey: ["invoices", "summary", scope],
    queryFn: () =>
      api.get<BillingSummary>(
        `/invoices/summary${buildQuery({
          search,
          client_id: filters.client_id,
          date_from: filters.date_from,
          date_to: filters.date_to,
        })}`,
      ),
  });

  const invoices = useQuery({
    queryKey: ["invoices", "list", { ...scope, tab, offset, limit }],
    queryFn: () =>
      api.get<Page<Invoice>>(
        `/invoices${buildQuery({
          search,
          client_id: filters.client_id,
          date_from: filters.date_from,
          date_to: filters.date_to,
          group: tab === "all" || tab === "credit_notes" ? undefined : tab,
          limit,
          offset,
        })}`,
      ),
  });

  const rows = invoices.data?.items ?? [];
  const s = summary.data;
  const total = invoices.data?.meta?.total ?? 0;
  const hasMore = invoices.data?.meta?.has_more ?? offset + limit < total;

  function changeTab(key: string) {
    setTab(key);
    setOffset(0);
  }

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <main className="min-h-screen bg-[#f7f8fd] p-5 lg:p-8 text-[#17172f]">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Finance / Billing</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Billing & Invoices
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Create, manage and track invoices, payments and receivables.
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700" onClick={() => setAdding(true)}>
          <Plus className="h-5 w-5" /> New Invoice
        </button>
      </header>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, sub, icon: Icon, color }) => (
          <article key={label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <h2 className="mt-3 text-2xl font-bold tracking-tight">{value}</h2>
                <p className="mt-1 text-xs text-slate-400">{sub}</p>
              </div>
              <div className={`rounded-xl p-3 ${
                color === "violet" ? "bg-violet-50 text-violet-600" :
                color === "green" ? "bg-emerald-50 text-emerald-600" :
                color === "rose" ? "bg-rose-50 text-rose-600" :
                "bg-blue-50 text-blue-600"
              }`}>
                <Icon size={22} />
              </div>
            </div>
          </article>
        ))}
      </section>

      <nav className="mb-5 flex flex-wrap gap-2 border-b border-slate-200">
        {[
          ["Invoices", Receipt], ["Payments", Wallet],
          ["Receivables", CreditCard], ["Generate Invoices", FileText],
          ["Settings", Settings],
        ].map(([label, Icon]: any, index) => (
          <button key={label} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${
            index === 0 ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-800"
          }`} onClick={() => changeTab(index === 0 ? "all" : index === 1 ? "payments" : index === 2 ? "receivables" : index === 3 ? "generate" : "settings")}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </nav>

      {summary.isError && (
        <ErrorState message={summary.error instanceof Error ? summary.error.message : "Could not load the billing figures."} />
      )}

      {generating && <GenerateInvoicesPanel />}
      {adding && (
        <NewInvoiceForm
          onClose={() => setAdding(false)}
          onDone={(invoiceId) => { setAdding(false); setOpenInvoiceId(invoiceId); }}
        />
      )}

      <section className="grid gap-5 md:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Invoices</h2>
              <p className="text-sm text-slate-500">All your practice invoices</p>
            </div>
            <button className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700" onClick={() => setAdding(true)}>
              <Plus size={17} /> New Invoice
            </button>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 md:col-span-2">
              <Search size={17} className="text-slate-400" />
              <input placeholder="Search invoice or client..." value={filters.search ?? ""} onChange={(event) => updateFilter("search", event.target.value)} className="w-full bg-transparent text-sm outline-none" />
            </div>
            {["All Status", "All Clients", "All Dates"].map((item, i) => (
              <button key={item} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600">
                <span className="flex items-center gap-2">
                  {i === 2 && <CalendarDays size={15} />}
                  {item}
                </span>
                <ChevronDown size={15} />
              </button>
            ))}
          </div>

        <div className="overflow-y-auto max-h-[380px] pr-2">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {["Invoice No.", "Client", "Invoice Date", "Amount", "Status", ""].map(x => (
                    <th key={x} className="px-3 py-3 font-semibold">{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
<tr key={row.id} className="border-b border-slate-100 transition hover:bg-violet-50/40" onClick={() => setOpenInvoiceId(row.id)}>
                  <td className="px-3 py-4 font-semibold text-violet-700">{row.invoice_number ?? "(draft)"}</td>
                  <td className="px-3 py-4 font-medium">{row.client_name ?? "—"}</td>
                  <td className="px-3 py-4 text-slate-500">{formatDate(row.invoice_date)}</td>
                  <td className="px-3 py-4 font-semibold tabular-nums">{formatMoney(row.total)}</td>
                  <td className="px-3 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[`${row.status.charAt(0).toUpperCase() + row.status.slice(1)}`]}`}>{row.status.charAt(0).toUpperCase() + row.status.slice(1)}</span>
                  </td>
                  <td className="px-3 py-4 text-slate-400" onClick={(e) => e.stopPropagation()}>
                    <InvoiceRowActions
                      invoice={row}
                      onOpen={() => setOpenInvoiceId(row.id)}
                      onChanged={() => void invoices.refetch()}
                      receiptBtn={row.status === "paid" && row.outstanding <= 0 ? { pending: false, on: () => {} } : undefined}
                    />
                  </td>
                </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <span>Showing {offset + 1} to {Math.min(offset + rows.length, rows.length)} of {rows.length} invoices</span>
            <div className="flex items-center gap-2">
              <button className="rounded-lg border px-3 py-2">‹</button>
              <button className="rounded-lg bg-violet-600 px-3 py-2 font-semibold text-white">1</button>
              <button className="rounded-lg border px-3 py-2">›</button>
            </div>
          </div>
        </Card>

        <aside className="space-y-5">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
              <Zap className="text-violet-600 h-5 w-5" /> Quick Actions
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "New Invoice", icon: FileText, action: () => setAdding(true) },
                { label: "Generate Invoices", icon: Layers, action: () => setGenerating(true) },
                { label: "Record Payment", icon: Wallet, action: () => router.push("/receivables") },
                { label: "Billing Settings", icon: Settings, action: () => router.push("/invoices/settings") },
              ].map(({ label, icon: Icon, action }) => (
                <button key={label} onClick={action} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-violet-100 bg-violet-50/40 p-3 text-center text-xs font-semibold transition hover:border-violet-300 hover:bg-violet-50">
                  <Icon className="h-6 w-6 text-violet-600" />
                  {label}
                </button>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Invoice Summary</h2>
            <p className="mb-5 text-xs text-slate-500">Financial year overview</p>
            <div className="flex items-center gap-5">
              <div className="relative grid h-32 w-32 shrink-0 place-items-center rounded-full"
                style={{ background: "conic-gradient(#7c3aed 0 20%, #3b82f6 20% 40%, #f59e0b 40% 60%, #a78bfa 60% 80%, #10b981 80% 100%)" }}>
                <div className="grid h-20 w-20 place-items-center rounded-full bg-white">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{s?.invoiced_count ?? rows.length}</p>
                    <p className="text-[10px] text-slate-500">Invoices</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3 text-xs">
                {(s?.by_status ?? []).map((row) => {
                  const colorMap: Record<string, string> = {
                    paid: "bg-emerald-500",
                    partially_paid: "bg-amber-500",
                    overdue: "bg-violet-400",
                    draft: "bg-slate-400",
                    issued: "bg-blue-500",
                    sent: "bg-blue-500",
                  };
                  return (
                    <div key={row.status} className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${colorMap[row.status] ?? "bg-slate-400"}`} />
                      <span className="text-slate-600">{row.label}</span>
                      <strong className="ml-auto">{row.percent}%</strong>
                    </div>
                  );
                })}
              </div>
            </div>
          </article>
        </aside>
      </section>

      {openInvoiceId && (
        <InvoiceDetailDrawer
          invoiceId={openInvoiceId}
          onClose={() => {
            setOpenInvoiceId(null);
            setOpenTab("lines");
          }}
          initialTab={openTab as any}
        />
      )}
    </main>
  );
}
