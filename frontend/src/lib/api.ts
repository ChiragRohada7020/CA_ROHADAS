import type { ApiErrorBody } from "./types";

/**
 * The single place the frontend talks to the API.
 *
 * Auth is cookie-based: the backend sets httpOnly cookies, so the browser attaches
 * them automatically and JavaScript can never read the token. `credentials:
 * "include"` is therefore required on every call.
 */

const BASE = "/api";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | null;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when the caller simply is not signed in. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  get isPermissionDenied(): boolean {
    return this.status === 403;
  }
}

/**
 * In-flight refresh, shared so concurrent 401s trigger exactly one refresh.
 *
 * This is not an optimisation. `POST /auth/refresh` **rotates** the refresh token:
 * it revokes the token it was given and issues a new one. Two parallel refreshes
 * would therefore race — the second would present a token the first had just
 * revoked, and the user would be signed out for no reason.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      // The refresh token travels in an httpOnly cookie, so an empty body is
      // correct; the schema allows `refresh_token` to be omitted.
      body: JSON.stringify({}),
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = "http_error";
  let message = `Request failed with status ${response.status}.`;
  let details: Record<string, unknown> | null = null;

  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details ?? null;
    }
  } catch {
    // A non-JSON body (an edge error page, say) leaves the defaults in place.
  }

  return new ApiError(response.status, code, message, details);
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Set by the retry path so a second 401 cannot loop forever. */
  _retried?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, _retried = false } = options;

  const response = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    signal,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && !_retried) {
    // The access token is short-lived by design. Refresh once, then replay.
    if (await refreshSession()) {
      return apiRequest<T>(path, { ...options, _retried: true });
    }
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => apiRequest<T>(path, { method: "GET", signal }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "POST", body }),
  /**
   * Partial update. The API distinguishes an omitted field from an explicit `null`
   * using Pydantic's `model_fields_set`, so callers should send *only* the fields
   * they mean to change — omitting one leaves it alone, sending `null` clears it.
   */
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),

  /**
   * Upload a file as multipart form data.
   *
   * Deliberately separate from `apiRequest`: the `Content-Type` header must be left
   * unset so the browser can add the multipart boundary itself. Setting it to
   * `application/json`, as the JSON path does, makes the request unparseable.
   *
   * Bounded at 4 MB by the API — a Vercel Function request body is capped at 4.5 MB.
   * Larger files use `upload-target` + `confirm-upload` and a direct-to-storage
   * upload from the browser instead.
   */
  upload: async <T>(path: string, form: FormData): Promise<T> => {
    const response = await fetch(`${BASE}${path}`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!response.ok) {
      throw await toApiError(response);
    }
    return (await response.json()) as T;
  },
};

/**
 * Build a query string, dropping empty values.
 *
 * Dropping rather than sending `param=` matters: the backend treats an empty string
 * as a filter value in some places (an enum would 422) and as "absent" in others, so
 * passing blanks through produces inconsistent behaviour depending on the endpoint.
 */
export function buildQuery(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

