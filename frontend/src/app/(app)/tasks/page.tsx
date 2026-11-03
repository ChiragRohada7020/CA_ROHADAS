"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Filter,
  Plus,
  Clock,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  User,
  FileText,
  MoreHorizontal,
  ChevronDown,
  Eye,
  Send,
  Trash2,
  ArrowRight,
  LayoutList,
  LayoutGrid,
  Calendar as CalendarIcon,
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toaster,
  Pagination,
} from "@/components/ui";
import { ApiError, api, buildQuery } from "@/lib/api";
import { cn, formatDate, humanise } from "@/lib/format";
import { useDebouncedValue, usePaging } from "@/lib/hooks";
import { useSession, usePermissions } from "@/lib/session";
import {
  badgeClasses,
  sortStatuses,
  statusDotClass,
  statusRequiresReason,
  taskStatusLabel,
  taskStatusTone,
  TASK_STATUS_ORDER,
} from "@/lib/status";
import { initials, useUserDirectory } from "@/lib/users";
import type { Page, ServiceRow, TaskListItem, TaskStatus, TaskSummary } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/PageContainer";

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

const SUMMARY_META: Record<string, { icon: React.ElementType; color: string }> = {
  all: { icon: FileText, color: "bg-blue-50 text-blue-600 border-blue-100" },
  mine: { icon: User, color: "bg-violet-50 text-violet-600 border-violet-100" },
  review: { icon: ShieldCheck, color: "bg-amber-50 text-amber-600 border-amber-100" },
  approval: { icon: ShieldCheck, color: "bg-indigo-50 text-indigo-600 border-indigo-100" },
  "my-blocked": { icon: AlertTriangle, color: "bg-rose-50 text-rose-600 border-rose-100" },
  overdue: { icon: AlertTriangle, color: "bg-rose-50 text-rose-600 border-rose-100" },
  week: { icon: Calendar, color: "bg-blue-50 text-blue-600 border-blue-100" },
  completed: { icon: CheckCircle, color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
  waiting: { icon: Clock, color: "bg-indigo-50 text-indigo-600 border-indigo-100" },
};

function isoPlusDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

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

const BOARD: Array<{ status: string; label: string }> = [
  { status: "waiting_for_client", label: "Waiting on Client" },
  { status: "not_started", label: "Not Started" },
  { status: "in_progress", label: "In Preparation" },
  { status: "ready_for_review", label: "Awaiting Review" },
  { status: "ready_to_file", label: "Ready to File" },
];

function periodLabel(periodKey: string | null): string {
  if (!periodKey) return "—";
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) return periodKey;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return periodKey;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MONTHS[month - 1]} ${match[1]}`;
}

function PriorityDot({ priority }: { priority: string }) {
  const colour: Record<string, string> = {
    low: "bg-hsl(var(--muted-foreground))/30",
    normal: "bg-blue-500",
    high: "bg-amber-500",
    urgent: "bg-rose-500",
  };
  return (
    <span className={cn("flex items-center gap-1.5")}>
      <span className={cn("size-1.5 rounded-full", colour[priority] ?? "bg-hsl(var(--muted-foreground))/30")} />
      <span className="text-xs capitalize text-muted-foreground">{priority}</span>
    </span>
  );
}

function UserChip({ name }: { name: string | null }) {
  if (!name) return <span className="text-xs text-muted-foreground">Unassigned</span>;
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase();
  return (
    <span className="flex items-center gap-1.5" title={name}>
      <span className="flex size-6 items-center justify-center rounded-full bg-muted/40 text-[10px] font-semibold text-muted-foreground">
        {initials}
      </span>
      <span className="hidden text-xs text-muted-foreground lg:inline">{name.split(" ")[0]}</span>
    </span>
  );
}

function StatusControl({ task }: { task: TaskListItem }) {
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

  if (pendingTarget && statusRequiresReason(pendingTarget)) {
    return (
      <div ref={containerRef} className="flex flex-col gap-2 p-3 rounded-xl border border-border/30 bg-muted/30">
        <textarea
          className="input w-full py-1.5 text-xs"
          value={pendingReason}
          onChange={(e) => setPendingReason(e.target.value)}
          placeholder="Reason required…"
          rows={2}
          autoFocus
        />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!pendingReason.trim() || mutation.isPending}
            onClick={() => {
              if (!pendingReason.trim()) return;
              mutation.mutate({ status: pendingTarget, reason: pendingReason.trim() });
            }}
          >
            {mutation.isPending ? "…" : "Go"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPendingTarget(null)}
          >
            Cancel
          </Button>
        </div>
        {mutation.isError && (
          <p className="text-[10px] text-destructive">
            {mutation.error instanceof ApiError ? mutation.error.message : "Transition failed."}
          </p>
        )}
      </div>
    );
  }

  if (!hasAnyTransition) {
    return (
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium",
          statusClasses,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={cn("size-1.5 rounded-full", dotClass)} />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium outline-none transition-colors",
          statusClasses,
        )}
        onClick={(e) => {
          e.stopPropagation();
          setDropdownOpen(!dropdownOpen);
        }}
      >
        <span className={cn("size-1.5 rounded-full", dotClass)} />
        <span>{label}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      {dropdownOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-xl border border-border bg-popover shadow-lg p-1">
          {visibleStatuses.map((s) => {
            const needsReason = statusRequiresReason(s);
            return (
              <button
                key={s}
                type="button"
                className={cn(
                  "flex w-full cursor-pointer select-none items-center rounded-lg px-3 py-2 text-left text-xs outline-none transition-colors",
                  mutation.isPending ? "cursor-not-allowed opacity-50" : "hover:bg-accent",
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
                <span className={cn("size-1.5 rounded-full mr-2", statusDotClass(s))} />
                {taskStatusLabel(s)}
              </button>
            );
          })}
        </div>
      )}
      {mutation.isError && (
        <p className="absolute top-full left-0 mt-1 text-[10px] text-destructive whitespace-nowrap">
          {mutation.error instanceof ApiError ? mutation.error.message : "Transition failed."}
        </p>
      )}
    </div>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  const color =
    percent >= 100 ? "bg-emerald-500" :
    percent >= 70 ? "bg-blue-500" :
    percent >= 30 ? "bg-amber-500" :
    percent > 0 ? "bg-rose-400" :
    "bg-hsl(var(--muted-foreground))/20";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 min-w-[3rem] rounded overflow-hidden bg-muted/20">
        <div
          className={cn("h-full rounded-full transition-all duration-300", color)}
          style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
        />
      </div>
      <span className="tabular text-[10px] text-muted-foreground">{Math.round(percent)}%</span>
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
        className="p-1.5 text-muted-foreground hover:bg-muted/30 hover:text-foreground rounded-md transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        aria-label="More actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-border bg-popover shadow-lg p-1">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted/50 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onOpen();
            }}
          >
            <Eye className="h-3 w-3 mr-2" />
            Open task
          </button>
          <Link
            href={`/tasks/${task.id}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-muted/50 transition-colors"
          >
            <Send className="h-3 w-3 mr-2" />
            Email task link
          </Link>
          {canDelete && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-destructive hover:bg-rose-50 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                void handleDelete();
              }}
            >
              <Trash2 className="h-3 w-3 mr-2" />
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

  const isAdminOrOwner = session.data?.scope === "firm";
  const [tab, setTab] = useState(isAdminOrOwner ? "all" : "mine");
  const [view, setView] = useState<"list" | "kanban">("list");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const tabQuery = tabParams(tab);

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
    queryFn: () => api.get<Page<TaskListItem>>("/clients?limit=200"),
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
    <div className="space-y-6 min-h-full">
      <Toaster />

      <PageHeader
        title="Tasks"
        subtitle="Track and manage all compliance and client work."
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-0.5">
              {(["list", "kanban"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  className={cn(
                    "cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    view === key
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
                  )}
                  aria-pressed={view === key}
                >
                  {key === "list" ? <LayoutList className="h-3.5 w-3.5 mr-1.5" /> : <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />}
                  {key === "list" ? "List" : "Kanban"}
                </button>
              ))}
            </div>
            <Link href="/tasks/generate" className="text-sm text-hsl(var(--primary)) hover:underline font-medium">
              Generate work
            </Link>
            <Button onClick={() => setCreating(true)} className="px-5 py-2.5">
              <Plus className="h-4 w-4 mr-2" />
              New task
            </Button>
          </div>
        }
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Tasks" }]}
      />

      <Card>
        <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {TABS.map((entry) => {
            const isActive = entry.key === tab;
            const meta = SUMMARY_META[entry.key];
            const Icon = meta.icon;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => changeTab(entry.key)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  isActive
                    ? "border-hsl(var(--primary)) bg-primary/10 shadow-sm"
                    : "border-border/50 bg-card hover:border-border hover:bg-muted/30",
                )}
              >
                <div className={cn("flex size-7 items-center justify-center rounded-lg", meta.color)}>
                  <Icon className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs text-muted-foreground truncate">{entry.label}</span>
                  <span className="tabular text-sm font-bold text-foreground">
                    {summary.data?.[entry.countKey] ?? 0}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-border p-3 md:grid-cols-3 lg:grid-cols-5">
          <label className="col-span-2 block md:col-span-1">
            <Input
              type="search"
              value={filters.search ?? ""}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateFilter("search", event.target.value)}
              placeholder="Search tasks by title, code…"
              aria-label="Search tasks"
              className="input"
            />
          </label>
          <Select
            value={filters.status ?? ""}
            onValueChange={(value) => updateFilter("status", value)}
          >
            <SelectTrigger className="input w-full">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Status</SelectItem>
              <SelectItem value="not_started">Not Started</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="waiting_for_client">Waiting for Client</SelectItem>
              <SelectItem value="ready_for_review">Ready for Review</SelectItem>
              <SelectItem value="changes_requested">Changes Requested</SelectItem>
              <SelectItem value="ready_for_approval">Awaiting Approval</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="ready_to_file">Ready to File</SelectItem>
              <SelectItem value="filed">Filed</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.service_id ?? ""}
            onValueChange={(value) => updateFilter("service_id", value)}
          >
            <SelectTrigger className="input w-full">
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Services</SelectItem>
              {(services.data?.items ?? []).map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.preparer_id ?? ""}
            onValueChange={(value) => updateFilter("preparer_id", value)}
          >
            <SelectTrigger className="input w-full">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Assignees</SelectItem>
              {directory.active.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.client_id ?? ""}
            onValueChange={(value) => updateFilter("client_id", value)}
          >
            <SelectTrigger className="input w-full">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Clients</SelectItem>
              {(clients.data?.items ?? []).map((row: any) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.legal_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.priority ?? ""}
            onValueChange={(value) => updateFilter("priority", value)}
          >
            <SelectTrigger className="input w-full">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Priorities</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {hasFilters && (
          <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Showing {tasks.data?.meta.total ?? 0} of {summary.data?.all_tasks ?? 0} open tasks
            </p>
            <button
              type="button"
              className="text-xs font-medium text-hsl(var(--primary)) hover:underline"
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
            {tasks.isPending ? (
              <div className="p-8 text-center">
                <div className="h-4 w-24 bg-muted rounded animate-pulse mx-auto mb-2" />
                <div className="h-4 w-16 bg-muted rounded animate-pulse mx-auto" />
              </div>
            ) : tasks.isError ? (
              <div className="p-8 text-center text-destructive">
                Could not load tasks.
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                title={hasFilters ? "No matching tasks" : "No tasks in this tab"}
                description={
                  hasFilters
                    ? "Try adjusting your filters."
                    : "Nothing in this tab. Try another, or generate this year's work."
                }
                action={<Link href="/tasks/generate"><Button>Generate Work</Button></Link>}
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table className="min-w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleAll}
                            aria-label="Select all tasks"
                          />
                        </TableHead>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Task Title</TableHead>
                        <TableHead className="hidden sm:table-cell">Client</TableHead>
                        <TableHead className="hidden md:table-cell">Service</TableHead>
                        <TableHead className="hidden lg:table-cell">Period</TableHead>
                        <TableHead className="hidden xl:table-cell">Due Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden lg:table-cell">Progress</TableHead>
                        <TableHead className="hidden xl:table-cell">Assignee</TableHead>
                        <TableHead className="hidden xl:table-cell">Priority</TableHead>
                        <TableHead className="w-16 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((task, index) => (
                        <TableRow
                          key={task.id}
                          className={cn(
                            "cursor-pointer transition-colors hover:bg-muted/30",
                            selected.has(task.id) && "bg-blue-50/60",
                          )}
                          onClick={() => setOpenTaskId(task.id)}
                        >
                          <TableCell className="w-8" onClick={(event: React.MouseEvent) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected.has(task.id)}
                              onChange={() => toggleOne(task.id)}
                              aria-label={`Select ${task.title}`}
                            />
                          </TableCell>
                          <TableCell className="w-10 tabular text-xs text-muted-foreground">
                            {offset + index + 1}
                          </TableCell>
                          <TableCell className="min-w-[160px]">
                            <span className="font-medium text-foreground">{task.title}</span>
                            <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                              {task.task_code}
                            </span>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                            {task.client_name ?? "—"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {task.service_code ? (
                              <span className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border border-border/30">
                                {task.service_code}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell tabular text-xs text-muted-foreground">
                            {periodLabel(task.period_key)}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell tabular text-xs">
                            {task.statutory_due_date ? (
                              <span className={cn(task.is_overdue && "font-medium text-destructive")}>
                                {formatDate(task.statutory_due_date)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell" onClick={(event: React.MouseEvent) => event.stopPropagation()}>
                            <StatusControl task={task} />
                          </TableCell>
                          <TableCell className="hidden xl:table-cell">
                            <ProgressBar percent={task.progress_percent} />
                          </TableCell>
                          <TableCell className="hidden xl:table-cell">
                            <UserChip
                              name={
                                task.preparer_id
                                  ? (directory.byId.get(task.preparer_id)?.full_name ?? null)
                                  : null
                              }
                            />
                          </TableCell>
                          <TableCell className="hidden xl:table-cell">
                            <PriorityDot priority={task.priority} />
                          </TableCell>
                          <TableCell className="w-16 text-right" onClick={(event: React.MouseEvent) => event.stopPropagation()}>
                            <RowActionsMenu task={task} onOpen={() => setOpenTaskId(task.id)} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
          <div className="p-3">
            {boardTasks.isPending ? (
              <div className="p-8 text-center">
                <div className="h-4 w-24 bg-muted rounded animate-pulse mx-auto mb-2" />
              </div>
            ) : boardTasks.isSuccess && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
                {BOARD.map((column) => {
                  const cards = (boardTasks.data?.items ?? []).filter(
                    (task) => task.status === column.status,
                  );
                  return (
                    <div key={column.status} className="rounded-xl bg-muted/30 p-2">
                      <div className="mb-2 flex items-center justify-between px-1">
                        <span className="text-xs font-semibold text-foreground">
                          {column.label}
                        </span>
                        <span className="tabular rounded bg-card px-2 py-0.5 text-[10px] text-muted-foreground border border-border/30">
                          {cards.length}
                        </span>
                      </div>
                      <ul className="space-y-2">
                        {cards.map((task) => (
                          <li key={task.id}>
                            <button
                              type="button"
                              onClick={() => setOpenTaskId(task.id)}
                              className="w-full rounded-lg border border-border/50 bg-card p-3 text-left hover:border-primary/50 hover:shadow-sm transition-all"
                            >
                              <p className="text-xs font-medium text-foreground">{task.title}</p>
                              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                                {task.client_name ?? "—"}
                              </p>
                              <div className="mt-1.5 flex items-center justify-between">
                                <span className="tabular text-[10px] text-muted-foreground">
                                  {periodLabel(task.period_key)}
                                </span>
                                <span
                                  className={cn(
                                    "tabular text-[10px]",
                                    task.is_overdue ? "font-medium text-destructive" : "text-muted-foreground",
                                  )}
                                >
                                  {task.statutory_due_date ? formatDate(task.statutory_due_date) : "—"}
                                </span>
                              </div>
                            </button>
                          </li>
                        ))}
                        {cards.length === 0 && (
                          <li className="px-1 py-2 text-[10px] text-muted-foreground">Nothing here.</li>
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Showing five workflow stages. Tasks in other states appear on the List tab.
            </p>
          </div>
        )}
      </Card>

      {openTaskId && (
        <Dialog open onOpenChange={open => !open && setOpenTaskId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Task Details</DialogTitle>
              <DialogDescription>View and manage task details.</DialogDescription>
            </DialogHeader>
            <div className="p-6">
              <p className="text-sm text-muted-foreground">
                Task {openTaskId} - use the task detail page for full management.
              </p>
              <Button asChild onClick={() => setOpenTaskId(null)}>
                <Link href={`/tasks/${openTaskId}`}>Open Task</Link>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {creating && (
        <Dialog open onOpenChange={open => !open && setCreating(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Task</DialogTitle>
              <DialogDescription>Create a new task for a client.</DialogDescription>
            </DialogHeader>
            <div className="p-6">
              <p className="text-sm text-muted-foreground">
                Use the new task page to create a task.
              </p>
              <Button asChild onClick={() => setCreating(false)}>
                <Link href="/tasks/new">Create Task</Link>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
