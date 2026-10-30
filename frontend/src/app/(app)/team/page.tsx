"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  StatCard,
} from "@/components/ui";
import { Avatar, DonutChart, MiniBar } from "@/components/charts";
import { Icon } from "@/components/Icon";
import { EditTeamMemberModal } from "@/components/EditTeamMemberModal";
import { MemberDetailDrawer } from "@/components/MemberDetailDrawer";
import { CreateTeamMemberModal } from "@/components/CreateTeamMemberModal";
import { ApiError, api, buildQuery } from "@/lib/api";
import { cn, formatPercent, humanise } from "@/lib/format";
import { useDebouncedValue, usePaging } from "@/lib/hooks";
import { hasPermission, useSession } from "@/lib/session";
import { utilisationTone } from "@/lib/status";
import type {
  LeaveDay,
  Page,
  TeamSummary,
  UserListItem,
  UserStatus,
} from "@/lib/types";

/**
 * The tabs, as ranks.
 *
 * `designations` must match `_TAB_GROUPS` in `app/routers/users.py` — the counts come
 * from there, and a tab that counted one set while filtering by another would show a
 * number the table could not produce.
 */
const TABS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All Members" },
  { key: "partners", label: "Partners" },
  { key: "managers", label: "Managers" },
  { key: "seniors", label: "Seniors" },
  { key: "articles", label: "Articles" },
  { key: "assistants", label: "Assistants" },
];

/** Department colours, so a department keeps one colour across the donut and the list. */
const DEPARTMENT_TONES: Record<string, string> = {
  Taxation: "stroke-sky-500",
  Audit: "stroke-violet-500",
  Compliance: "stroke-emerald-500",
  Accounts: "stroke-amber-500",
  Management: "stroke-indigo-500",
};

const departmentStroke = (name: string, index: number) =>
  DEPARTMENT_TONES[name] ??
  ["stroke-slate-400", "stroke-rose-400", "stroke-cyan-400"][index % 3];

const STATUS_TONE: Record<UserStatus, "success" | "warning" | "danger" | "neutral"> = {
  active: "success",
  invited: "warning",
  suspended: "danger",
  disabled: "neutral",
};

/**
 * The bar colour for a utilisation figure.
 *
 * Over 100% is danger, not merely high: the person is carrying more than their capacity,
 * which is the one state this panel exists to make visible. The thresholds match
 * `utilisationTone` in `lib/status.ts` so the bar and any badge agree.
 */
function utilisationBarClass(percent: number): string {
  const tone = utilisationTone(percent);
  if (tone === "danger") return "bg-rose-500";
  if (tone === "warning") return "bg-amber-500";
  return "bg-emerald-500";
}

/** The four headline figures, using the shared tile so they match every other screen. */
function SummaryTiles({ summary }: { summary: TeamSummary | undefined }) {
  const tiles = [
    {
      icon: "team" as const,
      tone: "info" as const,
      label: "Total Members",
      value: String(summary?.total_members ?? 0),
      hint: `${summary?.joined_this_year ?? 0} joined this year`,
    },
    {
      icon: "user" as const,
      tone: "success" as const,
      label: "Active Members",
      value: String(summary?.active_members ?? 0),
      hint:
        (summary?.inactive_members ?? 0) > 0
          ? `${summary?.inactive_members} not active`
          : "Everyone is active",
    },
    {
      icon: "clock" as const,
      tone: "warning" as const,
      label: "Total Workload",
      value: String(summary?.total_open_tasks ?? 0),
      hint: `${summary?.total_overdue_tasks ?? 0} overdue`,
    },
    {
      icon: "reports" as const,
      tone: "danger" as const,
      label: "Average Utilisation",
      value: formatPercent(summary?.average_utilisation ?? 0),
      hint:
        (summary?.over_capacity ?? 0) > 0
          ? `${summary?.over_capacity} over capacity`
          : "Nobody over capacity",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <StatCard
          key={tile.label}
          icon={<Icon name={tile.icon} className="h-5 w-5" />}
          tone={tile.tone}
          label={tile.label}
          value={tile.value}
          hint={tile.hint}
        />
      ))}
    </div>
  );
}

