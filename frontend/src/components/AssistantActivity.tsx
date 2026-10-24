"use client";

import { useEffect, useRef } from "react";

/**
 * The live "what is happening right now" strip.
 *
 * An assistant turn is several model round-trips and several tool calls. The
 * old UI showed nothing until the turn ended and then listed the tools that had
 * run, which is backwards: by then the user no longer needs to know. This panel
 * sits above the composer, fills in as each tool starts and finishes, and the
 * parent unmounts it the moment the answer arrives.
 */

export interface ActivityStep {
  id: string;
  tool: string;
  status: "running" | "ok" | "error";
  /** e.g. "26 items" - what the tool returned, once it has returned. */
  detail?: string;
  elapsedMs?: number;
}

/** Plain-English descriptions, so the strip reads as work, not as function names. */
const TOOL_LABELS: Record<string, string> = {
  search_tasks: "Searching tasks",
  get_task_details: "Opening the task",
  get_task_checklist: "Reading the checklist",
  get_task_blockers: "Checking what is blocking it",
  get_task_comments: "Reading the comments",
  get_task_history: "Reading the activity history",
  get_task_assignees: "Checking who is assigned",
  get_task_attachments: "Looking for attachments",
  get_task_dependencies: "Checking dependencies",
  get_task_time_entries: "Adding up the time logged",
  get_task_summary: "Counting your tasks",
  get_my_tasks: "Finding your tasks",
  get_overdue_tasks: "Finding overdue tasks",
  get_tasks_awaiting_review: "Checking your review queue",
  get_tasks_awaiting_approval: "Checking your approval queue",
  get_assignment_history: "Reading the assignment history",
  get_workload_summary: "Working out the workload",
  search_clients: "Searching clients",
  get_client_details: "Opening the client record",
  get_client_compliance_status: "Assessing compliance",
  get_missing_documents: "Checking outstanding documents",
  get_upcoming_deadlines: "Checking upcoming deadlines",
  get_filing_records: "Reading filing records",
  search_staff: "Looking up staff",
  assign_task_role: "Assigning the role",
  update_checklist_step: "Updating the checklist",
  update_task_priority: "Changing the priority",
  update_task_due_date: "Changing the due date",
  transition_task_status: "Moving the task on",
  request_task_review: "Requesting review",
  request_task_documents: "Requesting documents",
  add_task_comment: "Adding the comment",
  log_task_time: "Logging the time",
};

export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool.replace(/_/g, " ");
}

function Spinner() {
  return (
    <span className="relative flex h-4 w-4 items-center justify-center">
      <span className="absolute h-4 w-4 animate-ping rounded-full bg-sky-400/40" />
      <span className="relative h-2 w-2 rounded-full bg-sky-500" />
    </span>
  );
}

function Tick() {
  return (
    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100">
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-emerald-600">
        <path
          fillRule="evenodd"
          d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
          clipRule="evenodd"
        />
      </svg>
    </span>
  );
}

function Cross() {
  return (
    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-100">
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-rose-600">
        <path d="M6.3 6.3a1 1 0 0 1 1.4 0L10 8.6l2.3-2.3a1 1 0 1 1 1.4 1.4L11.4 10l2.3 2.3a1 1 0 0 1-1.4 1.4L10 11.4l-2.3 2.3a1 1 0 0 1-1.4-1.4L8.6 10 6.3 7.7a1 1 0 0 1 0-1.4Z" />
      </svg>
    </span>
  );
}

export function AssistantActivity({
  steps,
  headline,
  elapsedMs,
}: {
  steps: ActivityStep[];
  headline: string;
  elapsedMs: number;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [steps.length, steps[steps.length - 1]?.status]);

  return (
    <div className="overflow-hidden rounded-2xl border border-sky-200/70 bg-gradient-to-b from-sky-50/80 to-white shadow-[0_1px_2px_rgba(16,27,61,0.04),0_8px_24px_-12px_rgba(16,27,61,0.18)]">
      <div className="flex items-center gap-3 px-4 py-3">
        <Spinner />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">{headline}</p>
          <p className="text-xs text-slate-500">
            {steps.length === 0
              ? "Reading your question"
              : `${steps.length} step${steps.length === 1 ? "" : "s"} completed`}
            {elapsedMs > 0 && ` · ${(elapsedMs / 1000).toFixed(1)}s`}
          </p>
        </div>
      </div>

      {steps.length > 0 && (
        <div
          ref={listRef}
          className="max-h-40 space-y-0.5 overflow-y-auto border-t border-sky-100/80 px-4 py-2"
        >
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-2.5 py-1">
              {step.status === "running" ? <Spinner /> : step.status === "ok" ? <Tick /> : <Cross />}
              <span
                className={`flex-1 truncate text-xs ${
                  step.status === "running"
                    ? "font-medium text-slate-800"
                    : step.status === "error"
                      ? "text-rose-700"
                      : "text-slate-500"
                }`}
              >
                {toolLabel(step.tool)}
                {step.detail && step.status !== "running" && (
                  <span className="text-slate-400"> · {step.detail}</span>
                )}
                {step.elapsedMs !== undefined && step.status !== "running" && (
                  <span className="text-slate-300"> · {Math.round(step.elapsedMs)}ms</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
