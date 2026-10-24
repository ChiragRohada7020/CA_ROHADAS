"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Card, PageHeader, StatCard } from "@/components/ui";
import { CheckboxField, FormError, SelectField } from "@/components/form";
import { api } from "@/lib/api";
import type {
  ClientListItem,
  FinancialYearRow,
  GenerateTasksPayload,
  GenerateTasksResult,
  Page,
} from "@/lib/types";

/**
 * Generate the year's recurring compliance work.
 *
 * **Preview is the primary action, and it is the default.** The generator reports
 * exactly why it skipped each template — `Rule requires one of these registrations:
 * tan`, `service not taken by client` — and that explanation is the fastest way for a
 * partner to understand why a client's calendar looks thin. Hiding it behind a flag
 * would turn a silent no-op into a mystery.
 *
 * The write is a deliberate second click, after the preview has been read.
 */
export default function GenerateWorkPage() {
  const queryClient = useQueryClient();
  const [financialYear, setFinancialYear] = useState("");
  const [scope, setScope] = useState<"firm" | "clients">("firm");
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<GenerateTasksResult | null>(null);

  const years = useQuery({
    queryKey: ["financial-years"],
    queryFn: () => api.get<FinancialYearRow[]>("/financial-years"),
  });

  const clients = useQuery({
    queryKey: ["clients", "active-for-generate"],
    queryFn: () => api.get<Page<ClientListItem>>("/clients?status=active&limit=200"),
  });

  const generate = useMutation({
    mutationFn: (payload: GenerateTasksPayload) =>
      api.post<GenerateTasksResult>("/tasks/generate", payload),
    onSuccess: (data) => {
      setResult(data);
      if (!data.dry_run) {
        void queryClient.invalidateQueries({ queryKey: ["tasks"] });
        void queryClient.invalidateQueries({ queryKey: ["my-queue"] });
        void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        void queryClient.invalidateQueries({ queryKey: ["calendar"] });
      }
    },
  });

  function run(dryRun: boolean) {
    const payload: GenerateTasksPayload = { dry_run: dryRun };
    if (financialYear) payload.financial_year = financialYear;
    if (scope === "clients" && selected.length > 0) payload.client_ids = selected;
    generate.mutate(payload);
  }

  const yearOptions = (years.data ?? []).map((year) => ({
    value: year.code,
    label: year.is_active ? `${year.label} (current)` : year.label,
  }));
  const clientRows = clients.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/tasks"
          className="text-xs font-medium text-slate-500 underline-offset-2 hover:underline"
        >
          ← All tasks
        </Link>
        <div className="mt-2">
          <PageHeader
            title="Generate recurring work"
            subtitle="Creates this financial year's compliance tasks from the firm's templates."
          />
        </div>
      </div>

      {generate.isError && <FormError error={generate.error} />}

      <Card title="Scope">
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          <SelectField
            label="Financial year"
            value={financialYear}
            onChange={setFinancialYear}
            options={yearOptions}
            placeholder={
              years.isPending
                ? "Loading…"
                : (years.data?.find((year) => year.is_active)?.code ?? "Current year")
            }
            hint="Leave as the current year unless you are catching up on an earlier one"
          />
          <SelectField
            label="Which clients"
            value={scope}
            onChange={(value) => setScope(value as "firm" | "clients")}
            options={[
              { value: "firm", label: "Every active client in the firm" },
              { value: "clients", label: "Only the clients I pick" },
            ]}
          />
        </div>

        {scope === "clients" && (
          <div className="border-t border-slate-200 p-4">
            {clientRows.length === 0 ? (
              <p className="text-sm text-slate-500">
                No active clients. Recurring work is only generated for active clients — a
                prospect is skipped entirely, which is why an empty calendar usually means the
                client has not been activated.
              </p>
            ) : (
              <>
                <p className="mb-2 text-xs text-slate-600">
                  {selected.length === 0
                    ? "Nothing selected — the whole firm will be used."
                    : `${selected.length} selected.`}
                </p>
                <div className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                  {clientRows.map((row) => (
                    <CheckboxField
                      key={row.id}
                      label={`${row.client_code} · ${row.legal_name}`}
                      checked={selected.includes(row.id)}
                      onChange={(checked) =>
                        setSelected((current) =>
                          checked ? [...current, row.id] : current.filter((id) => id !== row.id),
                        )
                      }
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 p-4">
          <button
            type="button"
            className="btn-primary"
            disabled={generate.isPending}
            onClick={() => run(true)}
          >
            {generate.isPending ? "Working…" : "Preview (writes nothing)"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={generate.isPending}
            onClick={() => run(false)}
          >
            Generate for real
          </button>
          <span className="text-xs text-slate-500">
            Preview first — it reports why each template was skipped.
          </span>
        </div>
      </Card>

      {result && (
        <Card
          title={result.dry_run ? "Preview result — nothing was written" : "Generated"}
          subtitle={`Financial year ${result.financial_year}`}
        >
          <div className="grid grid-cols-2 gap-3 border-b border-slate-200 p-4 md:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label={result.dry_run ? "Would create" : "Created"}
              value={result.created}
              tone={result.created > 0 ? "success" : "neutral"}
            />
            <StatCard label="Templates considered" value={result.templates_considered} />
            <StatCard label="Clients considered" value={result.clients_considered} />
            <StatCard
              label="Already existed"
              value={result.skipped_existing}
              hint="Generation is idempotent — a re-run creates nothing"
            />
            <StatCard label="Rule did not apply" value={result.skipped_not_applicable} />
            <StatCard
              label="Total skipped"
              value={result.skipped_existing + result.skipped_not_applicable}
            />
          </div>

          {Object.keys(result.skipped_reasons).length > 0 && (
            <div className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">
                Why templates were skipped
              </h3>
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {Object.entries(result.skipped_reasons).map(([reason, count]) => (
                  <li
                    key={reason}
                    className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-700">{reason}</span>
                    <span className="tabular shrink-0 text-slate-500">×{count}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">
                A template that keeps being skipped is telling you something: a missing
                registration, or a service the client has not been signed up for.
              </p>
            </div>
          )}

          {result.created === 0 && result.dry_run && (
            <p className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
              Nothing would be created. Either every applicable task already exists, or the
              rules do not match this client&apos;s registrations and services — see above.
            </p>
          )}

          {!result.dry_run && result.created > 0 && (
            <div className="border-t border-slate-200 px-4 py-3">
              <Link
                href="/tasks"
                className="text-sm font-medium text-slate-800 underline underline-offset-2"
              >
                View the generated tasks →
              </Link>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
