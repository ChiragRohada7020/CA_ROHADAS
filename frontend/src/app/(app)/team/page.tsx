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
  Pagination,
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
  Taxation: "stroke-blue-500",
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
    { icon: "team" as const, label: "Total members", value: String(summary?.total_members ?? 0), hint: `${summary?.joined_this_year ?? 0} joined this year`, tint: "bg-[#F1ECFF] text-[#6D3AE8]", line: "bg-[#8D6BEE]" },
    { icon: "user" as const, label: "Active members", value: String(summary?.active_members ?? 0), hint: (summary?.inactive_members ?? 0) > 0 ? `${summary?.inactive_members} not active` : "Everyone is active", tint: "bg-[#E9F8F1] text-[#15966A]", line: "bg-[#48C69A]" },
    { icon: "clock" as const, label: "Open workload", value: String(summary?.total_open_tasks ?? 0), hint: `${summary?.total_overdue_tasks ?? 0} overdue tasks`, tint: "bg-[#FFF4E8] text-[#D98226]", line: "bg-[#F0B15E]" },
    { icon: "reports" as const, label: "Average utilisation", value: formatPercent(summary?.average_utilisation ?? 0), hint: (summary?.over_capacity ?? 0) > 0 ? `${summary?.over_capacity} over capacity` : "Within team capacity", tint: "bg-[#EEF3FF] text-[#5276D9]", line: "bg-[#83A0F4]" },
  ];
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">{tiles.map((tile) => <div key={tile.label} className="group relative overflow-hidden rounded-2xl border border-[#E7E6F1] bg-white p-4 shadow-[0_3px_14px_rgba(40,42,90,.045)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(40,42,90,.09)]"><div className="flex items-start justify-between"><span className={`grid h-10 w-10 place-items-center rounded-xl ${tile.tint}`}><Icon name={tile.icon} className="h-[19px] w-[19px]" /></span><span className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#A0A4B8]">Team</span></div><p className="mt-4 text-[12px] font-medium text-[#747B98]">{tile.label}</p><div className="mt-1 flex items-end justify-between gap-2"><p className="text-[27px] font-bold leading-none tracking-[-.04em] text-[#171A32]">{tile.value}</p><span className="mb-0.5 text-[10px] text-[#858BA4]">{tile.hint}</span></div><div className="absolute inset-x-0 bottom-0 h-[3px] bg-[#F5F4FA]"><div className={`h-full w-1/3 rounded-r-full ${tile.line}`} /></div></div>)}</div>;
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
      <section className="relative overflow-hidden rounded-[22px] border border-[#E5DDFB] bg-[radial-gradient(ellipse_at_90%_0%,rgba(157,126,245,.20),transparent_38%),linear-gradient(110deg,#FFFFFF_0%,#FBFAFF_55%,#F3EEFF_100%)] px-5 py-5 shadow-[0_5px_22px_rgba(75,55,140,.055)] md:px-6 md:py-6">
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#7954D7]"><span className="h-1.5 w-1.5 rounded-full bg-[#7954D7]" /> People & operations</div>
            <h1 className="text-[26px] font-bold tracking-[-.04em] text-[#171A32] md:text-[30px]">Team management</h1>
            <p className="mt-1.5 max-w-xl text-[12px] leading-5 text-[#747B98]">Manage people, responsibilities and capacity across your practice from one workspace.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManagePerms && <Link href="/team/permissions" className="inline-flex items-center gap-2 rounded-xl border border-[#E3E2F2] bg-white px-3.5 py-2.5 text-[11px] font-semibold text-[#454765] shadow-sm transition hover:border-[#C9B9FA] hover:bg-[#F8F5FF]"><Icon name="shield-check" className="h-4 w-4 text-[#6D3AE8]" /> Per-user permissions</Link>}
            {canViewRoles ? <Link href="/team/roles" className="inline-flex items-center gap-2 rounded-xl border border-[#E3E2F2] bg-white px-3.5 py-2.5 text-[11px] font-semibold text-[#454765] shadow-sm transition hover:border-[#C9B9FA] hover:bg-[#F8F5FF]"><Icon name="settings" className="h-4 w-4 text-[#6D3AE8]" /> Roles & permissions</Link> : <span className="text-xs text-slate-400" title="You do not have permission to view roles.">Roles & permissions</span>}
            {canAddMember && <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#7040E8] to-[#8058EC] px-4 py-2.5 text-[11px] font-bold text-white shadow-[0_7px_16px_rgba(109,58,232,.24)] transition hover:-translate-y-0.5 hover:shadow-lg" onClick={() => setShowAddMember(true)}><Icon name="plus" className="h-4 w-4" /> Add team member</button>}
          </div>
        </div>
      </section>
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

      <section className="overflow-hidden rounded-[20px] border border-[#E5E5F0] bg-white shadow-[0_4px_18px_rgba(40,42,90,.045)]">
        <div className="flex flex-wrap items-center gap-1 border-b border-[#EEEFF6] bg-[#FCFBFE] px-4 pt-3">
          {TABS.map((entry) => {
            const isActive = entry.key === tab;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => changeTab(entry.key)}
                className={cn(
                  "-mb-px rounded-t-lg border-b-2 px-3.5 py-3 text-[11px] font-semibold transition-colors",
                  isActive
                    ? "border-[#6D3AE8] text-[#6D3AE8]"
                    : "border-transparent text-slate-500 hover:text-slate-800",
                )}
              >
                {entry.label}
                <span
                  className={cn(
                    "tabular ml-1.5 rounded-md px-1.5 py-0.5 text-[10px]",
                    isActive ? "bg-[#F1ECFF] text-[#6D3AE8]" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {s?.tab_counts[entry.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-2.5 border-b border-[#EEEFF6] bg-white p-4 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1.6fr)_1fr_1fr_auto]">
          <label className="col-span-2 block">
            <input
              className="input rounded-xl border-[#E5E5F0] bg-[#FCFBFE] py-2.5 text-xs focus:border-[#A88AF3] focus:ring-2 focus:ring-[#F1ECFF]"
              type="search"
              value={filters.search ?? ""}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Search by name, code, email…"
              aria-label="Search team"
            />
          </label>
          <select
            className="input rounded-xl border-[#E5E5F0] bg-[#FCFBFE] py-2.5 text-xs focus:border-[#A88AF3] focus:ring-2 focus:ring-[#F1ECFF]"
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
            className="input rounded-xl border-[#E5E5F0] bg-[#FCFBFE] py-2.5 text-xs focus:border-[#A88AF3] focus:ring-2 focus:ring-[#F1ECFF]"
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
            className="rounded-xl border border-[#E5E5F0] px-4 py-2 text-xs font-semibold text-[#6D3AE8] transition hover:bg-[#F8F5FF]"
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
            <table className="w-full min-w-[68rem]">
              <thead className="bg-[#F8F7FC]">
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
              <tbody className="divide-y divide-[#EEEFF6]">
                {rows.map((person, index) => {
                  const load = loadByUser.get(person.id);
                  return (
                    <tr key={person.id} className="hover:bg-[#F8F7FC]">
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
                            <span className="block font-medium text-slate-900 underline-offset-2 hover:text-[#6D3AE8] hover:underline">
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
                      <td className="td text-right overflow-visible">
                        <div className="flex items-center gap-1">
                          {canAddMember && (
                            <button
                              type="button"
                              onClick={() => setEditMemberId(person.id)}
                              className="rounded-lg border border-[#E8E2FA] bg-white px-2.5 py-1.5 text-xs text-[#6D3AE8] transition hover:bg-[#F5F0FF] disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={!canAddMember}
                              title="Edit member"
                            >
                              <Icon name="pencil" className="h-3 w-3" />
                            </button>
                          )}
                          <div className="relative inline-block">
                            <button
                              type="button"
                              className="relative rounded-lg p-1.5 text-slate-400 transition hover:bg-[#F1ECFF] hover:text-[#6D3AE8]"
                              onClick={() => setMenuMemberId(menuMemberId === person.id ? null : person.id)}
                              aria-label={`Actions for ${person.full_name}`}
                            >
                              ⋮
                            </button>
                            {menuMemberId === person.id && (
                              <div ref={menuRef} className="absolute right-0 z-50 mt-1 w-48 origin-top-right rounded-md border border-slate-200 bg-white shadow-lg overflow-visible">
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
                                {canDelete ? (
                                  <>
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100"
                                      onClick={() => {
                                        setMenuMemberId(null);
                                        setEditMemberId(person.id);
                                      }}
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
                                    >
                                      <Icon name="trash" className="h-4 w-4" />
                                      Delete
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-400"
                                    disabled
                                  >
                                    <Icon name="pencil" className="h-4 w-4" />
                                    Edit
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
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
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          title="Team Workload"
          subtitle="Effort-weighted, not task counts"
          action={
            <Link
              href="/reports"
              className="text-xs font-medium text-[#6D3AE8] hover:underline"
            >
              View All
            </Link>
          }
        >
          {(s?.workload.length ?? 0) === 0 ? (
            <EmptyState message="Nobody is carrying open work yet." />
          ) : (
            <table className="w-full">
              <thead className="bg-[#F8F7FC]">
                <tr>
                  <th className="th">Name</th>
                  <th className="th text-right">Open</th>
                  <th className="th text-right">Overdue</th>
                  <th className="th">Utilisation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEFF6]">
                {s?.workload.slice(0, 8).map((row) => (
                  <tr key={row.user_id} className="hover:bg-[#F8F7FC]">
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



