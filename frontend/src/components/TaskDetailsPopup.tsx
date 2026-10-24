"use client";

import type { ReactNode } from "react";

import Link from "next/link";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useState } from "react";

import { Badge, ErrorState, LoadingState, ProgressBar } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { DescriptionBody } from "@/components/TaskDescription";
import { ApiError, api } from "@/lib/api";
import { cn, formatDate, formatRelative, humanise } from "@/lib/format";
import {
  badgeClasses,
  approvalTone,
  filingTone,
  priorityTone,
  stepStatusTone,
  statusDotClass,
  taskStatusLabel,
  taskStatusTone,
} from "@/lib/status";
import { initials, userName, useUserDirectory } from "@/lib/users";
import type {
  ClientDetail,
  DocumentRequestMutate,
  DocumentRequestRow,
  DocumentRow,
  Page,
  TaskAssignmentRow,
  TaskCommentRow,
  TaskDetail,
  TaskDependencyRow,
  TaskStatus,
  TaskStepRow,
} from "@/lib/types";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function periodLabel(periodKey: string | null): string {
  if (!periodKey) return "—";
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) return periodKey;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return periodKey;
  return `${MONTHS[month - 1]} ${match[1]}`;
}

function financialYearLabel(yearId: string | null | undefined): string {
  if (!yearId) return "—";
  return yearId;
}

function StatusButton({ status }: { status: TaskStatus }) {
  const tone = taskStatusTone(status);
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium",
      badgeClasses(tone),
    )}>
      <span className={cn("size-1.5 rounded-full", statusDotClass(status))} />
      {taskStatusLabel(status)}
    </span>
  );
}

function AvailableTransitionsBar({ task }: { task: TaskDetail }) {
  const transitions = task.available_transitions ?? [];
  if (transitions.length === 0) return null;

  const handleTransition = (status: string) => {
    void api.post(`/tasks/${task.id}/status`, { status });
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-slate-500">Next actions:</span>
      {transitions.map((s) => (
        <button
          key={s}
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors",
            badgeClasses(taskStatusTone(s)),
          )}
          onClick={() => handleTransition(s)}
        >
          <span className={cn("size-1.5 rounded-full", statusDotClass(s))} />
          {taskStatusLabel(s)}
        </button>
      ))}
    </div>
  );
}

const DOC_STATUS_TONE = {
  requested: "warning" as const,
  received: "info" as const,
  under_review: "progress" as const,
  accepted: "success" as const,
  rejected: "danger" as const,
  superseded: "neutral" as const,
} satisfies Record<DocumentRow["status"], import("@/lib/status").Tone>;

const ROLE_LABELS: Record<string, string> = {
  preparer: "Preparer",
  reviewer: "Reviewer",
  approver: "Approver",
  filer: "Filer",
  manager: "Manager",
  partner: "Partner",
  observer: "Observer",
};

export function TaskDetailsPopup({
  taskId,
  onClose,
}: {
  taskId: string | null;
  onClose: () => void;
}) {
  if (!taskId) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close task details"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-slate-900/50 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-label="Task details"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
      >
        <div className="relative flex w-full max-w-5xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl">
          <PopupBody taskId={taskId} onClose={onClose} />
        </div>
      </aside>
    </>
  );
}

