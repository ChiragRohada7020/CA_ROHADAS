"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge, Card, EmptyState } from "@/components/ui";
import { FormActions, FormError, SelectField, TextField } from "@/components/form";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { formatDateTime, humanise } from "@/lib/format";
import { useUserDirectory, userName } from "@/lib/users";
import type { TaskDetail, TaskRole } from "@/lib/types";

const ROLES: Array<{ role: TaskRole; field: "preparer_id" | "reviewer_id" | "approver_id" | "filer_id"; blurb: string }> = [
  { role: "preparer", field: "preparer_id", blurb: "Does the work" },
  { role: "reviewer", field: "reviewer_id", blurb: "Checks it before approval" },
  { role: "approver", field: "approver_id", blurb: "Signs it off internally" },
  { role: "filer", field: "filer_id", blurb: "Files it with the authority" },
];

/**
 * Assign or reassign the four task roles.
 *
 * **Only the roles the user actually changed are sent.** The API distinguishes "not
 * mentioned" (leave the holder alone) from "explicitly null" (clear the role) using
 * Pydantic's `model_fields_set`, so omitting an untouched role is both safe and
 * correct. Clearing sends `null` on purpose.
 *
 * Separation of duties is enforced by the API, not here — the reviewer and approver
 * cannot be the preparer. This form shows the refusal rather than trying to predict
 * it, because the rule belongs in one place.
 */
export function AssignPanel({ task, onChanged }: { task: TaskDetail; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const directory = useUserDirectory();

  const initial = {
    preparer_id: task.preparer_id ?? "",
    reviewer_id: task.reviewer_id ?? "",
    approver_id: task.approver_id ?? "",
    filer_id: task.filer_id ?? "",
  };
  const [values, setValues] = useState(initial);
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: (payload: Record<string, string | null>) =>
      api.post<TaskDetail>(`/tasks/${task.id}/assign`, payload),
    onSuccess: () => {
      setReason("");
      setValues(initial);
      void queryClient.invalidateQueries({ queryKey: ["task", task.id] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["my-queue"] });
      onChanged();
    },
  });

  const changed = ROLES.filter(({ field }) => values[field] !== initial[field]);
  const staffOptions = directory.active.map((user) => ({
    value: user.id,
    label: user.designation ? `${user.full_name} — ${user.designation}` : user.full_name,
  }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload: Record<string, string | null> = {};
    for (const { field } of changed) {
      // An emptied select means "clear this role", which is an explicit null.
      payload[field] = values[field] === "" ? null : values[field];
    }
    if (reason.trim()) payload.reason = reason.trim();
    mutation.mutate(payload);
  }

  return (
    <Card
      title="Who is responsible"
      subtitle="Reassignment keeps history — the previous holder's record is closed, not deleted"
      icon={<Icon name="users-round" className="h-4 w-4" />}
    >
      <form onSubmit={submit} className="space-y-4 p-4">
        {mutation.isError && <FormError error={mutation.error} />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ROLES.map(({ role, field, blurb }) => (
            <SelectField
              key={field}
              label={humanise(role)}
              value={values[field]}
              onChange={(value) => setValues((current) => ({ ...current, [field]: value }))}
              options={staffOptions}
              placeholder="Unassigned"
              hint={blurb}
              disabled={directory.isPending}
            />
          ))}
        </div>

        <TextField
          label="Reason"
          value={reason}
          onChange={setReason}
          placeholder="Meera is on leave until the 20th"
          hint="Recorded on the assignment history — reassignment should be explainable later"
        />

        <FormActions
          submitLabel={changed.length === 0 ? "No changes" : `Save ${changed.length} change${changed.length === 1 ? "" : "s"}`}
          busy={mutation.isPending}
          disabled={changed.length === 0}
        />
      </form>

      <div className="border-t border-slate-200">
        <h3 className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
          Assignment history
        </h3>
        {task.assignments.length === 0 ? (
          <EmptyState message="Nobody has been assigned yet." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {task.assignments
              .slice()
              .reverse()
              .map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                  <Badge tone={entry.is_active ? "success" : "neutral"}>
                    {humanise(entry.role_in_task)}
                  </Badge>
                  <span className="text-sm text-slate-800">
                    {userName(directory.byId, entry.user_id)}
                  </span>
                  <span className="text-xs text-slate-500">
                    from {formatDateTime(entry.assigned_at)}
                    {entry.unassigned_at ? ` to ${formatDateTime(entry.unassigned_at)}` : ""}
                  </span>
                  {entry.assigned_by_id && (
                    <span className="text-xs text-slate-400">
                      by {userName(directory.byId, entry.assigned_by_id)}
                    </span>
                  )}
                  {entry.reason && (
                    <span className="w-full text-xs text-slate-600">“{entry.reason}”</span>
                  )}
                </li>
              ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
