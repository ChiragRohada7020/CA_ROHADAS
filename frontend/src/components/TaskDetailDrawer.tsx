"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge, EmptyState, ErrorState, LoadingState, ProgressBar } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { DescriptionBody } from "@/components/TaskDescription";
import { TextField, TextAreaField, SelectField } from "@/components/form";
import { ApiError, api } from "@/lib/api";
import { cn, formatDate, humanise } from "@/lib/format";
import { delayReasonLabel, priorityTone, taskStatusLabel, taskStatusTone } from "@/lib/status";
import { initials, userName, useUserDirectory } from "@/lib/users";
import type {
  Page,
  TaskCommentRow,
  TaskDetail,
  TaskStatus,
  TaskStepRow,
  TaskWorkLogRow,
  DelayReason,
} from "@/lib/types";

const DELAY_REASONS: Array<{ value: DelayReason; label: string }> = [
  { value: "client_documents_pending", label: "Waiting for client documents" },
  { value: "client_clarification_pending", label: "Waiting for client clarification" },
  { value: "internal_capacity", label: "Internal capacity issue" },
  { value: "portal_downtime", label: "Portal or software issue" },
  { value: "awaiting_review", label: "Awaiting internal review" },
  { value: "awaiting_approval", label: "Awaiting approval" },
  { value: "data_mismatch", label: "Data mismatch" },
  { value: "third_party_dependency", label: "Third-party dependency" },
  { value: "other", label: "Other reason" },
];

const ACTIVITY_TYPES = [
  { value: "preparation", label: "Preparation" },
  { value: "review", label: "Review" },
  { value: "filing", label: "Filing" },
  { value: "correspondence", label: "Correspondence" },
  { value: "research", label: "Research / Advisory" },
  { value: "admin", label: "Admin" },
];