function PopupBody({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const directory = useUserDirectory();

  const task = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => api.get<TaskDetail>(`/tasks/${taskId}`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["document-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["documents"] });
    void queryClient.invalidateQueries({ queryKey: ["dependencies", taskId] });
  };

  const updateStep = useMutation({
    mutationFn: (payload: { stepId: string; status: string; notes?: string; skip_reason?: string }) =>
      api.post(`/tasks/${taskId}/steps/${payload.stepId}`, {
        status: payload.status,
        notes: payload.notes,
        skip_reason: payload.skip_reason,
      }),
    onSuccess: invalidate,
  });

  const addComment = useMutation({
    mutationFn: (payload: { body: string; visibility: "internal" | "client" }) =>
      api.post(`/tasks/${taskId}/comments`, payload),
    onSuccess: invalidate,
  });

  const addDocumentRequest = useMutation({
    mutationFn: (payload: { client_id: string; title: string; description?: string; due_date?: string; doc_type?: string }) =>
      api.post<DocumentRequestRow>("/document-requests", {
        ...payload,
        task_id: taskId,
      }),
    onSuccess: invalidate,
  });

  const addDependency = useMutation({
    mutationFn: (payload: { depends_on_task_id: string; dependency_type?: string; notes?: string }) =>
      api.post(`/tasks/${taskId}/dependencies`, payload),
    onSuccess: invalidate,
  });

  const taskData = task.data;

  const client = useQuery({
    queryKey: ["client", taskData?.client_id],
    queryFn: () => api.get<ClientDetail>(`/clients/${taskData!.client_id}`),
    enabled: !!taskData?.client_id,
    staleTime: 60_000,
  });

  const docRequests = useQuery({
    queryKey: ["document-requests", taskId],
    queryFn: () =>
      api.get<Page<DocumentRequestRow>>(
        `/document-requests?task_id=${taskId}&limit=50`,
      ),
    enabled: !!taskData,
    staleTime: 60_000,
  });

  const documents = useQuery({
    queryKey: ["documents", taskId],
    queryFn: () =>
      api.get<Page<DocumentRow>>(
        `/documents?task_id=${taskId}&limit=50`,
      ),
    enabled: !!taskData,
    staleTime: 60_000,
  });

  const dependencies = useQuery({
    queryKey: ["dependencies", taskId],
    queryFn: () =>
      api.get<Page<TaskDependencyRow>>(
        `/tasks/${taskId}/dependencies`,
      ),
    enabled: !!taskData,
    staleTime: 60_000,
  });

  if (task.isPending) {
    return (
      <>
        <HeaderSkeleton onClose={onClose} />
        <div className="p-6">
          <LoadingState label="Loading task…" />
        </div>
      </>
    );
  }
  if (task.isError) {
    return (
      <>
        <HeaderSkeleton onClose={onClose} />
        <div className="p-6">
          <ErrorState
            message={
              task.error instanceof ApiError
                ? task.error.message
                : "Could not load this task."
            }
          />
        </div>
      </>
    );
  }

  const row = task.data;

  const done = row.steps.filter(
    (s) => s.status === "completed" || s.status === "skipped",
  ).length;
  const total = row.steps.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <>
      <PopupHeader
        task={row}
        directory={directory}
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <main className="min-w-0 space-y-6">
              <TaskDetailsCard task={row} />

              <WorkProgressCard
                task={row}
                done={done}
                total={total}
                percent={percent}
                updateStep={updateStep}
              />

              <DocumentsRequiredCard
                task={row}
                client={client}
                docRequests={docRequests}
                addDocumentRequest={addDocumentRequest}
              />

              <DocumentsWeHaveCard documents={documents} />

              <CommentsCard
                task={row}
                directory={directory}
                addComment={addComment}
              />
            </main>

            <aside className="space-y-6">
              <AssignmentCard task={row} directory={directory} />
              <KeyInformationCard task={row} />
              <FirmCard client={client} />
              <DatesCard task={row} />
              <DependsOnCard dependencies={dependencies} addDependency={addDependency} />
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

function HeaderSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <header className="border-b border-slate-200 px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Link href="/tasks" className="hover:text-slate-900">
            Tasks
          </Link>
          <Icon name="chevron-right" className="h-3 w-3 text-slate-400" />
          <span className="text-slate-500">Task details</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            className="btn-icon"
            aria-label="Close"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-3 h-6 w-3/4 animate-pulse rounded bg-slate-200" />
      <div className="mt-2 flex items-center gap-2">
        <div className="h-5 w-20 animate-pulse rounded bg-slate-200" />
        <div className="h-5 w-16 animate-pulse rounded bg-slate-200" />
      </div>
    </header>
  );
}

function PopupHeader({
  task,
  directory,
  onClose,
}: {
  task: TaskDetail;
  directory: ReturnType<typeof useUserDirectory>;
  onClose: () => void;
}) {
  const primaryEntity = task.client_name;

  return (
    <header className="border-b border-slate-200 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500">
            <Link href="/tasks" className="hover:text-slate-900">
              Tasks
            </Link>
            <Icon name="chevron-right" className="h-3 w-3 text-slate-400" />
            <span className="text-slate-500">Task details</span>
          </nav>

          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="rounded-lg bg-[#F8FAFC] px-3 py-1.5 text-lg font-semibold text-[#101B3D]">
                {task.title}
              </span>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono text-[#64748B]">#{task.task_code}</span>
                {primaryEntity && (
                  <>
                    <span className="text-slate-300">·</span>
                    <Link
                      href={task.client_id ? `/clients/${task.client_id}` : "#"}
                      className="text-[#1677FF] hover:text-[#2563EB]"
                    >
                      {primaryEntity}
                    </Link>
                  </>
                )}
                {task.service_code && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="font-mono text-[10px] text-slate-600">
                      {task.service_code}
                    </span>
                  </>
                )}
                {task.period_key && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span>{periodLabel(task.period_key)}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <AvailableTransitionsBar task={task} />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <StatusButton status={task.status} />
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
            {humanise(task.priority)}
          </span>

          <div className="h-5 w-px bg-slate-200" />

          <Link
            href={`/tasks/${task.id}`}
            onClick={onClose}
            className="btn-icon"
            aria-label="Open full task"
            title="Open full task"
          >
            <Icon name="fullscreen" className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="btn-icon"
            aria-label="Close"
            title="Close"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

function TaskDetailsCard({ task }: { task: TaskDetail }) {
  return (
    <section className="card">
      <header className="card-header">
        <h3 className="card-title">Task Details</h3>
      </header>
      <div className="p-4">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <DetailRow label="Description">
            {task.description ? (
              <DescriptionBody
                text={task.description}
                className="max-w-prose text-sm text-slate-600"
              />
            ) : (
              <span className="text-sm text-slate-400">—</span>
            )}
          </DetailRow>
          <DetailRow label="Service">
            {task.service_code ? (
              <span className="font-mono text-sm text-slate-600">
                {task.service_code} {task.service_name ?? ""}
              </span>
            ) : (
              <span className="text-sm text-slate-400">—</span>
            )}
          </DetailRow>
          <DetailRow label="Reporting period">
            {task.period_key ? periodLabel(task.period_key) : "—"}
          </DetailRow>
          <DetailRow label="Task type">
            {humanise(task.task_type)}
          </DetailRow>
          <DetailRow label="Category">
            {task.category ? humanise(task.category) : "—"}
          </DetailRow>
          <DetailRow label="Start date">
            {task.start_date ? formatDate(task.start_date) : "—"}
          </DetailRow>
          <DetailRow label="Review round">
            <span className="text-sm text-slate-600">{task.review_round}</span>
          </DetailRow>
        </div>
      </div>
    </section>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <span className="block text-xs font-medium text-slate-500">{label}</span>
      <span className="mt-1 block text-sm text-[#101B3D]">
        {children}
      </span>
    </div>
  );
}

function WorkProgressCard({
  task,
  done,
  total,
  percent,
  updateStep,
}: {
  task: TaskDetail;
  done: number;
  total: number;
  percent: number;
  updateStep: UseMutationResult<unknown, Error, { stepId: string; status: string; notes?: string; skip_reason?: string }, unknown>;
}) {
  const handleToggle = (step: TaskStepRow) => {
    const isDone = step.status === "completed" || step.status === "skipped";
    const target = isDone ? "pending" : "completed";
    updateStep.mutate({ stepId: step.id, status: target });
  };

  return (
    <section className="card">
      <header className="card-header">
        <div className="min-w-0">
          <h3 className="card-title">Work Progress</h3>
          <p className="card-subtitle">
            {done} of {total} {total === 1 ? "step" : "steps"} completed
          </p>
        </div>
      </header>
      <div className="p-4">
        <ProgressBar
          percent={percent}
          tone={percent === 100 ? "success" : "progress"}
          className="h-2"
        />
      </div>

      {total === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-400">
          No checklist steps on this task.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {task.steps.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              isUpdating={updateStep.isPending}
              onToggle={handleToggle}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function StepRow({
  step,
  isUpdating,
  onToggle,
}: {
  step: TaskStepRow;
  isUpdating: boolean;
  onToggle: (step: TaskStepRow) => void;
}) {
  const isDone = step.status === "completed" || step.status === "skipped";
  const isDisabled = step.status === "in_progress" || isUpdating;

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="pt-0.5">
        <input
          type="checkbox"
          checked={isDone}
          disabled={isDisabled}
          onChange={(e) => {
            e.stopPropagation();
            onToggle(step);
          }}
          aria-label={step.name}
          className={cn(
            "size-4 cursor-pointer rounded border-slate-300 text-[#1677FF] transition-colors",
            isDisabled && "cursor-not-allowed opacity-60",
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "text-sm",
              isDone
                ? "text-slate-400 line-through"
                : "text-[#101B3D] font-medium",
            )}
          >
            {step.name}
          </span>
          {step.is_mandatory && !isDone && (
            <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700">
              Required
            </span>
          )}
        </div>
        {step.description ? (
          <p className="mt-0.5 text-xs text-slate-500">{step.description}</p>
        ) : null}
        <div className="mt-0.5 flex flex-wrap gap-1">
          {step.requires_review && (
            <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.25 text-[10px] text-slate-700">
              Needs review
            </span>
          )}
          {step.requires_approval && (
            <span className="inline-flex items-center rounded bg-indigo-50 px-1.5 py-0.25 text-[10px] text-indigo-700">
              Needs approval
            </span>
          )}
          {step.requires_filing && (
            <span className="inline-flex items-center rounded bg-emerald-50 px-1.5 py-0.25 text-[10px] text-emerald-700">
              Needs filing
            </span>
          )}
          {step.requires_document && (
            <span className="inline-flex items-center rounded bg-purple-50 px-1.5 py-0.25 text-[10px] text-purple-700">
              Needs document
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 pt-0.5">
        <Badge tone={stepStatusTone(step.status)}>
          {humanise(step.status)}
        </Badge>
      </div>
    </li>
  );
}

function CommentsCard({
  task,
  directory,
  addComment,
}: {
  task: TaskDetail;
  directory: ReturnType<typeof useUserDirectory>
  addComment: UseMutationResult<unknown, Error, { body: string; visibility: "internal" | "client" }, unknown>;
}) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"internal" | "client">("internal");

  const handleSubmit = () => {
    if (!body.trim()) return;
    addComment.mutate({ body: body.trim(), visibility });
    setBody("");
  };

  const canPost = body.trim().length > 0 && !addComment.isPending;

  return (
    <section className="card">
      <header className="card-header">
        <h3 className="card-title">Comments</h3>
        <p className="card-subtitle">
          {task.comments.length} {task.comments.length === 1 ? "comment" : "comments"}
        </p>
      </header>
      <div className="p-4">
        <div className="flex gap-2">
          <textarea
            className="input min-h-[3rem] flex-1 text-sm"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a comment…"
            aria-label="Write a comment"
            rows={3}
          />
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="radio"
                name="visibility"
                value="internal"
                checked={visibility === "internal"}
                onChange={() => setVisibility("internal")}
                className="size-3"
              />
              Internal note
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="radio"
                name="visibility"
                value="client"
                checked={visibility === "client"}
                onChange={() => setVisibility("client")}
                className="size-3"
              />
              Visible to client
            </label>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            disabled={!canPost}
            onClick={handleSubmit}
          >
            {addComment.isPending ? "Sending…" : "Send"}
          </button>
        </div>

        {addComment.isError && (
          <p role="alert" className="mt-2 text-xs text-rose-600">
            {addComment.error instanceof ApiError
              ? addComment.error.message
              : "Could not post the comment."}
          </p>
        )}

        {task.comments.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            No comments yet. Add a note to share an update with your team.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {task.comments.map((comment: TaskCommentRow) => (
              <li key={comment.id} className="flex items-start gap-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-700">
                  {comment.author_type === "system" ? (
                    <Icon name="settings" className="h-3.5 w-3.5 text-slate-500" />
                  ) : (
                    initials(userName(directory.byId, comment.author_user_id))
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-[#101B3D]">
                      {comment.author_type === "system"
                        ? "System"
                        : userName(directory.byId, comment.author_user_id)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatRelative(comment.created_at)}
                    </span>
                    {comment.visibility === "client" && (
                      <span className="text-[10px] text-sky-600">
                        Client-visible
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-600">
                    {comment.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function KeyInformationCard({
  task,
}: {
  task: TaskDetail;
}) {
  return (
    <section className="card">
      <header className="card-header">
        <h3 className="card-title">Key Information</h3>
      </header>
      <div className="p-4 space-y-1.5">
        <SidebarRow label="Status">
          <StatusButton status={task.status} />
        </SidebarRow>
        <SidebarRow label="Approval status">
          <span className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-medium",
            badgeClasses(approvalTone(task.approval_status)),
          )}>
            {humanise(task.approval_status)}
          </span>
        </SidebarRow>
        <SidebarRow label="Filing status">
          <span className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-medium",
            badgeClasses(filingTone(task.filing_status)),
          )}>
            {humanise(task.filing_status)}
          </span>
        </SidebarRow>
        <SidebarRow label="Priority">
          <span className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-medium",
            badgeClasses(priorityTone(task.priority)),
          )}>
            {humanise(task.priority)}
          </span>
        </SidebarRow>
        <SidebarRow label="Client">
          <span className="text-sm text-slate-600">{task.client_name ?? "—"}</span>
        </SidebarRow>
        <SidebarRow label="Financial year">
          <span className="text-sm text-slate-600">
            {financialYearLabel(task.financial_year_id)}
          </span>
        </SidebarRow>
        <SidebarRow label="Task type">
          <span className="text-sm text-slate-600">{humanise(task.task_type)}</span>
        </SidebarRow>
        <SidebarRow label="Created">
          <span className="text-sm text-slate-600">{formatDate(task.created_at)}</span>
        </SidebarRow>
        <SidebarRow label="Last updated">
          <span className="text-sm text-slate-600">{formatDate(task.updated_at)}</span>
        </SidebarRow>
      </div>
    </section>
  );
}

function FirmCard({
  client,
}: {
  client: UseQueryResult<ClientDetail>;
}) {
  if (client.isPending) {
    return (
      <section className="card">
        <header className="card-header">
          <h3 className="card-title">Firm</h3>
        </header>
        <p className="p-4 text-sm text-slate-400">Loading…</p>
      </section>
    );
  }
  if (client.isError) {
    return (
      <section className="card">
        <header className="card-header">
          <h3 className="card-title">Firm</h3>
        </header>
        <p className="p-4 text-sm text-rose-600">Could not load firm details.</p>
      </section>
    );
  }

  const cl = client.data;
  if (!cl) return null;

  return (
    <section className="card">
      <header className="card-header">
        <h3 className="card-title">Firm</h3>
      </header>
      <div className="p-4 space-y-1.5">
        <SidebarRow label="Client name">
          <span className="text-sm font-medium text-[#101B3D]">
            {cl.legal_name}
          </span>
        </SidebarRow>

        <SidebarRow label="PAN">
          <span className="font-mono text-sm text-slate-600">{cl.pan ?? "—"}</span>
        </SidebarRow>

        <SidebarRow label="TAN">
          <span className="font-mono text-sm text-slate-600">{cl.tan ?? "—"}</span>
        </SidebarRow>

        <SidebarRow label="GSTIN">
          <span className="font-mono text-sm text-slate-600">{cl.gstin ?? "—"}</span>
        </SidebarRow>

        <SidebarRow label="City">
          <span className="text-sm text-slate-600">{cl.city ?? "—"}</span>
        </SidebarRow>

        {cl.entities && cl.entities.length > 0 ? (
          <div className="pt-1.5">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Legal entities
            </p>
            {cl.entities.map((entity) => (
              <div key={entity.id} className="flex justify-between py-1">
                <span className="text-xs text-slate-500">
                  {humanise(entity.relationship_type)}
                </span>
                <span className="text-xs font-medium text-[#101B3D]">
                  {entity.legal_entity?.name ?? "—"}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DatesCard({ task }: { task: TaskDetail }) {
  return (
    <section className="card">
      <header className="card-header">
        <h3 className="card-title">Dates & Period</h3>
      </header>
      <div className="p-4 space-y-1.5">
        <SidebarRow label="Start date">
          <span className="text-sm text-slate-600">
            {formatDate(task.start_date)}
          </span>
        </SidebarRow>
        <SidebarRow label="Statutory due date">
          <span
            className={cn(
              "text-sm",
              task.is_overdue
                ? "font-medium text-rose-600"
                : "text-slate-600",
            )}
          >
            {formatDate(task.statutory_due_date)}
          </span>
        </SidebarRow>
        <SidebarRow label="Internal due date">
          <span className="text-sm text-slate-600">
            {formatDate(task.internal_due_date)}
          </span>
        </SidebarRow>
        <SidebarRow label="Period key">
          <span className="font-mono text-xs text-slate-400">
            {task.period_key ?? "—"}
          </span>
        </SidebarRow>
        <SidebarRow label="Financial year">
          <span className="text-sm text-slate-600">
            {financialYearLabel(task.financial_year_id)}
          </span>
        </SidebarRow>
        {!task.deadline_verified ? (
          <SidebarRow label="Deadline">
            <Badge tone="warning">Statutory date unconfirmed</Badge>
          </SidebarRow>
        ) : null}
      </div>
    </section>
  );
}

function DependsOnCard({
  dependencies,
  addDependency,
}: {
  dependencies: UseQueryResult<Page<TaskDependencyRow>>;
  addDependency: UseMutationResult<unknown, Error, { depends_on_task_id: string; dependency_type?: string; notes?: string }, unknown>;
}) {
  const [taskCode, setTaskCode] = useState("");
  const [dependencyType, setDependencyType] = useState<"finish_to_start" | "start_to_start" | "finish_to_finish">("finish_to_start");
  const [isFormOpen, setIsFormOpen] = useState(false);

  const handleAdd = () => {
    if (!taskCode.trim()) return;
    addDependency.mutate({
      depends_on_task_id: taskCode.trim(),
      dependency_type: dependencyType,
    });
    setTaskCode("");
    setIsFormOpen(false);
  };

  return (
    <section className="card">
      <header className="card-header">
        <h3 className="card-title">Depends on</h3>
        <p className="card-subtitle">
          {dependencies.data?.items?.length ?? 0} linked task(s)
        </p>
      </header>
      <div className="p-4">
        {dependencies.isPending ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : dependencies.isError ? (
          <p className="text-sm text-rose-600">Could not load dependencies.</p>
        ) : (dependencies.data?.items?.length ?? 0) > 0 ? (
          <ul className="space-y-2">
            {dependencies.data!.items.map((dep) => (
              <li key={dep.id} className="flex flex-col gap-1">
                <Link
                  href={`/tasks/${dep.depends_on_task_id}`}
                  className="text-sm font-medium text-[#1677FF] hover:text-[#2563EB]"
                >
                  {dep.depends_on_task_code
                    ? `${dep.depends_on_task_code} · ${dep.depends_on_task_title ?? ""}`
                    : dep.depends_on_task_id}
                </Link>
                <span className="text-xs text-slate-500">
                  {humanise(dep.dependency_type)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">
            No linked tasks. This task can proceed independently.
          </p>
        )}

        <div className="mt-3">
          {isFormOpen ? (
            <div className="space-y-2">
              <input
                type="text"
                className="input text-sm"
                placeholder="Task code or ID"
                value={taskCode}
                onChange={(e) => setTaskCode(e.target.value)}
                aria-label="Dependent task code or ID"
              />
              <select
                className="input py-1 text-xs"
                value={dependencyType}
                onChange={(e) => setDependencyType(e.target.value as "finish_to_start" | "start_to_start" | "finish_to_finish")}
              >
                <option value="finish_to_start">Finish to start</option>
                <option value="start_to_start">Start to start</option>
                <option value="finish_to_finish">Finish to finish</option>
              </select>
              {addDependency.isError && (
                <p className="text-xs text-rose-600">
                  {addDependency.error instanceof ApiError
                    ? addDependency.error.message
                    : "Could not link task."}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-primary text-xs"
                  disabled={!taskCode.trim() || addDependency.isPending}
                  onClick={handleAdd}
                >
                  {addDependency.isPending ? "Linking…" : "Link"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost text-xs"
                  onClick={() => {
                    setIsFormOpen(false);
                    setTaskCode("");
                    addDependency.reset();
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm text-xs"
              onClick={() => setIsFormOpen(true)}
            >
              <Icon name="plus" className="h-3 w-3" />
              Link task
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function AssignmentCard({
  task,
  directory,
}: {
  task: TaskDetail;
  directory: ReturnType<typeof useUserDirectory>;
}) {
  const roles: Array<{ label: string; id: string | null }> = [
    { label: "Preparer", id: task.preparer_id },
    { label: "Reviewer", id: task.reviewer_id },
    { label: "Approver", id: task.approver_id },
    { label: "Filer", id: task.filer_id },
  ];

  const activeAssignments = task.assignments.filter((a) => a.is_active);

  return (
    <section className="card">
      <header className="card-header">
        <h3 className="card-title">Assignment</h3>
      </header>
      <div className="p-4 space-y-1">
        {roles.map(({ label, id }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">{label}</span>
            <span className="flex items-center gap-1.5">
              {id ? (
                <>
                  <span className="flex size-7 items-center justify-center rounded-full bg-[#1677FF]/10 text-[10px] font-semibold text-[#1677FF]">
                    {initials(userName(directory.byId, id))}
                  </span>
                  <span className="text-sm text-[#101B3D]">
                    {userName(directory.byId, id)}
                  </span>
                </>
              ) : (
                <span className="text-sm text-slate-400">Unassigned</span>
              )}
            </span>
          </div>
        ))}

        {activeAssignments.length > 0 && (
          <div className="pt-2.5">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Active assignments
            </p>
            {activeAssignments.map((entry: TaskAssignmentRow) => (
              <div
                key={entry.id}
                className="flex items-center justify-between"
              >
                <span className="text-xs text-slate-500">
                  {ROLE_LABELS[entry.role_in_task] ?? humanise(entry.role_in_task)}
                </span>
                <span className="text-xs font-medium text-[#101B3D]">
                  {userName(directory.byId, entry.user_id)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function DocumentsRequiredCard({
  task,
  client,
  docRequests,
  addDocumentRequest,
}: {
  task: TaskDetail;
  client: UseQueryResult<ClientDetail>;
  docRequests: UseQueryResult<Page<DocumentRequestRow>>;
  addDocumentRequest: UseMutationResult<DocumentRequestRow, Error, DocumentRequestMutate, unknown>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [docType, setDocType] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);

  const handleSubmit = () => {
    if (!title.trim() || !task.client_id) return;
    addDocumentRequest.mutate({
      client_id: task.client_id,
      title: title.trim(),
      description: description.trim() || undefined,
      due_date: dueDate || undefined,
      doc_type: docType || undefined,
    });
    setTitle("");
    setDescription("");
    setDueDate("");
    setDocType("");
    setIsFormOpen(false);
  };

  const canSubmit = title.trim().length >= 2 && !!task.client_id && !addDocumentRequest.isPending;

  const openItems = (docRequests.data?.items ?? []).filter(
    (r) => r.status === "open" || r.status === "partially_received",
  );

  return (
    <section className="card">
      <header className="card-header">
        <div className="min-w-0">
          <h3 className="card-title">Documents Required</h3>
          <p className="card-subtitle">
            {openItems.length} {openItems.length === 1 ? "request" : "requests"} open
          </p>
        </div>
        <button
          type="button"
          className="btn-icon"
          aria-label="Add document request"
          title="Request a document"
          onClick={() => setIsFormOpen(true)}
        >
          <Icon name="plus" className="h-4 w-4" />
        </button>
      </header>

      <div className="p-4">
        {isFormOpen && (
          <div className="mb-3 space-y-2 rounded-md border border-slate-200 p-3">
            <input
              type="text"
              className="input text-sm"
              placeholder="Document title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Document title"
            />
            <textarea
              className="input min-h-[3rem] text-sm"
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="Document description"
              rows={2}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                className="input text-sm"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                aria-label="Due date"
              />
              <input
                type="text"
                className="input text-sm"
                placeholder="Document type (optional)"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                aria-label="Document type"
              />
            </div>
            {addDocumentRequest.isError && (
              <p role="alert" className="text-xs text-rose-600">
                {addDocumentRequest.error instanceof ApiError
                  ? addDocumentRequest.error.message
                  : "Could not create document request."}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary text-xs"
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                {addDocumentRequest.isPending ? "Requesting…" : "Request"}
              </button>
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => {
                  setIsFormOpen(false);
                  setTitle("");
                  setDescription("");
                  setDueDate("");
                  setDocType("");
                  addDocumentRequest.reset();
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {docRequests.isPending ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : docRequests.isError ? (
          <p className="text-sm text-rose-600">Could not load document requests.</p>
        ) : openItems.length === 0 ? (
          <p className="text-sm text-slate-400">
            No document requests on this task.
          </p>
        ) : (
          <ul className="space-y-1">
            {openItems.map((req) => (
              <li
                key={req.id}
                className="flex items-start justify-between gap-3 rounded-md px-2 py-2 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#101B3D]">
                    {req.title}
                  </p>
                  {req.description ? (
                    <p className="text-xs text-slate-500">{req.description}</p>
                  ) : null}
                </div>
                {req.due_date ? (
                  <span className="shrink-0 text-xs text-slate-500">
                    {formatDate(req.due_date)}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-slate-400">No due date</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function DocumentsWeHaveCard({
  documents,
}: {
  documents: UseQueryResult<Page<DocumentRow>>;
}) {
  if (documents.isPending) {
    return (
      <section className="card">
        <header className="card-header">
          <h3 className="card-title">Documents</h3>
        </header>
        <p className="p-4 text-sm text-slate-400">Loading…</p>
      </section>
    );
  }
  if (documents.isError) {
    return (
      <section className="card">
        <header className="card-header">
          <h3 className="card-title">Documents</h3>
        </header>
        <p className="p-4 text-sm text-rose-600">Could not load.</p>
      </section>
    );
  }

  const items = documents.data?.items ?? [];

  return (
    <section className="card">
      <header className="card-header">
        <h3 className="card-title">Documents</h3>
        <p className="card-subtitle">
          {items.length} {items.length === 1 ? "document" : "documents"}
        </p>
      </header>
      <div className="p-3">
        {items.length === 0 ? (
          <p className="px-1 text-sm text-slate-400">
            No documents linked to this task.
          </p>
        ) : (
          <ul className="space-y-1">
            {items.map((doc) => (
              <li
                key={doc.id}
                className="flex items-start justify-between gap-3 rounded-md px-2 py-2 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Icon
                      name="file-text"
                      className="h-4 w-4 shrink-0 text-slate-400"
                    />
                    <p className="text-sm font-medium text-[#101B3D]">
                      {doc.title}
                    </p>
                  </div>
                  {doc.file_name ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {doc.file_name}
                      {doc.size_bytes
                        ? ` · ${(doc.size_bytes / 1024).toFixed(1)} KB`
                        : ""}
                    </p>
                  ) : null}
                  {doc.description ? (
                    <p className="text-xs text-slate-500">{doc.description}</p>
                  ) : null}
                </div>
                <Badge tone={DOC_STATUS_TONE[doc.status]}>
                  {humanise(doc.status)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function SidebarRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="w-32 shrink-0 pt-0.5 text-xs font-medium text-slate-500">
        {label}
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right text-sm text-[#101B3D]">
        {children ?? "—"}
      </span>
    </div>
  );
}