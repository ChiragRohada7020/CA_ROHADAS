"use client";

import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Chip, FormError, PanelRow } from "@/components/form";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { cn, humanise } from "@/lib/format";
import type {
  ClientListItem,
  Page,
  Priority,
  ServiceRow,
  TaskDetail,
  TaskUpdatePayload,
} from "@/lib/types";

const PRIORITIES: Priority[] = ["low", "normal", "high", "urgent"];
const MAX_TAG_LENGTH = 40;

interface Draft {
  client_id: string;
  service_id: string;
  priority: Priority;
  internal_due_date: string;
  statutory_due_date: string;
  period_key: string;
  estimated_hours: string;
  tags: string[];
}

function fromTask(task: TaskDetail): Draft {
  return {
    client_id: task.client_id,
    service_id: task.service_id ?? "",
    priority: task.priority,
    internal_due_date: task.internal_due_date ?? "",
    statutory_due_date: task.statutory_due_date ?? "",
    period_key: task.period_key ?? "",
    estimated_hours: task.estimated_hours === null ? "" : String(task.estimated_hours),
    tags: task.tags ?? [],
  };
}

/** Tags compare case-insensitively, because that is how the API de-duplicates them. */
function sameTags(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((tag, index) => tag.toLowerCase() === right[index].toLowerCase());
}

/**
 * The fields an edit actually changes.
 *
 * Only differences are included. That is not an optimisation: the API treats an omitted
 * field as "leave it alone" and an explicit `null` as "clear it", so sending the whole
 * form every time would make every save an instruction to clear anything the form did
 * not happen to render.
 */
function buildFieldChanges(task: TaskDetail, draft: Draft): TaskUpdatePayload {
  const payload: TaskUpdatePayload = {};

  if (draft.client_id !== task.client_id) payload.client_id = draft.client_id;
  if (draft.service_id !== (task.service_id ?? "")) {
    payload.service_id = draft.service_id || null;
  }
  if (draft.priority !== task.priority) payload.priority = draft.priority;
  if (draft.internal_due_date !== (task.internal_due_date ?? "")) {
    payload.internal_due_date = draft.internal_due_date || null;
  }
  if (draft.statutory_due_date !== (task.statutory_due_date ?? "")) {
    payload.statutory_due_date = draft.statutory_due_date || null;
  }
  if (draft.period_key !== (task.period_key ?? "")) {
    payload.period_key = draft.period_key.trim() || null;
  }

  const hours = draft.estimated_hours.trim() === "" ? null : Number(draft.estimated_hours);
  if (hours !== task.estimated_hours) payload.estimated_hours = hours;

  if (!sameTags(draft.tags, task.tags ?? [])) payload.tags = draft.tags;

  return payload;
}

/** A labelled row, matching the compact spacing of the design's right-hand panel. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <PanelRow label={label}>{children}</PanelRow>;
}

/**
 * The right-hand panel: the task's own fields that can be edited in one place.
 *
 * Status changes are handled by `StatusTransitionMenu` in the page header, and
 * assignment changes are handled by `AssignPanel` elsewhere on the right rail,
 * because each is governed by a different endpoint and different permissions.
 * This panel only edits the task's descriptive fields and tags.
 */
