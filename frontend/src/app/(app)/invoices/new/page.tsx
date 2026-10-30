"use client";

import { PageHeader } from "@/components/ui";
import { CreateInvoiceForm } from "@/components/CreateInvoiceForm";
import { useRouter } from "next/navigation";

/**
 * Full-page invoice creation with live split-pane preview.
 *
 * This is the "raise an invoice" surface — distinct from the slide-over
 * `NewInvoiceForm` on the invoices list page. The split-pane layout puts the
 * form and the live preview side by side, so every keystroke is reflected
 * immediately in the rendered invoice.
 */
export default function NewInvoicePage() {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <PageHeader
        title="New invoice"
        subtitle="Create a sale invoice with a live preview."
        action={
          <button type="button" className="btn btn-ghost px-5 py-2.5" onClick={() => router.push("/invoices")}>
            Back to invoices
          </button>
        }
      />
      <div className="h-[calc(100vh-8rem)]">
        <CreateInvoiceForm
          onDone={(invoice) => router.push(`/invoices/${invoice.id}`)}
          onClose={() => router.push("/invoices")}
        />
      </div>
    </div>
  );
}
