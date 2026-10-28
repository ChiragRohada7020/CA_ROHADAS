"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./api";
import type { TokenResponse } from "./types";

export const SESSION_QUERY_KEY = ["session"] as const;

/**
 * The signed-in user, or an error if there is none.
 *
 * The session is derived from `GET /auth/me` rather than from anything stored in
 * JavaScript, because the tokens live in httpOnly cookies that the page cannot
 * read. That is the point of httpOnly: an XSS bug cannot steal the session.
 */
export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => api.get<TokenResponse>("/auth/me"),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: { email: string; password: string; firm_slug?: string }) =>
      api.post<TokenResponse>("/auth/login", credentials),
    onSuccess: (session) => {
      // Seed the cache so the shell renders immediately instead of flashing a
      // loading state on the way to the dashboard.
      queryClient.setQueryData(SESSION_QUERY_KEY, session);
    },
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean; message: string | null }>("/auth/logout"),
    onSettled: () => {
      // Drop everything: another user signing in on this browser must not see the
      // previous firm's cached figures.
      queryClient.clear();
    },
  });
}

export function hasPermission(session: TokenResponse | undefined, code: string): boolean {
  return Boolean(session?.permissions?.includes(code));
}

/**
 * Returns true when the caller should see a UI section or field.
 *
 * Permission logic:
 *  - `firm_owner` role or `*:*` wildcard → always true (firm owner has full access)
 *  - explicit grant of `code` → true
 *  - otherwise → false
 *
 * Field-level permissions (e.g. `client.read.sensitive`) are NOT auto-granted
 * from parent permissions (e.g. `client.read`). They must be explicitly granted
 * via the role or a per-user override so that the owner can selectively restrict
 * sensitive data.
 */
export function canSee(session: TokenResponse | undefined, code: string): boolean {
  if (!session) {
    return true; // avoid flicker during session loading
  }
  const perms = session.permissions ?? [];
  const roles = session.roles ?? [];

  // Owner and system admin always see everything
  if (roles.includes("firm_owner") || roles.includes("system_admin")) {
    return true;
  }
  if (perms.includes("*:*")) {
    return true;
  }

  // Exact match
  if (perms.includes(code)) {
    return true;
  }

  return false;
}

/**
 * Returns true when the user can see a section — used by `usePermissions`.
 *
 * This variant supports hierarchical matching: `invoice.read.financial` is
 * visible if the user has `invoice.read`. Use `canSee` for strict checks where
 * field-level permissions must be explicit.
 */
export function canSeeSection(session: TokenResponse | undefined, code: string): boolean {
  if (!session) {
    return true;
  }
  const perms = session.permissions ?? [];
  const roles = session.roles ?? [];

  if (roles.includes("firm_owner") || roles.includes("system_admin")) {
    return true;
  }
  if (perms.includes("*:*")) {
    return true;
  }
  if (perms.includes(code)) {
    return true;
  }

  // Hierarchical match for section-level permissions
  const parts = code.split(".");
  while (parts.length > 1) {
    parts.pop();
    if (perms.includes(parts.join("."))) {
      return true;
    }
  }

  return false;
}

/**
 * Hook: returns a convenience set of permission checks for the current session.
 */
export function usePermissions() {
  const { data: session } = useSession();
  const perms = session?.permissions ?? [];
  const roles = session?.roles ?? [];

  const check = (code: string) => {
    if (roles.includes("firm_owner") || roles.includes("system_admin")) return true;
    if (perms.includes("*:*")) return true;
    if (perms.includes(code)) return true;
    const parts = code.split(".");
    while (parts.length > 1) {
      parts.pop();
      if (perms.includes(parts.join("."))) return true;
    }
    return false;
  };

  return { permissions: perms, roles, canSee: check };
}
