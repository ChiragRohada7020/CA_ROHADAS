import type { NextConfig } from "next";

/** Where the FastAPI backend listens during local development. */
const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

/**
 * Auth cookies are `httpOnly` with `SameSite=Lax`, so the browser will only send
 * them on a same-origin request. In development the frontend (`:3000`) and the API
 * (`:8000`) are different origins, which would silently break every authenticated
 * call. Proxying `/api` through Next makes the browser see a single origin.
 *
 * On Vercel this rewrite is deliberately not registered: `vercel.json` already
 * routes `/api/(.*)` to the backend service at the routing layer, before Next.js
 * sees the request. Registering both would be redundant and confusing.
 *
 * **`BACKEND_ORIGIN` is resolved at BUILD time, not at start time.** Next writes the
 * destination into `.next/routes-manifest.json` during `next build`, and `next start`
 * reads it back from there. So setting the variable only for `next start` has no
 * effect — the value baked in at build wins. A stale `BACKEND_ORIGIN` in the shell
 * will therefore be compiled into the build and quietly point the proxy at the wrong
 * port, which presents as a 500 from Next with `ECONNREFUSED` in the frontend log.
 *
 * Check what a build actually contains with:
 *   python -c "import json;print(json.load(open('.next/routes-manifest.json'))['rewrites'])"
 */
const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async rewrites() {
    if (process.env.VERCEL) {
      return [];
    }
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
      {
        source: "/mcp/:path*",
        destination: `${backendOrigin}/mcp/:path*`,
      },
    ];
  },
};

export default nextConfig;

