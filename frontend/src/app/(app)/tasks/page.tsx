"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
} from "@/components/ui";
import { TaskDetailsPopup } from "@/components/TaskDetailsPopup";
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
const SUMMARY_META: Record<string, { icon: IconName; dot: string }> = {
  all: { icon: "tasks", dot: "bg-[#EAF3FF] text-[#3478D4]" },
  mine: { icon: "user", dot: "bg-[#FFF1E8] text-[#D97736]" },
  review: { icon: "shield-check", dot: "bg-[#F1EAFF] text-[#7543E9]" },
  approval: { icon: "shield-check", dot: "bg-[#E8F8EF] text-[#22965A]" },
  "my-blocked": { icon: "alert-triangle", dot: "bg-[#FFF0F3] text-[#D84C72]" },
  overdue: { icon: "alert-triangle", dot: "bg-[#FFF0F3] text-[#D84C72]" },
  week: { icon: "calendar", dot: "bg-[#FEF3C7] text-[#F59E0B]" },
  completed: { icon: "check-circle", dot: "bg-[#DCFCE7] text-[#16A34A]" },
  waiting: { icon: "clock", dot: "bg-[#F3EFFF] text-[#6D3AE8]" },
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

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `2026-09` → `Sep 2026`. The API stores a key; a person reads a label. */
function periodLabel(periodKey: string | null): string {
  if (!periodKey) return "—";
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) return periodKey;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return periodKey;
  return `${MONTHS[month - 1].slice(0, 3)} ${match[1]}`;
}

function PriorityDot({ priority }: { priority: string }) {
  const colour: Record<string, string> = {
    low: "bg-[#CBD5E1]",
    normal: "bg-[#38BDF8]",
    high: "bg-[#F59E0B]",
    urgent: "bg-[#DC2626]",
  };
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-1.5 rounded-full", colour[priority] ?? "bg-slate-300")} />
      <span className="text-xs capitalize text-[#64748B]">{priority}</span>
    </span>
  );
}

function Avatar({ name }: { name: string | null }) {
  if (!name) return <span className="text-xs text-[#94A3B8]">Unassigned</span>;
  return (
    <span className="flex items-center gap-1.5" title={name}>
      <span className="flex size-6 items-center justify-center rounded-full bg-[#E2E8F0] text-[10px] font-semibold text-[#101B3D]">
        {initials(name)}
      </span>
      <span className="hidden text-xs text-[#101B3D] xl:inline">{name.split(" ")[0]}</span>
    </span>
  );
}

