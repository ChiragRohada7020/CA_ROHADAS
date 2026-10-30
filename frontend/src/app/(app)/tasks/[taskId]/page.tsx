"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/charts";
import { AssignPanel } from "@/components/AssignPanel";
import { FilingPanel } from "@/components/FilingPanel";
import { Icon, type IconName } from "@/components/Icon";
import { TaskAttachments } from "@/components/TaskAttachments";
import { DescriptionBody, DescriptionEditor } from "@/components/TaskDescription";
import { TaskEditPanel } from "@/components/TaskEditPanel";
import { WorkLogPanel } from "@/components/WorkLogPanel";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  ProgressBar,
  StatCard,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import {
  cn,
  formatDate,
  formatDateTime,
  formatHours,
  formatPercent,
  formatRelative,
  humanise,
} from "@/lib/format";
import {
   approvalTone,
   badgeClasses,
   filingTone,
   priorityTone,
   stepStatusTone,
   taskStatusLabel,
   taskStatusTone,
   type Tone,
} from "@/lib/status";
import { hasPermission, useSession } from "@/lib/session";
import { useUserDirectory, userName } from "@/lib/users";
import type { DocumentRequestRow, FinancialYearRow, TaskAssignmentRow, TaskCommentRow, TaskDetail, TaskStatus, TaskStatusHistoryRow, TaskTemplateRow, TaskUpdatePayload } from "@/lib/types";

const STEP_STATUSES = ["pending", "in_progress", "completed", "skipped", "not_applicable"] as const;

type Tab = "comments" | "activity" | "time";

const ROLE_LABELS: Record<string, string> = {
  preparer: "Preparer",
  reviewer: "Reviewer",
  approver: "Approver",
  filer: "Filer",
  manager: "Manager",
  partner: "Partner",
  observer: "Observer",
};

const ASSIGNMENT_ROLES = ["preparer", "reviewer", "approver", "filer"] as const;

const ROLE_TO_FIELD = {
  preparer: "preparer_id",
  reviewer: "reviewer_id",
  approver: "approver_id",
  filer: "filer_id",
} as const;

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/** Maps each task status to a visual icon name. */
const STATUS_ICON: Record<string, IconName> = {
  not_started: "circle-dot",
  assigned: "user-round",
  in_progress: "clock",
  waiting_for_client: "alert-triangle",
  waiting_for_internal: "alert-triangle",
  ready_for_review: "check-circle",
  changes_requested: "alert-triangle",
  ready_for_approval: "shield-check",
  approved: "shield-check",
  ready_to_file: "receipt",
  filed: "file-text",
  delivered: "upload",
  completed: "check-circle",
  cancelled: "x",
};

/** Status pill rendered as a rectangle button with border and bg colour. */
function StatusButton({ status }: { status: TaskStatus }) {
  const iconName = STATUS_ICON[status] ?? "circle-dot";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium",
        badgeClasses(taskStatusTone(status)),
      )}
    >
      <Icon name={iconName} className="h-3 w-3" />
      {taskStatusLabel(status)}
    </span>
  );
}

/** Dropdown showing only the statuses the user can currently transition to. */
function StatusTransitionMenu({ task, onTransition }: { task: TaskDetail; onTransition: () => void }) {
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: (payload: { status: string; reason?: string }) =>
      api.post(`/tasks/${task.id}/status`, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["task", task.id] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onTransition();
      setOpen(false);
      setReason("");
    },
  });

  const visibleStatuses = task.available_transitions ?? [];

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onOutside);
      document.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (visibleStatuses.length === 0) {
    return <StatusButton status={task.status} />;
  }

  const needsReason = (s: string) =>
    ["cancelled", "waiting_for_client", "waiting_for_internal", "changes_requested", "not_started"].includes(s);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium outline-none",
          badgeClasses(taskStatusTone(task.status)),
        )}
         onClick={(e) => {
           e.stopPropagation();
           setOpen(!open);
         }}
       >
         <Icon name={STATUS_ICON[task.status] ?? "circle-dot"} className="h-3 w-3" />
         {taskStatusLabel(task.status)}
        <Icon name="chevron-down" className="h-3 w-3 text-slate-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          {visibleStatuses.map((s) => {
            const requiresReason = needsReason(s);
            const isPendingReason = selectedTarget === s;
            return (
              <div key={s} className="border-b border-slate-100 last:border-0">
                <div className="flex items-center justify-between px-3 py-1.5">
                     <button
                       type="button"
                       className={cn(
                         "flex items-center gap-2 text-left text-xs font-medium outline-none",
                         mutation.isPending ? "cursor-not-allowed opacity-50" : "hover:text-sky-700",
                       )}
                       disabled={mutation.isPending}
                       onClick={(e) => {
                         e.stopPropagation();
                         if (mutation.isPending) return;
                         if (requiresReason) {
                           setSelectedTarget(isPendingReason ? null : s);
                           setReason("");
                         } else {
                           mutation.mutate({ status: s });
                         }
                       }}
                     >
                       <Icon name={STATUS_ICON[s] ?? "circle-dot"} className="h-3 w-3 text-slate-400" />
                       {taskStatusLabel(s)}
                  </button>
                  {requiresReason && isPendingReason && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-sky-700 hover:underline"
                      disabled={mutation.isPending || !reason.trim()}
                      onClick={(e) => {
                        e.stopPropagation();
                        mutation.mutate({ status: s, reason: reason.trim() });
                      }}
                    >
                      {mutation.isPending ? "…" : "Go"}
                    </button>
                  )}
                </div>
                {requiresReason && isPendingReason && (
                  <div className="px-3 pb-2">
                    <textarea
                      className="input w-full resize-y text-xs"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason required…"
                      rows={2}
                      aria-label="Reason for status change"
                      autoFocus
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {mutation.isError && (
        <div className="absolute top-full left-0 mt-1 max-w-xs">
          <p className="text-xs text-rose-700">
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : "Transition failed."}
          </p>
          {mutation.error instanceof ApiError &&
            Array.isArray(mutation.error.details?.blockers) && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-rose-700">
                {(mutation.error.details.blockers as string[]).map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            )}
        </div>
      )}
    </div>
  );
}

