"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { InvoiceSheet } from "@/components/InvoiceSheet";
import { ErrorState, LoadingState } from "@/components/ui";
import { api } from "@/lib/api";
import type { InvoiceDetail } from "@/lib/types";

/**
 * The client's view of an invoice, opened from the link the firm sent.
 *
 * No sign-in, no app shell, and no navigation to anything else — the endpoint behind it
 * resolves exactly one invoice from a 256-bit token and there is nothing else reachable
 * from here. A cancelled invoice or a withdrawn link returns 404, so a link that was
 * handed out in error can be taken back.
 */
export default function SharedInvoicePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const invoice = useQuery({
    queryKey: ["public-invoice", token],
    queryFn: () => api.get<InvoiceDetail>(`/public/invoices/${token}`),
    retry: false,
  });

  if (invoice.isPending) return <LoadingState label="Loading your invoice…" />;

  if (invoice.isError) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-slate-900">This invoice link is not valid</h1>
        <p className="mt-2 text-sm text-slate-600">
          It may have been withdrawn, or the invoice cancelled. Please ask the firm for a
          current link.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <div className="no-print mx-auto mb-4 max-w-[210mm] px-6">
        <p className="text-xs text-slate-500">
          Please quote{" "}
          <span className="font-mono">{invoice.data.invoice_number ?? "this invoice"}</span> when
          making payment.
        </p>
      </div>
      <div className="mx-auto max-w-[210mm] px-2 sm:px-6">
        <InvoiceSheet invoice={invoice.data} />
      </div>
    </div>
  );
}