function InlineStatusControl({ task }: { task: TaskListItem }) {
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<TaskStatus | null>(null);
  const [pendingReason, setPendingReason] = useState("");

  const mutation = useMutation({
    mutationFn: (payload: { status: string; reason?: string }) =>
      api.post(`/tasks/${task.id}/status`, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks", "summary"] });
      setDropdownOpen(false);
      setPendingTarget(null);
      setPendingReason("");
    },
  });

  const availableSet = useMemo(
    () => new Set(task.available_transitions ?? []),
    [task.available_transitions],
  );

  /** Only the statuses the user can actually transition to — blocked/hidden ones are filtered out. */
  const visibleStatuses = useMemo(
    () => sortStatuses(TASK_STATUS_ORDER.filter((s) => s !== task.status && availableSet.has(s))),
    [task.status, availableSet],
  );

  const hasAnyTransition = visibleStatuses.length > 0;

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDropdownOpen(false);
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", onOutside);
      document.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [dropdownOpen]);

  const tone = taskStatusTone(task.status);
  const label = taskStatusLabel(task.status);
  const dotClass = statusDotClass(task.status);
  const statusClasses = badgeClasses(tone);

  // Reason prompt for guarded transitions
  if (pendingTarget && statusRequiresReason(pendingTarget)) {
    return (
      <div ref={containerRef} className="flex flex-col gap-1">
        <textarea
          className="input w-48 py-1 text-xs"
          value={pendingReason}
          onChange={(e) => setPendingReason(e.target.value)}
          placeholder="Reason required…"
          rows={2}
          autoFocus
        />
        <div className="flex gap-1">
          <button
            type="button"
            className="btn-primary px-2 py-0.5 text-xs"
            disabled={!pendingReason.trim() || mutation.isPending}
            onClick={() => {
              if (!pendingReason.trim()) return;
              mutation.mutate({ status: pendingTarget, reason: pendingReason.trim() });
            }}
          >
            {mutation.isPending ? "…" : "Go"}
          </button>
          <button
            type="button"
            className="text-xs text-[#64748B] hover:underline"
            onClick={() => setPendingTarget(null)}
          >
            Cancel
          </button>
        </div>
        {mutation.isError && (
          <p className="text-[10px] text-[#DC2626]">
            {mutation.error instanceof ApiError ? mutation.error.message : "Transition failed."}
          </p>
        )}
      </div>
    );
  }

  // No transitions available: render a static button with border and bg color
  if (!hasAnyTransition) {
    return (
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
          statusClasses,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={cn("size-1.5 rounded-full", dotClass)} />
        <span>{label}</span>
      </button>
    );
  }

  // Normal: button with border and bg color, chevron dropdown shows only available statuses
  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium outline-none",
          statusClasses,
        )}
        onClick={(e) => {
          e.stopPropagation();
          setDropdownOpen(!dropdownOpen);
        }}
      >
        <span className={cn("size-1.5 rounded-full", dotClass)} />
        <span>{label}</span>
        <Icon name="chevron-down" className="h-3 w-3 text-[#94A3B8]" />
      </button>

      {dropdownOpen && (
        <div className="absolute left-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-lg">
          {visibleStatuses.map((s) => {
            const needsReason = statusRequiresReason(s);
            return (
              <button
                key={s}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs outline-none",
                  mutation.isPending
                    ? "cursor-not-allowed opacity-50"
                    : "hover:bg-[#f7f6f3]",
                )}
                disabled={mutation.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  if (mutation.isPending) return;
                  if (needsReason) {
                    setPendingTarget(s);
                  } else {
                    mutation.mutate({ status: s });
                  }
                  setDropdownOpen(false);
                }}
              >
                <span className={cn("size-1.5 rounded-full", statusDotClass(s))} />
                {taskStatusLabel(s)}
              </button>
            );
          })}
        </div>
      )}
      {mutation.isError && (
        <p className="absolute top-full left-0 mt-1 text-[10px] text-[#DC2626] whitespace-nowrap">
          {mutation.error instanceof ApiError ? mutation.error.message : "Transition failed."}
        </p>
      )}
    </div>
  );
}

/** Colour for the progress bar fill based on completion percentage. */
function progressColour(percent: number): string {
  if (percent >= 100) return "bg-[#15803D]";
  if (percent >= 70) return "bg-[#1677FF]";
  if (percent >= 30) return "bg-[#F59E0B]";
  if (percent > 0) return "bg-rose-400";
  return "bg-[#CBD5E1]";
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 min-w-[3rem] rounded bg-[#E2E8F0] overflow-hidden">
        <div
          className={cn("h-full rounded", progressColour(percent))}
          style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
        />
      </div>
      <span className="tabular text-[10px] text-[#64748B]">{Math.round(percent)}%</span>
    </div>
  );
}

