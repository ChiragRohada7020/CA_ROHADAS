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
