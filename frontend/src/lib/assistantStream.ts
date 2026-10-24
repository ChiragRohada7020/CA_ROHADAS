/**
 * The assistant's Server-Sent Events client.
 *
 * `EventSource` cannot POST, and the chat turn needs a JSON body (`message`,
 * `session_id`, `confirm`, `tool_args`), so the frames are read off the response
 * body by hand. That is the whole reason this module exists.
 *
 * Frames are `data: {json}\n\n`. A frame that is not valid JSON is skipped
 * rather than throwing: one malformed progress line must not lose the answer
 * that follows it.
 */

export type AssistantEvent =
  | { type: "thinking"; round?: number }
  | { type: "tool_start"; tool: string; arguments: Record<string, unknown> }
  | {
      type: "tool_end";
      tool: string;
      status: "ok" | "error";
      message?: string | null;
      card?: string | null;
      title?: string | null;
      count?: number;
    }
  | { type: "done"; payload: AssistantPayload }
  | { type: "error"; status?: number; message: string };

export interface AssistantPayload {
  success?: boolean;
  response?: string;
  structured?: any;
  actions?: Array<{ label: string; action: string; args: Record<string, unknown> }>;
  tool_calls?: Array<{
    count: number;
    tools: Array<{ tool: string; arguments: Record<string, unknown> }>;
  }>;
  session_id?: string;
  pending_confirmation?: {
    tool: string;
    arguments: Record<string, unknown>;
    message: string;
  } | null;
  error?: string;
}

export interface StreamRequest {
  message: string;
  session_id?: string | null;
  confirm?: boolean;
  tool_args?: Record<string, unknown>;
}

/** Raised when the request itself failed, before any frame arrived. */
export class AssistantRequestError extends Error {
  status: number;
  /** True when the failure happened in front of the API (a proxy or the network). */
  beforeApi: boolean;

  constructor(message: string, status: number, beforeApi: boolean) {
    super(message);
    this.name = "AssistantRequestError";
    this.status = status;
    this.beforeApi = beforeApi;
  }
}

function messageFromBody(status: number, raw: string): AssistantRequestError {
  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  // This API answers {"error": {"code", "message", "details"}}; FastAPI's own
  // HTTPException answers {"detail": "..."}.
  const errObj = parsed?.error;
  const text =
    (typeof errObj === "string" ? errObj : errObj?.message) ||
    (typeof parsed?.detail === "string" ? parsed.detail : parsed?.detail?.message) ||
    (typeof parsed?.response === "string" ? parsed.response : null);

  if (text) return new AssistantRequestError(text, status, false);

  // No JSON at all: the request never reached the API.
  return new AssistantRequestError(
    status >= 500
      ? `The request never reached the server (HTTP ${status}). The connection to the API dropped.`
      : `The assistant request failed (HTTP ${status}).`,
    status,
    true,
  );
}

/**
 * Run one assistant turn, invoking `onEvent` for each progress frame.
 *
 * Resolves with the final payload from the `done` frame. Throws
 * `AssistantRequestError` when the turn could not be started or the API
 * reported a failure.
 */
export async function streamAssistantTurn(
  body: StreamRequest,
  onEvent: (event: AssistantEvent) => void,
  signal?: AbortSignal,
): Promise<AssistantPayload> {
  const response = await fetch("/api/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    credentials: "include",
    body: JSON.stringify(body),
    signal,
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("text/event-stream")) {
    const raw = await response.text().catch(() => "");
    throw messageFromBody(response.status, raw);
  }

  if (!response.body) {
    throw new AssistantRequestError("The response had no body.", response.status, true);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let payload: AssistantPayload | null = null;
  let failure: AssistantRequestError | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        let event: AssistantEvent;
        try {
          event = JSON.parse(raw);
        } catch {
          continue;
        }
        if (event.type === "done") {
          payload = event.payload;
        } else if (event.type === "error") {
          failure = new AssistantRequestError(
            event.message, event.status ?? 500, false,
          );
        }
        onEvent(event);
      }
    }
  }

  if (payload) return payload;
  if (failure) throw failure;
  throw new AssistantRequestError(
    "The assistant stopped before sending an answer. Please try again.", 500, false,
  );
}
