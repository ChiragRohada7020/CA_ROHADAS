"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { api } from "./api";
import type { Page, UserListItem } from "./types";

/**
 * The firm's staff, resolved by id.
 *
 * One request, shared by every component that needs it — TanStack Query dedupes on
 * the key, so ten components asking for the directory produce one call.
 *
 * **Inactive staff are included on purpose.** A task assigned to someone who has
 * left still needs to name them; a lookup that only knew about current staff would
 * render historical work as unassigned, which is worse than useless — it is wrong.
 * Pickers that *offer* people filter to `status === "active"` themselves.
 */
export const USER_DIRECTORY_KEY = ["users", "directory"] as const;

export function useUserDirectory() {
  const query = useQuery({
    queryKey: USER_DIRECTORY_KEY,
    queryFn: () => api.get<Page<UserListItem>>("/users?limit=500&include_inactive=true"),
    // People change far less often than work does.
    staleTime: 10 * 60 * 1000,
  });

  const byId = useMemo(() => {
    const map = new Map<string, UserListItem>();
    for (const row of query.data?.items ?? []) map.set(row.id, row);
    return map;
  }, [query.data]);

  const all = query.data?.items ?? [];
  const active = useMemo(() => all.filter((row) => row.status === "active"), [all]);

  return {
    byId,
    all,
    /** Only these should ever appear in an "assign to…" picker. */
    active,
    isPending: query.isPending,
  };
}

/** The person's name, or a clearly-marked placeholder if they cannot be resolved. */
export function userName(
  byId: Map<string, UserListItem>,
  id: string | null | undefined,
): string {
  if (!id) return "Unassigned";
  const user = byId.get(id);
  if (!user) return "Unknown";
  // Someone who has left is still named, but marked, so the reader knows not to
  // chase them.
  return user.status === "active" ? user.full_name : `${user.full_name} (inactive)`;
}

/** Name plus designation, for pickers and headers. */
export function userLabel(
  byId: Map<string, UserListItem>,
  id: string | null | undefined,
): string {
  if (!id) return "Unassigned";
  const user = byId.get(id);
  if (!user) return "Unknown";
  return user.designation ? `${user.full_name} — ${user.designation}` : user.full_name;
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "?";
}
