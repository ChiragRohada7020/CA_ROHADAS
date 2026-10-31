"use client";

import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Select,
} from "@/components/ui";
import { Avatar } from "@/components/charts";
import { Icon } from "@/components/Icon";
import { ApiError, api, buildQuery } from "@/lib/api";
import {
  addDays,
  formatDate,
  formatRelative,
  humanise,
  todayInIST,
} from "@/lib/format";
import { hasPermission, useSession } from "@/lib/session";
import type { UserListItem } from "@/lib/types";

type AttendanceKind = "present" | "leave" | "holiday" | "half_day";

const KIND_LABEL: Record<AttendanceKind, string> = {
  present: "Present",
  leave: "On Leave",
  holiday: "Holiday",
  half_day: "Half Day",
};

const KIND_TONE: Record<AttendanceKind, "success" | "danger" | "neutral" | "info"> = {
  present: "success",
  leave: "danger",
  holiday: "neutral",
  half_day: "info",
};

const KIND_COLOR: Record<AttendanceKind, string> = {
  present: "bg-emerald-500",
  leave: "bg-rose-500",
  holiday: "bg-slate-400",
  half_day: "bg-amber-500",
};

const KINDS: AttendanceKind[] = ["present", "leave", "holiday", "half_day"];

interface AttendanceRecord {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  on_date: string;
  kind: AttendanceKind;
  recorded_by: string | null;
  recorded_at: string | null;
}

interface MonthAttendance {
  user_id: string;
  full_name: string;
  email: string;
  records: Record<string, { kind: AttendanceKind; id: string }>; // on_date -> {kind, id}
}

