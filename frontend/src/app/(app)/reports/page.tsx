"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  ProgressBar,
  StatCard,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { formatDate, formatHours, formatMoney, formatPercent, humanise } from "@/lib/format";
import {
  ageingTone,
  daysRemainingLabel,
  daysRemainingTone,
  riskTone,
  utilisationTone,
} from "@/lib/status";
import type {
  BottleneckReport,
  ClientRiskRow,
  ClientServiceStatusReport,
  DeadlineAlertRow,
  ProductivityReport,
  ReceivablesSummary,
  ServiceTurnaroundRow,
  WeeklyChangeSummary,
  WorkloadRow,
} from "@/lib/types";

export default function ReportsPage() {
  const weekly = useQuery({
    queryKey: ["reports", "weekly-change"],
    queryFn: () => api.get<WeeklyChangeSummary>("/reports/weekly-change"),
  });

  const workload = useQuery({
    queryKey: ["reports", "workload"],
    queryFn: () => api.get<WorkloadRow[]>("/reports/workload"),
  });

  const atRisk = useQuery({
    queryKey: ["reports", "at-risk"],
    queryFn: () => api.get<ClientRiskRow[]>("/reports/at-risk-clients"),
  });

  const turnaround = useQuery({
    queryKey: ["reports", "turnaround"],
    queryFn: () => api.get<ServiceTurnaroundRow[]>("/reports/service-turnaround"),
  });

  const deadlines = useQuery({
    queryKey: ["reports", "upcoming-deadlines"],
    queryFn: () => api.get<DeadlineAlertRow[]>("/reports/upcoming-deadlines?days=30"),
  });

  const productivity = useQuery({
    queryKey: ["reports", "productivity"],
    queryFn: () => api.get<ProductivityReport>("/reports/productivity"),
  });

  const bottlenecks = useQuery({
    queryKey: ["reports", "bottlenecks"],
    queryFn: () => api.get<BottleneckReport>("/reports/bottlenecks"),
  });

  const clientServices = useQuery({
    queryKey: ["reports", "client-services"],
    queryFn: () => api.get<ClientServiceStatusReport>("/reports/client-services"),
  });

  const receivables = useQuery({
    queryKey: ["receivables"],
    queryFn: () => api.get<ReceivablesSummary>("/billing/receivables"),
  });

  const firstError = [
    weekly,
    workload,
    atRisk,
    turnaround,
    deadlines,
    productivity,
    bottlenecks,
    clientServices,
    receivables,
  ].find((entry) => entry.isError);


  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        subtitle="Every figure is derived at read time. Nothing here is a stored counter."
      />

      {firstError && (
        <ErrorState
          message={
            firstError.error instanceof ApiError
              ? firstError.error.message
              : "Some reports could not be loaded."
          }
        />
      )}

      <Card
        title="What changed this week"
        subtitle={
          weekly.isSuccess
            ? `${formatDate(weekly.data.from_date)} to ${formatDate(weekly.data.to_date)}`
            : undefined
        }
      >
        {weekly.isPending && <LoadingState />}
        {weekly.isSuccess && (
          <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
            <StatCard label="Tasks created" value={weekly.data.tasks_created} />
            <StatCard
              label="Tasks completed"
              value={weekly.data.tasks_completed}
              tone="success"
            />
            <StatCard label="Tasks filed" value={weekly.data.tasks_filed} tone="progress" />
            <StatCard
              label="Newly overdue"
              value={weekly.data.tasks_newly_overdue}
              tone={weekly.data.tasks_newly_overdue > 0 ? "danger" : "success"}
            />
            <StatCard
              label="Overdue change"
              value={`${weekly.data.overdue_delta > 0 ? "+" : ""}${weekly.data.overdue_delta}`}
              hint="Versus the start of the window"
              tone={
                weekly.data.overdue_delta > 0
                  ? "danger"
                  : weekly.data.overdue_delta < 0
                    ? "success"
                    : "neutral"
              }
            />
            <StatCard label="Documents received" value={weekly.data.documents_received} />
            <StatCard label="Documents requested" value={weekly.data.documents_requested} />
            <StatCard label="New clients" value={weekly.data.new_clients} tone="info" />
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card
          title="Workload"
          subtitle="Effort-weighted hours against capacity — not a task count"
        >
          {workload.isPending && <LoadingState />}
          {workload.isSuccess && workload.data.length === 0 && (
            <EmptyState message="No staff to show." />
          )}
          {workload.isSuccess && workload.data.length > 0 && (
            <div className="max-h-72 overflow-auto">
              <table className="w-full min-w-[30rem]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Person</th>
                    <th className="th">Open</th>
                    <th className="th">Overdue</th>
                    <th className="th">Load</th>
                    <th className="th">Utilisation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workload.data.map((row) => (
                    <tr key={row.user_id}>
                      <td className="td font-medium text-slate-900">{row.full_name}</td>
                      <td className="td tabular">{row.open_tasks}</td>
                      <td className="td tabular">
                        {row.overdue_tasks > 0 ? (
                          <span className="font-medium text-rose-700">{row.overdue_tasks}</span>
                        ) : (
                          0
                        )}
                      </td>
                      <td className="td tabular text-xs">
                        {formatHours(row.weighted_load_hours)}
                        <span className="text-slate-400">
                          {" / "}
                          {formatHours(row.capacity_hours)}
                        </span>
                      </td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <ProgressBar
                            percent={row.utilisation_percent}
                            tone={utilisationTone(row.utilisation_percent)}
                            className="w-16"
                          />
                          <span className="tabular text-xs text-slate-600">
                            {formatPercent(row.utilisation_percent)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Service turnaround" subtitle="How long each kind of work actually takes">
          {turnaround.isPending && <LoadingState />}
          {turnaround.isSuccess && turnaround.data.length === 0 && (
            <EmptyState message="No completed work to measure yet." />
          )}
          {turnaround.isSuccess && turnaround.data.length > 0 && (
            <div className="max-h-72 overflow-auto">
              <table className="w-full min-w-[30rem]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Service</th>
                    <th className="th">Completed</th>
                    <th className="th">Average</th>
                    <th className="th">Median</th>
                    <th className="th">On time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {turnaround.data.map((row) => (
                    <tr key={row.service_id ?? row.service_name}>
                      <td className="td font-medium text-slate-900">{row.service_name}</td>
                      <td className="td tabular">{row.completed_tasks}</td>
                      <td className="td tabular text-xs">
                        {row.average_days === null ? "—" : `${row.average_days.toFixed(1)}d`}
                      </td>
                      <td className="td tabular text-xs">
                        {row.median_days === null ? "—" : `${row.median_days.toFixed(1)}d`}
                      </td>
                      <td className="td tabular text-xs">
                        {row.on_time_percent === null ? "—" : formatPercent(row.on_time_percent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="Clients needing attention" subtitle="Worst first, as ranked by the API">
          {atRisk.isPending && <LoadingState />}
          {atRisk.isSuccess && atRisk.data.length === 0 && (
            <EmptyState message="No client is currently flagged." />
          )}
          {atRisk.isSuccess && atRisk.data.length > 0 && (
            <div className="max-h-72 overflow-auto">
              <table className="w-full min-w-[30rem]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Client</th>
                    <th className="th">Risk</th>
                    <th className="th">Overdue</th>
                    <th className="th">Missing docs</th>
                    <th className="th">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {atRisk.data.map((row) => (
                    <tr key={row.client_id}>
                      <td className="td">
                        <span className="font-medium text-slate-900">{row.client_name}</span>
                        <span className="ml-2 text-xs text-slate-400">{row.client_code}</span>
                      </td>
                      <td className="td">
                        <Badge tone={riskTone(row.risk_classification)}>
                          {humanise(row.risk_classification)}
                        </Badge>
                      </td>
                      <td className="td tabular">
                        {row.overdue_tasks > 0 ? (
                          <span className="font-medium text-rose-700">{row.overdue_tasks}</span>
                        ) : (
                          0
                        )}
                      </td>
                      <td className="td tabular">{row.open_document_requests}</td>
                      <td className="td tabular text-xs">{formatPercent(row.progress_percent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Deadlines in the next 30 days">
          {deadlines.isPending && <LoadingState />}
          {deadlines.isSuccess && deadlines.data.length === 0 && (
            <EmptyState message="Nothing due in the next 30 days." />
          )}
          {deadlines.isSuccess && deadlines.data.length > 0 && (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {deadlines.data.map((row, index) => (
                <li
                  key={row.task_id ?? `${row.client_id}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{row.title}</p>
                    <p className="text-xs text-slate-500">
                      {row.client_name}
                      {row.owner_name ? ` · ${row.owner_name}` : " · unassigned"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular text-xs text-slate-500">
                      {formatDate(row.statutory_due_date)}
                    </span>
                    {!row.verified && <Badge tone="warning">Date unconfirmed</Badge>}
                    <Badge tone={daysRemainingTone(row.days_remaining)}>
                      {daysRemainingLabel(row.days_remaining)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Productivity"
          subtitle="Complexity-weighted throughput beside logged effort — never a bare task count"
        >
          {productivity.isPending && <LoadingState label="Loading productivity…" />}
          {productivity.isSuccess && (
            <>
              <div className="grid grid-cols-2 gap-3 border-b border-slate-200 p-4 md:grid-cols-3">
                <StatCard label="Completed" value={productivity.data.total_completed} />
                <StatCard
                  label="Hours logged"
                  value={formatHours(productivity.data.total_logged_hours)}
                  tone={productivity.data.total_logged_hours === 0 ? "warning" : "success"}
                />
                <StatCard
                  label="Period"
                  value={`${formatDate(productivity.data.period_start)} – ${formatDate(
                    productivity.data.period_end,
                  )}`}
                />
              </div>

              {(productivity.data.rows?.length ?? 0) === 0 ? (
                <EmptyState message="Nobody has completed work in this period." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[52rem]">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="th">Person</th>
                        <th className="th">Completed</th>
                        <th className="th">Weighted</th>
                        <th className="th">Hours</th>
                        <th className="th">Billable</th>
                        <th className="th">Unlogged</th>
                        <th className="th">Turnaround</th>
                        <th className="th">On time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {productivity.data.rows.map((row) => (
                        <tr key={row.user_id}>
                          <td className="td text-sm text-slate-900">{row.full_name}</td>
                          <td className="td tabular">{row.tasks_completed}</td>
                          <td className="td tabular">{row.weighted_throughput}</td>
                          <td className="td tabular">{formatHours(row.logged_hours)}</td>
                          <td className="td tabular">{formatHours(row.billable_hours)}</td>
                          <td className="td tabular text-xs">
                            {row.completed_without_logged_effort > 0 ? (
                              <span className="font-medium text-amber-700">
                                {row.completed_without_logged_effort}
                              </span>
                            ) : (
                              0
                            )}
                          </td>
                          <td className="td tabular text-xs">
                            {row.average_turnaround_days !== null
                              ? `${row.average_turnaround_days}d`
                              : "—"}
                          </td>
                          <td className="td tabular text-xs">
                            {row.on_time_percent !== null
                              ? formatPercent(row.on_time_percent)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(productivity.data.notes?.length ?? 0) > 0 && (
                <ul className="space-y-1 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
                  {productivity.data.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>

        <Card
          title="Delays and bottlenecks"
          subtitle="Where work is piling up, which stage is slow, and what runs chronically late"
        >
          {bottlenecks.isPending && <LoadingState label="Loading bottlenecks…" />}
          {bottlenecks.isSuccess && (
             <>
               {bottlenecks.data.slowest_stage && (
                 <p className="border-b border-slate-200 px-4 py-3 text-sm text-slate-800">
                   Slowest stage:{" "}
                   <span className="font-medium">{humanise(bottlenecks.data.slowest_stage)}</span>
                 </p>
               )}

               <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
                 <div className="max-h-60 overflow-y-auto">
                   <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                     Where work is sitting now
                   </h4>
                   {(bottlenecks.data.aging?.length ?? 0) === 0 ? (
                     <EmptyState message="No open work." />
                   ) : (
                     <table className="w-full">
                      <thead>
                        <tr>
                          <th className="th">Stage</th>
                          <th className="th">Open</th>
                          <th className="th">Median age</th>
                          <th className="th">Oldest</th>
                          <th className="th">Overdue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bottlenecks.data.aging.map((row) => (
                          <tr key={row.status}>
                            <td className="td text-xs">{humanise(row.status)}</td>
                            <td className="td tabular text-xs">{row.open_tasks}</td>
                            <td className="td tabular text-xs">
                              {row.median_days_in_status !== null
                                ? `${row.median_days_in_status}d`
                                : "—"}
                            </td>
                            <td className="td tabular text-xs">
                              {(row.oldest_days ?? 0) > 30 ? (
                                <span className="font-medium text-rose-700">
                                  {row.oldest_days}d
                                </span>
                              ) : (
                                `${row.oldest_days ?? 0}d`
                              )}
                            </td>
                            <td className="td tabular text-xs">
                              {row.overdue_tasks > 0 ? (
                                <span className="text-rose-700">{row.overdue_tasks}</span>
                              ) : (
                                0
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                 <div className="max-h-60 overflow-y-auto">
                   <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                     How long each stage takes
                   </h4>
                  {bottlenecks.data.dwell?.length ?? 0 === 0 ? (
                    <EmptyState message="No status changes recorded in the window." />
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="th">Stage</th>
                          <th className="th">Moves</th>
                          <th className="th">Median</th>
                          <th className="th">Average</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bottlenecks.data.dwell.map((row) => (
                          <tr key={row.status}>
                            <td className="td text-xs">{humanise(row.status)}</td>
                            <td className="td tabular text-xs">{row.transitions}</td>
                            <td className="td tabular text-xs">
                              {row.median_days !== null ? `${row.median_days}d` : "—"}
                            </td>
                            <td className="td tabular text-xs">
                              {row.average_days !== null ? `${row.average_days}d` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                 <div className="max-h-60 overflow-y-auto">
                   <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                     Recurrence delays
                  </h4>
                  {(bottlenecks.data.recurrence_delay?.length ?? 0) === 0 ? (
                    <EmptyState message="No recurring work to report." />
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="th">Template</th>
                          <th className="th">Instances</th>
                          <th className="th">Late</th>
                          <th className="th">Avg days late</th>
                          <th className="th">Late %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bottlenecks.data.recurrence_delay.map((row) => (
                          <tr key={row.template_id ?? row.template_name}>
                            <td className="td text-xs font-medium text-slate-900">{row.template_name}</td>
                            <td className="td tabular text-xs">{row.instances}</td>
                            <td className="td tabular text-xs">
                              {row.late_instances > 0 ? (
                                <span className="font-medium text-rose-700">{row.late_instances}</span>
                              ) : (
                                0
                              )}
                            </td>
                            <td className="td tabular text-xs">
                              {row.average_days_late !== null ? `${row.average_days_late.toFixed(1)}d` : "—"}
                            </td>
                            <td className="td tabular text-xs"
                              >{formatPercent(row.late_percent)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {(bottlenecks.data.notes?.length ?? 0) > 0 && (
                <ul className="space-y-1 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
                  {bottlenecks.data.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>

        <Card
          title="Client-wise service status"
          subtitle="One row per client and service, so a stuck service is visible rather than averaged away"
        >
          {clientServices.isPending && <LoadingState label="Loading client services…" />}
          {clientServices.isSuccess && (
            <>
              <div className="grid grid-cols-2 gap-3 border-b border-slate-200 p-4">
                <StatCard label="Clients covered" value={clientServices.data.clients_covered} />
                <StatCard label="Services covered" value={clientServices.data.services_covered} />
              </div>

              {(clientServices.data.rows?.length ?? 0) === 0 ? (
                <EmptyState message="No client has generated work yet." />
              ) : (
                <div className="max-h-72 overflow-auto">
                  <table className="w-full min-w-[56rem]">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="th">Client</th>
                        <th className="th">Service</th>
                        <th className="th">Total</th>
                        <th className="th">Completed</th>
                        <th className="th">Filed</th>
                        <th className="th">Open</th>
                        <th className="th">Overdue</th>
                        <th className="th">Waiting on client</th>
                        <th className="th">Awaiting review</th>
                        <th className="th">Progress</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {clientServices.data.rows.map((row) => (
                        <tr key={`${row.client_id}-${row.service_id ?? "none"}`}>
                          <td className="td text-xs">
                            <Link
                              href={`/clients/${row.client_id}`}
                              className="text-slate-900 underline-offset-2 hover:underline"
                            >
                              {row.client_name}
                            </Link>
                            <span className="block font-mono text-slate-400">
                              {row.client_code}
                            </span>
                          </td>
                          <td className="td text-xs text-slate-700">{row.service_name}</td>
                          <td className="td tabular text-xs">{row.total}</td>
                          <td className="td tabular text-xs text-emerald-700">{row.completed}</td>
                          <td className="td tabular text-xs">{row.filed}</td>
                          <td className="td tabular text-xs">{row.open}</td>
                          <td className="td tabular text-xs">
                            {row.overdue > 0 ? (
                              <span className="font-medium text-rose-700">{row.overdue}</span>
                            ) : (
                              0
                            )}
                          </td>
                          <td className="td tabular text-xs">
                            {row.waiting_for_client > 0 ? (
                              <span className="text-amber-700">{row.waiting_for_client}</span>
                            ) : (
                              0
                            )}
                          </td>
                          <td className="td tabular text-xs">
                            {row.awaiting_review > 0 ? (
                              <span className="text-sky-700">{row.awaiting_review}</span>
                            ) : (
                              0
                            )}
                          </td>
                          <td className="td">
                            <div className="flex items-center gap-2">
                              <ProgressBar
                                percent={row.completion_percent}
                                tone={row.completion_percent >= 100 ? "success" : "progress"}
                                className="w-16"
                              />
                              <span className="tabular text-xs text-slate-600">
                                {formatPercent(row.completion_percent)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(clientServices.data.notes?.length ?? 0) > 0 && (
                <ul className="space-y-1 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
                  {clientServices.data.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      </div>

      <Card
        title="Outstanding fees and ageing"
        subtitle="Moved to its own screen, with the ageing report and a chase list."
        action={
          <Link href="/receivables" className="btn-ghost">
            Open receivables
          </Link>
        }
      >
        {receivables.isSuccess && (
          <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
            <StatCard label="Invoiced" value={formatMoney(receivables.data.invoiced_total)} />
            <StatCard
              label="Collected"
              value={formatMoney(receivables.data.collected_total)}
              tone="success"
            />
            <StatCard
              label="Outstanding"
              value={formatMoney(receivables.data.outstanding_total)}
              tone={receivables.data.outstanding_total > 0 ? "warning" : "success"}
            />
            <StatCard
              label="Overdue"
              value={formatMoney(receivables.data.overdue_total)}
              tone={receivables.data.overdue_total > 0 ? "danger" : "success"}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
