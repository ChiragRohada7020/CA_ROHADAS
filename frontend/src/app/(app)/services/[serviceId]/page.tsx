"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { ChecklistEditor } from "@/components/ChecklistEditor";
import { EditServiceForm } from "@/components/ServiceForms";
import { api } from "@/lib/api";
import { formatDate, formatMoney, humanise } from "@/lib/format";
import type { ServiceDetailRow } from "@/lib/types";

/**
 * One service: its fees, its checklist, and who has bought it.
 *
 * The checklist shown here is the service's task templates' steps — the same steps
 * that get copied onto every task generated for it. Editing them changes future work
 * only.
 */
export default function ServiceDetailPage() {
  const params = useParams<{ serviceId: string }>();
  const serviceId = params.serviceId;

  const service = useQuery({
    queryKey: ["service", serviceId],
    queryFn: () => api.get<ServiceDetailRow>(`/services/${serviceId}`),
  });

  if (service.isPending) return <LoadingState label="Loading the service…" />;
  if (service.isError) return <ErrorState message="Could not load this service." />;

  const row = service.data;
  const stepCount = (row.templates ?? []).reduce((total, tpl) => total + tpl.steps.length, 0);
  const mandatory = (row.templates ?? []).reduce(
    (total, tpl) => total + tpl.steps.filter((step) => step.is_mandatory).length,
    0,
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={row.name}
        subtitle={`${humanise(row.category)}${row.description ? ` · ${row.description}` : ""}`}
        action={
          <Link href="/services" className="btn btn-ghost">
            Back to services
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-slate-500">{row.code}</span>
        <Badge tone={row.is_active ? "success" : "neutral"}>
          {row.is_active ? "Active" : "Retired"}
        </Badge>
        {row.is_recurring ? (
          <Badge tone="info">Recurring · {humanise(row.default_frequency ?? "not set")}</Badge>
        ) : (
          <Badge tone="neutral">On request</Badge>
        )}
        <Badge tone="neutral">Default priority: {row.default_priority}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Clients"
          value={row.client_count}
          hint="Currently taking this service"
        />
        <StatCard
          label="Billing method"
          value={row.default_fee_model ? humanise(row.default_fee_model) : "Not set"}
          tone={row.default_fee_model ? "success" : "warning"}
        />
        <StatCard
          label="Standard fee"
          value={row.standard_fee !== null ? formatMoney(row.standard_fee) : "Not set"}
          tone={row.standard_fee !== null ? "success" : "warning"}
        />
        <StatCard
          label="Checklist"
          value={`${mandatory}/${stepCount}`}
          hint="Mandatory of total steps"
        />
      </div>

      <Card title="Fees and settings" subtitle="Only the fields you change are saved">
        <EditServiceForm service={row} />
      </Card>

      <Card
        title="Checklist and milestones"
        subtitle="Copied onto each task generated for this service"
      >
        {row.templates?.length === 0 ? (
          <EmptyState message="No task template is linked to this service, so no checklist has been defined and no recurring work will be generated for it." />
        ) : (
          row.templates?.map((template) => (
            <ChecklistEditor key={template.id} template={template} />
          ))
        )}
      </Card>

      <Card
        title="Clients taking this service"
        subtitle={`${row.clients.length} link(s)`}
      >
        {row.clients.length === 0 ? (
          <EmptyState message="No client has taken this service yet." />
        ) : (
          <ClientList clients={row.clients} />
        )}
      </Card>
    </div>
  );
}

function ClientList({ clients }: { clients: ServiceDetailRow["clients"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem]">
        <thead className="bg-slate-50">
          <tr>
            <th className="th">Client</th>
            <th className="th">Status</th>
            <th className="th">Taken since</th>
            <th className="th">Service link</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {clients.map((client) => (
            <tr key={`${client.client_id}-${client.start_date ?? "none"}`}>
              <td className="td">
                <Link
                  href={`/clients/${client.client_id}`}
                  className="font-medium text-slate-900 underline-offset-2 hover:underline"
                >
                  {client.legal_name}
                </Link>
                <span className="block font-mono text-xs text-slate-400">
                  {client.client_code}
                </span>
              </td>
              <td className="td">
                <Badge tone={client.client_status === "active" ? "success" : "neutral"}>
                  {humanise(client.client_status)}
                </Badge>
              </td>
              <td className="td text-xs">{formatDate(client.start_date)}</td>
              <td className="td">
                <Badge tone={client.link_is_active ? "success" : "neutral"}>
                  {client.link_is_active ? "Active" : "Ended"}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
