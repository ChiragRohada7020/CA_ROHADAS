"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Card, EmptyState, LoadingState } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { Page, RecurringSchedule } from "@/lib/types";

export default function RecurringBillingPage() {
  const queryClient = useQueryClient();
  const schedules = useQuery({
    queryKey: ["billing", "recurring"],
    queryFn: () => api.get<{ items: RecurringSchedule[] }>("/billing/recurring"),
  });

  const active = schedules.data?.items ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Recurring Billing"
        subtitle="Generate recurring monthly or annual bills for regular CA services."
        action={
          <button type="button" className="btn-primary" disabled>
            <Icon name="plus" className="h-4 w-4" />
            New Schedule
          </button>
        }
      />
      <Card title="Recurring Schedules" subtitle="Active and upcoming recurring bills.">
        <div className="p-4">
          {schedules.isPending && <LoadingState label="Loading schedules…" />}
          {schedules.isError && <EmptyState message="Could not load schedules." />}
          {!schedules.isPending && active.length === 0 && <EmptyState message="No recurring schedules found." />}
          {active.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem]">
                <thead>
                  <tr>
                    <th className="th">Client</th>
                    <th className="th">Frequency</th>
                    <th className="th text-right">Fee</th>
                    <th className="th">Next Run</th>
                    <th className="th">Status</th>
                    <th className="th w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {active.map((s) => (
                    <tr key={s.id} className="dashboard-row">
                      <td className="td">{s.client_name ?? s.client_id}</td>
                      <td className="td text-sm text-slate-600">{s.frequency}</td>
                      <td className="td tabular text-right">{formatMoney(s.fee)}</td>
                      <td className="td text-xs text-slate-500">{s.next_billing_date ? new Date(s.next_billing_date).toLocaleDateString() : "—"}</td>
                      <td className="td">{s.status}</td>
                      <td className="td">
                        <button type="button" className="btn-ghost" disabled>
                          <Icon name="plus" className="h-4 w-4" />
                          Generate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
