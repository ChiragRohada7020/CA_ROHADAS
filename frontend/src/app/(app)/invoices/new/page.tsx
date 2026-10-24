"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { CreateInvoiceForm } from "@/components/CreateInvoiceForm";
import { ErrorState, LoadingState } from "@/components/ui";
import { api } from "@/lib/api";
import type { InvoiceDetail } from "@/lib/types";

/**
 * Create / Edit Invoice page.
 *
 * When `?edit={id}` is present, the page loads the existing draft and opens the
 * form in edit mode. Without it, a fresh invoice is created.
 *
 * This is the full-screen editor with a live preview. The invoices list page
 * toggles a simpler inline `NewInvoiceForm`; this route is the complete workflow.
 */
export default function NewInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams?.get("edit");
  const [created, setCreated] = useState<InvoiceDetail | null>(null);

  const existing = useQuery({
    queryKey: ["invoice", editId ?? null],
    queryFn: () => api.get<InvoiceDetail>(`/invoices/${editId}`),
    enabled: !!editId,
    staleTime: 60 * 1000,
  });

  const handleDone = (invoice: InvoiceDetail) => {
    router.push(`/invoices/${invoice.id}`);
  };

  const handleCreateDone = (invoice: InvoiceDetail) => {
    setCreated(invoice);
  };

  // Edit mode: load the existing draft
  if (editId) {
    if (existing.isPending) return <LoadingState label="Loading draft…" />;
    if (existing.isError) return <ErrorState message="Could not load this draft invoice." />;

    return (
      <CreateInvoiceForm initial={existing.data!} onDone={handleDone} />
    );
  }

  // Create mode: show the form, allow staying on the page after saving
  return (
    <CreateInvoiceForm
      key={created?.id ?? "new"}
      onDone={handleCreateDone}
    />
  );
}
