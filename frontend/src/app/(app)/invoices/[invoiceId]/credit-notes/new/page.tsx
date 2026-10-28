"use client";

import { PageHeader } from "@/components/ui";
import Link from "next/link";
import { useParams } from "next/navigation";

import { CreditNoteForm } from "@/components/BillingForms";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { InvoiceDetail } from "@/lib/types";

export default function NewCreditNotePage() {
  const params = useParams<{ invoiceId: string }>();
  const invoiceId = params?.invoiceId as string;

  const invoice = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => api.get<InvoiceDetail>(`/invoices/${invoiceId}`),
  });

  if (invoice.isPending)
    return (
      <div className="space-y-4">
        <PageHeader
          title="Raise Credit Note"
          subtitle="Create a credit note against the invoice."
        />
        <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
          Loading invoice…
        </div>
      </div>
    );
  if (invoice.isError)
    return (
      <div className="space-y-4">
        <PageHeader
          title="Raise Credit Note"
          subtitle="Create a credit note against the invoice."
        />
        <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
          Could not load invoice. {invoice.error?.message}
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Raise Credit Note"
        subtitle="Create a credit note against the invoice."
        action={
          <Link href={`/invoices/${invoiceId}`} className="btn-ghost">
            Back to invoice
          </Link>
        }
      />
      <CreditNoteForm invoice={invoice.data!} />
    </div>
  );
}