export function TaskEditPanel({ task, onSaved }: { task: TaskDetail; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => fromTask(task));
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    setDraft(fromTask(task));
    setTagInput("");
  }, [task.id, task.updated_at]);

  const clients = useQuery({
    queryKey: ["clients", "for-task-edit"],
    queryFn: () => api.get<Page<ClientListItem>>("/clients?limit=300"),
  });

  const services = useQuery({
    queryKey: ["services", "for-task-edit"],
    queryFn: () => api.get<Page<ServiceRow>>("/services?limit=200"),
  });

  const save = useMutation({
    mutationFn: async () => {
      const fields = buildFieldChanges(task, draft);
      if (Object.keys(fields).length > 0) {
        await api.patch<TaskDetail>(`/tasks/${task.id}`, fields);
      }
    },
    onSuccess: onSaved,
  });

  const currentClient = clients.data?.items.find((row) => row.id === draft.client_id);
  const fields = buildFieldChanges(task, draft);
  const dirty = Object.keys(fields).length > 0;

  function addTag() {
    const tag = tagInput.trim().slice(0, MAX_TAG_LENGTH);
    if (!tag) return;
    if (draft.tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      setTagInput("");
      return;
    }
    setDraft((current) => ({ ...current, tags: [...current.tags, tag] }));
    setTagInput("");
  }

  return (
    <div className="card divide-y divide-slate-100">
      <div className="p-4">
        <Row label="Linked service">
          <select
            className="input w-full py-1.5 text-xs"
            value={draft.service_id}
            aria-label="Linked service"
            disabled={services.isPending}
            onChange={(event) =>
              setDraft((current) => ({ ...current, service_id: event.target.value }))
            }
          >
            <option value="">No service linked</option>
            {(services.data?.items ?? []).map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </Row>
      </div>

      <div className="p-4">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <Icon name="file-text" className="h-3.5 w-3.5 text-slate-400" />
          Task details
        </p>

        <Row label="Client">
          <select
            className="input w-full py-1.5 text-xs"
            value={draft.client_id}
            aria-label="Client"
            disabled={clients.isPending}
            onChange={(event) =>
              setDraft((current) => ({ ...current, client_id: event.target.value }))
            }
          >
            {(clients.data?.items ?? []).map((client) => (
              <option key={client.id} value={client.id}>
                {client.legal_name}
              </option>
            ))}
          </select>
        </Row>

        <div className="flex flex-wrap items-center justify-end gap-1.5 pb-1">
          {currentClient?.pan && <Chip>PAN {currentClient.pan}</Chip>}
          {currentClient?.gstin && <Chip>GSTIN {currentClient.gstin}</Chip>}
        </div>

        <div className="pb-1 text-right">
          <Link
            href={`/clients/${draft.client_id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline"
          >
            <Icon name="user" className="h-3.5 w-3.5" />
            View client
            <Icon name="arrow-right" className="h-3.5 w-3.5" />
          </Link>
        </div>

        <Row label="Priority">
          <select
            className="input w-full py-1.5 text-xs"
            value={draft.priority}
            aria-label="Priority"
            onChange={(event) =>
              setDraft((current) => ({ ...current, priority: event.target.value as Priority }))
            }
          >
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {humanise(value)}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Due date">
          <input
            type="date"
            className="input w-full py-1.5 text-xs"
            value={draft.internal_due_date}
            aria-label="Internal due date"
            onChange={(event) =>
              setDraft((current) => ({ ...current, internal_due_date: event.target.value }))
            }
          />
        </Row>

        <Row label="Statutory due">
          <input
            type="date"
            className="input w-full py-1.5 text-xs"
            value={draft.statutory_due_date}
            aria-label="Statutory due date"
            onChange={(event) =>
              setDraft((current) => ({ ...current, statutory_due_date: event.target.value }))
            }
          />
        </Row>

        {!task.deadline_verified && (
          <p className="pb-1 text-right text-[11px] text-amber-700">
            Statutory date not confirmed by a person
          </p>
        )}

        <Row label="Period">
          <input
            className="input w-full py-1.5 text-xs"
            value={draft.period_key}
            aria-label="Period"
            placeholder="July 2026"
            maxLength={20}
            onChange={(event) =>
              setDraft((current) => ({ ...current, period_key: event.target.value }))
            }
          />
        </Row>

        <Row label="Estimated time">
          <input
            type="number"
            min={0}
            max={1000}
            step={0.5}
            className="input w-full py-1.5 text-xs"
            value={draft.estimated_hours}
            aria-label="Estimated hours"
            placeholder="2.5"
            onChange={(event) =>
              setDraft((current) => ({ ...current, estimated_hours: event.target.value }))
            }
          />
          <span className="shrink-0 text-xs text-slate-500">h</span>
        </Row>

        <div className="flex items-start justify-between gap-3 py-1.5">
          <span className="w-28 shrink-0 pt-1 text-xs text-slate-500">Tags</span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
            {draft.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-700"
              >
                {tag}
                <button
                  type="button"
                  className="text-slate-400 hover:text-rose-600"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      tags: current.tags.filter((existing) => existing !== tag),
                    }))
                  }
                >
                  ×
                </button>
              </span>
            ))}
            <input
              className="w-24 border-0 border-b border-dashed border-slate-300 bg-transparent px-1 py-1 text-[11px] outline-none focus:border-slate-500"
              value={tagInput}
              placeholder="+ tag"
              aria-label="Add a tag"
              maxLength={MAX_TAG_LENGTH}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
            />
          </div>
        </div>
      </div>

      <div className="p-4">
        {save.isError && (
          <div className="mb-3">
            <FormError error={save.error} />
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn("btn-primary flex-1 inline-flex items-center justify-center gap-1.5")}
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            <Icon name="file-text" className="h-4 w-4" />
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={save.isPending}
            onClick={() => {
              setDraft(fromTask(task));
              setTagInput("");
              save.reset();
            }}
          >
            Cancel
          </button>
        </div>

        <p className="mt-2 text-[11px] text-slate-400">
          Status changes are handled above; this panel saves only task fields and tags.
          Assignment changes are handled in the Assignment panel on the right.
        </p>
      </div>
    </div>
  );
}