function RowActionsMenu({ task, onOpen }: { task: TaskListItem; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { canSee } = usePermissions();
  const canDelete = canSee("task.delete");
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    if (!confirm(`Delete task "${task.task_code}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/tasks/${task.id}`);
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
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

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        className="rounded p-1 text-[#94A3B8] hover:bg-[#f7f6f3] hover:text-[#101B3D]"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        aria-label="More actions"
      >
        <Icon name="more-vertical" className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-lg">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#101B3D] hover:bg-[#f7f6f3]"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onOpen();
            }}
          >
            <Icon name="eye" className="h-3 w-3" />
            Open task
          </button>
          <a
            href={`/tasks/${task.id}`}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#101B3D] hover:bg-[#f7f6f3]"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          >
            <Icon name="envelope" className="h-3 w-3" />
            Email task link
          </a>
          {canDelete && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#DC2626] hover:bg-[#FEF2F2]"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                void handleDelete();
              }}
            >
              <Icon name="trash" className="h-3 w-3" />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function TasksPage() {
  const paging = usePaging(25);
  const { filters, updateFilter, offset, setOffset, limit, page } = paging;
  const search = useDebouncedValue(filters.search ?? "");
  const directory = useUserDirectory();
  const session = useSession();
  const router = useRouter();

  // Admins/owners (firm-wide scope) default to "All Tasks" so they can see and
  // manage every task in the firm. Regular staff default to "My Tasks" — they
  // only see tasks they are assigned to.
  const isAdminOrOwner = session.data?.scope === "firm";
  const [tab, setTab] = useState(isAdminOrOwner ? "all" : "mine");
  const [view, setView] = useState<"list" | "kanban" | "calendar">("list");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const tabQuery = tabParams(tab);

  // Filters that narrow *what is being looked at*, as opposed to which slice the tab
  // shows. The summary is built from these alone, so the tab counts keep describing the
  // whole filtered set rather than collapsing to the tab you are standing on.
  const scope = {
    search,
    status: filters.status,
    service_id: filters.service_id,
    priority: filters.priority,
    preparer_id: filters.preparer_id,
    client_id: filters.client_id,
  };

  const summary = useQuery({
    queryKey: ["tasks", "summary", scope],
    queryFn: () => api.get<TaskSummary>(`/tasks/summary${buildQuery(scope)}`),
  });

  const tasks = useQuery({
    queryKey: ["tasks", { ...scope, tab, offset, limit }],
    queryFn: () =>
      api.get<Page<TaskListItem>>(`/tasks${buildQuery({ ...scope, ...tabQuery, limit, offset })}`),
  });

  // Kanban and calendar need the whole filtered set, not one page of it — so they fetch at
  // a higher cap, and only when that view is actually showing.
  const boardTasks = useQuery({
    queryKey: ["tasks", "board", scope, tab],
    queryFn: () =>
      api.get<Page<TaskListItem>>(`/tasks${buildQuery({ ...scope, ...tabQuery, limit: 200 })}`),
    enabled: view !== "list",
  });

  const services = useQuery({
    queryKey: ["services", "catalogue"],
    queryFn: () => api.get<Page<ServiceRow>>("/services?limit=100"),
    staleTime: 10 * 60 * 1000,
  });

  const clients = useQuery({
    queryKey: ["clients", "picker"],
    queryFn: () => api.get<Page<ClientListItem>>("/clients?limit=200"),
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
  }

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="min-h-full space-y-3 bg-[#F5F6FB] p-1 sm:p-2 lg:p-3">
      <div className="overflow-hidden rounded-[26px] border border-[#E8E7F0] bg-white shadow-[0_18px_55px_rgba(34,26,71,.07)]">
        <div className="relative isolate flex flex-wrap items-center justify-between gap-5 overflow-hidden border-b border-white/10 bg-[radial-gradient(ellipse_at_85%_10%,rgba(155,119,255,.35),transparent_36%),linear-gradient(115deg,#17132D_0%,#29204B_55%,#443078_100%)] px-4 py-5 text-white sm:px-5 lg:px-6">
              <div>
                <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-violet-200">
                  <span className="size-2 rounded-full bg-[#B9A0FF] shadow-[0_0_14px_rgba(185,160,255,.9)]" />
                  Work management
                </div>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-3xl">
                  Tasks & Compliance
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-violet-100">
                  Plan, assign and monitor your firm's client work.
                </p>
              </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-white/15 bg-white/10 p-1 backdrop-blur-md">
              {(
                [
                  ["list", "List"],
                  ["kanban", "Kanban"],
                  ["calendar", "Calendar"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  className={cn(
                    "cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold transition-all",
                    view === key
                      ? "bg-white text-[#6336D6] shadow-sm ring-1 ring-[#E8E0FA]"
                      : "text-[#747B95] hover:bg-white/70 hover:text-[#6032D4]",
                  )}
                  aria-pressed={view === key}
                >
                  {label}
                </button>
              ))}
            </div>
            <Link href="/tasks/generate" className="rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-white/20">
              Generate work
            </Link>
            <button
              type="button"
              className="inline-flex items-center rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-[#4D328B] shadow-[0_8px_24px_rgba(0,0,0,.18)] transition hover:-translate-y-0.5 hover:shadow-xl"
              onClick={() => router.push("/tasks/new")}
            >
              <Icon name="plus" className="h-3 w-3 mr-1" />
              New task
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-2 border-b border-[#EEEAF5] bg-[#FBFAFE] px-3 py-3 sm:grid-cols-3 sm:px-4 lg:grid-cols-5 2xl:grid-cols-9">
          {TABS.map((entry) => {
            const isActive = entry.key === tab;
            const meta = SUMMARY_META[entry.key];
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => changeTab(entry.key)}
                className={cn(
                  "group flex min-h-[108px] flex-col items-start justify-between gap-3 rounded-2xl border p-3.5 text-left transition-all duration-200",
                  isActive
                    ? "border-[#BDA8F4] bg-gradient-to-br from-[#F5F0FF] to-white shadow-[0_5px_16px_rgba(109,58,232,.10)] ring-1 ring-[#E9E0FF]"
                    : "border-[#ECEAF2] bg-white hover:-translate-y-0.5 hover:border-[#D3C4F7] hover:shadow-[0_8px_18px_rgba(55,43,100,.07)]",
                )}
              >
                <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", meta.dot)}>
                  <Icon name={meta.icon} className="h-4 w-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold leading-tight text-[#77738B] group-hover:text-[#4D328B]">{entry.label}</span>
                  <span className="tabular-nums text-[25px] font-bold tracking-[-.04em] text-[#211B38]">
                    {summary.data?.[entry.countKey] ?? 0}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 gap-3 border-b border-[#EEEAF5] bg-white px-3 py-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 sm:px-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8A849C]">Search</label>
            <input
              className="input min-h-11 rounded-xl border border-[#E7E5EE] bg-[#FAFAFC] px-3.5 py-2.5 text-[13px] text-[#302A42] shadow-sm outline-none transition placeholder:text-[#A5A1B0] hover:border-[#CEC4E5] focus:border-[#9271D8] focus:bg-white focus:ring-4 focus:ring-[#7543E9]/10"
              type="search"
              value={filters.search ?? ""}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Search tasks by title, code…"
              aria-label="Search tasks"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8A849C]">Status</label>
            <select
              className="input min-h-11 rounded-xl border border-[#E7E5EE] bg-[#FAFAFC] px-3.5 py-2.5 text-[13px] text-[#302A42] shadow-sm outline-none transition placeholder:text-[#A5A1B0] hover:border-[#CEC4E5] focus:border-[#9271D8] focus:bg-white focus:ring-4 focus:ring-[#7543E9]/10"
              value={filters.status ?? ""}
              onChange={(event) => updateFilter("status", event.target.value)}
              aria-label="Status"
            >
              <option value="">Status</option>
              <option value="not_started">Not Started</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="waiting_for_client">Waiting for Client</option>
              <option value="ready_for_review">In Review</option>
              <option value="changes_requested">Changes Requested</option>
              <option value="ready_for_approval">Awaiting Approval</option>
              <option value="approved">Approved</option>
              <option value="ready_to_file">Ready to File</option>
              <option value="filed">Filed</option>
              <option value="delivered">Delivered</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8A849C]">Service</label>
            <select
              className="input min-h-11 rounded-xl border border-[#E7E5EE] bg-[#FAFAFC] px-3.5 py-2.5 text-[13px] text-[#302A42] shadow-sm outline-none transition placeholder:text-[#A5A1B0] hover:border-[#CEC4E5] focus:border-[#9271D8] focus:bg-white focus:ring-4 focus:ring-[#7543E9]/10"
              value={filters.service_id ?? ""}
              onChange={(event) => updateFilter("service_id", event.target.value)}
              aria-label="Service"
            >
              <option value="">Service</option>
              {(services.data?.items ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8A849C]">Assignee</label>
            <select
              className="input min-h-11 rounded-xl border border-[#E7E5EE] bg-[#FAFAFC] px-3.5 py-2.5 text-[13px] text-[#302A42] shadow-sm outline-none transition placeholder:text-[#A5A1B0] hover:border-[#CEC4E5] focus:border-[#9271D8] focus:bg-white focus:ring-4 focus:ring-[#7543E9]/10"
              value={filters.preparer_id ?? ""}
              onChange={(event) => updateFilter("preparer_id", event.target.value)}
              aria-label="Assignee"
            >
              <option value="">Assignee</option>
              {directory.active.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8A849C]">Client</label>
            <select
              className="input min-h-11 rounded-xl border border-[#E7E5EE] bg-[#FAFAFC] px-3.5 py-2.5 text-[13px] text-[#302A42] shadow-sm outline-none transition placeholder:text-[#A5A1B0] hover:border-[#CEC4E5] focus:border-[#9271D8] focus:bg-white focus:ring-4 focus:ring-[#7543E9]/10"
              value={filters.client_id ?? ""}
              onChange={(event) => updateFilter("client_id", event.target.value)}
              aria-label="Client"
            >
              <option value="">Client</option>
              {(clients.data?.items ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.legal_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8A849C]">Priority</label>
            <select
              className="input min-h-11 rounded-xl border border-[#E7E5EE] bg-[#FAFAFC] px-3.5 py-2.5 text-[13px] text-[#302A42] shadow-sm outline-none transition placeholder:text-[#A5A1B0] hover:border-[#CEC4E5] focus:border-[#9271D8] focus:bg-white focus:ring-4 focus:ring-[#7543E9]/10"
              value={filters.priority ?? ""}
              onChange={(event) => updateFilter("priority", event.target.value)}
              aria-label="Priority"
            >
              <option value="">Priority</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {hasFilters && (
          <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#EAE5F5] bg-[#F8F6FC] px-4 py-3 sm:mx-6">
            <p className="text-xs text-[#64748B]">
              Showing {tasks.data?.meta.total ?? 0} of {summary.data?.all_tasks ?? 0} open tasks
            </p>
            <button
              type="button"
              className="text-xs font-medium text-[#7543E9] hover:underline"
              onClick={() => {
                paging.clearFilters();
                setSelected(new Set());
              }}
            >
              Clear
            </button>
          </div>
        )}

        {view === "list" && (
          <>
            {tasks.isPending && <LoadingState label="Loading tasks…" />}
            {tasks.isError && (
              <ErrorState
                message={
                  tasks.error instanceof ApiError ? tasks.error.message : "Could not load tasks."
                }
              />
            )}
            {tasks.isSuccess && rows.length === 0 && (
              <EmptyState
                message={
                  hasFilters
                    ? "No task matches those filters."
                    : "Nothing in this tab. Try another, or generate this year's work."
                }
              />
            )}
            {rows.length > 0 && (
              <>
                <div className="mx-4 mb-4 overflow-x-auto rounded-2xl border border-[#E9E7F0] bg-white shadow-[0_6px_24px_rgba(31,24,60,.035)] sm:mx-6">
                  <table className="w-full min-w-[68rem]">
                    <thead className="bg-[#F7F5FB]">
                      <tr>
                        <th className="th w-8">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleAll}
                            aria-label="Select all tasks on this page"
                          />
                        </th>
                        <th className="th w-10">#</th>
                        <th className="th">Task Title</th>
                        <th className="th">Client</th>
                        <th className="th">Service</th>
                        <th className="th">Period</th>
                        <th className="th">Due Date</th>
                        <th className="th">Status</th>
                        <th className="th">Progress</th>
                        <th className="th">Assignee</th>
                        <th className="th">Priority</th>
                        <th className="th w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0EEF5]">
                      {rows.map((task, index) => (
                        <tr
                          key={task.id}
                          className={cn(
                            "cursor-pointer transition-colors hover:bg-[#FAF8FF]",
                            selected.has(task.id) && "bg-[#F1EAFF]",
                          )}
                          onClick={() => setOpenTaskId(task.id)}
                        >
                          <td className="td" onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected.has(task.id)}
                              onChange={() => toggleOne(task.id)}
                              aria-label={`Select ${task.title}`}
                            />
                          </td>
                          <td className="td tabular text-xs text-[#94A3B8]">
                            {offset + index + 1}
                          </td>
                          <td className="td">
                            <span className="font-medium text-[#171A3D]">{task.title}</span>
                            <span className="ml-2 font-mono text-[10px] text-[#94A3B8]">
                              {task.task_code}
                            </span>
                          </td>
                          <td className="td text-xs text-[#64748B]">{task.client_name ?? "—"}</td>
                          <td className="td">
                            {task.service_code ? (
                              <span className="rounded bg-[#F7F3FF] px-1.5 py-0.5 font-mono text-[10px] text-[#737A96]">
                                {task.service_code}
                              </span>
                            ) : (
                              <span className="text-xs text-[#94A3B8]">—</span>
                            )}
                          </td>
                          <td className="td tabular text-xs text-[#64748B]">
                            {periodLabel(task.period_key)}
                          </td>
                          <td className="td tabular text-xs">
                            {task.statutory_due_date ? (
                              <span className={cn(task.is_overdue && "font-medium text-[#DC2626]")}>
                                {formatDate(task.statutory_due_date)}
                              </span>
                            ) : (
                              <span className="text-[#94A3B8]">—</span>
                            )}
                          </td>
                          <td className="td" onClick={(event) => event.stopPropagation()}>
                            <InlineStatusControl task={task} />
                          </td>
                          <td className="td">
                            <ProgressBar percent={task.progress_percent} />
                          </td>
                          <td className="td">
                            <Avatar
                              name={
                                task.preparer_id
                                  ? (directory.byId.get(task.preparer_id)?.full_name ?? null)
                                  : null
                              }
                            />
                          </td>
                          <td className="td">
                            <PriorityDot priority={task.priority} />
                          </td>
                          <td className="td" onClick={(event) => event.stopPropagation()}>
                            <RowActionsMenu task={task} onOpen={() => setOpenTaskId(task.id)} />
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
          </>
        )}

        {view === "kanban" && (
          <div className="bg-[#FBFAFD] p-4 sm:p-6">
            {boardTasks.isPending && <LoadingState label="Loading board…" />}
            {boardTasks.isSuccess && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {BOARD.map((column) => {
                  const cards = (boardTasks.data?.items ?? []).filter(
                    (task) => task.status === column.status,
                  );
                  return (
                    <div key={column.status} className="rounded-2xl border border-[#E9E6F0] bg-[#F5F3F9] p-3.5">
                      <div className="mb-2 flex items-center justify-between px-1">
                        <span className="text-xs font-semibold text-[#171A32]">
                          {column.label}
                        </span>
                        <span className="tabular rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-[#64748B] border border-[#E2E8F0]">
                          {cards.length}
                        </span>
                      </div>
                      <ul className="space-y-2">
                        {cards.map((task) => (
                          <li key={task.id}>
                            <button
                              type="button"
                              onClick={() => setOpenTaskId(task.id)}
                              className="w-full rounded-xl border border-[#EAE7F0] bg-white p-4 text-left shadow-[0_3px_10px_rgba(40,35,90,.035)] transition-all hover:-translate-y-1 hover:border-[#CBBBF4] hover:shadow-[0_12px_24px_rgba(65,48,130,.10)]"
                            >
                              <p className="text-sm font-medium text-[#171A32]">{task.title}</p>
                              <p className="mt-0.5 truncate text-[10px] text-[#737A96]">
                                {task.client_name ?? "—"}
                              </p>
                              <div className="mt-1.5 flex items-center justify-between">
                                <span className="tabular text-[10px] text-[#64748B]">
                                  {periodLabel(task.period_key)}
                                </span>
                                <span
                                  className={cn(
                                    "tabular text-[10px]",
                                    task.is_overdue ? "font-medium text-[#DC2626]" : "text-[#64748B]",
                                  )}
                                >
                                  {task.statutory_due_date
                                    ? formatDate(task.statutory_due_date)
                                    : "—"}
                                </span>
                              </div>
                            </button>
                          </li>
                        ))}
                        {cards.length === 0 && (
                          <li className="px-1 py-2 text-[10px] text-[#94A3B8]">Nothing here.</li>
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-xs text-[#64748B]">
              Showing five workflow stages. Tasks in other states appear on the List tab.
            </p>
          </div>
        )}

        {view === "calendar" && (
          <div className="bg-[#FBFAFD] p-4 sm:p-6">
            {boardTasks.isPending && <LoadingState label="Loading calendar…" />}
            {boardTasks.isSuccess && (
              <CalendarView
                tasks={boardTasks.data?.items ?? []}
                onOpen={(id) => setOpenTaskId(id)}
              />
            )}
          </div>
        )}
      </div>

      <TaskDetailsPopup taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </div>
  );
}

/**
 * A month grid with each task on its due date.
 *
 * Deliberately the *current* month only, with no navigation: the list and the board are how
 * work is found, and a calendar that pages through months invites the belief that it is a
 * planning tool. What this answers is "what lands in the next few weeks", which is the
 * question a partner asks on a Monday.
 */
function CalendarView({
  tasks,
  onOpen,
}: {
  tasks: TaskListItem[];
  onOpen: (id: string) => void;
}) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first, which is how Indian practices read a week.
  const leading = (first.getDay() + 6) % 7;

  const byDay = useMemo(() => {
    const map = new Map<string, TaskListItem[]>();
    for (const task of tasks) {
      if (!task.statutory_due_date) continue;
      const [y, m, d] = task.statutory_due_date.split("-").map(Number);
      if (y !== year || m !== month + 1) continue;
      const key = String(d);
      map.set(key, [...(map.get(key) ?? []), task]);
    }
    return map;
  }, [tasks, year, month]);

  const todayKey = today.getDate();

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-[#171A32]">
        {MONTHS[month]} {year}
      </p>
      <div className="grid grid-cols-7 gap-2">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div key={day} className="px-1 py-1 text-center text-[10px] font-medium text-[#737A96]">
            {day}
          </div>
        ))}
        {Array.from({ length: leading }).map((_, index) => (
          <div key={`pad-${index}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1;
          const items = byDay.get(String(day)) ?? [];
          const isToday = day === todayKey;
          return (
            <div
              key={day}
              className={cn(
                "min-h-[5.5rem] rounded-xl border p-2 transition-colors",
                isToday ? "border-[#9271D8] bg-[#F3EEFF] shadow-sm" : "border-[#ECEAF1] bg-white hover:bg-[#FBFAFD]",
              )}
            >
              <span
                className={cn(
                  "tabular text-[10px]",
                  isToday ? "font-semibold text-[#7543E9]" : "text-[#94A3B8]",
                )}
              >
                {day}
              </span>
              <ul className="mt-0.5 space-y-0.5">
                {items.slice(0, 3).map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(task.id)}
                      title={`${task.title} — ${task.client_name ?? ""}`}
                      className={cn(
                        "w-full truncate rounded px-1 py-0.5 text-left text-[9px]",
                        task.is_overdue
                          ? "bg-[#FEE2E2] text-[#991A1A]"
                          : "bg-[#F1EAFF] text-[#7543E9]",
                      )}
                    >
                      {task.service_code ?? task.title}
                    </button>
                  </li>
                ))}
                {items.length > 3 && (
                  <li className="px-1 text-[9px] text-[#94A3B8]">+{items.length - 3} more</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
