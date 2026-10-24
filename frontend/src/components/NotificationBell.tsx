"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { cn, formatRelative } from "@/lib/format";
import type { NotificationRow, Page, UnreadCount } from "@/lib/types";

const UNREAD_KEY = ["notifications", "unread"] as const;
const LIST_KEY = ["notifications", "list"] as const;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const unread = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: () => api.get<UnreadCount>("/notifications/unread-count"),
    // A deadline alert is worth noticing within the hour, not within the day. The
    // count is a single indexed count, so polling it is cheap.
    refetchInterval: 60_000,
  });

  const list = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => api.get<Page<NotificationRow>>("/notifications?limit=20"),
    // Only fetch the contents once the panel is actually open.
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });

  // Close on an outside click or Escape, so the panel does not trap the user.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const count = unread.data?.unread ?? 0;
  const items = list.data?.items ?? [];

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-md border border-slate-300 bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-50"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.85 23.85 0 0 0 5.454-1.31A8.97 8.97 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.97 8.97 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.26 24.26 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>
        {count > 0 && (
          <span className="tabular absolute -right-1.5 -top-1.5 min-w-[1.25rem] rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {count > 0 && (
              <button
                type="button"
                className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
                disabled={markAllRead.isPending}
                onClick={() => markAllRead.mutate()}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {list.isPending && (
              <p className="px-3 py-6 text-center text-sm text-slate-500">Loading…</p>
            )}
            {list.isError && (
              <p className="px-3 py-6 text-center text-sm text-rose-600">
                Could not load notifications.
              </p>
            )}
            {list.isSuccess && items.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-slate-500">
                Nothing needs your attention.
              </p>
            )}

            <ul className="divide-y divide-slate-100">
              {items.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={cn(
                      "block w-full px-3 py-3 text-left hover:bg-slate-50",
                      !row.is_read && "bg-sky-50/60",
                    )}
                    onClick={() => {
                      if (!row.is_read) markRead.mutate(row.id);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          row.is_read ? "bg-transparent" : "bg-sky-500",
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">{row.title}</p>
                        <p className="mt-0.5 text-xs text-slate-600">{row.body}</p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {formatRelative(row.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
