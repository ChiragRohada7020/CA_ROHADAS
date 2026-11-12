"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ImportClientsForm, ImportIssueList } from "@/components/ImportClientsForm";
import { ApiError, api } from "@/lib/api";
import { formatDateTime, formatRelative, humanise } from "@/lib/format";
import type {
  ConnectionRow,
  ImportJobDetailRow,
  ImportJobRow,
  Page,
  ProviderInfo,
} from "@/lib/types";

/**
 * Third-party integration: importing client master data, exporting it back, and
 * seeing exactly what went wrong when it did.
 *
 * The honest framing, which the providers panel states outright: Winman and Tally are
 * desktop products with no API this application can call, so these integrations are
 * **file-based**. A firm exports a file from its tax software and uploads it here, or
 * downloads a file from here and opens it there. Anything else would be a claim the
 * vendors do not support.
 */
export default function IntegrationsPage() {
  const [openJob, setOpenJob] = useState<string | null>(null);

  const providers = useQuery({
    queryKey: ["integrations", "providers"],
    queryFn: () => api.get<ProviderInfo[]>("/integrations/providers"),
  });

  const imports = useQuery({
    queryKey: ["imports"],
    queryFn: () => api.get<Page<ImportJobRow>>("/imports?limit=25"),
  });

  const connections = useQuery({
    queryKey: ["integrations", "connections"],
    queryFn: () => api.get<Page<ConnectionRow>>("/integrations/connections?limit=50"),
  });

  const rows = imports.data?.items ?? [];
  const totalImported = rows.reduce((sum, row) => sum + row.rows_imported, 0);
  const totalRejected = rows.reduce((sum, row) => sum + row.rows_rejected, 0);

  const firstError = [providers, imports, connections].find((entry) => entry.isError);

  return (
    <div className="min-h-full space-y-5 bg-[#F8F8FD] p-4 md:space-y-6 md:p-5 xl:p-6">
      {/* Dashboard-style hero */}
      <section className="relative isolate overflow-hidden rounded-[22px] border border-[#E5DFFC] bg-gradient-to-r from-[#F5F1FF] via-[#EEE9FF] to-[#DFDAFF] px-5 py-5 shadow-[0_5px_20px_rgba(75,53,145,.045)] sm:px-7 sm:py-6">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-24 h-64 w-64 rounded-full bg-white/45 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 right-[28%] h-48 w-48 rounded-full bg-[#B9A6FF]/25 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold tracking-wide text-[#77749A]">
              <span>Workspace</span>
              <Icon name="chevron-right" className="h-3 w-3" />
              <span className="text-[#5D43A1]">Integrations</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-white/75 text-[#6D3AE8] shadow-sm">
                <Icon name="integrations" className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-[25px] font-extrabold leading-tight tracking-[-.045em] text-[#171A32] sm:text-[29px]">
                  Integrations
                </h1>
                <p className="mt-1 max-w-2xl text-[12px] leading-5 text-[#6F7190] sm:text-[13px]">
                  Exchange client data with Winman and Tally, review import results and manage file-based connections.
                </p>
              </div>
            </div>
          </div>
          <div className="relative flex shrink-0 flex-wrap items-center gap-2">
            <div className="hidden items-center gap-2 rounded-xl border border-white/80 bg-white/55 px-3 py-2 text-[10px] font-semibold text-[#6D5A9B] sm:flex">
              <span className="size-1.5 rounded-full bg-[#32A879]" />
              File-based exchange
            </div>
            <button
              type="button"
              onClick={() => document.getElementById("integration-import-form")?.scrollIntoView({ behavior: "smooth", block: "center" })}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-[#7543E9] to-[#5B31CC] px-5 py-2.5 text-[12px] font-bold text-white shadow-[0_7px_18px_rgba(104,61,213,.24)] transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-[#7543E9]/20"
            >
              <Icon name="upload" className="h-4 w-4" />
              Import file
            </button>
          </div>
        </div>
      </section>

      {firstError && (
        <ErrorState
          message={
            firstError.error instanceof ApiError
              ? firstError.error.message
              : "Could not load the integration screens."
          }
        />
      )}

      {/* Activity overview */}
      {imports.isSuccess && (
        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            {
              label: "Imports run",
              value: rows.length,
              hint: "Recent import jobs",
              icon: "upload",
              tone: "violet",
            },
            {
              label: "Clients imported",
              value: totalImported,
              hint: "Successfully processed",
              icon: "users-round",
              tone: "green",
            },
            {
              label: "Rows rejected",
              value: totalRejected,
              hint: "Across the imports shown",
              icon: "alert-circle",
              tone: totalRejected > 0 ? "amber" : "slate",
            },
            {
              label: "Connections",
              value: connections.data?.meta.total ?? 0,
              hint: "Registered products",
              icon: "plug",
              tone: "indigo",
            },
          ].map((item) => {
            const toneClasses: Record<string, string> = {
              violet: "bg-[#F1ECFF] text-[#6D3AE8]",
              green: "bg-[#EAF8F0] text-[#238451]",
              amber: "bg-[#FFF3E3] text-[#C47A2C]",
              slate: "bg-[#F0F1F7] text-[#69718F]",
              indigo: "bg-[#EBEEFF] text-[#5B31CC]",
            };
            return (
              <div
                key={item.label}
                className="relative overflow-hidden rounded-[18px] border border-[#E3E5F4] bg-white p-4 shadow-[0_3px_12px_rgba(40,42,90,.045)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_9px_24px_rgba(65,48,130,.09)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#747B98]">{item.label}</p>
                    <p className="mt-2 text-[24px] font-extrabold leading-none tracking-[-.035em] text-[#171A32] tabular-nums">{item.value.toLocaleString("en-IN")}</p>
                    <p className="mt-2 text-[10px] text-[#9298AE]">{item.hint}</p>
                  </div>
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${toneClasses[item.tone]}`}>
                    <Icon name={item.icon as any} className="h-4 w-4" />
                  </span>
                </div>
                <span aria-hidden className="pointer-events-none absolute -bottom-6 -right-4 size-16 rounded-full bg-[#F2EEFF] opacity-60 blur-xl" />
              </div>
            );
          })}
        </section>
      )}

      {/* Import workflow */}
      <section id="integration-import-form" className="overflow-hidden rounded-[20px] border border-[#E3E5F4] bg-white shadow-[0_4px_18px_rgba(40,42,90,.045)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF0F7] bg-[#FCFBFF] px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl border border-[#E9E3FF] bg-[#F1ECFF] text-[#6D3AE8]">
              <Icon name="upload" className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-[14px] font-bold tracking-[-.02em] text-[#171A32]">Import client data</h2>
              <p className="mt-0.5 text-[11px] text-[#858AA4]">Upload an export file from your accounting or tax software</p>
            </div>
          </div>
          <span className="rounded-lg border border-[#E9E3FF] bg-[#F7F3FF] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.08em] text-[#7651C8]">
            Secure file upload
          </span>
        </div>
        <div className="p-4 sm:p-5">
          <ImportClientsForm />
        </div>
      </section>

      {/* Import history */}
      <section className="overflow-hidden rounded-[20px] border border-[#E3E5F4] bg-white shadow-[0_4px_18px_rgba(40,42,90,.045)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF0F7] bg-[#FCFBFF] px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl border border-[#E9E3FF] bg-[#F1ECFF] text-[#6D3AE8]">
              <Icon name="history" className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-[14px] font-bold tracking-[-.02em] text-[#171A32]">Import history</h2>
              <p className="mt-0.5 text-[11px] text-[#858AA4]">Every import is recorded, including jobs that rejected every row</p>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-[#8B8FA7]">{rows.length} recent {rows.length === 1 ? "job" : "jobs"}</span>
        </div>

        {imports.isPending && <div className="p-4"><LoadingState label="Loading imports…" /></div>}
        {imports.isSuccess && rows.length === 0 && (
          <div className="px-4 py-10">
            <EmptyState message="No imports have run yet." />
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem]">
              <thead className="bg-[#F7F5FC]">
                <tr>
                  <th className="th">When</th>
                  <th className="th">Source</th>
                  <th className="th">Provider</th>
                  <th className="th text-right">Imported</th>
                  <th className="th text-right">Rejected</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EEF5]">
                {rows.map((job) => (
                  <tr key={job.id} className="transition-colors hover:bg-[#FAF8FF]">
                    <td className="td text-xs text-[#747B98]" title={formatDateTime(job.created_at)}>
                      {formatRelative(job.created_at)}
                    </td>
                    <td className="td text-xs font-medium text-[#343A58]">
                      {job.source_ref ?? <span className="italic text-[#A0A4B8]">unnamed</span>}
                    </td>
                    <td className="td text-xs text-[#59617E]">{humanise(job.provider)}</td>
                    <td className="td tabular text-right text-xs font-semibold text-[#238451]">{job.rows_imported}</td>
                    <td className="td tabular text-right text-xs">
                      {job.rows_rejected > 0 ? (
                        <span className="font-semibold text-[#C34D68]">{job.rows_rejected}</span>
                      ) : (
                        <span className="text-[#9298AE]">0</span>
                      )}
                    </td>
                    <td className="td">
                      <Badge tone={importStatusTone(job.status)}>{humanise(job.status)}</Badge>
                    </td>
                    <td className="td text-right">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-[#6D3AE8] transition hover:bg-[#F3EEFF]"
                        onClick={() => setOpenJob(openJob === job.id ? null : job.id)}
                      >
                        <Icon name={openJob === job.id ? "chevron-up" : "clipboard-list"} className="h-3.5 w-3.5" />
                        {openJob === job.id ? "Hide errors" : "View details"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openJob && <ImportErrors jobId={openJob} />}

      {/* Connections + provider capability information */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="overflow-hidden rounded-[20px] border border-[#E3E5F4] bg-white shadow-[0_4px_18px_rgba(40,42,90,.045)]">
          <div className="flex items-center gap-3 border-b border-[#EEF0F7] bg-[#FCFBFF] px-4 py-3.5">
            <span className="flex size-9 items-center justify-center rounded-xl border border-[#E9E3FF] bg-[#F1ECFF] text-[#6D3AE8]">
              <Icon name="integrations" className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-[14px] font-bold text-[#171A32]">Connections</h2>
              <p className="mt-0.5 text-[11px] text-[#858AA4]">Registered products and connection status</p>
            </div>
          </div>
          {connections.isPending && <div className="p-4"><LoadingState label="Loading connections…" /></div>}
          {connections.isSuccess &&
            ((connections.data?.items.length ?? 0) === 0 ? (
              <div className="px-4 py-8">
                <EmptyState message="No integration connection is registered. Imports work without one — a connection just records where the files come from." />
              </div>
            ) : (
              <ul className="divide-y divide-[#EEF0F7]">
                {(connections.data?.items ?? []).map((connection) => (
                  <li key={connection.id} className="space-y-2 px-4 py-3.5 transition-colors hover:bg-[#FAF8FF]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-bold text-[#25213E]">{connection.name}</span>
                      <Badge tone="neutral">{humanise(connection.provider)}</Badge>
                      <Badge tone={connection.status === "connected" ? "success" : "warning"}>
                        {humanise(connection.status)}
                      </Badge>
                    </div>
                    {connection.credential_ref && (
                      <p className="font-mono text-[10px] text-[#858AA4]">Credential reference: {connection.credential_ref}</p>
                    )}
                    {connection.last_error && (
                      <p className="flex items-start gap-1.5 text-[11px] leading-5 text-[#C34D68]">
                        <Icon name="alert-circle" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {connection.last_error}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ))}
        </section>

        <section className="overflow-hidden rounded-[20px] border border-[#E3E5F4] bg-white shadow-[0_4px_18px_rgba(40,42,90,.045)]">
          <div className="flex items-center gap-3 border-b border-[#EEF0F7] bg-[#FCFBFF] px-4 py-3.5">
            <span className="flex size-9 items-center justify-center rounded-xl border border-[#E9E3FF] bg-[#F1ECFF] text-[#6D3AE8]">
              <Icon name="info" className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-[14px] font-bold text-[#171A32]">Provider capabilities</h2>
              <p className="mt-0.5 text-[11px] text-[#858AA4]">What each product supports — and what it does not</p>
            </div>
          </div>
          {providers.isPending && <div className="p-4"><LoadingState label="Loading providers…" /></div>}
          {providers.isSuccess && (
            <div className="divide-y divide-[#EEF0F7]">
              {providers.data?.map((provider) => (
                <div key={provider.provider} className="space-y-3 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-bold text-[#25213E]">{provider.name}</span>
                    <span className="rounded-lg bg-[#F4F1FC] px-2 py-1 text-[10px] font-medium text-[#777095]">{provider.mechanism}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-[#E5F1E9] bg-[#F7FCF8] p-3">
                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-[#39845A]">
                        <Icon name="check-circle" className="h-3.5 w-3.5" />
                        Supports
                      </p>
                      <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-[#596F61]">
                        {provider.supports.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-[#55A879]" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-[#F1E8DE] bg-[#FFFBF6] p-3">
                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-[#B4773D]">
                        <Icon name="alert-circle" className="h-3.5 w-3.5" />
                        Limitations
                      </p>
                      <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-[#806D5B]">
                        {provider.limitations.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-[#C69A68]" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-[#E8E4F4] bg-[#F5F2FC] px-4 py-3">
        <Icon name="shield-check" className="mt-0.5 h-4 w-4 shrink-0 text-[#8065C2]" />
        <p className="text-[10px] leading-5 text-[#77718E]">
          Winman and Tally are desktop products. These integrations use file-based exchange: export a file from the product and upload it here, or download a file and open it there. No vendor API connection or credential storage is implied.
        </p>
      </div>
    </div>
  );
}


function ImportErrors({ jobId }: { jobId: string }) {
  const detail = useQuery({
    queryKey: ["imports", jobId],
    queryFn: () => api.get<ImportJobDetailRow>(`/imports/${jobId}`),
  });

  return (
    <section className="overflow-hidden rounded-[20px] border border-[#E3E5F4] bg-white shadow-[0_4px_18px_rgba(40,42,90,.045)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF0F7] bg-[#FCFBFF] px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl border border-[#F2E3E8] bg-[#FFF3F5] text-[#C34D68]">
            <Icon name="clipboard-list" className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-[14px] font-bold text-[#171A32]">Validation details</h2>
            <p className="mt-0.5 text-[11px] text-[#858AA4]">
              {detail.data
                ? `${detail.data.error_count} error(s), ${detail.data.warning_count} warning(s)`
                : "Review issues found during this import"}
            </p>
          </div>
        </div>
      </div>
      {detail.isPending && <div className="p-4"><LoadingState label="Loading errors…" /></div>}
      {detail.isError && <div className="p-4"><ErrorState message="Could not load this import's errors." /></div>}
      {detail.isSuccess && (
        <div className="p-4">
          <ImportIssueList
            issues={detail.data.errors}
            emptyMessage="This import found no problems."
          />
        </div>
      )}
    </section>
  );
}


function importStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "completed") return "success";
  if (status === "partial") return "warning";
  if (status === "failed") return "danger";
  return "neutral";
}
