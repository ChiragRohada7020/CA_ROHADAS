import { NextResponse, type NextRequest } from "next/server";

/**
 * A dedicated proxy for the assistant chat endpoint.
 *
 * `next.config.ts` rewrites `/api/*` to the backend, which is the right default:
 * it keeps the browser on a single origin so the httpOnly auth cookies travel.
 * But Next's dev proxy **cuts a request off at 30 seconds** and answers a
 * plain-text 500. An assistant turn is a long model call - 10 to 60 seconds
 * depending on how many tools the model decides to use - so a rewrite is the
 * wrong transport for this one endpoint, and roughly one turn in five was
 * failing with "Internal Server Error" *after the backend had already finished
 * the work*.
 *
 * A route handler is not subject to that limit, and it can stream: the body is
 * piped straight through, so the Server-Sent Events that report each tool as it
 * runs reach the browser as they happen rather than all at once at the end.
 * `rewrites()` returning a plain array is applied after the filesystem routes,
 * so this file takes precedence for this exact path; every other `/api/*` call
 * still goes through the rewrite.
 *
 * Nothing is interpreted here - the body, the status and the content type are
 * forwarded verbatim, so the `tool_args`/`confirm` contract is unchanged.
 */

// The upstream call is a plain Node fetch; the edge runtime would re-introduce
// its own limits and its own buffering.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel's own ceiling for a serverless function; ignored locally.
export const maxDuration = 300;

const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

export async function POST(request: NextRequest) {
  const body = await request.text();

  const headers: Record<string, string> = {
    "content-type": request.headers.get("content-type") ?? "application/json",
    accept: "text/event-stream",
  };
  // The backend resolves the signed-in principal from these, so they must
  // travel: the assistant's MCP tools run as the caller.
  const cookie = request.headers.get("cookie");
  if (cookie) headers.cookie = cookie;
  const authorization = request.headers.get("authorization");
  if (authorization) headers.authorization = authorization;

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_ORIGIN}/api/assistant/chat/stream`, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "backend_unreachable",
          message: `The API could not be reached at ${BACKEND_ORIGIN}. Is the backend running?`,
          details: { cause: error instanceof Error ? error.message : String(error) },
        },
      },
      { status: 502 },
    );
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      // Without this a buffering proxy in front of us holds the frames until
      // the response ends, which is exactly the behaviour being avoided.
      "x-accel-buffering": "no",
    },
  });
}

