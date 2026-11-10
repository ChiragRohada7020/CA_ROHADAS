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
import { Badge, Card, EmptyState, ErrorState, LoadingState, Modal, ProgressBar, StatCard } from "@/components/ui";
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
import type {
  DocumentRequestRow,
  FinancialYearRow,
  TaskAssignmentRow,
  TaskCommentRow,
  TaskDetail,
  TaskStatus,
  TaskStatusHistoryRow,
  TaskTemplateRow,
  TaskUpdatePayload,
} from "@/lib/types";

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
        <Icon name="chevron-down" className="h-3 w-3 text-[#6B7280]" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-lg">
          {visibleStatuses.map((s) => {
            const requiresReason = needsReason(s);
            const isPendingReason = selectedTarget === s;
            return (
              <div key={s} className="border-b border-[#EEF0F7] last:border-0">
                <div className="flex items-center justify-between px-3 py-1.5">
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-2 text-left text-xs font-medium outline-none",
                      mutation.isPending ? "cursor-not-allowed opacity-50" : "hover:bg-[#F8F6FF]",
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
                    <Icon name={STATUS_ICON[s] ?? "circle-dot"} className="h-3 w-3 text-[#6B7280]" />
                    {taskStatusLabel(s)}
                  </button>
                  {requiresReason && isPendingReason && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-[#7543E9] hover:underline"
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
                  <div className="px-3 py-2">
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
          <p className="text-xs text-[#DC2626]">
            {mutation.error instanceof ApiError ? mutation.error.message : "Transition failed."}
          </p>
          {mutation.error instanceof ApiError &&
            Array.isArray(mutation.error.details?.blockers) && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-[#DC2626]">
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

/** Inline document request form tied to the current task. */
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
      api.get<{ items: DocumentRequestRow[] }>(`/document-requests?task_id=${task.id}&limit=50`).then((res) => res),
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

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        className="rounded-lg border border-[#ECEAF4] bg-[#FCFBFF] px-3 py-2 text-xs font-medium text-[#454B68] hover:bg-[#F5F0FF] hover:border-[#CFC0F8] transition"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        <Icon name="file-text" className="h-3 w-3 mr-1" />
        Request documents
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-lg border border-[#E4E6F2] bg-white shadow-[0_10px_28px_rgba(38,35,82,.08)]">
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[.1em] text-[#737A96]">
                Title
              </label>
              <input
                className="input mt-1 h-10 w-full rounded-xl border-[#E3E5F0] bg-white px-3 text-xs focus:border-[#9A7AEF] focus:ring-4 focus:ring-[#EEE8FF]"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What documents do you need?"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[.1em] text-[#737A96]">
                Description (optional)
              </label>
              <textarea
                className="input mt-1 h-24 w-full resize-y rounded-xl border-[#E3E5F0] bg-white px-3 text-xs focus:border-[#9A7AEF] focus:ring-4 focus:ring-[#EEE8FF]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Any details for the client?"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[.1em] text-[#737A96]">
                  Due date
                </label>
                <input
                  type="date"
                  className="input mt-1 h-10 w-full rounded-xl border-[#E3E5F0] bg-white px-3 text-xs focus:border-[#9A7AEF] focus:ring-4 focus:ring-[#EEE8FF]"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[.1em] text-[#737A96]">
                  Type (optional)
                </label>
                <input
                  className="input mt-1 h-10 w-full rounded-xl border-[#E3E5F0] bg-white px-3 text-xs focus:border-[#9A7AEF] focus:ring-4 focus:ring-[#EEE8FF]"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  placeholder="e.g. Bank statements"
                />
              </div>
            </div>

            {pending.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[#EEF0F7]">
                <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#737A96]">
                  Already requested
                </p>
                <ul className="space-y-1.5">
                  {pending.map((r) => (
                    <li key={r.id} className="flex items-start gap-2">
                      <Icon name="file-text" className="mt-0.5 h-3.5 w-3.5 text-[#9CA3AF]" />
                      <span className="text-xs text-[#4B5563] truncate">{r.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-xs font-medium text-[#6B7280] hover:bg-[#F3F4F6]"
                onClick={handleClose}
                disabled={mutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-gradient-to-r from-[#7543E9] to-[#5B31CC] px-4 py-2 text-xs font-medium text-white shadow-[0_5px_14px_rgba(104,61,213,.22)] hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={!canSubmit || mutation.isPending}
                onClick={() => {
                  mutation.mutate({ title: title.trim(), description: description.trim() || undefined, due_date: dueDate || undefined, doc_type: docType || undefined });
                }}
              >
                {mutation.isPending ? "Requesting…" : "Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One task, as a workspace rather than a form.
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
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
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
    mutationFn: (name: string) => api.post(`/tasks/${taskId}/steps`, { name }),
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
    mutationFn: (stepId: string) => api.delete(`/tasks/${taskId}/steps/${stepId}`),
    onSuccess: () => {
      invalidate();
    },
  });

  const saveAsTemplate = useMutation({
    mutationFn: () => {
      const steps = row?.steps.map((s, i) => ({
        name: s.name,
        sequence: i + 1,
        is_mandatory: s.is_mandatory,
        requires_review: s.requires_review,
        requires_approval: s.requires_approval,
        requires_filing: s.requires_filing,
        requires_document: s.requires_document,
      }));
      return api.post("/task-templates", {
        name: row?.title,
        code: row?.task_code,
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
      <ErrorState message={task.error instanceof ApiError ? task.error.message : "Could not load this task."} />
    );
  }

  const row = task.data;
  const mandatoryDone = row.steps.filter(
    (step) => step.is_mandatory && step.status === "completed",
  ).length;
  const mandatoryTotal = row.steps.filter((step) => step.is_mandatory).length;
  const year = years.data?.find((entry) => entry.id === row.financial_year_id);

  return (
    <div className="min-h-full space-y-5 bg-[#F7F8FC] p-4 md:p-5 xl:p-6">
      {/* Page heading */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-[#777E9B]">
            <Link href="/tasks" className="transition hover:text-[#6637D7]">Tasks</Link>
            {row.category && (
              <>
                <span aria-hidden="true">/</span>
                <Link href={`/tasks?category=${row.category}`} className="transition hover:text-[#6637D7]">{humanise(row.category)}</Link>
              </>
            )}
            {row.service_name && (
              <>
                <span aria-hidden="true">/</span>
                <span className="text-[#777E9B]">{row.service_name}</span>
              </>
            )}
            {row.parent_task_code && (
              <>
                <span aria-hidden="true">/</span>
                <Link href={`/tasks/${row.parent_task_id}`} className="transition hover:text-[#6637D7]" title={row.parent_task_title ?? undefined}>
                  {row.parent_task_code}
                </Link>
              </>
            )}
            <span aria-hidden="true">/</span>
            <span className="font-mono text-[#343A58]">{row.task_code}</span>
          </nav>

          <h1 className="flex items-center gap-2 text-[28px] font-bold tracking-[-.045em] text-[#171A32]">
            <Icon name="file-text" className="h-6 w-6 text-[#7543E9]" />
            {row.title}
          </h1>

          <p className="mt-1 text-sm text-[#737A96]">
            {row.task_code}
            {row.period_key ? ` · ${row.period_key}` : ""}
            {year ? ` · ${year.label}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(row.tags ?? []).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Icon name="tag" className="h-3 w-3 text-[#9CA3AF]" />
              {(row.tags ?? []).map((tag, i) => (
                <span key={`${tag}-${i}`} className="inline-flex items-center rounded-md bg-[#F0E9FF] px-2 py-0.5 text-[10px] text-[#713FE6]">
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-[#9CA3AF]">
            <Icon name="history" className="h-3 w-3" />
            <span>Updated {formatRelative(row.updated_at)}</span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#7543E9] to-[#5B31CC] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_7px_18px_rgba(104,61,213,.22)] transition hover:-translate-y-0.5 hover:shadow-lg"
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

      {/* Task header card */}
      <section className="overflow-hidden rounded-2xl border border-[#E4E6F2] bg-white shadow-[0_8px_28px_rgba(38,35,82,.055)]">
        <div className="px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              {editingTitle ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="input text-[26px] font-semibold w-full max-w-[600px] rounded-xl border-[#E3E5F0] bg-white px-3 py-2 text-xs focus:border-[#9A7AEF] focus:ring-4 focus:ring-[#EEE8FF]"
                    value={titleDraft}
                    autoFocus
                    maxLength={300}
                    aria-label="Task title"
                    onChange={(event) => setTitleDraft(event.target.value)}
                  />
                  <button
                    type="button"
                    className="rounded-lg bg-gradient-to-r from-[#7543E9] to-[#5B31CC] px-4 py-2.5 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={titleDraft.trim().length < 2 || editTask.isPending}
                    onClick={() => editTask.mutate({ title: titleDraft.trim() })}
                  >
                    {editTask.isPending ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-[#ECEAF4] bg-[#FCFBFF] px-4 py-2.5 text-xs font-semibold text-[#454B68] hover:bg-[#F5F0FF] hover:border-[#CFC0F8] transition"
                    onClick={() => setEditingTitle(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <h1 className="flex items-center gap-2 text-[26px] font-bold text-[#171A32]">
                  <Icon name="file-text" className="h-5 w-5 text-[#9CA3AF]" />
                  {row.title}
                  {canEdit && (
                    <button
                      type="button"
                      className="p-1 cursor-pointer text-[#9CA3AF] hover:text-[#6D3AE8]"
                      aria-label="Edit task details"
                      onClick={() => {
                        setTitleDraft(row.title);
                        setEditingTitle(true);
                        editTask.reset();
                      }}
                    >
                      <Icon name="pencil" className="h-4 w-4 text-[#6D3AE8]" />
                    </button>
                  )}
                </h1>
              )}
              <p className="mt-1 text-xs text-[#737A96]">
                {row.task_code}
                {row.period_key ? ` · ${row.period_key}` : ""}
                {year ? ` · ${year.label}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StatusTransitionMenu task={row} onTransition={invalidate} />
            <Badge tone={approvalTone(row.approval_status)} className="text-[10px]">
              <span className="mr-1">
                <Icon name="shield-check" className="h-3 w-3" />
              </span>
              Approval: {humanise(row.approval_status)}
            </Badge>
            <Badge tone={filingTone(row.filing_status)} className="text-[10px]">
              <span className="mr-1">
                <Icon name={row.filing_status === "not_required" ? "circle-dot" : "receipt"} className="h-3 w-3" />
              </span>
              Filing: {humanise(row.filing_status)}
            </Badge>
            <Badge tone={priorityTone(row.priority)} className="text-[10px]">
              <span className="mr-1">
                <Icon name={row.priority === "urgent" ? "alert-triangle" : row.priority === "high" ? "clock" : "file-text"} className="h-3 w-3" />
              </span>
              {humanise(row.priority)}
            </Badge>
          </div>

          {row.completion_blockers.length > 0 && (
            <div className="mt-4 rounded-lg border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-sm text-[#92400E]">
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
            <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {editTask.error instanceof ApiError ? editTask.error.message : "The change was refused."}
            </p>
          )}
        </div>
      </section>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Internal due" value={row.internal_due_date ? formatDate(row.internal_due_date) : "—"} />
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

      {/* Assignments */}
      {ASSIGNMENT_ROLES.some((role) => {
        const field = ROLE_TO_FIELD[role as keyof typeof ROLE_TO_FIELD];
        return Boolean(field && row[field as keyof TaskDetail]);
      }) && (
        <>
          <section className="overflow-hidden rounded-2xl border border-[#E4E6F2] bg-white shadow-[0_8px_28px_rgba(38,35,82,.055)] mt-5">
            <div className="flex items-center justify-between border-b border-[#EEF0F7] bg-[#F5F1FF] px-4 py-3">
              <div className="flex items-center gap-2">
                <Icon name="user-round" className="h-4 w-4 text-[#7543E9]" />
                <h3 className="text-sm font-bold text-[#171A32]">Assignees</h3>
              </div>
              {canAssign && (
                <button
                  type="button"
                  className="p-1.5 cursor-pointer text-[#9CA3AF] hover:text-[#6D3AE8] hover:bg-[#F5F1FF] rounded-lg transition"
                  onClick={() => setShowAssignModal(true)}
                  aria-label="Edit assignees"
                >
                  <Icon name="pencil" className="h-4 w-4 text-[#6D3AE8]" />
                </button>
              )}
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ASSIGNMENT_ROLES.map((role) => {
                const field = ROLE_TO_FIELD[role as keyof typeof ROLE_TO_FIELD] as keyof TaskDetail;
                const userId = (row[field] as string | null) ?? null;
                const name = userName(directory.byId, userId);
                const isUnassigned = !userId;
                return (
                  <div key={role} className="flex items-center gap-3 rounded-xl border border-[#ECEAF4] bg-[#FCFBFF] p-3 hover:border-[#CFC0F8] transition">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#F0E9FF] text-[#7543E9]">
                      <Avatar name={name} size="sm" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-[#737A96]">{roleLabel(role)}</div>
                      <div className={cn("text-sm font-medium", isUnassigned ? "text-[#9CA3AF] italic" : "text-[#171A32]")}>
                        {isUnassigned ? "Unassigned" : name}
                      </div>
                    </div>
                  </div>
                );
            })}
          </div>
        </section>
        </>
      )}
  
      {/* Client info */}
      {row.client_id && (
        <section className="overflow-hidden rounded-2xl border border-[#E4E6F2] bg-white shadow-[0_8px_28px_rgba(38,35,82,.055)]">
          <div className="flex items-center justify-between border-b border-[#EEF0F7] bg-[#F8F6FF] px-4 py-3">
            <div className="flex items-center gap-2">
              <Icon name="user-round" className="h-4 w-4 text-[#7543E9]" />
              <h3 className="text-sm font-bold text-[#171A32]">Client</h3>
            </div>
          </div>
          <div className="px-4 py-4">
            <Link
              href={`/clients/${row.client_id}`}
              className="flex items-center gap-3 rounded-xl border border-[#ECEAF4] bg-[#FCFBFF] px-4 py-3 hover:border-[#CFC0F8] hover:bg-[#F5F0FF] transition"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#F0E9FF] text-[#7543E9]">
                <Icon name="user-round" className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#171A32]">{row.client_name ?? "Client"}</div>
                <div className="text-[10px] text-[#737A96]">Open client details</div>
              </div>
              <Icon name="arrow-right" className="h-4 w-4 text-[#9CA3AF] shrink-0" />
            </Link>
          </div>
        </section>
      )}
 
      {/* Main content */}
      <div className="grid items-start gap-5 mt-5 lg:grid-cols-[minmax(0,1fr)_360px]">

        {/* Left: What the task is */}
        <div className="min-w-0 space-y-5">
          {/* Description */}
          <section className="overflow-hidden rounded-2xl border border-[#E4E6F2] bg-white shadow-[0_8px_28px_rgba(38,35,82,.055)]">
            <div className="flex items-center justify-between border-b border-[#EEF0F7] bg-[#F8F6FF] px-4 py-3">
              <div className="flex items-center gap-2">
                <Icon name="file-text" className="h-4 w-4 text-[#7543E9]" />
                <h3 className="text-sm font-bold text-[#171A32]">Description</h3>
              </div>
              {canEdit && (
                <button
                  type="button"
                  className="p-1.5 cursor-pointer text-[#9CA3AF] hover:text-[#6D3AE8] hover:bg-[#F5F1FF] rounded-lg transition"
                  onClick={() => {
                    setDescriptionDraft(row.description ?? "");
                    setEditingDescription(true);
                    editTask.reset();
                  }}
                >
                  <Icon name="pencil" className="h-4 w-4 text-[#6D3AE8]" />
                </button>
              )}
            </div>
            <div className="p-4">
              {editingDescription ? (
                <div className="space-y-3">
                  <DescriptionEditor
                    value={descriptionDraft}
                    onChange={setDescriptionDraft}
                    placeholder="What is this work, and anything the preparer needs to know."
                    rows={10}
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-gradient-to-r from-[#7543E9] to-[#5B31CC] px-4 py-2 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                      disabled={editTask.isPending}
                      onClick={() => editTask.mutate({ description: descriptionDraft.trim() || null })}
                    >
                      {editTask.isPending ? "Saving…" : "Save description"}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-[#ECEAF4] bg-[#FCFBFF] px-4 py-2 text-xs font-semibold text-[#454B68] hover:bg-[#F5F0FF] hover:border-[#CFC0F8] transition"
                      onClick={() => setEditingDescription(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : row.description ? (
                <DescriptionBody text={row.description} />
              ) : (
                <p className="text-sm italic text-[#9CA3AF]">
                  No description yet. Use Edit to write one.
                </p>
              )}
            </div>
          </section>

          {/* Checklist */}
          <section className="overflow-hidden rounded-2xl border border-[#E4E6F2] bg-white shadow-[0_8px_28px_rgba(38,35,82,.055)]">
            <div className="flex items-center justify-between border-b border-[#EEF0F7] bg-[#F8F6FF] px-4 py-3">
              <div className="flex items-center gap-2">
                <Icon name="check-circle" className="h-4 w-4 text-[#16A34A]" />
                <h3 className="text-sm font-bold text-[#171A32]">Checklist</h3>
              </div>
              {canEdit && (
                <button
                  type="button"
                  className="p-1.5 cursor-pointer text-[#9CA3AF] hover:text-[#6D3AE8] hover:bg-[#F5F1FF] rounded-lg transition"
                  onClick={() => setShowChecklistModal(true)}
                  aria-label="Edit checklist"
                >
                  <Icon name="pencil" className="h-4 w-4 text-[#6D3AE8]" />
                </button>
              )}
              <div className="flex items-center gap-2">
                {templates.data && templates.data.items.length > 0 && (
                  <button
                    type="button"
                    className="rounded-lg border border-[#ECEAF4] bg-[#FCFBFF] px-3 py-2 text-xs font-medium text-[#454B68] hover:bg-[#F5F0FF] hover:border-[#CFC0F8] transition"
                    disabled={loadingTemplate}
                    onClick={() => setLoadingTemplate(true)}
                  >
                    <Icon name="copy" className="h-3.5 w-3.5 mr-1" />
                    {loadingTemplate ? "Loading…" : "Load template"}
                  </button>
                )}
                {row.steps.length > 0 && (
                  <button
                    type="button"
                    className="rounded-lg border border-[#ECEAF4] bg-[#FCFBFF] px-3 py-2 text-xs font-medium text-[#454B68] hover:bg-[#F5F0FF] hover:border-[#CFC0F8] transition"
                    disabled={savingTemplate}
                    onClick={() => saveAsTemplate.mutate()}
                  >
                    <Icon name="download" className="h-3.5 w-3.5 mr-1" />
                    {savingTemplate ? "Saving…" : "Save as template"}
                  </button>
                )}
              </div>
            </div>
            <div className="p-4">
              {templates.data && templates.data.items.length > 0 && loadingTemplate && (
                <div className="mb-3 space-y-2">
                  <p className="text-xs text-[#737A96]">Select a template to copy its steps into this task:</p>
                  <div className="space-y-1">
                    {templates.data.items.map((tmpl) => (
                      <button
                        key={tmpl.id}
                        type="button"
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left border border-[#ECEAF4] bg-[#FCFBFF] rounded hover:bg-[#F5F0FF] hover:border-[#CFC0F8] transition"
                        onClick={() => {
                          setLoadingTemplate(false);
                          loadTemplate.mutate(tmpl.id);
                        }}
                      >
                        <span className="text-[#171A32]">{tmpl.name}</span>
                        <span className="text-[#737A96]">{tmpl.steps.length} step{tmpl.steps.length === 1 ? "" : "s"}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="w-full flex items-center justify-center gap-1 px-3 py-2 text-xs text-[#7543E9] hover:bg-[#F5F0FF] border rounded"
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
                      className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5 rounded-lg border border-[#EEF0F7]"
                    >
                      <div className="min-w-0 flex-1">
                        {editingStepId === step.id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="tabular text-xs text-[#737A96]">{step.sequence}.</span>
                            <input
                              className="input text-sm w-48 rounded-xl border-[#E3E5F0] bg-white px-2 py-1 focus:border-[#9A7AEF] focus:ring-4 focus:ring-[#EEE8FF]"
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
                              className="rounded-lg border border-[#ECEAF4] bg-[#FCFBFF] px-3 py-1 text-[10px] font-medium text-[#454B68] hover:bg-[#F5F0FF] hover:border-[#CFC0F8] transition"
                              onClick={() => {
                                updateStepName.mutate({ stepId: step.id, name: stepNameDraft.trim(), is_mandatory: !step.is_mandatory });
                              }}
                            >
                              {step.is_mandatory ? "Not mandatory" : "Mandatory"}
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="tabular text-xs text-[#737A96]">{step.sequence}.</span>
                            <span
                              className={cn(
                                step.status === "completed" ? "text-[#737A96] line-through" : "text-[#171A32]",
                              )}
                            >
                              {step.name}
                            </span>
                            {canEdit && (
                              <>
                                <Badge tone={stepStatusTone(step.status)} className="text-[10px]">
                                  {humanise(step.status)}
                                </Badge>
                                <button
                                  type="button"
                                  className="text-xs text-[#9CA3AF] hover:text-[#DC2626] p-1"
                                  onClick={() => {
                                    updateStep.mutate({ stepId: step.id, status: step.status === "completed" ? "pending" : "completed" });
                                  }}
                                >
                                  <Icon name={step.status === "completed" ? "check-circle" : "circle-dot"} className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="p-1 cursor-pointer text-[#9CA3AF] hover:text-[#DC2626]"
                        onClick={() => deleteStep.mutate(step.id)}
                        aria-label="Remove step"
                      >
                        <Icon name="trash" className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Subtasks */}
          {(row.subtasks?.length ?? 0) > 0 && (
            <section className="overflow-hidden rounded-2xl border border-[#E4E6F2] bg-white shadow-[0_8px_28px_rgba(38,35,82,.055)]">
              <div className="flex items-center justify-between border-b border-[#EEF0F7] bg-[#F8F6FF] px-4 py-3">
              <div className="flex items-center gap-2">
                <Icon name="documents" className="h-4 w-4 text-[#7543E9]" />
                <h3 className="text-sm font-bold text-[#171A32]">Subtasks</h3>
              </div>
              </div>
              <div className="p-4 space-y-2">
                {row.subtasks.map((child) => (
                  <div
                    key={child.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[#EEF0F7] p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/tasks/${child.id}`}
                        className="min-w-0 truncate text-sm font-medium text-[#171A32] hover:underline"
                      >
                        {child.title}
                      </Link>
                      <Badge tone={taskStatusTone(child.status)} className="text-[10px]">
                        {taskStatusLabel(child.status)}
                      </Badge>
                      <span className="tabular text-xs text-[#737A96]">{formatPercent(child.progress_percent)}</span>
                      <Badge tone={priorityTone(child.priority)}>{humanise(child.priority)}</Badge>
                      {canEdit && (
                        <button
                          type="button"
                          className="text-xs text-[#9CA3AF] hover:text-[#DC2626] p-1"
                          onClick={() => setRemovingSubtaskId(child.id)}
                          aria-label="Remove subtask from parent"
                        >
                          <Icon name="trash" className="h-3 w-3" />
                        </button>
                      )}
                      {removingSubtaskId === child.id && (
                        <div className="flex items-center gap-1 ml-auto">
                          <button
                            type="button"
                            className="text-xs text-[#DC2626]"
                            onClick={() => removeSubtask.mutate(child.id)}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            className="text-xs text-[#737A96]"
                            onClick={() => setRemovingSubtaskId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right: attachments */}
        <aside className="space-y-4 lg:sticky lg:top-5">
          <section id="attachments" className="overflow-hidden rounded-2xl border border-[#E4E6F2] bg-white shadow-[0_8px_28px_rgba(38,35,82,.055)]">
            <div className="flex items-center justify-between border-b border-[#EEF0F7] bg-[#F8F6FF] px-4 py-3">
              <div className="flex items-center gap-2">
                <Icon name="paperclip" className="h-4 w-4 text-[#7543E9]" />
                <h3 className="text-sm font-bold text-[#171A32]">Attachments</h3>
              </div>
            </div>
            <div className="p-4">
              <TaskAttachments task={row} />
            </div>
          </section>
        </aside>
      </div>

      {/* Tabs panel */}
      <section className="overflow-hidden rounded-2xl border border-[#E4E6F2] bg-white shadow-[0_8px_28px_rgba(38,35,82,.055)] mt-5">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-[#EEF0F7] px-4 py-3">
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
                "shrink-0 border-b-2 px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                tab === entry.key
                  ? "border-[#7543E9] bg-[#F0E9FF] text-[#7543E9]"
                  : "border-transparent text-[#737A96] hover:bg-[#F8F6FF] hover:text-[#6D3AE8]",
              )}
              onClick={() => setTab(entry.key)}
            >
              {entry.label}
              {entry.count !== null && entry.count > 0
                ? <span className="ml-1.5 rounded-full px-1 py-0.5 text-[10px] font-semibold border border-white/40 bg-white/20 text-white">{entry.count}</span>
                : null}
            </button>
          ))}
        </div>

        {tab === "comments" && (
          <div className="p-4">
            <textarea
              className="input min-h-[4rem] w-full rounded-xl border-[#E3E5F0] bg-white px-3 py-2 text-xs focus:border-[#9A7AEF] focus:ring-4 focus:ring-[#EEE8FF]"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Write a comment or update…"
              aria-label="New comment"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-[10px] text-[#737A96]">
                <span>Visible to</span>
                <select
                  className="input h-8 w-auto rounded-lg border-[#E3E5F0] bg-white px-2 text-[10px] focus:border-[#9A7AEF] focus:ring-0"
                  value={commentVisibility}
                  aria-label="Comment visibility"
                  onChange={(event) => setCommentVisibility(event.target.value as "internal" | "client")}
                >
                  <option value="internal">Internal team</option>
                  <option value="client">Client</option>
                </select>
              </label>
              <button
                type="button"
                className="rounded-lg bg-gradient-to-r from-[#7543E9] to-[#5B31CC] px-4 py-2 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={!comment.trim() || addComment.isPending}
                onClick={() => addComment.mutate({ body: comment.trim(), visibility: commentVisibility })}
              >
                {addComment.isPending ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        )}

        {tab === "activity" && (
          <div className="p-4 space-y-3">
            {row.status_history.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-[.1em] text-[#737A96] mb-3">Status history</h4>
                <div className="space-y-2">
                  {row.status_history.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[#E5E4F4] bg-[#F1ECFF] text-[#7543E9]">
                        <Icon name="clock" className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-[#171A32]">{userName(directory.byId, entry.changed_by_id)}</span>
                          <Badge tone={taskStatusTone(entry.to_status)} className="text-[10px]">
                            {taskStatusLabel(entry.to_status)}
                          </Badge>
                        </div>
                        {entry.reason && (
                          <p className="mt-0.5 text-[10px] text-[#737A96] italic">Reason: {entry.reason}</p>
                        )}
                        <span className="text-[10px] text-[#9CA3AF]">{formatDateTime(entry.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {row.assignments.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold uppercase tracking-[.1em] text-[#737A96] mb-3">Assignments</h4>
                <div className="space-y-2">
                  {row.assignments.map((a) => (
                    <div key={a.id} className="flex items-start gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[#E5E4F4] bg-[#F1ECFF] text-[#7543E9]">
                        <Icon name="user" className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-[#171A32]">{userName(directory.byId, a.user_id)}</span>
                          <Badge tone="neutral">{roleLabel(a.role_in_task)}</Badge>
                        </div>
                        <p className="mt-0.5 text-[10px] text-[#737A96] italic">{a.reason ?? ""}</p>
                        <span className="text-[10px] text-[#9CA3AF]">{formatDateTime(a.assigned_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(row.status_history.length === 0 && row.assignments.length === 0) && (
              <EmptyState message="No activity yet." />
            )}
          </div>
        )}

        {tab === "time" && (
          <div className="p-4">
            <WorkLogPanel task={row} />
          </div>
        )}
      </section>

      {/* Assignee edit modal */}
      <Modal
        open={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title="Edit assignees"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-xs text-[#737A96]">
            Choose who is responsible for each role. Reassignment closes the previous holder's record and opens a new one — nothing is deleted.
          </p>
          <AssignPanel task={row} onChanged={invalidate} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-[#ECEAF4] bg-[#FCFBFF] px-4 py-2.5 text-xs font-semibold text-[#454B68] hover:bg-[#F5F0FF] hover:border-[#CFC0F8] transition"
            onClick={() => setShowAssignModal(false)}
          >
            Cancel
          </button>
        </div>
      </Modal>

      {/* Checklist edit modal */}
      <Modal
        open={showChecklistModal}
        onClose={() => setShowChecklistModal(false)}
        title="Edit checklist"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-xs text-[#737A96]">
            Steps determine the task&rsquo;s progress. Check a step when done, edit its name, or mark it mandatory.
          </p>
          {row.steps.length === 0 ? (
            <EmptyState message="This task has no steps yet." />
          ) : (
            <div className="space-y-2">
              {row.steps.map((step) => (
                <div
                  key={step.id}
                  className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg border border-[#EEF0F7]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular text-xs text-[#737A96]">{step.sequence}.</span>
                      <span
                        className={cn(
                          step.status === "completed"
                            ? "text-[#737A96] line-through"
                            : "text-[#171A32]",
                        )}
                      >
                        {step.name}
                      </span>
                      <Badge tone={stepStatusTone(step.status)} className="text-[10px]">
                        {humanise(step.status)}
                      </Badge>
                      <button
                        type="button"
                        className="text-xs text-[#9CA3AF] hover:text-[#DC2626] p-1"
                        onClick={() => {
                          updateStep.mutate({
                            stepId: step.id,
                            status: step.status === "completed" ? "pending" : "completed",
                          });
                        }}
                        aria-label="Toggle step status"
                      >
                        <Icon
                          name={step.status === "completed" ? "check-circle" : "circle-dot"}
                          className="h-3 w-3"
                        />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <label className="flex items-center gap-1 text-[10px] text-[#737A96]">
                        <input
                          type="checkbox"
                          checked={step.is_mandatory}
                          onChange={() => {
                            updateStepName.mutate({
                              stepId: step.id,
                              name: step.name,
                              is_mandatory: !step.is_mandatory,
                            });
                          }}
                        />
                        {step.is_mandatory ? "Mandatory" : "Optional"}
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="pt-3 border-t border-[#EEF0F7]">
            <div className="flex items-center gap-2">
              <input
                id="new-step-input"
                className="flex-1 input min-w-0 rounded-xl border-[#E3E5F0] bg-white px-3 py-2 text-xs focus:border-[#9A7AEF] focus:ring-4 focus:ring-[#EEE8FF]"
                value={newStepName}
                placeholder="Add a new step…"
                onChange={(e) => setNewStepName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newStepName.trim()) {
                    addStep.mutate(newStepName.trim());
                    setNewStepName("");
                  }
                }}
              />
              <button
                type="button"
                className="rounded-lg bg-gradient-to-r from-[#7543E9] to-[#5B31CC] px-4 py-2 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={!newStepName.trim() || addStep.isPending}
                onClick={() => {
                  addStep.mutate(newStepName.trim());
                  setNewStepName("");
                }}
              >
                {addStep.isPending ? "Adding…" : "Add step"}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