/**
 * Inline document request form tied to the current task.
 *
 * Replaces the bare "Request documents" link: instead of navigating away, the user can
 * raise a request in place. The client is taken from the task, and the task itself is
 * attached automatically, so the request shows up on the task's activity log.
 */
function DocumentRequestMenu({
  task,
  onRequested,
}: {
  task: TaskDetail;
  onRequested: () => void;
}) {
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [docType, setDocType] = useState("");

  const mutation = useMutation({
    mutationFn: (payload: { title: string; description?: string; due_date?: string; doc_type?: string }) =>
      api.post<DocumentRequestRow>("/document-requests", {
        ...payload,
        client_id: task.client_id,
        task_id: task.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-requests", task.id] });
      onRequested();
      handleClose();
    },
  });

  const openRequests = useQuery({
    queryKey: ["document-requests", task.id],
    queryFn: () =>
      api.get<{ items: DocumentRequestRow[] }>(
        `/document-requests?task_id=${task.id}&limit=50`,
      ).then((res) => res),
    enabled: Boolean(task.id),
    staleTime: 30_000,
  });

  const pending = openRequests.data?.items.filter(
    (r) => r.status === "open" || r.status === "partially_received",
  ) ?? [];

  const canSubmit =
    title.trim().length >= 2 && !!task.client_id && !mutation.isPending;

  function handleClose() {
    setOpen(false);
    setTitle("");
    setDescription("");
    setDueDate("");
    setDocType("");
    mutation.reset();
  }

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onOutside);
      return () => document.removeEventListener("mousedown", onOutside);
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        className="btn btn-outline inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
        onClick={(e) => {
          e.stopPropagation();
          if (task.client_id) setOpen(!open);
        }}
        disabled={!task.client_id}
      >
        <Icon name="folder-open" className="h-4 w-4" />
        Request documents
        {pending.length > 0 && (
          <span className="tabular flex-shrink-0 rounded bg-slate-200 px-1.5 text-xs text-slate-700">
            {pending.length}
          </span>
        )}
        <Icon name="chevron-down" className="h-3 w-3 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-600">New request for {task.client_name ?? "this client"}</p>
            <input
              type="text"
              className="input mt-2 w-full text-xs"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What do you need?"
              aria-label="Document title"
              maxLength={200}
            />
            <textarea
              className="input mt-2 w-full resize-y text-xs"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              aria-label="Document description"
              rows={2}
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                type="date"
                className="input text-xs"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                aria-label="Due date"
              />
              <input
                type="text"
                className="input text-xs"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                placeholder="Document type (optional)"
                aria-label="Document type"
              />
            </div>
            {mutation.isError && (
              <p role="alert" className="mt-2 text-xs text-rose-600">
                {mutation.error instanceof ApiError
                  ? mutation.error.message
                  : "Could not create document request."}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="btn btn-primary text-xs flex-1"
                disabled={!canSubmit}
                onClick={() => {
                  if (!canSubmit) return;
                  mutation.mutate({
                    title: title.trim(),
                    description: description.trim() || undefined,
                    due_date: dueDate || undefined,
                    doc_type: docType || undefined,
                  });
                }}
              >
                {mutation.isPending ? "Requesting…" : "Request"}
              </button>
              <button
                type="button"
                className="btn btn-outline text-xs gap-2 px-2.5 py-1 rounded-lg"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClose();
                }}
              >
                Cancel
              </button>
            </div>
          </div>

          {pending.length > 0 && (
            <div className="border-t border-slate-200 p-3">
              <p className="mb-1 text-xs font-medium text-slate-600">
                {pending.length} {pending.length === 1 ? "open request" : "open requests"} on this task
              </p>
              <ul className="space-y-1">
                {pending.slice(0, 5).map((req) => (
                  <li key={req.id} className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium text-slate-800">{req.title}</span>
                    {req.due_date && (
                      <span className="text-[10px] text-slate-500">
                        Due {formatDate(req.due_date)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A compact read-only label/value row for the sidebar summary cards. */
function LabelValue({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-[#667085]">{label}</dt>
      <dd className="text-sm font-medium text-[#172B4D]">{value}</dd>
      {hint && <dd className="text-xs text-[#667085]">{hint}</dd>}
    </div>
  );
}

/**
 * The detailed activity timeline for a task.
 *
 * Merges the existing status history and assignment history into a single
 * chronological list, showing every recorded event with the actor, action,
 * timestamp, previous/new values, and reason or context where available.
 * Uses the data already present on the TaskDetail response — no extra API call.
 */
function ActivityTimeline({
  statusHistory,
  assignments,
  directory,
}: {
  statusHistory: TaskStatusHistoryRow[];
  assignments: TaskAssignmentRow[];
  directory: ReturnType<typeof useUserDirectory>;
}) {
  type TimelineEntry =
    | { kind: "status"; data: (typeof statusHistory)[number] }
    | { kind: "assignment"; data: (typeof assignments)[number] };

  const entries: TimelineEntry[] = [
    ...statusHistory.map((e) => ({ kind: "status" as const, data: e })),
    ...assignments.map((e) => ({ kind: "assignment" as const, data: e })),
  ].sort((a, b) => {
    const ta = a.kind === "status" ? a.data.created_at : a.data.assigned_at;
    const tb = b.kind === "status" ? b.data.created_at : b.data.assigned_at;
    return new Date(tb).getTime() - new Date(ta).getTime();
  });

  if (entries.length === 0) {
    return (
      <EmptyState message="No activity recorded yet. Everything that happens from here is logged." />
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {entries.map((entry, index) => {
        const key =
          entry.kind === "status"
            ? `status-${entry.data.id}`
            : `assign-${entry.data.id}`;
        return (
          <li key={key} className="px-4 py-3">
            <ActivityEntry entry={entry} directory={directory} />
          </li>
        );
      })}
    </ul>
  );
}

/** A single row in the activity timeline. */
function ActivityEntry({
  entry,
  directory,
}: {
  entry:
    | { kind: "status"; data: TaskStatusHistoryRow }
    | { kind: "assignment"; data: TaskAssignmentRow };
  directory: ReturnType<typeof useUserDirectory>;
}) {
  if (entry.kind === "status") {
    const e = entry.data;
    return (
      <div className="flex flex-wrap items-start gap-2">
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Icon name="history" className="h-3 w-3" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-xs font-medium text-slate-800">
              Status changed
            </span>
            <span className="text-xs text-slate-400">
              {formatRelative(e.created_at)}
            </span>
            <span className="text-xs text-slate-500">
              by {userName(directory.byId, e.changed_by_id)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {e.from_status ? (
              <>
                <Badge tone={taskStatusTone(e.from_status)}>
                  {taskStatusLabel(e.from_status)}
                </Badge>
                <span aria-hidden="true" className="text-slate-400">
                  →
                </span>
              </>
            ) : (
              <span className="text-xs text-slate-500">Created as</span>
            )}
            <Badge tone={taskStatusTone(e.to_status)}>
              {taskStatusLabel(e.to_status)}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
            <span>Progress: {formatPercent(e.progress_percent)}</span>
            <span>·</span>
            <span>Approval: {humanise(e.approval_status)}</span>
            <span>·</span>
            <span>Filing: {humanise(e.filing_status)}</span>
          </div>
          {e.reason && (
            <p className="mt-1 text-sm text-slate-700">{e.reason}</p>
          )}
        </div>
      </div>
    );
  }

  const a = entry.data;
  return (
    <div className="flex flex-wrap items-start gap-2">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icon name="user-round" className="h-3 w-3" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-xs font-medium text-slate-800">
            {a.is_active ? "Assigned" : "Unassigned"}
          </span>
          <span className="text-xs text-slate-400">
            {formatRelative(a.assigned_at)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {a.is_active && (
            <>
              <Badge tone="neutral">{roleLabel(a.role_in_task)}</Badge>
              <span className="text-sm text-slate-800">
                {userName(directory.byId, a.user_id)}
              </span>
            </>
          )}
          {!a.is_active && (
            <span className="text-sm text-slate-800">
              {roleLabel(a.role_in_task)} role cleared
            </span>
          )}
        </div>
        {a.reason && (
          <p className="mt-1 text-xs italic text-slate-600">Reason: {a.reason}</p>
        )}
        {a.unassigned_at && (
          <p className="mt-1 text-xs text-slate-500">
            Removed {formatDateTime(a.unassigned_at)}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * One task, as a workspace rather than a form.
 *
 * The layout follows the work: the left column is what the task *is* — the files on it,
 * what it says, the checklist that decides when it can close, and the conversation about
 * it. The right column is what can be *changed* about it, and it is the only place that
 * writes. Keeping the two apart is what stops a stray click in the description from
 * moving a task through its workflow.
 *
 * Status, assignment and the task's own fields save through three different endpoints
 * because they are three different permissions. `StatusTransitionMenu` handles status,
 * `AssignPanel` handles assignment, and `TaskEditPanel` handles the task's descriptive
 * fields. This page decides what to render and when to refetch.
 */
export default function TaskDetailPage() {
  const params = useParams<{ taskId: string }>();
  const taskId = params.taskId;
  const queryClient = useQueryClient();
  const directory = useUserDirectory();
   const { data: session } = useSession();
   const canEdit = !session || hasPermission(session, "task.update");
   const canAssign = !session || hasPermission(session, "task.assign");

  const [tab, setTab] = useState<Tab>("comments");
  const [comment, setComment] = useState("");
  const [commentVisibility, setCommentVisibility] = useState<"internal" | "client">("internal");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [editingTaskDetails, setEditingTaskDetails] = useState(false);
  const [editingAssignments, setEditingAssignments] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [stepNameDraft, setStepNameDraft] = useState("");
  const [newStepName, setNewStepName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [removingSubtaskId, setRemovingSubtaskId] = useState<string | null>(null);

  const task = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => api.get<TaskDetail>(`/tasks/${taskId}`),
    enabled: Boolean(taskId),
  });

  const years = useQuery({
    queryKey: ["financial-years"],
    queryFn: () => api.get<FinancialYearRow[]>("/financial-years"),
  });

  const templates = useQuery({
    queryKey: ["task-templates", "for-select"],
    queryFn: () => api.get<{ items: TaskTemplateRow[] }>("/task-templates?limit=200"),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    // The list shows status and progress, so it is stale too.
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["my-queue"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const editTask = useMutation({
    mutationFn: (payload: TaskUpdatePayload) => api.patch<TaskDetail>(`/tasks/${taskId}`, payload),
    onSuccess: () => {
      setEditingTitle(false);
      setEditingDescription(false);
      invalidate();
    },
  });

  const addComment = useMutation({
    mutationFn: (payload: { body: string; visibility: "internal" | "client" }) =>
      api.post<TaskCommentRow>(`/tasks/${taskId}/comments`, payload),
    onSuccess: () => {
      setComment("");
      invalidate();
    },
  });

  const updateStep = useMutation({
    mutationFn: (payload: { stepId: string; status: string }) =>
      api.post(`/tasks/${taskId}/steps/${payload.stepId}`, { status: payload.status }),
    onSuccess: invalidate,
  });

  const addStep = useMutation({
    mutationFn: (name: string) =>
      api.post(`/tasks/${taskId}/steps`, { name }),
    onSuccess: () => {
      setNewStepName("");
      invalidate();
    },
  });

  const updateStepName = useMutation({
    mutationFn: ({ stepId, name, is_mandatory }: { stepId: string; name: string; is_mandatory?: boolean }) =>
      api.post(`/tasks/${taskId}/steps/${stepId}`, { name, ...(is_mandatory !== undefined ? { is_mandatory } : {}) }),
    onSuccess: () => {
      setEditingStepId(null);
      invalidate();
    },
  });

  const deleteStep = useMutation({
    mutationFn: (stepId: string) =>
      api.delete(`/tasks/${taskId}/steps/${stepId}`),
    onSuccess: () => {
      invalidate();
    },
  });

  const saveAsTemplate = useMutation({
    mutationFn: () => {
      const steps = row.steps.map((s, i) => ({
        name: s.name,
        sequence: i + 1,
        is_mandatory: s.is_mandatory,
        requires_review: s.requires_review,
        requires_approval: s.requires_approval,
        requires_filing: s.requires_filing,
        requires_document: s.requires_document,
      }));
      return api.post("/task-templates", {
        name: row.title,
        code: row.task_code,
        steps,
      });
    },
    onSuccess: () => {
      setSavingTemplate(false);
      invalidate();
    },
  });

  const loadTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const detail = await api.get<TaskTemplateRow>(`/task-templates/${templateId}`);
      for (const step of detail.steps ?? []) {
        await api.post(`/tasks/${taskId}/steps`, { name: step.name });
      }
    },
    onSuccess: invalidate,
  });

  const removeSubtask = useMutation({
    mutationFn: (subtaskId: string) =>
      api.patch<TaskDetail>(`/tasks/${subtaskId}`, { parent_task_id: null }),
    onSuccess: () => {
      setRemovingSubtaskId(null);
      invalidate();
    },
  });

  if (task.isPending) return <LoadingState label="Loading task…" />;
  if (task.isError) {
    return (
      <ErrorState
        message={task.error instanceof ApiError ? task.error.message : "Could not load this task."}
      />
    );
  }

  const row = task.data;
  const mandatoryDone = row.steps.filter(
    (step) => step.is_mandatory && step.status === "completed",
  ).length;
  const mandatoryTotal = row.steps.filter((step) => step.is_mandatory).length;
  const year = years.data?.find((entry) => entry.id === row.financial_year_id);

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-4 md:px-6 md:py-6 lg:px-8">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1.5 text-xs text-[#667085]"
        >
        <Link href="/tasks" className="hover:underline">
          Tasks
        </Link>
        {row.category && (
          <>
            <span aria-hidden="true">/</span>
            <Link href={`/tasks?category=${row.category}`} className="hover:underline">
              {humanise(row.category)}
            </Link>
          </>
        )}
        {row.service_name && (
          <>
            <span aria-hidden="true">/</span>
            <span className="text-slate-600">{row.service_name}</span>
          </>
        )}
        {row.parent_task_code && (
          <>
            <span aria-hidden="true">/</span>
            <Link
              href={`/tasks/${row.parent_task_id}`}
              className="hover:underline"
              title={row.parent_task_title ?? undefined}
            >
              {row.parent_task_code}
            </Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span className="font-mono text-slate-700">{row.task_code}</span>
      </nav>

      <Card className="relative overflow-hidden border-t-2 border-t-sky-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {editingTitle ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="input text-[26px] font-semibold"
                  value={titleDraft}
                  autoFocus
                  maxLength={300}
                  aria-label="Task title"
                  onChange={(event) => setTitleDraft(event.target.value)}
                />
                <button
                  type="button"
                  className="btn-primary text-xs"
                  disabled={titleDraft.trim().length < 2 || editTask.isPending}
                  onClick={() => editTask.mutate({ title: titleDraft.trim() })}
                >
                  {editTask.isPending ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline text-xs gap-2 px-2.5 py-1 rounded-lg"
                  onClick={() => setEditingTitle(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <h1 className="flex flex-wrap items-center gap-2 text-[26px] font-semibold text-[#172B4D]">
               <Icon name="file-text" className="h-6 w-6 text-slate-400" />
               {row.title}
                  {canEdit && (
                <button
                  type="button"
                  className="p-1 cursor-pointer text-slate-400 hover:text-[#b45309]"
                  aria-label="Edit task details"
                  onClick={() => {
                    setTitleDraft(row.title);
                    setEditingTitle(true);
                    editTask.reset();
                  }}
                >
                  <Icon name="pencil" className="h-5 w-5 text-[#b45309]" />
                </button>
                )}
             </h1>
          )}
          <p className="mt-1 text-xs text-[#667085]">
            {row.task_code}
            {row.period_key ? ` · ${row.period_key}` : ""}
            {year ? ` · ${year.label}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(row.tags ?? []).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Icon name="tag" className="h-3 w-3 text-slate-400" />
              {(row.tags ?? []).map((tag, i) => (
                <span
                  key={`${tag}-${i}`}
                  className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Icon name="history" className="h-3 w-3" />
            <span>Updated {formatRelative(row.updated_at)}</span>
          </div>
          <button
            type="button"
            className="btn btn-primary inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
            onClick={() => {
              const el = document.getElementById("attachments");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <Icon name="upload" className="h-4 w-4" />
            Attach file
          </button>
          <DocumentRequestMenu task={row} onRequested={invalidate} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusTransitionMenu task={row} onTransition={invalidate} />
        <Badge tone={approvalTone(row.approval_status)} className="text-[11px]">
          <span className="mr-1">
            <Icon name="shield-check" className="h-3 w-3" />
          </span>
          Approval: {humanise(row.approval_status)}
        </Badge>
        <Badge tone={filingTone(row.filing_status)} className="text-[11px]">
          <span className="mr-1">
            <Icon name={row.filing_status === "not_required" ? "circle-dot" : "receipt"} className="h-3 w-3" />
          </span>
          Filing: {humanise(row.filing_status)}
        </Badge>
        <Badge tone={priorityTone(row.priority)} className="text-[11px]">
          <span className="mr-1">
            <Icon name={row.priority === "urgent" ? "alert-triangle" : row.priority === "high" ? "clock" : "file-text"} className="h-3 w-3" />
          </span>
          {humanise(row.priority)}
        </Badge>
      </div>
      </Card>

      {row.completion_blockers.length > 0 && (
        <div className="rounded-md border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-sm text-[#92400E]">
          <div className="flex items-start gap-2">
            <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" />
            <ul className="list-disc space-y-0.5 pl-4">
              {row.completion_blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {editTask.isError && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {editTask.error instanceof ApiError ? editTask.error.message : "The change was refused."}
        </p>
      )}

       <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
         <StatCard
           label="Internal due"
           value={row.internal_due_date ? formatDate(row.internal_due_date) : "—"}
         />
         <StatCard
           label="Statutory due"
           value={row.statutory_due_date ? formatDate(row.statutory_due_date) : "—"}
           hint={!row.deadline_verified ? "Not confirmed by a person" : undefined}
           tone={!row.deadline_verified ? "warning" : "neutral"}
         />
         <StatCard
           label="Checklist"
           value={`${mandatoryDone}/${mandatoryTotal}`}
           hint={mandatoryTotal > 0 ? `${formatPercent(row.progress_percent)} complete` : undefined}
           tone="progress"
         />
         <StatCard label="Estimated effort" value={formatHours(row.estimated_hours)} />
       </div>

       <ProgressBar percent={row.progress_percent} className="mt-3 h-2" />

       {ASSIGNMENT_ROLES.some((role) => {
         const field = ROLE_TO_FIELD[role as keyof typeof ROLE_TO_FIELD];
         return Boolean(field && row[field as keyof TaskDetail]);
       }) && (
         <div className="flex flex-wrap items-center gap-5">
           {ASSIGNMENT_ROLES.map((role) => {
             const field = ROLE_TO_FIELD[role as keyof typeof ROLE_TO_FIELD] as keyof TaskDetail;
             const userId = (row[field] as string | null) ?? null;
             const name = userName(directory.byId, userId);
             const isUnassigned = !userId;
             return (
               <div key={role} className="flex items-center gap-2">
                 <Avatar name={name} size="sm" />
                 <div className="min-w-0">
                   <div className="text-xs text-[#667085]">{roleLabel(role)}</div>
                   <div className={cn("text-sm font-medium", isUnassigned ? "text-slate-400 italic" : "text-[#172B4D]")}>
                     {isUnassigned ? "Unassigned" : name}
                   </div>
                 </div>
               </div>
             );
           })}
         </div>
       )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── What the task is ── */}
        <div className="min-w-0 space-y-5">
          <Card
            title="Description"
            subtitle="Formatted task description"
            icon={<Icon name="file-text" className="h-4 w-4" />}
            className="relative overflow-hidden border-t-2 border-t-sky-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            action={
              !editingDescription && (
                <button
                  type="button"
                  className="p-1 cursor-pointer text-slate-400 hover:text-[#b45309]"
                  onClick={() => {
                    setDescriptionDraft(row.description ?? "");
                    setEditingDescription(true);
                    editTask.reset();
                  }}
                >
                  <Icon name="pencil" className="h-5 w-5 text-[#b45309]" />
                </button>
              )
            }
          >
            <div className="p-4">
              {editingDescription ? (
                <div className="space-y-3">
                  <DescriptionEditor
                    value={descriptionDraft}
                    onChange={setDescriptionDraft}
                    placeholder="What is this work, and what does it need?"
                    rows={10}
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-primary text-xs gap-2 px-2.5 py-1 rounded-lg"
                      disabled={editTask.isPending}
                      onClick={() =>
                        editTask.mutate({ description: descriptionDraft.trim() || null })
                      }
                    >
                      {editTask.isPending ? "Saving…" : "Save description"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline text-xs gap-2 px-2.5 py-1 rounded-lg"
                      onClick={() => setEditingDescription(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : row.description ? (
                <DescriptionBody text={row.description} />
              ) : (
                <p className="text-sm italic text-slate-400">
                  No description yet. Use Edit to write one.
                </p>
              )}
            </div>
          </Card>

          <Card
            title="Checklist"
            subtitle="Progress is computed from these, never hand-entered"
            icon={<Icon name="check-circle" className="h-4 w-4" />}
            className="relative overflow-hidden border-t-2 border-t-emerald-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            action={
              <div className="flex items-center gap-2">
                {templates.data && templates.data.items.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-primary text-xs gap-2 px-2.5 py-1 rounded-lg"
                    disabled={loadingTemplate}
                    onClick={() => setLoadingTemplate(true)}
                  >
                    <Icon name="copy" className="h-3.5 w-3.5" />
                    {loadingTemplate ? "Loading…" : "Load template"}
                  </button>
                )}
              {row.steps.length > 0 && (
                <button
                  type="button"
                  className="btn btn-outline text-xs gap-2 px-2.5 py-1 rounded-lg"
                  disabled={saveAsTemplate.isPending}
                  onClick={() => saveAsTemplate.mutate()}
                >
                  <Icon name="download" className="h-3.5 w-3.5" />
                  {saveAsTemplate.isPending ? "Saving…" : "Save as template"}
                </button>
              )}
              </div>
            }
          >
            <div className="p-4">
              {templates.data && templates.data.items.length > 0 && loadingTemplate && (
                <div className="mb-3 space-y-2">
                  <p className="text-xs text-slate-500">Select a template to copy its steps into this task:</p>
                  <div className="space-y-1">
                    {templates.data.items.map((tmpl) => (
                      <button
                        key={tmpl.id}
                        type="button"
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left border border-slate-200 rounded bg-slate-50 hover:bg-sky-50 hover:border-sky-200 transition-colors"
                        onClick={() => {
                          setLoadingTemplate(false);
                          loadTemplate.mutate(tmpl.id);
                        }}
                      >
                        <span className="text-slate-900">{tmpl.name}</span>
                        <span className="text-slate-400">{tmpl.steps.length} step{tmpl.steps.length === 1 ? "" : "s"}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="w-full flex items-center justify-center gap-1 px-3 py-2 text-xs text-sky-700 hover:bg-sky-50 border rounded"
                      onClick={() => setLoadingTemplate(false)}
                    >
                      <Icon name="x" className="h-3 w-3" />
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {row.steps.length === 0 ? (
                <EmptyState message="This task has no steps." />
              ) : (
                <div className="space-y-1">
                  {row.steps.map((step) => (
                    <div
                      key={step.id}
                      className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5 rounded-lg border border-slate-100"
                    >
                      <div className="min-w-0 flex-1">
                        {editingStepId === step.id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="tabular text-xs text-slate-400">{step.sequence}.</span>
                            <input
                              className="input text-sm"
                              value={stepNameDraft}
                              onChange={(e) => setStepNameDraft(e.target.value)}
                              autoFocus
                              onBlur={() => {
                                if (stepNameDraft.trim()) {
                                  updateStepName.mutate({ stepId: step.id, name: stepNameDraft.trim() });
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && stepNameDraft.trim()) {
                                  updateStepName.mutate({ stepId: step.id, name: stepNameDraft.trim() });
                                }
                                if (e.key === "Escape") {
                                  setEditingStepId(null);
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="btn btn-outline gap-2 px-2.5 py-0.5 rounded"
                              onClick={() => {
                                updateStepName.mutate({ stepId: step.id, name: stepNameDraft.trim(), is_mandatory: !step.is_mandatory });
                              }}
                            >
                              {step.is_mandatory ? "Not mandatory" : "Mandatory"}
                            </button>
                          </div>
                        ) : (
                           <div className="flex flex-wrap items-center gap-2">
                             <span className="tabular text-xs text-slate-400">{step.sequence}.</span>
                             <span
                               className={cn(
                                 step.status === "completed"
                                   ? "text-slate-500 line-through"
                                   : "text-slate-900",
                               )}
                             >
                               {step.name}
                             </span>
                                {canEdit && (
                                  <>
                                  <button
                                    type="button"
                                    className="p-1 cursor-pointer text-slate-400 hover:text-[#b45309]"
                                    disabled={updateStep.isPending}
                                    onClick={() => {
                                      updateStepName.mutate({ stepId: step.id, name: step.name, is_mandatory: !step.is_mandatory });
                                    }}
                                    aria-label={step.is_mandatory ? "Mark as not mandatory" : "Mark as mandatory"}
                                  >
                                    <Icon name="bookmark" className={`h-3.5 w-3.5 ${step.is_mandatory ? "text-[#b45309]" : "text-slate-400"}`} />
                                  </button>
                                  </>
                                )}
                              {step.is_mandatory && <Badge tone="info" className="text-[10px]">Mandatory</Badge>}
                           </div>
                        )}
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {step.requires_review && <Badge tone="warning" className="text-[10px]">Needs review</Badge>}
                          {step.requires_approval && <Badge tone="warning" className="text-[10px]">Needs approval</Badge>}
                          {step.requires_filing && <Badge tone="info" className="text-[10px]">Needs filing</Badge>}
                          {step.requires_document && <Badge tone="neutral" className="text-[10px]">Needs document</Badge>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={stepStatusTone(step.status)}>{humanise(step.status)}</Badge>
                        <select
                          className="input w-auto py-1 text-xs"
                          aria-label={`Status of ${step.name}`}
                          disabled={updateStep.isPending}
                          onChange={(event) =>
                            updateStep.mutate({ stepId: step.id, status: event.target.value })
                          }
                          value={step.status}
                        >
                          {STEP_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {humanise(status)}
                            </option>
                          ))}
                        </select>
                        {canEdit && (
                          <button
                            type="button"
                            className="p-1 cursor-pointer text-slate-400 hover:text-rose-600"
                            onClick={() => {
                              deleteStep.mutate(step.id);
                            }}
                            aria-label="Delete step"
                          >
                            <Icon name="trash" className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <input
                        className="input flex-1 text-sm"
                        value={newStepName}
                        placeholder="New step name…"
                        onChange={(e) => setNewStepName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newStepName.trim()) {
                            addStep.mutate(newStepName.trim());
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary text-xs gap-2 px-2.5 py-1 rounded-lg"
                        disabled={!newStepName.trim() || addStep.isPending}
                        onClick={() => addStep.mutate(newStepName.trim())}
                      >
                        {addStep.isPending ? "Adding…" : "Add step"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <div id="attachments" className="scroll-mt-4">
            <TaskAttachments task={row} />
          </div>

          <Card
            title={`Subtasks${row.subtasks.length > 0 ? ` (${row.subtasks.length})` : ""}`}
            subtitle="Child tasks, each with its own status and checklist"
            icon={<Icon name="users-round" className="h-4 w-4" />}
          >
            {row.subtasks.length === 0 ? (
              <EmptyState message="No subtasks. Break this into smaller pieces from the task list." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {row.subtasks.map((child) => (
                  <li key={child.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <span className="font-mono text-xs text-slate-400">{child.task_code}</span>
                    <Link
                      href={`/tasks/${child.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-sky-700 hover:underline"
                    >
                      {child.title}
                    </Link>
                    <Badge tone={taskStatusTone(child.status)}>
                      {taskStatusLabel(child.status)}
                    </Badge>
                    <span className="tabular text-xs text-slate-500">
                      {formatPercent(child.progress_percent)}
                    </span>
                    <Badge tone={priorityTone(child.priority)}>{humanise(child.priority)}</Badge>
                    {canEdit && (
                      <button
                        type="button"
                        className="text-xs flex items-center gap-1 text-slate-500 hover:text-rose-600 font-medium ml-auto"
                        disabled={removingSubtaskId === child.id}
                        onClick={() => setRemovingSubtaskId(child.id)}
                        aria-label="Remove subtask from parent"
                      >
                        <Icon name="trash" className="h-3 w-3" />
                        Remove
                      </button>
                    )}
                    {removingSubtaskId === child.id && (
                      <div className="flex items-center gap-1 ml-auto">
                        <button
                          type="button"
                          className="text-xs text-rose-600"
                          onClick={() => {
                            removeSubtask.mutate(child.id);
                          }}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className="text-xs text-slate-500"
                          onClick={() => setRemovingSubtaskId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="card">
            <div className="border-b border-slate-200">
              <nav
                className="flex items-center gap-1 overflow-x-auto px-2"
                aria-label="Task sections"
              >
                {(
                  [
                    { key: "comments", label: "Comments", count: row.comments.length },
                    { key: "activity", label: "Activity", count: row.status_history.length + row.assignments.length },
                    { key: "time", label: "Time tracking", count: null },
                  ] as Array<{ key: Tab; label: string; count: number | null }>
                ).map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    className={cn(
                      "shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap",
                      tab === entry.key
                        ? "border-sky-600 text-sky-700"
                        : "border-transparent text-slate-500 hover:text-slate-700",
                    )}
                    onClick={() => setTab(entry.key)}
                  >
                    {entry.label}
                    {entry.count !== null && entry.count > 0
                      ? ` (${entry.count})`
                      : ""}
                  </button>
                ))}
              </nav>
            </div>

            {tab === "comments" && (
              <div>
                <div className="border-b border-slate-200 p-4">
                  <textarea
                    className="input min-h-[4rem]"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Write a comment or update…"
                    aria-label="New comment"
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <span>Visible to</span>
                      <select
                        className="input w-auto py-1 text-xs"
                        value={commentVisibility}
                        aria-label="Comment visibility"
                        onChange={(event) =>
                          setCommentVisibility(event.target.value as "internal" | "client")
                        }
                      >
                        <option value="internal">Firm only</option>
                        <option value="client">Client portal too</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary text-xs gap-2 px-2.5 py-1 rounded-lg"
                      disabled={addComment.isPending || comment.trim().length === 0}
                      onClick={() =>
                        addComment.mutate({ body: comment.trim(), visibility: commentVisibility })
                      }
                    >
                      {addComment.isPending ? "Posting…" : "Post comment"}
                    </button>
                  </div>
                  {addComment.isError && (
                    <p role="alert" className="mt-2 text-sm text-rose-700">
                      {addComment.error instanceof ApiError
                        ? addComment.error.message
                        : "The comment was refused."}
                    </p>
                  )}
                </div>

                {row.comments.length === 0 ? (
                  <EmptyState message="No comments yet." />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {row.comments.map((entry) => (
                      <li key={entry.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-slate-700">
                            {entry.author_type === "system"
                              ? "System"
                              : userName(directory.byId, entry.author_user_id)}
                          </span>
                          <Badge tone={entry.visibility === "internal" ? "neutral" : "info"}>
                            {entry.visibility === "internal" ? "Firm only" : "Client visible"}
                          </Badge>
                          {entry.is_review_note && <Badge tone="progress">Review note</Badge>}
                          <span className="text-xs text-slate-400">
                            {formatRelative(entry.created_at)}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                          {entry.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === "activity" && (
              <ActivityTimeline
                statusHistory={row.status_history}
                assignments={row.assignments}
                directory={directory}
              />
            )}

            {tab === "time" && <WorkLogPanel task={row} />}
          </div>
        </div>

        {/* ── What can be changed ── */}
        <div className="space-y-5">
          {editingTaskDetails ? (
            <>
              <TaskEditPanel task={row} onSaved={() => { invalidate(); setEditingTaskDetails(false); }} onCancel={() => setEditingTaskDetails(false)} />
              <button
                type="button"
                className="btn btn-outline text-xs gap-2 px-2.5 py-1 rounded-lg"
                onClick={() => setEditingTaskDetails(false)}
              >
                ← Back to summary
              </button>
            </>
          ) : (
            <>
            <Card
              title="Client"
              subtitle={row.service_name ?? undefined}
              icon={<Icon name="building" className="h-4 w-4" />}
              className="relative overflow-hidden border-t-2 border-t-violet-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              action={
                <button
                  type="button"
                  className="p-1 cursor-pointer text-slate-400 hover:text-[#b45309]"
                  onClick={() => setEditingTaskDetails(true)}
                >
                  <Icon name="pencil" className="h-5 w-5 text-[#b45309]" />
                </button>
              }
            >
              <div className="p-4 space-y-2">
                <LabelValue label="Client" value={row.client_name ?? "—"} />
                <LabelValue label="Service" value={row.service_name ?? "—"} />
                {row.client_id && (
                  <Link
                    href={`/clients/${row.client_id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline"
                  >
                    <Icon name="arrow-right" className="h-3 w-3" />
                    View client
                  </Link>
                )}
              </div>
            </Card>

            <Card title="Task details" icon={<Icon name="file-text" className="h-4 w-4" />} className="relative overflow-hidden border-t-2 border-t-amber-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
              <div className="p-4 space-y-2">
                <LabelValue label="Priority" value={humanise(row.priority)} />
                <LabelValue label="Internal due" value={row.internal_due_date ? formatDate(row.internal_due_date) : "—"} />
                <LabelValue
                  label="Statutory due"
                  value={row.statutory_due_date ? formatDate(row.statutory_due_date) : "—"}
                  hint={!row.deadline_verified ? "Not confirmed by a person" : undefined}
                />
                <LabelValue label="Period" value={row.period_key ?? "—"} />
                <LabelValue label="Financial year" value={year ? year.label : (row.financial_year_id ? row.financial_year_id : "—")} />
                <LabelValue label="Estimated effort" value={formatHours(row.estimated_hours)} />
              </div>
            </Card>

              <Card title="Tags" icon={<Icon name="tag" className="h-4 w-4" />} className="relative overflow-hidden border-t-2 border-t-slate-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
               <div className="p-4">
                 {(row.tags ?? []).length > 0 ? (
                   <div className="flex flex-wrap gap-1.5">
                     {(row.tags ?? []).map((tag, i) => (
                       <span
                         key={`${tag}-${i}`}
                         className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                       >
                         {tag}
                       </span>
                     ))}
                   </div>
                 ) : (
                   <p className="text-xs text-slate-400">No tags.</p>
                 )}
               </div>
             </Card>

              <Card
                title="Assignees"
                icon={<Icon name="user-round" className="h-4 w-4" />}
                className="relative overflow-hidden border-t-2 border-t-sky-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                action={
                  canAssign ? (
                  <button
                    type="button"
                    className="p-1 cursor-pointer text-slate-400 hover:text-[#b45309]"
                    onClick={() => setEditingAssignments(true)}
                  >
                    <Icon name="pencil" className="h-5 w-5 text-[#b45309]" />
                  </button>
                  ) : null
                }
             >
               <div className="p-4 space-y-3">
                 {ASSIGNMENT_ROLES.map((role) => {
                   const field = ROLE_TO_FIELD[role as keyof typeof ROLE_TO_FIELD] as keyof TaskDetail;
                   const userId = (row[field] as string | null) ?? null;
                   const name = userName(directory.byId, userId);
                   return (
                     <div key={role} className="flex items-center gap-2">
                       <Avatar name={name} size="sm" />
                       <div className="min-w-0">
                         <dt className="text-xs text-[#667085]">{roleLabel(role)}</dt>
                         <dd className={cn("text-sm font-medium", !userId ? "text-slate-400 italic" : "text-[#172B4D]")}>
                           {userId ? name : "Unassigned"}
                         </dd>
                       </div>
                     </div>
                   );
                 })}
               </div>
             </Card>

              {editingAssignments ? (
                <>
                  <AssignPanel task={row} onChanged={() => setEditingAssignments(false)} />
                  <button
                    type="button"
                    className="btn btn-outline text-xs gap-2 px-2.5 py-1 rounded-lg"
                    onClick={() => setEditingAssignments(false)}
                  >
                    ← Back to summary
                  </button>
                </>
              ) : null}
            </>
          )}

          <FilingPanel task={row} onChanged={invalidate} />
        </div>
      </div>
    </div>
  );
}

