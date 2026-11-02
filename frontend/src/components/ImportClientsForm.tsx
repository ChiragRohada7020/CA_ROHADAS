"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Badge, Card } from "@/components/ui";
import { FormError, SelectField, TextAreaField, TextField } from "@/components/form";
import { api } from "@/lib/api";
import { humanise } from "@/lib/format";
import type {
  ImportIssue,
  ImportJobRow,
  ImportPlanResult,
  IntegrationProvider,
} from "@/lib/types";

const PROVIDERS: Array<{ value: IntegrationProvider; label: string }> = [
  { value: "winman", label: "Winman" },
  { value: "tally", label: "Tally" },
];

/**
 * Import client master data from a Winman or Tally export.
 *
 * **Validate first, then commit.** The plan is computed by the API and shown before
 * anything is written, because an import that half-applies leaves the firm unable to
 * tell what got in. The commit button only appears once a validation has succeeded.
 *
 * The file is read in the browser and sent as text: Winman and Tally both export
 * plain delimited text, and keeping the content in the form means the mapping and the
 * content are one request.
 */
export function ImportClientsForm() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [provider, setProvider] = useState<IntegrationProvider>("winman");
  const [sourceRef, setSourceRef] = useState("");
  const [defaultType, setDefaultType] = useState("individual");
  const [dataType, setDataType] = useState("clients");

  const validate = useMutation({
    mutationFn: () => {
      if (!selectedFile) throw new Error("No file selected");
      const form = new FormData();
      form.append("file", selectedFile);
      form.append("provider", provider);
      form.append("source_ref", sourceRef.trim() || "");
      form.append("default_client_type", defaultType);
      form.append("data_type", dataType);
      form.append("dry_run", "true");
      return api.upload<ImportPlanResult>("/imports/upload", form);
    },
  });

  const commit = useMutation({
    mutationFn: () => {
      if (!selectedFile) throw new Error("No file selected");
      const form = new FormData();
      form.append("file", selectedFile);
      form.append("provider", provider);
      form.append("source_ref", sourceRef.trim() || "");
      form.append("default_client_type", defaultType);
      form.append("data_type", dataType);
      form.append("dry_run", "false");
      return api.upload<ImportJobRow>("/imports/upload", form);
    },
    onSuccess: () => {
      setSelectedFile(null);
      setSourceRef("");
      validate.reset();
      if (fileInput.current) fileInput.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["imports"] });
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setSelectedFile(file);
    if (!sourceRef) setSourceRef(file.name);
    // Any previous validation is now stale.
    validate.reset();
  }

  const plan = validate.data;

  return (
    <Card
      title="Import data"
      subtitle="Upload an export file. Columns are matched automatically — preview first, then import."
    >
      <div className="space-y-4 p-4">
        {(validate.isError || commit.isError) && (
          <FormError error={commit.error ?? validate.error} />
        )}

        {commit.isSuccess && (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">
            Imported {commit.data.rows_imported} client(s);{" "}
            {commit.data.rows_rejected} row(s) rejected. See the history below for the
            detail.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SelectField
            label="Source"
            value={provider}
            onChange={(value) => setProvider(value as IntegrationProvider)}
            options={PROVIDERS}
          />
          <SelectField
            label="Data type"
            value={dataType}
            onChange={setDataType}
            options={[
              { value: "clients", label: "Client data" },
              { value: "contacts", label: "Contact data" },
              { value: "invoices", label: "Invoice data" },
              { value: "services", label: "Service data" },
              { value: "other", label: "Other" },
            ]}
            hint="What kind of records the file contains."
          />
          <TextField
            label="Source reference"
            value={sourceRef}
            onChange={setSourceRef}
            placeholder="client-master-march.csv"
            hint="Recorded in the import history so a file can be traced."
          />
          <TextField
            label="Default client type"
            value={defaultType}
            onChange={setDefaultType}
            placeholder="individual"
            hint="Used for rows with no client-type column."
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600">
            Export file
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="mt-1 block w-full text-xs text-slate-600"
              onChange={(event) => void pickFile(event.target.files?.[0])}
            />
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Supports CSV, TXT, and Excel (.xlsx/.xls) exports. Columns are matched
            automatically — preview first, then import.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!selectedFile || validate.isPending}
            onClick={() => validate.mutate()}
          >
            {validate.isPending ? "Checking…" : "Validate"}
          </button>
          {plan && plan.would_create > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={commit.isPending}
              onClick={() => commit.mutate()}
            >
              {commit.isPending ? "Importing…" : `Import ${plan.would_create} client(s)`}
            </button>
          )}
        </div>
      </div>

      {plan && <ImportPlanSummary plan={plan} />}
    </Card>
  );
}


export function ImportPlanSummary({ plan }: { plan: ImportPlanResult }) {
  return (
    <div className="space-y-3 border-t border-slate-200 bg-slate-50/60 p-4">
      <div className="flex flex-wrap gap-4 text-sm">
        <span>
          <span className="tabular font-medium text-slate-900">{plan.rows_read}</span>{" "}
          <span className="text-slate-500">row(s) read</span>
        </span>
        <span>
          <span className="tabular font-medium text-emerald-700">{plan.would_create}</span>{" "}
          <span className="text-slate-500">would be created</span>
        </span>
        <span>
          <span className="tabular font-medium text-slate-700">{plan.would_skip_existing}</span>{" "}
          <span className="text-slate-500">already present</span>
        </span>
        <span>
          <span
            className={`tabular font-medium ${plan.rows_rejected > 0 ? "text-rose-700" : "text-slate-900"}`}
          >
            {plan.rows_rejected}
          </span>{" "}
          <span className="text-slate-500">rejected</span>
        </span>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Columns matched
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {Object.entries(plan.mapping).map(([field, header]) => (
            <Badge key={field} tone="neutral">
              {field} ← {header}
            </Badge>
          ))}
        </div>
        {plan.unmapped_fields.length > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            Not in this file: {plan.unmapped_fields.join(", ")}
          </p>
        )}
      </div>

      {plan.mapping_problems.length > 0 && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
          <p className="font-medium">Mapping problems</p>
          <ul className="mt-1 list-disc pl-4">
            {plan.mapping_problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}

      <ImportIssueList issues={plan.issues} />
    </div>
  );
}


/** Per-row problems, with the row number and the offending value. */
export function ImportIssueList({
  issues,
  emptyMessage = "No problems found.",
}: {
  issues: ImportIssue[];
  emptyMessage?: string;
}) {
  if (issues.length === 0) {
    return <p className="text-xs text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem]">
        <thead>
          <tr>
            <th className="th">Row</th>
            <th className="th">Field</th>
            <th className="th">Problem</th>
            <th className="th">Severity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {issues.map((issue, index) => (
            <tr key={`${issue.row_number}-${issue.code}-${index}`}>
              <td className="td tabular text-xs text-slate-500">
                {issue.row_number ?? "file"}
              </td>
              <td className="td font-mono text-xs text-slate-600">{issue.field ?? "—"}</td>
              <td className="td text-xs text-slate-800">{issue.message}</td>
              <td className="td">
                <Badge tone={issue.severity === "error" ? "danger" : "warning"}>
                  {humanise(issue.severity)}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
