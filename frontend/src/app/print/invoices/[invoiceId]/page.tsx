"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { InvoiceSheet } from "@/components/InvoiceSheet";
import { ErrorState, LoadingState } from "@/components/ui";
import { api } from "@/lib/api";
import type { InvoiceDetail, InvoiceTemplate } from "@/lib/types";

/**
 * The invoice, ready to print.
 *
 * Deliberately outside the `(app)` route group so there is no sidebar or header to
 * suppress — the print stylesheet then only has to deal with the page itself. The
 * button below is marked `no-print`, so printing from here yields the invoice alone,
 * which is what "print with the firm's letterhead" has to mean.
 */
export default function InvoicePrintPage() {
  const params = useParams<{ invoiceId: string }>();
  const invoiceId = params.invoiceId;
  const searchParams = useSearchParams();

  const invoice = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => api.get<InvoiceDetail>(`/invoices/${invoiceId}`),
  });

  const templateParam = searchParams.get("template");
  const template = (templateParam ?? "modern") as InvoiceTemplate;

  if (invoice.isPending) return <LoadingState label="Preparing the invoice…" />;
  if (invoice.isError) return <ErrorState message="Could not load this invoice." />;

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-6">
        <div>
          <p className="text-sm font-medium text-slate-800">
            {invoice.data.invoice_number ?? "Draft invoice"}
          </p>
          <p className="text-xs text-slate-500">
            Template: {template} · Use your browser&apos;s Print, then choose &quot;Save as PDF&quot; to keep a copy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/invoices/${invoiceId}`} className="btn btn-ghost px-5 py-2.5">
            Back to the invoice
          </Link>
          <button type="button" className="btn btn-primary px-5 py-2.5" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[210mm] px-2 sm:px-6">
        <InvoiceSheet invoice={invoice.data} template={template} />
      </div>
    </div>
  );
}