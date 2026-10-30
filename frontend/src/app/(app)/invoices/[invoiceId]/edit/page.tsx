"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { CreateInvoiceForm } from "@/components/CreateInvoiceForm";
import { LoadingState, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import type { InvoiceDetail } from "@/lib/types";

/**
 * Edit an existing draft invoice.
 *
 * Reuses the same CreateInvoiceForm as the new-invoice page — it just passes
 * the loaded invoice as `initial`, which switches the form into edit mode
 * (PATCH instead of POST, "Update and send" instead of "Create and send").
 * Only drafts can be edited; the form itself refuses to submit for issued
 * invoices, and the backend rejects the PATCH with a clear error.
 */
export default function EditInvoicePage() {
  const router = useRouter();
  // The route param is the invoice id; Next.js gives it to us via the
  // dynamic segment name, so we read it from the URL directly.
  const segments = typeof window !== "undefined" ? window.location.pathname.split("/") : [];
  const invoiceId = segments[segments.length - 1];

  const invoice = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => api.get<InvoiceDetail>(`/invoices/${invoiceId}`),
  });

  // Redirect to the detail page if the invoice is not a draft — editing an
  // issued invoice is not allowed, and the detail page says so.
  useEffect(() => {
    if (invoice.data && invoice.data.status !== "draft") {
      router.replace(`/invoices/${invoiceId}`);
    }
  }, [invoice.data, invoiceId, router]);

  if (invoice.isPending)
    return (
      <div className="space-y-4">
        <PageHeader title="Edit invoice" subtitle="Loading the draft…" />
        <LoadingState label="Loading the draft…" />
      </div>
    );
  if (invoice.isError || !invoice.data)
    return (
      <div className="space-y-4">
        <PageHeader title="Edit invoice" subtitle="Could not load the draft." />
      </div>
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Edit invoice"
        subtitle={`Draft ${invoice.data.invoice_number ?? "(unnumbered)"}`}
        action={
          <button type="button" className="btn btn-ghost px-5 py-2.5" onClick={() => router.push(`/invoices/${invoiceId}`)}>
            Back to invoice
          </button>
        }
      />
      <div className="h-[calc(100vh-8rem)]">
        <CreateInvoiceForm
          initial={invoice.data}
          onDone={(id) => router.push(`/invoices/${id}`)}
          onClose={() => router.push(`/invoices/${invoiceId}`)}
        />
      </div>
    </div>
  );
}