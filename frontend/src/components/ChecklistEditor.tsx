"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge, EmptyState } from "@/components/ui";
import { CheckboxField, FormActions, FormError, TextField } from "@/components/form";
import { api } from "@/lib/api";
import { humanise } from "@/lib/format";
import type { TaskTemplateRow, TaskTemplateStepRow } from "@/lib/types";

/**
 * The checklist for one service, which is its task template's steps.
 *
 * There is deliberately no separate service-level checklist table. Progress on a task
 * is computed from that task's steps, so a second, parallel checklist would be a
 * second source of truth for "what does a GST return involve" — and the two would
 * drift. Editing here changes future generation only; tasks already created hold their
 * own copies of the steps.
 */
export function ChecklistEditor({ template }: { template: TaskTemplateRow }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["service"] });
    void queryClient.invalidateQueries({ queryKey: ["task-templates"] });
  };

  const remove = useMutation({
    mutationFn: (stepId: string) =>
      api.delete<{ ok: boolean }>(`/task-templates/${template.id}/steps/${stepId}`),
    onSuccess: refresh,
  });

  const toggleMandatory = useMutation({
    mutationFn: ({ step }: { step: TaskTemplateStepRow }) =>
      api.patch<TaskTemplateStepRow>(`/task-templates/${template.id}/steps/${step.id}`, {
        is_mandatory: !step.is_mandatory,
      }),
    onSuccess: refresh,
  });

  const steps = template.steps.slice().sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="border-t border-slate-200 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div>
          <h4 className="text-sm font-medium text-slate-900">{template.name}</h4>
          <p className="text-xs text-slate-500">
            <span className="font-mono">{template.code}</span>
            {template.is_recurring && ` · ${humanise(template.frequency ?? "")} · generates work`}
            {` · leads by ${template.lead_days} day(s)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!template.is_active && <Badge tone="neutral">Retired</Badge>}
          <button type="button" className="btn btn-ghost" onClick={() => setAdding(!adding)}>
            {adding ? "Cancel" : "Add step"}
          </button>
        </div>
      </div>

      {(remove.isError || toggleMandatory.isError) && (
        <div className="px-4 pb-3">
          <FormError error={remove.error ?? toggleMandatory.error} />
        </div>
      )}

      {adding && (
        <AddStepForm
          templateId={template.id}
          nextSequence={(steps.at(-1)?.sequence ?? 0) + 1}
          onDone={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}

      {steps.length === 0 ? (
        <EmptyState message="This template has no checklist yet." />
      ) : (
        <ol className="divide-y divide-slate-100 border-t border-slate-100">
          {steps.map((step) => (
            <li key={step.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5">
              <span className="tabular mt-0.5 w-5 shrink-0 text-xs text-slate-400">
                {step.sequence}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800">{step.name}</p>
                {step.description && <p className="text-xs text-slate-500">{step.description}</p>}
                <div className="mt-1 flex flex-wrap gap-1">
                  {step.is_mandatory ? (
                    <Badge tone="warning">Mandatory</Badge>
                  ) : (
                    <Badge tone="neutral">Optional</Badge>
                  )}
                  {step.requires_review && <Badge tone="info">Needs review</Badge>}
                  {step.requires_approval && <Badge tone="info">Needs approval</Badge>}
                  {step.requires_filing && <Badge tone="progress">Needs a filing record</Badge>}
                  {step.requires_document && <Badge tone="progress">Needs a document</Badge>}
                  {step.estimated_hours !== null && (
                    <span className="text-xs text-slate-400">{step.estimated_hours}h</span>
                  )}
                  {step.role_hint && (
                    <span className="text-xs text-slate-400">{humanise(step.role_hint)}</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="text-xs text-slate-500 underline-offset-2 hover:underline"
                  disabled={toggleMandatory.isPending}
                  onClick={() => toggleMandatory.mutate({ step })}
                >
                  {step.is_mandatory ? "Make optional" : "Make mandatory"}
                </button>
                <button
                  type="button"
                  className="text-xs text-rose-700 underline-offset-2 hover:underline"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(step.id)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}


function AddStepForm({
  templateId,
  nextSequence,
  onDone,
}: {
  templateId: string;
  nextSequence: number;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [isMandatory, setIsMandatory] = useState(true);
  const [requiresReview, setRequiresReview] = useState(false);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [requiresFiling, setRequiresFiling] = useState(false);
  const [requiresDocument, setRequiresDocument] = useState(false);

  const add = useMutation({
    mutationFn: () =>
      api.post<TaskTemplateStepRow>(`/task-templates/${templateId}/steps`, {
        sequence: nextSequence,
        name: name.trim(),
        is_mandatory: isMandatory,
        requires_review: requiresReview,
        requires_approval: requiresApproval,
        requires_filing: requiresFiling,
        requires_document: requiresDocument,
      }),
    onSuccess: onDone,
  });

  return (
    <form
      className="space-y-3 border-y border-slate-100 bg-slate-50/60 px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate();
      }}
    >
      {add.isError && <FormError error={add.error} />}
      <TextField
        label={`Step ${nextSequence}`}
        value={name}
        onChange={setName}
        placeholder="Reconcile with GSTR-2B"
        required
        maxLength={250}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <CheckboxField
          label="Mandatory"
          checked={isMandatory}
          onChange={setIsMandatory}
          hint="A task cannot be completed while a mandatory step is open."
        />
        <CheckboxField
          label="Requires a review"
          checked={requiresReview}
          onChange={setRequiresReview}
        />
        <CheckboxField
          label="Requires approval"
          checked={requiresApproval}
          onChange={setRequiresApproval}
        />
        <CheckboxField
          label="Requires a filing record"
          checked={requiresFiling}
          onChange={setRequiresFiling}
          hint="Stops the task closing before the ARN is recorded."
        />
        <CheckboxField
          label="Requires a document"
          checked={requiresDocument}
          onChange={setRequiresDocument}
        />
      </div>
      <FormActions
        submitLabel="Add step"
        busy={add.isPending}
        disabled={!name.trim()}
        onCancel={onDone}
      />
    </form>
  );
}