/** One cell of the attendance calendar. */
function LeaveCell({ day }: { day: LeaveDay }) {
  if (!day.recorded) {
    return (
      <div
        className="rounded border border-dashed border-slate-200 py-1 text-center"
        title="Nobody has recorded this day"
      >
        <p className="tabular text-[10px] text-slate-300">{day.day}</p>
      </div>
    );
  }

  const tone =
    day.leave > 0
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : day.holiday > 0 && day.present === 0
        ? "border-slate-200 bg-slate-100 text-slate-500"
        : day.half_day > 0
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700";

  const total = day.present + day.leave + day.holiday + day.half_day;

  return (
    <div
      className={cn("rounded border py-1 text-center", tone)}
      title={`${day.present} present, ${day.leave} on leave, ${day.holiday} holiday, ${day.half_day} half day`}
    >
      <p className="tabular text-[10px] font-medium">{day.day}</p>
      <p className="tabular text-[10px] opacity-70">{total}</p>
    </div>
  );
}

export default function TeamPage() {
  const paging = usePaging(10);
  const { filters, updateFilter, offset, setOffset, limit, page } = paging;
  const search = useDebouncedValue(filters.search ?? "");

  const [tab, setTab] = useState("all");
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);
  const [menuMemberId, setMenuMemberId] = useState<string | null>(null);
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);

   const queryClient = useQueryClient();

   const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/users/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  // Close the action menu when clicking outside it.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDocumentClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuMemberId(null);
      }
    }
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, []);

  const scope = {
    search,
    department: filters.department,
    status: filters.status,
  };

  const summary = useQuery({
    queryKey: ["users", "summary", scope],
    queryFn: () =>
      api.get<TeamSummary>(
        `/users/summary${buildQuery({ search, department: filters.department, status: filters.status })}`,
      ),
  });

  const members = useQuery({
    queryKey: ["users", "list", { ...scope, tab, offset, limit }],
    queryFn: () =>
      api.get<Page<UserListItem>>(
        `/users${buildQuery({
          search,
          department: filters.department,
          status: filters.status,
          group: tab === "all" ? undefined : tab,
          include_inactive: true,
          limit,
          offset,
        })}`,
      ),
  });

  const rows = members.data?.items ?? [];
  const s = summary.data;
  const loadByUser = new Map((s?.workload ?? []).map((row) => [row.user_id, row]));

  function changeTab(key: string) {
    setTab(key);
    setOffset(0);
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const leave = s?.leave ?? null;
  const [activeDepartment, setActiveDepartment] = useState<string | null>(null);
  const session = useSession();
  const canViewRoles = hasPermission(session.data, "role.read");
  const canManagePerms = hasPermission(session.data, "user.permission.manage");
  const canAddMember = hasPermission(session.data, "user.write");
  const canDelete = canAddMember;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Team"
        subtitle="Manage your team, roles, workload and performance."
        action={
          <div className="flex items-center gap-2">
            {canManagePerms ? (
              <Link
                href="/team/permissions"
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700"
              >
                Per-User Permissions
              </Link>
            ) : null}
            {canViewRoles ? (
              <Link
                href="/team/roles"
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700"
              >
                Roles & Permissions
              </Link>
            ) : (
              <span
                className="text-xs font-medium text-slate-400"
                title="You do not have permission to view roles."
              >
                Roles & Permissions
              </span>
            )}
            {canAddMember ? (
              <button
                type="button"
                className="btn btn-primary px-5 py-2.5"
                onClick={() => setShowAddMember(true)}
              >
                <Icon name="plus" className="h-4 w-4" />
                Add Member
              </button>
            ) : (
              <span
                className="text-xs font-medium text-slate-400"
                title="You do not have permission to add team members."
              >
                Add Member
              </span>
            )}
          </div>
        }
      />

      <SummaryTiles summary={s} />

      {summary.isError && (
        <ErrorState
          message={
            summary.error instanceof ApiError
              ? summary.error.message
              : "Could not load the team figures."
          }
        />
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-3 pt-2">
          {TABS.map((entry) => {
            const isActive = entry.key === tab;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => changeTab(entry.key)}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "border-sky-600 text-sky-700"
                    : "border-transparent text-slate-500 hover:text-slate-800",
                )}
              >
                {entry.label}
                <span
                  className={cn(
                    "tabular ml-1.5 rounded px-1.5 py-0.5 text-[10px]",
                    isActive ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {s?.tab_counts[entry.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-slate-200 p-3 md:grid-cols-5">
          <label className="col-span-2 block">
            <input
              className="input py-1.5"
              type="search"
              value={filters.search ?? ""}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Search by name, code, email…"
              aria-label="Search team"
            />
          </label>
          <select
            className="input py-1.5"
            value={filters.department ?? ""}
            onChange={(event) => updateFilter("department", event.target.value)}
            aria-label="Department"
          >
            <option value="">Department</option>
            {(s?.departments ?? []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select
            className="input py-1.5"
            value={filters.status ?? ""}
            onChange={(event) => updateFilter("status", event.target.value)}
            aria-label="Status"
          >
            <option value="">Status</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="suspended">Suspended</option>
            <option value="disabled">Disabled</option>
          </select>
          <button
            type="button"
            className="btn-ghost py-1.5"
            disabled={!hasFilters}
            onClick={() => paging.clearFilters()}
          >
            Clear
          </button>
        </div>

        {members.isPending ? (
          <LoadingState label="Loading the team…" />
        ) : members.isError ? (
          <ErrorState
            message={
              members.error instanceof ApiError
                ? members.error.message
                : "Could not load the team."
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            message={
              hasFilters || tab !== "all"
                ? "No members match these filters. Try another tab or clear them."
                : "No staff records yet."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem]">
              <thead className="bg-[#f7f6f3]">
                <tr>
                  <th className="th w-8">
                    <input type="checkbox" aria-label="Select all members on this page" />
                  </th>
                  <th className="th w-10">#</th>
                  <th className="th">Name</th>
                  <th className="th">Role</th>
                  <th className="th">Department</th>
                  <th className="th text-right">Open Tasks</th>
                  <th className="th text-right">Overdue</th>
                  <th className="th">Utilisation</th>
                  <th className="th">Status</th>
                  <th className="th w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((person, index) => {
                  const load = loadByUser.get(person.id);
                  return (
                    <tr key={person.id} className="hover:bg-[#f7f6f3]">
                      <td className="td">
                        <input type="checkbox" aria-label={`Select ${person.full_name}`} />
                      </td>
                      <td className="td tabular text-xs text-slate-400">
                        {offset + index + 1}
                      </td>
                      <td className="td">
                        <button
                          type="button"
                          className="flex items-center gap-2 text-left"
                          onClick={() => setOpenMemberId(person.id)}
                        >
                          <Avatar name={person.full_name} size="sm" />
                          <span className="min-w-0">
                            <span className="block font-medium text-slate-900 underline-offset-2 hover:text-sky-700 hover:underline">
                              {person.full_name}
                            </span>
                            <span className="block text-[11px] text-slate-400">
                              {person.email}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="td text-xs text-slate-700">
                        {person.designation ?? <span className="text-slate-300">—</span>}
                        {person.is_partner && (
                          <span className="ml-1.5 align-middle">
                            <Badge tone="info">Partner</Badge>
                          </span>
                        )}
                      </td>
                      <td className="td text-xs text-slate-700">
                        {person.department ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="td tabular text-right text-slate-700">
                        {load?.open_tasks ?? 0}
                      </td>
                      <td className="td tabular text-right">
                        {(load?.overdue_tasks ?? 0) > 0 ? (
                          <span className="font-medium text-rose-700">
                            {load?.overdue_tasks}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="td">
                        {load ? (
                          <div className="flex items-center gap-2">
                            <MiniBar
                              percent={load.utilisation_percent}
                              className={utilisationBarClass(load.utilisation_percent)}
                              trackClassName="w-16"
                            />
                            <span className="tabular w-10 text-xs text-slate-600">
                              {formatPercent(load.utilisation_percent)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="td">
                        <Badge tone={STATUS_TONE[person.status]}>
                          {humanise(person.status)}
                        </Badge>
                      </td>
                      <td className="td text-right">
                        <div className="relative inline-block">
                          <button
                            type="button"
                            className="relative rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            onClick={() => setMenuMemberId(menuMemberId === person.id ? null : person.id)}
                            aria-label={`Actions for ${person.full_name}`}
                          >
                            ⋮
                          </button>
                          {menuMemberId === person.id && (
                            <div ref={menuRef} className="absolute right-0 z-20 mt-1 w-40 origin-top-right rounded-md border border-slate-200 bg-white shadow-lg">
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100"
                                onClick={() => {
                                  setMenuMemberId(null);
                                  setOpenMemberId(person.id);
                                }}
                              >
                                <Icon name="eye" className="h-4 w-4" />
                                Details
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100"
                                onClick={() => {
                                  setMenuMemberId(null);
                                  setEditMemberId(person.id);
                                }}
                                disabled={!canDelete}
                              >
                                <Icon name="pencil" className="h-4 w-4" />
                                Edit
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                                onClick={async () => {
                                  setMenuMemberId(null);
                                  const ok = confirm(`Deactivate ${person.full_name}?`);
                                  if (ok) {
                                    await removeMutation.mutateAsync(person.id);
                                  }
                                }}
                                disabled={!canDelete}
                              >
                                <Icon name="trash" className="h-4 w-4" />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          total={members.data?.meta.total ?? 0}
          limit={limit}
          offset={offset}
          page={page}
          hasMore={offset + rows.length < (members.data?.meta.total ?? 0)}
          onOffsetChange={setOffset}
        />
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          title="Team Workload"
          subtitle="Effort-weighted, not task counts"
          action={
            <Link
              href="/reports"
              className="text-xs font-medium text-sky-700 hover:underline"
            >
              View All
            </Link>
          }
        >
          {(s?.workload.length ?? 0) === 0 ? (
            <EmptyState message="Nobody is carrying open work yet." />
          ) : (
            <table className="w-full">
              <thead className="bg-[#f7f6f3]">
                <tr>
                  <th className="th">Name</th>
                  <th className="th text-right">Open</th>
                  <th className="th text-right">Overdue</th>
                  <th className="th">Utilisation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {s?.workload.slice(0, 8).map((row) => (
                  <tr key={row.user_id} className="hover:bg-[#f7f6f3]">
                    <td className="td">
                      <button
                        type="button"
                        className="flex items-center gap-2 text-left"
                        onClick={() => setOpenMemberId(row.user_id)}
                      >
                        <Avatar name={row.full_name} size="sm" />
                        <span className="text-xs font-medium text-slate-800">
                          {row.full_name.split(" ")[0]}
                        </span>
                      </button>
                    </td>
                    <td className="td tabular text-right text-xs text-slate-700">
                      {row.open_tasks}
                    </td>
                    <td className="td tabular text-right text-xs">
                      {row.overdue_tasks > 0 ? (
                        <span className="font-medium text-rose-700">
                          {row.overdue_tasks}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <MiniBar
                          percent={row.utilisation_percent}
                          className={utilisationBarClass(row.utilisation_percent)}
                          trackClassName="w-14"
                        />
                        <span className="tabular w-9 text-[11px] text-slate-600">
                          {Math.round(row.utilisation_percent)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Tasks by Department" subtitle="Open work, by practice area">
          {(s?.by_department.length ?? 0) === 0 ? (
            <EmptyState message="No open tasks are assigned to anyone with a department." />
          ) : (
            <div className="p-4">
              <DonutChart
                total={s?.total_open_tasks ?? 0}
                totalLabel="Open Tasks"
                size={170}
                activeKey={activeDepartment}
                onSegmentClick={setActiveDepartment}
                segments={(s?.by_department ?? []).map((row, index) => ({
                  key: row.department,
                  label: `${row.department} — ${row.open_tasks} (${Math.round(row.percent)}%)`,
                  value: row.open_tasks,
                  className: departmentStroke(row.department, index),
                }))}
              />
            </div>
          )}
        </Card>

        <Card
          title={leave ? `Leave & Attendance (${leave.label})` : "Leave & Attendance"}
          subtitle="Recorded days only"
        >
          {!leave ? (
            <EmptyState message="No attendance has been recorded." />
          ) : (
            <div className="p-3">
              <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-emerald-500" /> Present
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-rose-500" /> On Leave
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-slate-400" /> Holiday
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-amber-500" /> Half Day
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
                  <p
                    key={`${label}-${index}`}
                    className="text-center text-[10px] font-medium text-slate-400"
                  >
                    {label}
                  </p>
                ))}
                {/* Blank cells so the 1st lands under its weekday. */}
                {Array.from({
                  length: new Date(leave.year, leave.month - 1, 1).getDay(),
                }).map((_, index) => (
                  <span key={`pad-${index}`} />
                ))}
                {leave.days.map((day) => (
                  <LeaveCell key={day.day} day={day} />
                ))}
              </div>
              <p className="mt-3 text-[11px] text-slate-500">
                {leave.present} present · {leave.leave} on leave · {leave.holiday} holiday ·{" "}
                {leave.half_day} half day
              </p>
            </div>
          )}
        </Card>
      </div>

      {openMemberId && (
        <MemberDetailDrawer
          memberId={openMemberId}
          onClose={() => setOpenMemberId(null)}
        />
      )}

      {editMemberId && (
        <EditTeamMemberModal
          memberId={editMemberId}
          onClose={() => setEditMemberId(null)}
        />
      )}

      <CreateTeamMemberModal
        open={showAddMember}
        onClose={() => setShowAddMember(false)}
      />
    </div>
  );
}