export function TaskDetailDrawer({
  taskId,
  onClose,
}: {
  taskId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const directory = useUserDirectory();
  const [tab, setTab] = useState<"details" | "comments" | "documents" | "time" | "activity">("details");

  const task = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => api.get<TaskDetail>(`/tasks/${taskId}`),
    enabled: Boolean(taskId),
  });

  const workLogs = useQuery({
    queryKey: ["task", taskId, "work-logs"],
    queryFn: () =>
      api.get<Page<TaskWorkLogRow>>(`/tasks/${taskId}/work-logs?limit=100`),
    enabled: Boolean(taskId),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks", "summary"] });
    void queryClient.invalidateQueries({ queryKey: ["task", taskId, "work-logs"] });
  }

  if (!taskId) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close task details"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-slate-900/20"
      />
      <aside
        role="dialog"
        aria-label="Task details"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-[#E2E8F0] bg-white shadow-xl"
      >
        {task.isPending && <LoadingState label="Loading task…" />}
        {task.isError && (
          <ErrorState
            message={
              task.error instanceof ApiError ? task.error.message : "Could not load this task."
            }
          />
        )}
        {task.isSuccess && (
          <>
            <TaskHeader task={task.data} directory={directory} onChanged={refresh} />

            <div className="flex min-h-0 flex-1 overflow-y-auto">
              <nav className="flex items-center gap-1 border-b border-[#E2E8F0] px-4 text-xs">
                {(["details", "comments", "documents", "time", "activity"] as const).map((key, idx) => {
                  const labels: Record<string, string> = {
                    details: "Details",
                    comments: "Comments",
                    documents: "Documents",
                    time: "Time Log",
                    activity: "Activity",
                  };
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setTab(key)}
                      className={cn(
                        "-mb-px border-b-2 px-3 py-2 font-medium transition-colors",
                        tab === key
                          ? "border-[#1677FF] text-[#1677FF]"
                          : "border-transparent text-[#64748B] hover:text-[#101B3D]",
                      )}
                    >
                      {labels[key]}
                    </button>
                  );
                })}
              </nav>

              <div className="flex-1 overflow-y-auto px-4 py-3">
                {tab === "details" && (
                  <DetailsPane
                    task={task.data}
                    directory={directory}
                    onChanged={refresh}
                    workLogs={workLogs}
                  />
                )}
                {tab === "comments" && (
                  <Comments task={task.data} directory={directory} onChanged={refresh} />
                )}
                {tab === "documents" && (
                  <EmptyState message="Documents are managed on the Documents screen." />
                )}
                {tab === "time" && (
                  <TimeLog taskId={task.data.id} workLogs={workLogs} onChanged={refresh} />
                )}
                {tab === "activity" && (
                  <Activity task={task.data} directory={directory} />
                )}
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

const ASSIGNABLE_ROLES = [
  { field: "preparer_id" as const, label: "Assigned To" },
  { field: "reviewer_id" as const, label: "Review By" },
  { field: "approver_id" as const, label: "Approver" },
  { field: "filer_id" as const, label: "Filer" },
] as const;
type RoleField = (typeof ASSIGNABLE_ROLES)[number]["field"];

function TaskHeader({
  task,
  directory,
  onChanged,
}: {
  task: TaskDetail;
  directory: ReturnType<typeof useUserDirectory>;
  onChanged: () => void;
}) {
  return (
    <header className="border-b border-[#E2E8F0] px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-[#F8FAFC] px-3 py-1.5 text-sm font-semibold text-[#101B3D]">
              {task.title}
            </span>
            <span className="font-mono text-[10px] text-[#94A3B8]">{task.task_code}</span>
          </div>
          {task.client_name && (
            <Link
              href={`/clients/${task.client_id}`}
              className="mt-0.5 block text-xs text-[#64748B] hover:text-[#1677FF]"
            >
              Client: {task.client_name}
            </Link>
          )}
          {task.service_code && (
            <span className="mt-0.5 inline-block rounded bg-[#F6F8FC] px-1.5 py-0.5 font-mono text-[10px] text-[#64748B]">
              {task.service_code} {task.service_name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge tone={taskStatusTone(task.status)}>
            {taskStatusLabel(task.status)}
          </Badge>
          <Badge tone={priorityTone(task.priority)}>
            {humanise(task.priority)}
          </Badge>
        </div>
      </div>

      <WorkflowActionBar task={task} directory={directory} onChanged={onChanged} />
    </header>
  );
}

function WorkflowActionBar({
  task,
  directory,
  onChanged,
}: {
  task: TaskDetail;
  directory: ReturnType<typeof useUserDirectory>;
  onChanged: () => void;
}) {
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [logWorkOpen, setLogWorkOpen] = useState(false);

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {task.available_transitions.map((toStatus) => {
          let label: string;
          let requiresReason = false;
          switch (toStatus) {
            case "in_progress":
              label = "Start work";
              break;
            case "ready_for_review":
              label = "Send for review";
              break;
            case "ready_for_approval":
              label = "Send for approval";
              break;
            case "approved":
              label = "Approve";
              break;
            case "ready_to_file":
              label = "Ready to file";
              break;
            case "filed":
              label = "Mark filed";
              requiresReason = true;
              break;
            case "delivered":
              label = "Mark delivered";
              break;
            case "completed":
              label = "Complete";
              requiresReason = task.completion_blockers.length > 0;
              break;
            case "cancelled":
              label = "Cancel";
              requiresReason = true;
              break;
            case "waiting_for_client":
              label = "Waiting on client";
              requiresReason = true;
              break;
            case "waiting_for_internal":
              label = "Waiting (internal)";
              requiresReason = true;
              break;
            case "changes_requested":
              label = "Request changes";
              requiresReason = true;
              break;
            case "not_started":
              label = "Reset to not started";
              requiresReason = true;
              break;
            case "assigned":
              label = "Assign";
              break;
            default:
              label = taskStatusLabel(toStatus);
          }
          return (
            <TransitionButton
              key={toStatus}
              task={task}
              toStatus={toStatus}
              label={label}
              requiresReason={requiresReason}
              completionBlockers={task.completion_blockers}
              onChange={onChanged}
            />
          );
        })}
        <button
          type="button"
          onClick={() => setBlockerOpen(true)}
          className="text-xs font-medium text-[#1677FF] hover:underline"
        >
          Report blocker
        </button>
        <button
          type="button"
          onClick={() => setLogWorkOpen(true)}
          className="text-xs font-medium text-[#1677FF] hover:underline"
        >
          Log work
        </button>
        {task.blocked_reason && (
          <button
            type="button"
            onClick={async () => {
              await api.patch(`/tasks/${task.id}`, {
                blocked_reason: null,
                delay_reason: null,
              });
              onChanged();
            }}
            className="text-xs font-medium text-[#15803D] hover:underline"
          >
            Resolve blocker
          </button>
        )}
        <BlockerModal
          task={task}
          open={blockerOpen}
          onClose={() => setBlockerOpen(false)}
          onChanged={onChanged}
        />
        <LogWorkModal
          task={task}
          open={logWorkOpen}
          onClose={() => setLogWorkOpen(false)}
          onChanged={onChanged}
        />
      </div>
    </>
  );
}

function TransitionButton({
  task,
  toStatus,
  label,
  requiresReason,
  completionBlockers,
  onChange,
}: {
  task: TaskDetail;
  toStatus: TaskStatus;
  label: string;
  requiresReason: boolean;
  completionBlockers?: string[];
  onChange: () => void;
}) {
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: (payload: { status: string; reason?: string; force?: boolean }) =>
      api.post(`/tasks/${task.id}/status`, payload),
    onSuccess: () => {
      setShowReason(false);
      setReason("");
      onChange();
    },
  });

  const handleSubmit = () => {
    if (requiresReason && !reason.trim()) return;
    mutation.mutate({ status: toStatus, reason: reason.trim() || undefined });
  };

  if (showReason) {
    return (
      <div className="flex items-end gap-2 rounded-md bg-[#F6F8FC] p-2">
        <textarea
          className="input w-48 py-1 text-xs"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            completionBlockers && completionBlockers.length > 0
              ? `Required: ${completionBlockers.join("; ")}. Add a reason…`
              : "Why? (required for this transition)"
          }
          rows={2}
          autoFocus
        />
        <button
          type="button"
          className="btn-primary px-2 py-0.5 text-xs"
          disabled={requiresReason && !reason.trim()}
          onClick={handleSubmit}
        >
          {mutation.isPending ? "..." : "Go"}
        </button>
        <button
          type="button"
          className="text-xs text-[#64748B] hover:underline"
          onClick={() => setShowReason(false)}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowReason(requiresReason)}
        className="btn-primary px-2.5 py-1 text-xs"
        disabled={mutation.isPending}
      >
        {label}
      </button>
      {mutation.isError && (
        <p className="text-[10px] text-[#DC2626]">
          {mutation.error instanceof ApiError ? mutation.error.message : "Transition failed."}
        </p>
      )}
    </>
  );
}

function BlockerModal({
  task,
  open,
  onClose,
  onChanged,
}: {
  task: TaskDetail;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");

  const mutation = useMutation({
    mutationFn: (payload: { status: string; blocked_reason?: string; delay_reason?: DelayReason; reason?: string }) =>
      api.post(`/tasks/${task.id}/status`, payload),
    onSuccess: () => {
      onClose();
      onChanged();
    },
  });

  const handleSubmit = () => {
    if (!reason.trim()) return;
    mutation.mutate({
      status: "waiting_for_client",
      blocked_reason: reason,
      delay_reason: reason as DelayReason,
      reason: notes.trim() || undefined,
    });
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4",
        !open && "hidden",
      )}
    >
      <div className="relative z-10 w-full max-w-lg rounded-[10px] border border-[#E2E8F0] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
          <h2 className="text-base font-semibold text-[#101B3D]">Report Blocker</h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="p-4">
          <div className="space-y-4">
            <select
              className="input w-full"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">Select a reason…</option>
              {DELAY_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <textarea
              className="input w-full"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Explanation…"
              rows={3}
            />
            <input
              type="date"
              className="input w-full"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
            />
            <label className="text-xs text-[#64748B]">Follow-up date</label>
          </div>
          {mutation.isError && (
            <p className="mt-3 text-xs text-[#DC2626]">
              {mutation.error instanceof ApiError ? mutation.error.message : "Could not report blocker."}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#E2E8F0] px-4 py-3">
          <button type="button" onClick={onClose} className="btn-ghost text-xs">
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary text-xs"
            disabled={!reason.trim() || mutation.isPending}
            onClick={handleSubmit}
          >
            {mutation.isPending ? "Saving…" : "Report"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogWorkModal({
  task,
  open,
  onClose,
  onChanged,
}: {
  task: TaskDetail;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [hours, setHours] = useState("");
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [activityType, setActivityType] = useState("preparation");

  const mutation = useMutation({
    mutationFn: (payload: { work_date: string; hours: number; description?: string; activity_type: string }) =>
      api.post(`/tasks/${task.id}/work-logs`, payload),
    onSuccess: () => {
      setHours("");
      setDescription("");
      onClose();
      onChanged();
    },
  });

  const handleSubmit = () => {
    const h = parseFloat(hours);
    if (isNaN(h) || h <= 0 || h > 24) return;
    mutation.mutate({
      work_date: workDate,
      hours: h,
      description: description.trim() || undefined,
      activity_type: activityType,
    });
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4",
        !open && "hidden",
      )}
    >
      <div className="relative z-10 w-full max-w-md rounded-[10px] border border-[#E2E8F0] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
          <h2 className="text-base font-semibold text-[#101B3D]">Log Work</h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="p-4">
          <div className="space-y-4">
            <input
              type="number"
              className="input w-full"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="Hours"
              min="0"
              max="24"
              step="0.25"
            />
            <TextField label="Date" value={workDate} onChange={setWorkDate} type="date" />
            <select
              className="input w-full"
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
            >
              {ACTIVITY_TYPES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <TextAreaField label="Description" value={description} onChange={setDescription} placeholder="What did you do?" />
          </div>
          {mutation.isError && (
            <p className="mt-3 text-xs text-[#DC2626]">
              {mutation.error instanceof ApiError ? mutation.error.message : "Could not log work."}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#E2E8F0] px-4 py-3">
          <button type="button" onClick={onClose} className="btn-ghost text-xs">
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary text-xs"
            disabled={!hours || mutation.isPending}
            onClick={handleSubmit}
          >
            {mutation.isPending ? "Logging…" : "Log"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailsPane({
  task,
  directory,
  onChanged,
  workLogs,
}: {
  task: TaskDetail;
  directory: ReturnType<typeof useUserDirectory>;
  onChanged: () => void;
  workLogs: ReturnType<typeof useQuery<Page<TaskWorkLogRow>>>;
}) {
  const done = task.steps.filter((s) => s.status === "completed" || s.status === "skipped").length;
  const total = task.steps.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  const logs = workLogs.data?.items ?? [];
  const loggedHours = logs.reduce((sum, log) => sum + log.hours, 0);
  const estimatedHours = task.estimated_hours ?? 0;
  const remainingHours = estimatedHours - loggedHours;

  const hasBlocker = task.available_transitions.some(
    (t) => t === "waiting_for_client" || t === "waiting_for_internal",
  );

  return (
    <>
      <DetailSection title="Task Metadata">
        <Detail label="Status">
          <Badge tone={taskStatusTone(task.status)}>
            {taskStatusLabel(task.status)}
          </Badge>
        </Detail>
        <Detail label="Priority">
          <Badge tone={priorityTone(task.priority)}>
            {humanise(task.priority)}
          </Badge>
        </Detail>
        <Detail label="Type">
          <span className="text-[#101B3D]">{task.task_type}</span>
        </Detail>
        <Detail label="Category">
          <span className="text-[#64748B]">
            {task.category ? humanise(task.category) : "—"}
          </span>
        </Detail>
        <Detail label="Complexity">
          <span className="text-[#64748B]">{humanise(task.complexity)}</span>
        </Detail>
      </DetailSection>

      <DetailSection title="Dates & Period">
        <Detail label="Start date">
          <span className="tabular text-[#101B3D]">
            {task.start_date ? formatDate(task.start_date) : "—"}
          </span>
        </Detail>
        <Detail label="Statutory due date">
          <span className={cn("tabular", task.is_overdue && "font-medium text-[#DC2626]")}>
            {task.statutory_due_date ? formatDate(task.statutory_due_date) : "—"}
          </span>
        </Detail>
        <Detail label="Internal due date">
          <span className="tabular text-[#101B3D]">
            {task.internal_due_date ? formatDate(task.internal_due_date) : "—"}
          </span>
        </Detail>
        <Detail label="Period key">
          <span className="tabular text-[#64748B]">{task.period_key ?? "—"}</span>
        </Detail>
        {task.financial_year_id && (
          <Detail label="Financial year">
            <span className="text-[#64748B]">{task.financial_year_id}</span>
          </Detail>
        )}
        {task.deadline_verified ? null : (
          <Detail label="Deadline">
            <Badge tone="warning">Statutory date unconfirmed</Badge>
          </Detail>
        )}
      </DetailSection>

      <DetailSection title="Assignment">
        <RoleAssigner task={task} directory={directory} onChanged={onChanged} />
      </DetailSection>

      <DetailSection title="Time Tracking">
        <Detail label="Estimated">{task.estimated_hours != null ? `${task.estimated_hours}h` : "—"}</Detail>
        <Detail label="Logged">{loggedHours > 0 ? `${loggedHours.toFixed(2)}h` : "—"}</Detail>
        <Detail label="Remaining">
          {estimatedHours > 0 ? `${remainingHours.toFixed(1)}h` : "—"}
        </Detail>
        <Detail
          label="Tags"
          action={
            task.tags && task.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {task.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded bg-[#F0F9FF] px-1.5 py-0.5 text-[10px] text-[#0369A1]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : undefined
          }
        />
        {task.blocked_reason && (
          <Detail
            label="Blocker"
            action={
              <Badge tone="warning">
                {task.delay_reason ? delayReasonLabel(task.delay_reason) : task.blocked_reason}
              </Badge>
            }
          />
        )}
      </DetailSection>

      {task.parent_task_code && (
        <DetailSection title="Parent Task">
          <Detail label="Parent">
            <Link
              href={`/tasks/${task.parent_task_code}`}
              className="text-xs text-[#1677FF] hover:underline"
            >
              {task.parent_task_code} — {task.parent_task_title}
            </Link>
          </Detail>
        </DetailSection>
      )}

      {task.subtasks.length > 0 && (
        <DetailSection title="Subtasks">
          <ul className="space-y-1 text-xs">
            {task.subtasks.map((sub) => (
              <li key={sub.id} className="flex items-center justify-between">
                <span className="text-[#64748B]">{sub.task_code}</span>
                <span className="text-[#101B3D]">{sub.title}</span>
                <span className="text-[#64748B]">
                  <Badge tone={taskStatusTone(sub.status)}>{taskStatusLabel(sub.status)}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </DetailSection>
      )}

      {task.description && (
        <DetailSection title="Description">
          <DescriptionBody
            text={task.description}
            className="text-xs text-[#64748B]"
          />
        </DetailSection>
      )}

      <DetailSection title={`Checklist (${done}/${total})`}>
        <ProgressBar percent={percent} tone={percent === 100 ? "success" : "progress"} />
        {total === 0 ? (
          <p className="mt-2 text-xs text-[#94A3B8]">No checklist steps on this task.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {task.steps.map((step) => (
              <StepRow
                key={step.id}
                step={step}
                taskId={task.id}
                onChanged={onChanged}
              />
            ))}
          </ul>
        )}
      </DetailSection>

      {task.completion_blockers.length > 0 && (
        <DetailSection title="Completion blockers">
          <ul className="list-disc list-inside space-y-1 text-xs text-[#DC2626]">
            {task.completion_blockers.map((blocker, idx) => (
              <li key={idx}>{blocker}</li>
            ))}
          </ul>
        </DetailSection>
      )}
    </>
  );
}

function DetailSection({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-b border-[#E2E8F0] py-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
          {title}
        </h4>
        {action}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Detail({
  label,
  children,
  action,
}: {
  label: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="w-32 shrink-0 pt-0.5 text-xs text-[#64748B]">{label}</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right text-xs text-[#101B3D]">
        {children ?? "—"}
      </span>
      {action}
    </div>
  );
}

function StepRow({
  step,
  taskId,
  onChanged,
}: {
  step: TaskStepRow;
  taskId: string;
  onChanged: () => void;
}) {
  const complete = step.status === "completed" || step.status === "skipped";
  const update = useMutation({
    mutationFn: (payload: { status: string; notes?: string }) =>
      api.post(`/tasks/${taskId}/steps/${step.id}`, payload),
    onSuccess: onChanged,
  });

  const handleToggle = () => {
    if (complete) {
      update.mutate({ status: "pending" });
    } else {
      update.mutate({ status: "completed" });
    }
  };

  return (
    <li className="flex items-start gap-2">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={complete}
        disabled={update.isPending}
        onChange={handleToggle}
        aria-label={step.name}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-xs",
            complete ? "text-[#94A3B8] line-through" : "text-[#101B3D]",
          )}
        >
          {step.name}
          {step.is_mandatory && !complete && (
            <span className="ml-1 text-[10px] uppercase tracking-wide text-[#B45309]">
              required
            </span>
          )}
        </span>
        {update.isError && (
          <span className="block text-[10px] text-[#DC2626]">
            {update.error instanceof ApiError ? update.error.message : "Could not update."}
          </span>
        )}
      </span>
    </li>
  );
}

function RoleAssigner({
  task,
  directory,
  onChanged,
}: {
  task: TaskDetail;
  directory: ReturnType<typeof useUserDirectory>;
  onChanged: () => void;
}) {
  return (
    <>
      {ASSIGNABLE_ROLES.map(({ field, label }) => {
        const currentId = task[field] as string | null;
        return (
          <Detail key={field} label={label}>
            <span className="text-[#101B3D]">
              {userName(directory.byId, currentId)}
            </span>
          </Detail>
        );
      })}
    </>
  );
}

function Comments({
  task,
  directory,
  onChanged,
}: {
  task: TaskDetail;
  directory: ReturnType<typeof useUserDirectory>;
  onChanged: () => void;
}) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"internal" | "client">("internal");
  const post = useMutation({
    mutationFn: (payload: { body: string; visibility: string; is_review_note?: boolean }) =>
      api.post(`/tasks/${task.id}/comments`, payload),
    onSuccess: () => {
      setBody("");
      onChanged();
    },
  });

  const handleSubmit = () => {
    if (!body.trim()) return;
    post.mutate({ body: body.trim(), visibility, is_review_note: false });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <textarea
          className="input min-h-[3rem] flex-1 text-xs"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Add a comment…"
          aria-label="Add a comment"
        />
        <div className="flex flex-col gap-1">
          <select
            className="input py-1 text-xs"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as "internal" | "client")}
          >
            <option value="internal">Internal</option>
            <option value="client">Visible to client</option>
          </select>
          <button
            type="button"
            className="btn-primary px-2 py-1 text-xs"
            disabled={!body.trim() || post.isPending}
            onClick={handleSubmit}
          >
            Send
          </button>
        </div>
      </div>
      {post.isError && (
        <p role="alert" className="text-xs text-[#DC2626]">
          {post.error instanceof ApiError ? post.error.message : "Could not post the comment."}
        </p>
      )}

      {task.comments.length === 0 ? (
        <EmptyState message="No comments yet." />
      ) : (
        <ul className="space-y-3">
          {task.comments.map((comment: TaskCommentRow) => (
            <li key={comment.id} className="flex items-start gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#E2E8F0] text-[10px] font-semibold text-[#101B3D]">
                {comment.author_type === "system" ? (
                  <Icon name="settings" className="h-3.5 w-3.5" />
                ) : (
                  initials(userName(directory.byId, comment.author_user_id))
                )}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#101B3D]">
                  {comment.author_type === "system"
                    ? "System"
                    : userName(directory.byId, comment.author_user_id)}
                  <span className="ml-2 font-normal text-[#94A3B8]">
                    {formatDate(comment.created_at.slice(0, 10))}
                  </span>
                  {comment.is_review_note && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-[#0369A1]">
                      review note
                    </span>
                  )}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-[#64748B]">{comment.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TimeLog({
  taskId,
  workLogs,
  onChanged,
}: {
  taskId: string;
  workLogs: ReturnType<typeof useQuery<Page<TaskWorkLogRow>>>;
  onChanged: () => void;
}) {
  const [logOpen, setLogOpen] = useState(false);

  if (workLogs.isPending) return <LoadingState label="Loading effort…" />;
  const items = workLogs.data?.items ?? [];
  if (items.length === 0) {
    return (
      <div className="text-center">
        <EmptyState message="No effort logged against this task." />
        <button
          type="button"
          onClick={() => setLogOpen(true)}
          className="mt-2 text-xs font-medium text-[#1677FF] hover:underline"
        >
          Log work
        </button>
      </div>
    );
  }
  const total = items.reduce((sum, row) => sum + row.hours, 0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="tabular text-xs text-[#64748B]">
          {total.toFixed(2)} hour(s) across {items.length} entr{items.length === 1 ? "y" : "ies"}
        </p>
        <button
          type="button"
          onClick={() => setLogOpen(true)}
          className="text-xs font-medium text-[#1677FF] hover:underline"
        >
          Log more
        </button>
      </div>
      <ul className="divide-y divide-[#E2E8F0]">
        {items.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-3 py-1.5"
          >
            <div className="min-w-0 flex-1">
              <span className="truncate text-xs text-[#64748B]">
                {row.description ?? "—"}
              </span>
              <span className="ml-2 text-[10px] text-[#94A3B8]">
                {humanise(row.activity_type)}
              </span>
            </div>
            <span className="tabular shrink-0 text-xs text-[#64748B]">
              {row.hours}h · {formatDate(row.work_date)}
            </span>
            <WorkLogActions
              taskId={taskId}
              log={row}
              onChanged={onChanged}
            />
          </li>
        ))}
      </ul>

      <LogWorkInline taskId={taskId} open={logOpen} onClose={() => setLogOpen(false)} onChanged={onChanged} />
    </div>
  );
}

function WorkLogActions({
  taskId,
  log,
  onChanged,
}: {
  taskId: string;
  log: TaskWorkLogRow;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState(String(log.hours));
  const [date, setDate] = useState(log.work_date);
  const [description, setDescription] = useState(log.description ?? "");

  const update = useMutation({
    mutationFn: (payload: { hours?: number; work_date?: string; description?: string }) =>
      api.patch(`/tasks/${taskId}/work-logs/${log.id}`, payload),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
  });

  const del = useMutation({
    mutationFn: () => api.delete(`/tasks/${taskId}/work-logs/${log.id}`),
    onSuccess: onChanged,
  });

  if (editing) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          className="input w-16 py-0.5 text-xs"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          min="0"
          max="24"
          step="0.25"
        />
        <button
          type="button"
          className="text-[10px] text-[#1677FF]"
          onClick={() =>
            update.mutate({
              hours: parseFloat(hours),
              work_date: date,
              description: description.trim() || undefined,
            })
          }
        >
          ✓
        </button>
        <button
          type="button"
          className="text-[10px] text-[#64748B]"
          onClick={() => setEditing(false)}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <span className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-[10px] text-[#64748B] hover:text-[#1677FF]"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => del.mutate()}
        className="text-[10px] text-[#64748B] hover:text-[#DC2626]"
      >
        ✕
      </button>
    </span>
  );
}

function LogWorkInline({
  taskId,
  open,
  onClose,
  onChanged,
}: {
  taskId: string;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [hours, setHours] = useState("");
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [activityType, setActivityType] = useState("preparation");

  const mutation = useMutation({
    mutationFn: (payload: { work_date: string; hours: number; description?: string; activity_type: string }) =>
      api.post(`/tasks/${taskId}/work-logs`, payload),
    onSuccess: () => {
      setHours("");
      setDescription("");
      onClose();
      onChanged();
    },
  });

  const handleSubmit = () => {
    const h = parseFloat(hours);
    if (isNaN(h) || h <= 0 || h > 24) return;
    mutation.mutate({
      work_date: workDate,
      hours: h,
      description: description.trim() || undefined,
      activity_type: activityType,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="relative z-10 w-full max-w-md rounded-[10px] border border-[#E2E8F0] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
          <h2 className="text-base font-semibold text-[#101B3D]">Log Work</h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="p-4">
          <div className="space-y-4">
            <input
              type="number"
              className="input w-full"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="Hours"
              step="0.25"
              min="0"
              max="24"
            />
            <input
              type="date"
              className="input w-full"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
            />
            <select
              className="input w-full"
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
            >
              {ACTIVITY_TYPES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <textarea
              className="input w-full"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you do?"
              rows={3}
            />
          </div>
          {mutation.isError && (
            <p className="mt-3 text-xs text-[#DC2626]">
              {mutation.error instanceof ApiError ? mutation.error.message : "Could not log work."}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#E2E8F0] px-4 py-3">
          <button type="button" onClick={onClose} className="btn-ghost text-xs">
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary text-xs"
            disabled={!hours || mutation.isPending}
            onClick={handleSubmit}
          >
            {mutation.isPending ? "Logging…" : "Log"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Activity({
  task,
  directory,
}: {
  task: TaskDetail;
  directory: ReturnType<typeof useUserDirectory>;
}) {
  if (task.status_history.length === 0) {
    return <EmptyState message="No status changes recorded." />;
  }
  return (
    <ul className="space-y-2">
      {task.status_history.map((entry) => (
        <li key={entry.id} className="flex items-start gap-2 text-xs">
          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#CBD5E1]" />
          <div className="min-w-0">
            <p className="text-[#64748B]">
              {entry.from_status ? `${taskStatusLabel(entry.from_status)} → ` : ""}
              <span className="font-medium text-[#101B3D]">{taskStatusLabel(entry.to_status)}</span>
            </p>
            <p className="text-[#94A3B8]">
              {userName(directory.byId, entry.changed_by_id)} ·{" "}
              {formatDate(entry.created_at.slice(0, 10))}
            </p>
            {entry.reason && <p className="mt-0.5 text-[#94A3B8]">{entry.reason}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
