"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Card, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { CheckboxField, FormActions, FormError, TextField } from "@/components/form";
import { ApiError, api } from "@/lib/api";
import { formatDate, formatHours, todayInIST } from "@/lib/format";
import { useUserDirectory, userName } from "@/lib/users";
import type { Page, TaskDetail, TaskWorkLogRow } from "@/lib/types";

/**
 * Effort spent on this task.
 *
 * This is what the productivity report is built on, and the reason it exists rather
 * than counting tasks: the blueprint is explicit that staff must not be measured by
 * counts alone, because a five-minute acknowledgement and a full audit are both "one
 * task". Without logged effort, productivity has nothing honest to say — which the
 * report states outright rather than showing zeros.
 *
 * The logged person comes from the session, never from this form.
 */
export function WorkLogPanel({ task }: { task: TaskDetail }) {
  const queryClient = useQueryClient();
  const directory = useUserDirectory();
  const [adding, setAdding] = useState(false);

  const logs = useQuery({
    queryKey: ["work-logs", task.id],
    queryFn: () => api.get<Page<TaskWorkLogRow>>(`/tasks/${task.id}/work-logs?limit=50`),
  });

  const rows = logs.data?.items ?? [];
  const total = rows.reduce((sum, row) => sum + row.hours, 0);
  const billable = rows.reduce((sum, row) => sum + (row.is_billable ? row.hours : 0), 0);

  return (
    <Card
      title="Effort logged"
      subtitle={
        rows.length > 0
          ? `${formatHours(total)} total · ${formatHours(billable)} billable`
          : "Time spent on this task, which is what the productivity report is built on"
      }
      action={
        <button type="button" className="btn btn-ghost" onClick={() => setAdding(!adding)}>
          {adding ? "Cancel" : "Log time"}
        </button>
      }
    >
      {adding && (
        <LogTimeForm
          task={task}
          onDone={() => {
            setAdding(false);
            void queryClient.invalidateQueries({ queryKey: ["work-logs", task.id] });
            void queryClient.invalidateQueries({ queryKey: ["reports", "productivity"] });
          }}
        />
      )}

      {logs.isPending && <LoadingState label="Loading logged effort…" />}
      {logs.isError && (
        <ErrorState
          message={
            logs.error instanceof ApiError ? logs.error.message : "Could not load logged effort."
          }
        />
      )}
      {logs.isSuccess && rows.length === 0 && (
        <EmptyState message="No time has been logged against this task." />
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="tabular text-sm text-slate-900">{formatHours(row.hours)}</span>
              <span className="text-xs text-slate-500">{formatDate(row.work_date)}</span>
              <span className="text-xs text-slate-700">{userName(directory.byId, row.user_id)}</span>
              <span className="text-xs text-slate-400">{row.activity_type}</span>
              {!row.is_billable && <span className="text-xs text-amber-700">non-billable</span>}
              {row.description && (
                <span className="w-full text-xs text-slate-600">{row.description}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}


function LogTimeForm({ task, onDone }: { task: TaskDetail; onDone: () => void }) {
  const [workDate, setWorkDate] = useState(todayInIST());
  const [hours, setHours] = useState("");
  const [activityType, setActivityType] = useState("preparation");
  const [isBillable, setIsBillable] = useState(true);
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.post<TaskWorkLogRow>(`/tasks/${task.id}/work-logs`, {
        work_date: workDate,
        hours: Number(hours),
        activity_type: activityType,
        is_billable: isBillable,
        description: description.trim() || null,
      }),
    onSuccess: onDone,
  });

  const parsed = Number(hours);
  const valid = workDate !== "" && Number.isFinite(parsed) && parsed > 0 && parsed <= 24;

  return (
    <form
      className="space-y-4 border-b border-slate-200 bg-slate-50/60 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      {create.isError && <FormError error={create.error} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <TextField
          label="Date"
          value={workDate}
          onChange={setWorkDate}
          type="date"
          required
          hint="Often recorded after the fact, so this is not limited to today."
        />
        <TextField
          label="Hours"
          value={hours}
          onChange={setHours}
          type="number"
          placeholder="2.5"
          required
          hint="Between 0 and 24."
        />
        <TextField
          label="Activity"
          value={activityType}
          onChange={setActivityType}
          placeholder="preparation"
          maxLength={30}
          hint="Distinguishes preparation from review effort."
        />
      </div>

      <TextField
        label="What was done"
        value={description}
        onChange={setDescription}
        placeholder="Reconciled the sales register against 2B"
        maxLength={600}
      />

      <CheckboxField
        label="Billable"
        checked={isBillable}
        onChange={setIsBillable}
        hint="Non-billable effort is still counted, and shown separately."
      />

      <FormActions
        submitLabel="Log time"
        busy={create.isPending}
        disabled={!valid}
        onCancel={onDone}
      />
    </form>
  );
}