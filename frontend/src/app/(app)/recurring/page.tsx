"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Card, EmptyState, LoadingState, ErrorState, Button } from "@/components/ui";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";

interface Schedule {
  id: string;
  client_id: string;
  frequency: string;
  fee: number;
  status: string;
  next_billing_date: string | null;
}

export default function RecurringPage() {
  const qc = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["recurring-schedules"],
    queryFn: () => api.get<Schedule[]>("/billing/recurring-schedules"),
  });

  const [clientId, setClientId] = useState("");
  const [fee, setFee] = useState("");
  const [frequency, setFrequency] = useState("monthly");

  const create = useMutation({
    mutationFn: () =>
      api.post("/billing/recurring-schedules", {
        client_id: clientId,
        fee: Number(fee),
        frequency,
        next_billing_date: new Date().toISOString(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["recurring-schedules"] });
      setClientId("");
      setFee("");
    },
  });

  const generate = useMutation({
    mutationFn: (id: string) => api.post(`/billing/recurring-schedules/${id}/generate`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["recurring-schedules"] }),
  });

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Failed"} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Recurring Billing" subtitle="Manage recurring billing schedules." />
      <Card title="Create schedule" className="p-4">
        <div className="flex flex-wrap gap-3">
          <input className="rounded border px-3 py-2 text-sm" placeholder="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Fee" type="number" value={fee} onChange={(e) => setFee(e.target.value)} />
          <select className="rounded border px-3 py-2 text-sm" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="half_yearly">Half-yearly</option>
            <option value="annual">Annual</option>
          </select>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !clientId || !fee}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </div>
      </Card>
      <Card title="Schedules">
        {(data ?? []).length === 0 ? (
          <EmptyState message="No recurring schedules yet." />
        ) : (
          <ul className="divide-y">
            {(data ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{s.frequency} · {formatMoney(s.fee)}</p>
                  <p className="text-xs text-slate-500">Next: {s.next_billing_date ? new Date(s.next_billing_date).toLocaleDateString() : "—"} · {s.status}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => generate.mutate(s.id)} disabled={generate.isPending || s.status !== "active"}>
                  Generate invoice
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
