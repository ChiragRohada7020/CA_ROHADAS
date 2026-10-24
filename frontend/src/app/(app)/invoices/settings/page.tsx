"use client";

import Link from "next/link";

import { BillingSettingsForm } from "@/components/BillingForms";
import { Card, PageHeader } from "@/components/ui";

/**
 * The firm's own billing identity — the letterhead and the tax details.
 *
 * Kept separate from the invoice list because it is set once and then forgotten, and
 * because getting it wrong makes every invoice wrong rather than one.
 */
export default function BillingSettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Firm billing details"
        subtitle="The letterhead printed on every invoice, and the state code that decides GST."
        action={
          <Link href="/invoices" className="btn-ghost">
            Back to invoices
          </Link>
        }
      />

      <BillingSettingsForm />

      <Card title="How GST is decided">
        <ul className="list-disc space-y-2 px-8 py-4 text-sm text-slate-600">
          <li>
            The firm must have a <strong>GSTIN</strong> for any tax to be charged. With no
            GSTIN on file, invoices carry no GST at all.
          </li>
          <li>
            The tax on each invoice is decided by comparing the firm&apos;s{" "}
            <strong>state code</strong> with the client&apos;s. The same state gives CGST +
            SGST; a different state gives IGST.
          </li>
          <li>
            That makes the client&apos;s state code a billing field, not just an address
            detail — an invoice raised for a client without one says so, and the state can
            still be filled in while the invoice is a draft.
          </li>
          <li>
            <strong>SAC</strong> codes default to 9982 (legal and accounting services) and
            can be narrowed per service in the catalogue — an audit and a tax return are
            different supplies.
          </li>
          <li>
            Invoice numbers are allocated when an invoice is <strong>issued</strong>, not
            when it is created, so an abandoned draft leaves no gap in the series.
          </li>
        </ul>
      </Card>
    </div>
  );
}