"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A dashboard figure is worth re-reading when the window regains focus,
            // but polling in the background would burn the firm's database quota for
            // numbers nobody is looking at.
            refetchOnWindowFocus: true,
            staleTime: 30_000,
            retry: (failureCount, error) => {
              // Retrying an auth or permission failure only delays the redirect.
              if (error instanceof ApiError && error.status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
