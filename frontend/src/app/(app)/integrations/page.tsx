"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
} from "@/components/ui";
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
    <div className="space-y-4">
      <PageHeader
        title="Integrations"
        subtitle="Exchange client data with Winman and Tally, and see exactly what went wrong when it did."
        action={
          <a className="btn btn-ghost" href="/api/exports/clients" download>
            Export client master
          </a>
        }
      />

      {firstError && (
        <ErrorState
          message={
            firstError.error instanceof ApiError
              ? firstError.error.message
              : "Could not load the integration screens."
          }
        />
      )}

      {imports.isSuccess && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Imports run" value={rows.length} />
          <StatCard label="Clients imported" value={totalImported} tone="success" />
          <StatCard
            label="Rows rejected"
            value={totalRejected}
            tone={totalRejected > 0 ? "warning" : "neutral"}
            hint="Across the imports shown"
          />
          <StatCard label="Connections" value={connections.data?.meta.total ?? 0} />
        </div>
      )}

      <ImportClientsForm />

      <Card
        title="Import history"
        subtitle="Every import is recorded, including one that rejected everything"
      >
        {imports.isPending && <LoadingState label="Loading imports…" />}
        {imports.isSuccess && rows.length === 0 && (
          <EmptyState message="No imports have run yet." />
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">When</th>
                  <th className="th">Source</th>
                  <th className="th">Provider</th>
                  <th className="th">Imported</th>
                  <th className="th">Rejected</th>
                  <th className="th">Status</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((job) => (
                  <tr key={job.id}>
                    <td
                      className="td text-xs text-slate-500"
                      title={formatDateTime(job.created_at)}
                    >
                      {formatRelative(job.created_at)}
                    </td>
                    <td className="td text-xs">
                      {job.source_ref ?? <span className="italic text-slate-400">unnamed</span>}
                    </td>
                    <td className="td text-xs">{humanise(job.provider)}</td>
                    <td className="td tabular text-xs text-emerald-700">{job.rows_imported}</td>
                    <td className="td tabular text-xs">
                      {job.rows_rejected > 0 ? (
                        <span className="font-medium text-rose-700">{job.rows_rejected}</span>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="td">
                      <Badge tone={importStatusTone(job.status)}>{humanise(job.status)}</Badge>
                    </td>
                    <td className="td">
                      <button
                        type="button"
                        className="text-xs text-slate-600 underline-offset-2 hover:underline"
                        onClick={() => setOpenJob(openJob === job.id ? null : job.id)}
                      >
                        {openJob === job.id ? "Hide errors" : "Show errors"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {openJob && <ImportErrors jobId={openJob} />}

      <Card
        title="Connections"
        subtitle="How to reach each product. No credentials are stored here."
      >
        {connections.isPending && <LoadingState label="Loading connections…" />}
        {connections.isSuccess &&
          (connections.data.items.length === 0 ? (
            <EmptyState message="No integration connection is registered. Imports work without one — a connection just records where the files come from." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {connections.data.items.map((connection) => (
                <li key={connection.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="text-sm font-medium text-slate-900">{connection.name}</span>
                  <Badge tone="neutral">{humanise(connection.provider)}</Badge>
                  <Badge tone={connection.status === "connected" ? "success" : "warning"}>
                    {humanise(connection.status)}
                  </Badge>
                  {connection.credential_ref && (
                    <span className="font-mono text-xs text-slate-500">
                      credential: {connection.credential_ref}
                    </span>
                  )}
                  {connection.last_error && (
                    <span className="text-xs text-rose-700">{connection.last_error}</span>
                  )}
                </li>
              ))}
            </ul>
          ))}
      </Card>

      <Card title="What each product supports" subtitle="Including what it does not">
        {providers.isPending && <LoadingState label="Loading providers…" />}
        {providers.isSuccess && (
          <div className="divide-y divide-slate-100">
            {providers.data.map((provider) => (
              <div key={provider.provider} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">{provider.name}</span>
                  <span className="text-xs text-slate-500">{provider.mechanism}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Supports
                    </p>
                    <ul className="mt-1 list-disc pl-4 text-xs text-slate-700">
                      {provider.supports.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Limitations
                    </p>
                    <ul className="mt-1 list-disc pl-4 text-xs text-slate-600">
                      {provider.limitations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}


function ImportErrors({ jobId }: { jobId: string }) {
  const detail = useQuery({
    queryKey: ["imports", jobId],
    queryFn: () => api.get<ImportJobDetailRow>(`/imports/${jobId}`),
  });

  return (
    <Card
      title="Validation errors"
      subtitle={
        detail.data
          ? `${detail.data.error_count} error(s), ${detail.data.warning_count} warning(s)`
          : undefined
      }
    >
      {detail.isPending && <LoadingState label="Loading errors…" />}
      {detail.isError && <ErrorState message="Could not load this import's errors." />}
      {detail.isSuccess && (
        <div className="p-4">
          <ImportIssueList
            issues={detail.data.errors}
            emptyMessage="This import found no problems."
          />
        </div>
      )}
    </Card>
  );
}


function importStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "completed") return "success";
  if (status === "partial") return "warning";
  if (status === "failed") return "danger";
  return "neutral";
}
