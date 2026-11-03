"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { IconChip, type ChipTone } from "@/components/charts";
import { AgeingChart } from "@/components/charts-reports";
import { Icon } from "@/components/Icon";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { ageingTone, invoiceStatusLabel, invoiceStatusTone } from "@/lib/status";
import type { ReceivablesSummary } from "@/lib/types";

/**
 * Outstanding fees, how late they are, and who to chase.
 *
 * Every figure is derived at read time by `/billing/receivables`, which is also what the
 * dashboard's financial panel reads — so the two screens cannot disagree about what the
 * firm is owed. In particular `overdue` is computed from the due date and what is still
 * outstanding rather than stored, because a stored flag goes stale silently.
 */
export default function ReceivablesPage() {
  const summary = useQuery({
    queryKey: ["receivables"],
    queryFn: () => api.get<ReceivablesSummary>("/billing/receivables"),
  });

  if (summary.isPending) return <LoadingState label="Working out what is owed…" />;
  if (summary.isError) return <ErrorState message="Could not load receivables." />;

  const data = summary.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Receivables"
        subtitle={`Outstanding fees as at ${formatDate(data.as_of)}. Worst first.`}
        action={
          <Link href="/invoices" className="btn btn-ghost px-5 py-2.5">
            Open invoices
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Invoiced"
          value={formatMoney(data.invoiced_total)}
          hint="Issued invoices only"
        />
        <StatCard label="Collected" value={formatMoney(data.collected_total)} tone="success" />
        <StatCard
          label="Outstanding"
          value={formatMoney(data.outstanding_total)}
          tone={data.outstanding_total > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Overdue"
          value={formatMoney(data.overdue_total)}
          hint={
            data.oldest_overdue
              ? `Worst is ${data.oldest_overdue.days_overdue} days late`
              : "Nothing late"
          }
          tone={data.overdue_total > 0 ? "danger" : "success"}
        />
      </div>

      <Card
        title="Ageing"
        subtitle="Measured from each invoice's due date, not the date it was raised."
      >
        <div className="p-4">
          <AgeingChart
            data={Object.entries(data.ageing).map(([bucket, amount]) => ({
              bucket,
              label:
                bucket === "current"
                  ? "Not yet due"
                  : bucket.split("-").join("-"),
              amount,
              count: data.ageing_counts[bucket] ?? 0,
            }))}
          />
        </div>
      </Card>

      <Card title="By client" subtitle="Who owes what, and how late their worst invoice is.">
        {data.by_client.length === 0 ? (
          <EmptyState message="Nothing is outstanding." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem]">
              <thead className="bg-[#f7f6f3]">
                <tr>
                  <th className="th">Client</th>
                  <th className="th">Invoices</th>
                  <th className="th">Billed</th>
                  <th className="th">Collected</th>
                  <th className="th">Outstanding</th>
                  <th className="th">Of which overdue</th>
                  <th className="th">Worst</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.by_client.map((row) => (
                  <tr key={row.client_id}>
                    <td className="td text-xs">
                      <Link
                        href={`/invoices?client=${row.client_id}`}
                        className="font-medium text-slate-900 underline-offset-2 hover:underline"
                      >
                        {row.client_name ?? "Unknown client"}
                      </Link>
                      <span className="ml-2 font-mono text-slate-400">{row.client_code}</span>
                    </td>
                    <td className="td tabular text-xs">{row.invoice_count}</td>
                    <td className="td tabular text-xs">{formatMoney(row.billed)}</td>
                    <td className="td tabular text-xs">{formatMoney(row.collected)}</td>
                    <td className="td tabular text-xs font-medium">
                      {formatMoney(row.outstanding)}
                    </td>
                    <td className="td tabular text-xs">
                      {row.overdue_outstanding > 0 ? (
                        <span className="font-medium text-rose-700">
                          {formatMoney(row.overdue_outstanding)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="td text-xs">
                      {row.worst_days_overdue > 0 ? (
                        <Badge tone="danger">{row.worst_days_overdue}d late</Badge>
                      ) : (
                        <span className="text-slate-400">On time</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data.oldest_overdue && (
        <Card title="Chase this one first">
          <div className="flex flex-wrap items-center gap-4 p-4">
            <IconChip tone={ageingTone(data.oldest_overdue.ageing_bucket) as ChipTone} size="lg">
              <Icon name="alert-triangle" className="h-5 w-5" />
            </IconChip>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                {data.oldest_overdue.invoice_number ?? "Invoice"} ·{" "}
                {data.oldest_overdue.client_name ?? "Unknown client"}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                {formatMoney(data.oldest_overdue.outstanding)} outstanding, due{" "}
                {formatDate(data.oldest_overdue.due_date)} — {data.oldest_overdue.days_overdue}{" "}
                days late.
              </p>
            </div>
            <Badge tone={invoiceStatusTone(data.oldest_overdue.status)}>
              {invoiceStatusLabel(data.oldest_overdue.status)}
            </Badge>
            <Link href={`/invoices/${data.oldest_overdue.invoice_id}`} className="btn btn-primary px-5 py-2.5">
              Open and send
            </Link>
          </div>
        </Card>
      )}

      {data.notes.length > 0 && (
        <Card title="Notes">
          <ul className="list-disc space-y-1 px-8 py-4 text-xs text-slate-600">
            {data.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}