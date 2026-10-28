"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { EmptyState, LoadingState } from "@/components/ui";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { Invoice } from "@/lib/types";

export function CreditNoteList() {
  const creditNotes = useQuery({
    queryKey: ["credit-notes"],
    queryFn: () => api.get<any[]>("/credit-notes"),
  });

  if (creditNotes.isPending) return <LoadingState label="Loading credit notes…" />;
  if (creditNotes.isError) return <EmptyState message="Could not load credit notes." />;

  const rows = creditNotes.data ?? [];
  if (rows.length === 0) {
    return <EmptyState message="No credit notes have been raised yet." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem]">
        <thead className="bg-slate-50">
          <tr>
            <th className="th">#</th>
            <th className="th">Invoice</th>
            <th className="th">Client</th>
            <th className="th">Status</th>
            <th className="th text-right">Amount</th>
            <th className="th">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((cn) => (
            <tr key={cn.id} className="dashboard-row">
              <td className="td text-xs text-slate-500">{cn.note_number ?? "—"}</td>
              <td className="td">
                {cn.invoice_id ? <Link href={`/invoices/${cn.invoice_id}`} className="text-sky-700 hover:underline">{cn.invoice_number ?? cn.invoice_id}</Link> : "—"}
              </td>
              <td className="td text-slate-600">{cn.client_name ?? cn.client_id}</td>
              <td className="td">{cn.status}</td>
              <td className="td tabular text-right text-slate-800">{formatMoney(cn.total)}</td>
              <td className="td text-xs text-slate-500">{cn.created_at ? new Date(cn.created_at).toLocaleDateString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
