"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Select,
  StatCard,
} from "@/components/ui";
import { ApiError, api, buildQuery } from "@/lib/api";
import { addDays, formatDate, humanise, todayInIST } from "@/lib/format";
import { daysRemainingLabel, daysRemainingTone, priorityTone } from "@/lib/status";
import type { CalendarResponse } from "@/lib/types";

const WINDOWS = [
  { value: "7", label: "Next 7 days" },
  { value: "30", label: "Next 30 days" },
  { value: "90", label: "Next 90 days" },
  { value: "180", label: "Next 180 days" },
] as const;

export default function CalendarPage() {
  const today = todayInIST();
  const [windowDays, setWindowDays] = useState("30");
  const [onlyUnverified, setOnlyUnverified] = useState("");
  const [includeFiled, setIncludeFiled] = useState("");

  const fromDate = today;
  const toDate = addDays(today, Number(windowDays));

  const calendar = useQuery({
    queryKey: ["calendar", { fromDate, toDate, onlyUnverified, includeFiled }],
    queryFn: () =>
      api.get<CalendarResponse>(
        `/compliance/calendar${buildQuery({
          from_date: fromDate,
          to_date: toDate,
          only_unverified: onlyUnverified,
          include_filed: includeFiled,
          limit: 500,
        })}`,
      ),
  });

  const data = calendar.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Compliance calendar"
        subtitle={`Statutory dates from ${formatDate(fromDate)} to ${formatDate(toDate)}, reasoned in IST.`}
      />

      {/* Filters bar */}
      <Card className="p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Window"
            value={windowDays}
            onChange={setWindowDays}
            options={WINDOWS.map((option) => ({ ...option }))}
            placeholder="Next 30 days"
          />
          <Select
            label="Verification"
            value={onlyUnverified}
            onChange={setOnlyUnverified}
            options={[{ value: "true", label: "Unconfirmed dates only" }]}
            placeholder="All dates"
          />
          <Select
            label="Filed work"
            value={includeFiled}
            onChange={setIncludeFiled}
            options={[{ value: "true", label: "Include filed" }]}
            placeholder="Exclude filed"
          />
        </div>
      </Card>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          <StatCard label="Entries in window" value={data.total} />
          <StatCard
            label="Overdue"
            value={data.overdue_count}
            tone={data.overdue_count > 0 ? "danger" : "success"}
          />
          <StatCard
            label="Unconfirmed dates"
            value={data.unverified_count}
            tone={data.unverified_count > 0 ? "warning" : "success"}
            hint="No person has verified these"
          />
          <StatCard
            label="Filed"
            value={data.entries.filter((entry) => entry.is_filed).length}
            tone="success"
          />
        </div>
      )}

      {calendar.isPending && <LoadingState label="Loading calendar…" />}
      {calendar.isError && (
        <ErrorState
          message={
            calendar.error instanceof ApiError
              ? calendar.error.message
              : "Could not load the calendar."
          }
        />
      )}
      {calendar.isSuccess && data && data.entries.length === 0 && (
        <EmptyState message="Nothing falls in this window." />
      )}

      {calendar.isSuccess && data && data.entries.length > 0 && (
        <Card className="p-4 sm:p-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[58rem]">
              <thead className="bg-[#f7f6f3]">
                <tr>
                  <th className="th">Statutory date</th>
                  <th className="th">Timing</th>
                  <th className="th">Client</th>
                  <th className="th">Obligation</th>
                  <th className="th">Period</th>
                  <th className="th">Internal date</th>
                  <th className="th">Status</th>
                  <th className="th">Priority</th>
                  <th className="th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.entries.map((entry, index) => {
                  const isOverdue = entry.is_overdue;
                  return (
                    <tr
                      key={entry.task_id ?? entry.deadline_id ?? `${entry.client_id}-${index}`}
                      className={`hover:bg-[#f7f6f3] ${isOverdue ? "bg-rose-50" : ""}`}
                    >
                      <td className="td tabular text-xs font-medium text-slate-900">
                        {formatDate(entry.statutory_due_date)}
                      </td>
                      <td className="td">
                        <Badge tone={daysRemainingTone(entry.days_remaining)}>
                          {daysRemainingLabel(entry.days_remaining)}
                        </Badge>
                      </td>
                      <td className="td">
                        <span className="font-medium text-slate-900">{entry.client_name}</span>
                      </td>
                      <td className="td text-xs">
                        <div className="flex flex-col gap-1">
                          <span className="text-slate-900">{entry.rule_name ?? entry.filing_type ?? "—"}</span>
                          {entry.authority && (
                            <span className="text-slate-400 text-[10px]">{entry.authority}</span>
                          )}
                          {!entry.verified && <Badge tone="warning" className="text-[10px]">Date unconfirmed</Badge>}
                        </div>
                      </td>
                      <td className="td tabular text-xs">{entry.period_key ?? "—"}</td>
                      <td className="td tabular text-xs">
                        {entry.internal_due_date ? formatDate(entry.internal_due_date) : "—"}
                      </td>
                      <td className="td">
                        <div className="flex flex-col gap-1">
                          <Badge tone={entry.is_filed ? "success" : "progress"}>
                            {entry.is_filed ? "Filed" : humanise(entry.status)}
                          </Badge>
                          {entry.task_id && (
                            <Link
                              href={`/tasks/${entry.task_id}`}
                              className="text-xs text-slate-500 underline-offset-2 hover:underline"
                            >
                              Open task
                            </Link>
                          )}
                          {!entry.task_id && (
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={(e) => {
                                e.preventDefault();
                                const url = `/tasks/new?client_id=${entry.client_id}&title=${encodeURIComponent(
                                  `Compliance: ${entry.rule_name ?? entry.filing_type ?? ""} — ${entry.client_name}`
                                )}&period_key=${encodeURIComponent(entry.period_key ?? "")}&statutory_due_date=${entry.statutory_due_date}`;
                                window.location.href = url;
                              }}
                            >
                              Create task
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="td">
                        <Badge tone={priorityTone(entry.priority)}>{entry.priority}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