export default function AttendancePage() {
  const session = useSession();
  const canManage = hasPermission(session.data, "user.write");
  const queryClient = useQueryClient();

  const [viewMonth, setViewMonth] = useState(todayInIST().slice(0, 7)); // YYYY-MM
  const [year, month] = viewMonth.split("-").map(Number);

  // Compute prev/next month strings (derived, not state — avoids re-render loops)
  const prevDate = new Date(year, month - 2, 1);
  const nextDate = new Date(year, month, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const dayCount = lastDay.getDate();
  const startWeekday = firstDay.getDay(); // 0 = Sunday

  const allUsers = useQuery({
    queryKey: ["users", "list"],
    queryFn: () =>
      api.get<{ items: UserListItem[]; meta: any }>(
        `/users?limit=500&include_inactive=false`,
      ),
    enabled: !!session.data,
  });

  const attendance = useQuery({
    queryKey: ["attendance", viewMonth],
    queryFn: () =>
      api.get<{ items: AttendanceRecord[]; total: number }>(
        `/attendance${buildQuery({ month: viewMonth })}`,
      ),
    enabled: !!session.data,
  });

  const records = (attendance.data?.items ?? []) as AttendanceRecord[];
  const users: UserListItem[] = allUsers.data?.items ?? [];

  // Build per-user month attendance map
  const monthAttendance = useMemo(() => {
    const map = new Map<string, MonthAttendance>();
    for (const u of users) {
      map.set(u.id, {
        user_id: u.id,
        full_name: u.full_name,
        email: u.email,
        records: {},
      });
    }
    for (const r of records) {
      const entry = map.get(r.user_id);
      if (entry) {
        entry.records[r.on_date] = { kind: r.kind, id: r.id };
      }
    }
    return map;
  }, [users, records]);

  const recordMutation = useMutation({
    mutationFn: async ({ userId, onDate, kind }: { userId: string; onDate: string; kind: AttendanceKind }) => {
      await api.post("/attendance", { user_id: userId, on_date: onDate, kind });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attendance", viewMonth] });
    },
  });

  const toggleAttendance = (userId: string, onDate: string, currentKind: AttendanceKind | undefined, recordId: string | undefined) => {
    if (!canManage) return;
    const nextKind: AttendanceKind | undefined =
      !currentKind ? "present"
        : currentKind === "present" ? "leave"
        : currentKind === "leave" ? "holiday"
        : currentKind === "holiday" ? "half_day"
        : undefined; // half_day -> unrecorded (delete)

    if (nextKind === undefined && recordId) {
      // Delete the record
      api.delete(`/attendance/${recordId}`).then(() => {
        void queryClient.invalidateQueries({ queryKey: ["attendance", viewMonth] });
      }).catch(() => {});
    } else if (nextKind) {
      recordMutation.mutate({ userId, onDate, kind: nextKind });
    }
  };

  const days = useMemo(() => {
    const d: number[] = [];
    // Pad with empty cells for days before the 1st
    for (let i = 0; i < startWeekday; i++) d.push(0);
    for (let i = 1; i <= dayCount; i++) d.push(i);
    return d;
  }, [year, month, dayCount, startWeekday]);

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  if (session.isError) {
    return <ErrorState message="Please log in to view attendance." />;
  }
  if (allUsers.isError || attendance.isError) {
    return <ErrorState message={allUsers.error?.message ?? attendance.error?.message ?? "Failed to load"} />;
  }
  if (allUsers.isPending || attendance.isPending) {
    return <LoadingState label="Loading attendance…" />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Attendance"
        subtitle="Record and view team attendance for the month."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMonth(prevMonth)}
              className="btn-ghost px-2 py-1 text-xs"
            >
              <Icon name="chevron-left" className="h-4 w-4" />
            </button>
            <span className="px-3 py-1 text-sm font-medium text-slate-700">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setViewMonth(nextMonth)}
              className="btn-ghost px-2 py-1 text-xs"
            >
              <Icon name="chevron-right" className="h-4 w-4" />
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => setViewMonth(todayInIST().slice(0, 7))}
                className="btn btn-xs text-[10px] px-2 py-1"
              >
                Today
              </button>
            )}
          </div>
        }
      />

      {!canManage && (
        <Card>
          <div className="p-4 text-center text-sm text-slate-500">
            You do not have permission to record attendance. Viewing only.
          </div>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="th w-48">Team Member</th>
                {[...Array(dayCount)].map((_, i) => {
                  const day = i + 1;
                  return (
                    <th key={day} className="th w-8 text-center" title={`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`}>
                      {day}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const att = monthAttendance.get(u.id);
                return (
                  <tr key={u.id} className="divide-y divide-slate-100 hover:bg-slate-50/50">
                    <td className="td px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={u.full_name} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{u.full_name}</p>
                          <p className="text-[11px] text-slate-500 truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    {days.map((day) => {
                      if (day === 0) {
                        return <td key="pad" className="w-8" />;
                      }
                      const onDate = new Date(year, month - 1, day).toISOString().slice(0, 10);
                      const cell = att?.records[onDate];
                      const kind = cell?.kind;
                      const recordId = cell?.id;
                      return (
                        <td
                          key={day}
                          className="td w-8 text-center p-1 cursor-pointer"
                          onClick={() => toggleAttendance(u.id, onDate, kind, recordId)}
                          title={
                            kind
                              ? `${KIND_LABEL[kind]} · ${formatDate(onDate)}`
                              : "Not recorded · Click to mark present"
                          }
                        >
                          {kind ? (
                            <span
                              className={`size-3.5 rounded-full ${KIND_COLOR[kind]}`}
                              title={KIND_LABEL[kind]}
                            />
                          ) : (
                            <span className="size-3.5 rounded-full border border-dashed border-slate-200" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <EmptyState message="No team members found." />
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {KINDS.map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`size-2 rounded-full ${KIND_COLOR[k]}`} />
              {KIND_LABEL[k]}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full border border-dashed border-slate-200" />
            Not recorded
          </span>
        </div>

        <p className="mt-2 text-[11px] text-slate-400">
          Click any cell to mark attendance. Requires team-management permission.
          {canManage ? " Changes save automatically." : ""}
        </p>
      </Card>

      {recordMutation.isPending && (
        <div className="fixed bottom-4 right-4 z-50">
          <LoadingState label="Saving attendance…" />
        </div>
      )}
    </div>
  );
}
