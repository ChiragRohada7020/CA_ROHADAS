"use client";

import { PageHeader } from "@/components/ui";
import { BillingSettingsForm } from "@/components/BillingForms";

export default function BillingSettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Billing Settings" subtitle="Invoice numbering, firm details, payment terms, GST defaults, and templates." />
      <BillingSettingsForm />
    </div>
  );
}
