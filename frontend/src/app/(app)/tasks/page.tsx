"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Clock, Calendar, Eye, Trash2, ArrowRight } from "lucide-react";

import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, StatCard, useToast } from "@/components/ui";
import { TaskDetailsPopup } from "@/components/TaskDetailsPopup";
import { CreateTaskModal } from "@/components/CreateTaskModal";
import { Icon, type IconName } from "@/components/Icon";
import { ApiError, api, buildQuery } from "@/lib/api";
import { cn, formatDate, humanise } from "@/lib/format";
import { useDebouncedValue, usePaging } from "@/lib/hooks";
import { useSession, usePermissions } from "@/lib/session";
import { badgeClasses, sortStatuses, statusDotClass, statusRequiresReason, taskStatusLabel, taskStatusTone, TASK_STATUS_ORDER } from "@/lib/status";
import { initials, useUserDirectory } from "@/lib/users";
import type {
  ClientListItem,
  Page,
  ServiceRow,
  TaskListItem,
  TaskStatus,
  TaskSummary,
} from "@/lib/types";

/**
 * The tabs, and the count each shows.
 *
 * A tab is a saved filter, not a bespoke endpoint — the counts come from `/tasks/summary`
 * built from the same `_task_conditions` the list uses, so a tab can never claim more rows
 * than it can show. The list parameters are derived in `tabParams` below, because two of
 * them (`mine`, the week window) need the caller's id and today's date.
 */
const TABS: Array<{ key: string; label: string; countKey: keyof TaskSummary }> = [
  { key: "all", label: "All Tasks", countKey: "all_tasks" },
  { key: "mine", label: "My Tasks", countKey: "my_tasks" },
  { key: "review", label: "Awaiting My Review", countKey: "awaiting_review" },
  { key: "approval", label: "Awaiting My Approval", countKey: "awaiting_approval" },
  { key: "my-blocked", label: "My Blocked Tasks", countKey: "my_blocked" },
  { key: "overdue", label: "Overdue", countKey: "overdue" },
  { key: "week", label: "Due This Week", countKey: "due_this_week" },
  { key: "completed", label: "Completed", countKey: "completed" },
  { key: "waiting", label: "Waiting on Client", countKey: "waiting_for_client" },
];

/** Icons and dot colours for each summary card. */
const SUMMARY_META: Record<string, { icon: IconName; tone: string }> = {
  all: { icon: "tasks", tone: "info" },
  mine: { icon: "user", tone: "neutral" },
  review: { icon: "shield-check", tone: "warning" },
  approval: { icon: "shield-check", tone: "progress" },
  "my-blocked": { icon: "alert-triangle", tone: "danger" },
  overdue: { icon: "alert-triangle", tone: "danger" },
  week: { icon: "calendar", tone: "warning" },
  completed: { icon: "check-circle", tone: "success" },
  waiting: { icon: "clock", tone: "info" },
};

/** Today plus seven days, as `YYYY-MM-DD`, in the browser's own timezone. */
function isoPlusDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The list parameters for a tab.
 *
 * Kept as a function rather than data on `TABS` so the week window and "mine" are computed
 * at render time. A `Date` captured at module load would go stale in a tab left open
 * overnight — and the counts would then disagree with the rows.
 */
function tabParams(key: string): Record<string, string> {
  switch (key) {
    case "mine":
      return { mine: "true", open_only: "true" };
    case "review":
      return { awaiting_review: "true", open_only: "true" };
    case "approval":
      return { awaiting_approval: "true", open_only: "true" };
    case "my-blocked":
      return { mine: "true", blocked_only: "true", open_only: "true" };
    case "overdue":
      return { overdue_only: "true" };
    case "week":
      return { due_after: isoToday(), due_before: isoPlusDays(7), open_only: "true" };
    case "completed":
      return { status: "completed" };
    case "waiting":
      return { status: "waiting_for_client" };
    default:
      return { open_only: "true" };
  }
}

/** Kanban columns, in workflow order. A task in any other status lands in none of them. */
const BOARD: Array<{ status: string; label: string }> = [
  { status: "waiting_for_client", label: "Waiting on Client" },
  { status: "not_started", label: "Not Started" },
  { status: "in_progress", label: "In Preparation" },
  { status: "ready_for_review", label: "Awaiting Review" },
  { status: "ready_to_file", label: "Ready to File" },
];

