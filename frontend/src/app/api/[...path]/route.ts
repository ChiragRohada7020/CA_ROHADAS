import { NextRequest, NextResponse } from "next/server";

const BACKEND_ORIGIN =
  process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

async function proxy(request: NextRequest, method: string) {
  const { pathname, search } = new URL(request.url);
  const url = `${BACKEND_ORIGIN}${pathname}${search}`;

  const headers: Record<string, string> = {};
  for (const [key, value] of request.headers.entries()) {
    const lower = key.toLowerCase();
    if (["host", "cookie", "connection", "content-length", "transfer-encoding", "accept-encoding"].includes(lower)) continue;
    headers[key] = value;
  }

  // Explicitly forward cookies (Next.js route handlers don't include them in headers.entries())
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    headers["cookie"] = cookieHeader;
  }

  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = await request.text();
  }

  try {
    const response = await fetch(url, init);

    // Build response with forwarded body
    const body = await response.text();
    const nextResponse = new NextResponse(body, {
      status: response.status,
    });

    // Forward all headers except the ones we delete
    for (const [key, value] of response.headers.entries()) {
      const lower = key.toLowerCase();
      if (["content-encoding", "content-length", "transfer-encoding", "connection"].includes(lower)) {
        continue;
      }
      nextResponse.headers.set(key, value);
    }

    // Forward Set-Cookie headers properly (getSetCookie returns array of full cookie strings)
    const setCookies = response.headers.getSetCookie();
    if (setCookies && setCookies.length > 0) {
      for (const cookie of setCookies) {
        nextResponse.headers.append("set-cookie", cookie);
      }
    }

    return nextResponse;
  } catch (error) {
    console.error("Proxy error:", error);
    return NextResponse.json(
      { error: { code: "proxy_error", message: "Backend unreachable" } },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest) { return proxy(request, "GET"); }
export async function POST(request: NextRequest) { return proxy(request, "POST"); }
export async function PATCH(request: NextRequest) { return proxy(request, "PATCH"); }
export async function PUT(request: NextRequest) { return proxy(request, "PUT"); }
export async function DELETE(request: NextRequest) { return proxy(request, "DELETE"); }
export async function HEAD(request: NextRequest) { return proxy(request, "HEAD"); }
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
