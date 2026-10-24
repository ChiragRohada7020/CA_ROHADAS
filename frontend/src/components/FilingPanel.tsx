"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge, Card, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { FormActions, FormError, SelectField, TextAreaField, TextField } from "@/components/form";
import { Icon } from "@/components/Icon";
import { ApiError, api } from "@/lib/api";
import { formatDate, formatMoney, humanise, todayInIST } from "@/lib/format";
import { filingRecordTone } from "@/lib/status";
import { hasPermission, useSession } from "@/lib/session";
import type { FilingRecordRow, FilingRecordStatus, TaskDetail } from "@/lib/types";

const STATUSES: FilingRecordStatus[] = [
  "pending",
  "submitted",
  "acknowledged",
  "rejected",
  "resubmitted",
];

/**
 * The filing record for a task: has it actually been filed, and what is the ARN?
 *
 * This is the question a firm asks about every return, and until now nothing could
 * answer it. The API could *create* a filing record and never read one back, so an
 * acknowledgement number could be recorded and never seen again.
 *
 * Recording a filing also advances the task's filing axis — `acknowledged` when the
 * ARN is in, `filed` otherwise — which is why this lives on the task itself.
 */
export function FilingPanel({ task, onChanged }: { task: TaskDetail; onChanged: () => void }) {
   const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
   const session = useSession();
   const canFile = !session.data || hasPermission(session.data, "task.file");

  const filings = useQuery({
    queryKey: ["filings", { task_id: task.id }],
    queryFn: () => api.get<{ items: FilingRecordRow[] }>(`/compliance/filings?task_id=${task.id}`),
  });

  const rows = filings.data?.items ?? [];

  return (
    <Card
      title="Filing record"
      subtitle="The acknowledgement number is the proof a return was actually filed"
      icon={<Icon name="receipt" className="h-4 w-4" />}
      action={
        canFile ? (
          <button type="button" className="btn btn-ghost" onClick={() => setAdding(!adding)}>
            {adding ? "Cancel" : "Record a filing"}
          </button>
        ) : null
      }
    >
      {adding && (
        <RecordFilingForm
          task={task}
          onDone={() => {
            setAdding(false);
            void queryClient.invalidateQueries({ queryKey: ["filings"] });
            void queryClient.invalidateQueries({ queryKey: ["task", task.id] });
            onChanged();
          }}
        />
      )}

      {filings.isPending && <LoadingState label="Loading filings…" />}
      {filings.isError && (
        <ErrorState
          message={
            filings.error instanceof ApiError
              ? filings.error.message
              : "Could not load filing records."
          }
        />
      )}

      {filings.isSuccess && rows.length === 0 && (
        <EmptyState message="Nothing has been filed for this task yet." />
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={row.id} className="space-y-1 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-900">{row.filing_type}</span>
                <Badge tone={filingRecordTone(row.status)}>{humanise(row.status)}</Badge>
                {row.filed_on && (
                  <span className="text-xs text-slate-500">filed {formatDate(row.filed_on)}</span>
                )}
                {row.period_key && <span className="text-xs text-slate-400">{row.period_key}</span>}
              </div>

              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                <div className="flex gap-2">
                  <dt className="text-slate-500">Acknowledgement</dt>
                  <dd
                    className={
                      row.acknowledgement_number
                        ? "font-mono text-slate-800"
                        : "italic text-slate-400"
                    }
                  >
                    {row.acknowledgement_number ?? "not recorded"}
                  </dd>
                </div>
                {row.portal_reference && (
                  <div className="flex gap-2">
                    <dt className="text-slate-500">Portal reference</dt>
                    <dd className="font-mono text-slate-800">{row.portal_reference}</dd>
                  </div>
                )}
                {row.late_fee_paid !== null && (
                  <div className="flex gap-2">
                    <dt className="text-slate-500">Late fee paid</dt>
                    <dd className="tabular text-slate-800">{formatMoney(row.late_fee_paid)}</dd>
                  </div>
                )}
              </dl>

              {row.remarks && <p className="text-xs text-slate-600">{row.remarks}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}


function RecordFilingForm({ task, onDone }: { task: TaskDetail; onDone: () => void }) {
  const [filingType, setFilingType] = useState("GSTR-3B");
  const [periodKey, setPeriodKey] = useState("");
  const [filedOn, setFiledOn] = useState(todayInIST());
  const [status, setStatus] = useState<FilingRecordStatus>("submitted");
  const [arn, setArn] = useState("");
  const [portalRef, setPortalRef] = useState("");
  const [lateFee, setLateFee] = useState("");
  const [remarks, setRemarks] = useState("");

  const create = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        client_id: task.client_id,
        task_id: task.id,
        filing_type: filingType.trim(),
        status,
        filed_on: filedOn || null,
      };
      if (periodKey.trim()) payload.period_key = periodKey.trim();
      if (arn.trim()) payload.acknowledgement_number = arn.trim();
      if (portalRef.trim()) payload.portal_reference = portalRef.trim();
      if (lateFee !== "") payload.late_fee_paid = Number(lateFee);
      if (remarks.trim()) payload.remarks = remarks.trim();
      return api.post<FilingRecordRow>("/compliance/filings", payload);
    },
    onSuccess: onDone,
  });

  return (
    <form
      className="space-y-4 border-b border-slate-200 bg-slate-50/60 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      {create.isError && <FormError error={create.error} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Filing type"
          value={filingType}
          onChange={setFilingType}
          placeholder="GSTR-3B"
          required
          maxLength={60}
        />
        <TextField
          label="Period"
          value={periodKey}
          onChange={setPeriodKey}
          placeholder="2026-04"
          hint="With the filing type, this stops the same return being recorded twice."
          maxLength={20}
        />
        <TextField
          label="Filed on"
          value={filedOn}
          onChange={setFiledOn}
          type="date"
          hint="Required unless the filing is still pending."
        />
        <SelectField
          label="Status"
          value={status}
          onChange={(value) => setStatus(value as FilingRecordStatus)}
          options={STATUSES.map((value) => ({ value, label: humanise(value) }))}
        />
        <TextField
          label="Acknowledgement number"
          value={arn}
          onChange={setArn}
          placeholder="AA2704261234567"
          hint="The ARN from the portal — the proof the filing happened."
          maxLength={120}
        />
        <TextField
          label="Portal reference"
          value={portalRef}
          onChange={setPortalRef}
          maxLength={200}
        />
        <TextField label="Late fee paid (₹)" value={lateFee} onChange={setLateFee} type="number" />
      </div>

      <TextAreaField label="Remarks" value={remarks} onChange={setRemarks} rows={2} maxLength={500} />

      <FormActions
        submitLabel="Record filing"
        busy={create.isPending}
        disabled={!filingType.trim() || (!filedOn && status !== "pending")}
        onCancel={onDone}
      />
    </form>
  );
}