function greeting(data: TaskSummary): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function TasksPage() {
  const paging = usePaging(25);
  const { filters, updateFilter, offset, setOffset, limit, page } = paging;
  const search = useDebouncedValue(filters.search ?? "");
  const directory = useUserDirectory();
  const session = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [tab, setTab] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setActionsOpen] = useState<string | null>(null);

  const scope = {
    search,
    client_id: filters.client_id,
    service_id: filters.service_id,
    priority: filters.priority,
    preparer_id: filters.preparer_id,
    status: filters.status,
  };

  const summary = useQuery({
    queryKey: ["tasks", "summary", scope],
    queryFn: () => api.get<TaskSummary>(`/tasks/summary${buildQuery(scope)}`),
  });

  const tasks = useQuery({
    queryKey: ["tasks", { ...scope, tab, offset, limit }],
    queryFn: () =>
      api.get<Page<TaskListItem>>(`/tasks${buildQuery({ ...scope, ...tabParams(tab), limit, offset })}`),
  });

  const boardTasks = useQuery({
    queryKey: ["tasks", "board", tab],
    queryFn: () =>
      api.get<Page<TaskListItem>>(`/tasks${buildQuery({ ...scope, ...tabParams(tab), limit: 200 })}`),
    enabled: tab === "mine" || tab === "all",
  });

  const services = useQuery({
    queryKey: ["services", "catalogue"],
    queryFn: () => api.get<Page<ServiceRow>>("/services?limit=100"),
    staleTime: 10 * 60 * 1000,
  });

  const rows = tasks.data?.items ?? [];
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)));
  }

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeTab(key: string) {
    setTab(key);
    setOffset(0);
    setSelected(new Set());
    setActionsOpen(null);
  }

  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openId === null) return;
    function onOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setActionsOpen(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setActionsOpen(null);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  const hasFilters = Object.values(filters).some(Boolean);
  const s = summary.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Tasks`}
        subtitle="Track and manage all compliance and client work."
        action={
          <div className="flex items-center gap-2">
            <Link href="/tasks/generate" className="btn btn-outline px-5 py-2.5">
              <Icon name="clock-3" className="h-4 w-4 mr-2" />
              Generate Work
            </Link>
            <Button className="btn-primary px-5 py-2.5">
              <Icon name="plus" className="h-4 w-4 mr-2" />
              New Task
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        {TABS.map((entry) => {
          const isActive = entry.key === tab;
          const meta = SUMMARY_META[entry.key];
          return (
            <StatCard
              key={entry.key}
              label={entry.label}
              value={s?.[entry.countKey] ?? 0}
              tone={meta.tone as any}
              icon={<Icon name={meta.icon} className="h-5 w-5" />}
            />
          );
        })}
      </div>

      <Card>
        <div className="flex items-center gap-1 border-b border-border px-3 pt-2 pb-1 overflow-x-auto">
          {TABS.map((row) => {
            const isActive = row.key === tab;
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => changeTab(row.key)}
                className={cn(
                  "whitespace-nowrap -mb-px border-b-2 px-3 py-1.5 text-xs font-medium transition-colors duration-150 shrink-0",
                  isActive
                    ? "border-primary text-primary-foreground"
                    : "border-transparent text-hsl(var(--muted-foreground)) hover:text-hsl(var(--foreground)) hover:bg-hsl(var(--secondary))/50 rounded",
                )}
              >
                {row.label}
                <span
                  className={cn(
                    "tabular ml-1.5 px-1.5 py-0.5 text-[10px] font-semibold",
                    isActive ? "bg-primary/10 text-primary rounded" : "bg-hsl(var(--muted))/50 text-hsl(var(--muted-foreground)) rounded",
                  )}
                >
                  {s?.[row.countKey] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-border p-3 md:grid-cols-3 xl:grid-cols-6">
          <label className="col-span-2 block md:col-span-1">
            <input
              className="input py-1.5"
              type="search"
              value={filters.search ?? ""}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Search tasks by title, code…"
              aria-label="Search tasks"
            />
          </label>
          <select
            className="select py-1.5"
            value={filters.status ?? ""}
            onChange={(event) => updateFilter("status", event.target.value)}
          >
            <option value="">Status</option>
            <option value="not_started">Not Started</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="waiting_for_client">Waiting for Client</option>
            <option value="ready_for_review">Ready for Review</option>
            <option value="ready_to_file">Ready to File</option>
            <option value="completed">Completed</option>
          </select>
          <select
            className="select py-1.5"
            value={filters.priority ?? ""}
            onChange={(event) => updateFilter("priority", event.target.value)}
          >
            <option value="">Priority</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <select
            className="select py-1.5"
            value={filters.client_id ?? ""}
            onChange={(event) => updateFilter("client_id", event.target.value)}
          >
            <option value="">Client</option>
            {(directory.active.map((row) => (
              <option key={row.id} value={row.id}>{row.full_name}</option>
            )))}
          </select>
        </div>

        {rows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[72rem]">
                <thead className="table-header">
                  <tr className="table-header-row">
                    <th className="table-head w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Select all tasks on this page"
                      />
                    </th>
                    <th className="table-head w-10">#</th>
                    <th className="table-head">Task Title</th>
                    <th className="table-head">Client</th>
                    <th className="table-head">Service</th>
                    <th className="table-head">Due Date</th>
                    <th className="table-head">Status</th>
                    <th className="table-head">Priority</th>
                    <th className="table-head w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className="table-body">
                  {rows.map((task, index) => (
                    <tr
                      key={task.id}
                      className={cn(
                        "table-row",
                        selected.has(task.id) && "table-row-selected",
                      )}
                    >
                      <td className="table-cell">
                        <input
                          type="checkbox"
                          checked={selected.has(task.id)}
                          onChange={() => toggleOne(task.id)}
                          aria-label={`Select ${task.title}`}
                        />
                      </td>
                      <td className="table-cell tabular text-xs text-hsl(var(--muted-foreground))">{offset + index + 1}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <span className="flex size-4 shrink-0 items-center justify-center rounded-md bg-hsl(var(--secondary)) text-[10px] font-semibold text-hsl(var(--secondary-foreground))">
                            {task.task_code}
                          </span>
                          <Link
                            href={`/tasks/${task.id}`}
                            className="font-medium text-hsl(var(--foreground)) underline-offset-2 hover:underline"
                          >
                            {task.title}
                          </Link>
                        </div>
                      </td>
                      <td className="table-cell text-xs text-hsl(var(--muted-foreground))">{task.client_name ?? "—"}</td>
                      <td className="table-cell text-xs text-hsl(var(--muted-foreground))">{task.service_code ?? "—"}</td>
                      <td className="table-cell tabular text-xs">
                        {task.statutory_due_date ? (
                          <span className={cn(
                            "font-medium",
                            task.is_overdue ? "text-destructive" : "text-hsl(var(--foreground))",
                          )}>
                            {formatDate(task.statutory_due_date)}
                          </span>
                        ) : (
                          <span className="text-hsl(var(--muted-foreground))">—</span>
                        )}
                      </td>
                      <td className="table-cell">
                        <Badge tone={taskStatusTone(task.status)}>
                          {taskStatusLabel(task.status)}
                        </Badge>
                      </td>
                      <td className="table-cell text-xs">
                        <span className={cn(
                          "flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium",
                          task.priority === "urgent" ? "border-destructive/20 bg-destructive/10 text-destructive" :
                          task.priority === "high" ? "border-warning/20 bg-warning/10 text-warning" :
                          task.priority === "normal" ? "border-info/20 bg-info/10 text-info" :
                          "border-muted/20 bg-muted/10 text-muted-foreground",
                        )}>
                          {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div
                          id={`actions-menu-${task.id}`}
                          ref={openId === task.id ? menuRef : null}
                          className="relative inline-block"
                        >
                          <button
                            type="button"
                            className="btn-icon text-hsl(var(--muted-foreground)) hover:bg-hsl(var(--secondary)) hover:text-hsl(var(--foreground))"
                            aria-label={`Actions for ${task.title}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActionsOpen((current) => (current === task.id ? null : task.id));
                            }}
                          >
                            <Icon name="more-vertical" className="h-4 w-4" />
                          </button>
                          {openId === task.id && (
                            <div
                              role="menu"
                              className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
                            >
                              <Link
                                href={`/tasks/${task.id}`}
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-hsl(var(--foreground)) hover:bg-hsl(var(--secondary)) transition-colors"
                                onClick={() => setActionsOpen(null)}
                              >
                                <Eye className="h-3 w-3" />
                                Open Task
                              </Link>
                              <div className="my-1 separator separator-horizontal" />
                              <Link
                                href={`/tasks/${task.id}/edit`}
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-hsl(var(--foreground)) hover:bg-hsl(var(--secondary)) transition-colors"
                                onClick={() => setActionsOpen(null)}
                              >
                                <Icon name="pencil" className="h-3 w-3" />
                                Edit
                              </Link>
                              <div className="my-1 separator separator-horizontal" />
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/5 transition-colors"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActionsOpen(null);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              limit={limit}
              total={tasks.data?.meta.total ?? 0}
              hasMore={tasks.data?.meta.has_more ?? false}
              offset={offset}
              onOffsetChange={setOffset}
            />
          </>
        )}
      </Card>
    </div>
  );
}
