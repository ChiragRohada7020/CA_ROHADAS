#!/usr/bin/env python
"""HTTP entry point for the developer MCP server.

By default the developer MCP server (``mcp_server/server.py``) runs over the
stdio transport and is only reachable as a local subprocess.  This module
starts the *same* set of tools over HTTP — either **SSE** or **streamable
HTTP** — so it can be exposed behind a Cloudflare tunnel and given to Claude
Desktop (or any MCP-capable client) as a *remote* server.

Transport choice:
    * ``streamable-http`` (default) — request/response over HTTP, robust behind
      Cloudflare tunnnels (no long-lived SSE stream to buffer). Path: ``/mcp``.
    * ``sse`` — classic SSE transport. Path: ``/sse`` (GET) + ``/messages/`` (POST).
      SSE streams can be buffered by the Cloudflare edge, so ``streamable-http``
      is recommended when serving through a tunnel.

Usage:
    python -m mcp_server.run_http                       # 127.0.0.1:8091 streamable-http
    python -m mcp_server.run_http --transport sse       # SSE on :8091
    python -m mcp_server.run_http --port 8090 --no-host-check

Environment (mirrors mcp_server/run.py & run_mcp.sh):
    PYTHONPATH        defaults to "<repo>/backend:<repo>"
    DATABASE_URL      postgresql+psycopg://postgres@127.0.0.1:5432/ca_software
    COMPOSIO_API_KEY  set only if you use the composio_* tools
    ENVIRONMENT       development

The Cloudflare tunnel URL + transport path are written to ``mcp_url.txt`` by
``start_mcp_tunnel.sh`` and referenced by claude_config.json / mcp_config.json.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Ensure the backend package is importable, mirroring run.py / run_mcp.sh.
_BACKEND_PATH = str(PROJECT_ROOT / "backend")
if _BACKEND_PATH not in sys.path:
    sys.path.insert(0, _BACKEND_PATH)

from mcp_server.config import DATABASE_URL  # noqa: E402  (import after sys.path tweak)
from mcp_server.server import mcp  # noqa: E402

try:
    from mcp.server.transport_security import TransportSecuritySettings  # type: ignore
except Exception:  # pragma: no cover - fall back if the import path changes
    TransportSecuritySettings = None  # type: ignore[assignment]

# Default env mirrors run_mcp.sh so the server behaves the same as the stdio
# entry point when launched directly.
os.environ.setdefault("PYTHONPATH", f"{_BACKEND_PATH}:{PROJECT_ROOT}")
os.environ.setdefault("DATABASE_URL", DATABASE_URL)

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8091  # 8090 is the project's web port; 8091 keeps the MCP tunnel isolated
DEFAULT_TRANSPORT = "streamable-http"
DEFAULT_SSE_PATH = "/sse"
DEFAULT_MESSAGE_PATH = "/messages/"
DEFAULT_STREAMABLE_PATH = "/mcp"


def _build_transport_security(allowed_extra_hosts: list[str], disable_host_check: bool):
    """Build TransportSecuritySettings for the HTTP transport.

    The MCP SSE/streamable app locks the Host header to 127.0.0.1/localhost by
    default (with a port).  When the server sits behind a Cloudflare tunnel the
    Host header is rewritten to the public hostname, so that check must be
    relaxed.  POST requests are still Content-Type validated regardless.
    """
    if TransportSecuritySettings is None:
        return None
    if disable_host_check:
        return TransportSecuritySettings(enable_dns_rebinding_protection=False)
    if allowed_extra_hosts:
        return TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=["127.0.0.1:*", "localhost:*", "[::1]:*"] + allowed_extra_hosts,
            allowed_origins=["*"],
        )
    return None


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the Ca_software developer MCP server over HTTP (SSE or streamable)."
    )
    parser.add_argument("--host", default=DEFAULT_HOST, help="Bind host (default: %(default)s)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Bind port (default: %(default)s)")
    parser.add_argument(
        "--transport",
        choices=["sse", "streamable-http"],
        default=DEFAULT_TRANSPORT,
        help="HTTP transport (default: %(default)s)",
    )
    parser.add_argument("--sse-path", default=DEFAULT_SSE_PATH, help="SSE endpoint path (default: %(default)s)")
    parser.add_argument(
        "--message-path", default=DEFAULT_MESSAGE_PATH, help="SSE message POST path (default: %(default)s)"
    )
    parser.add_argument(
        "--streamable-path",
        default=DEFAULT_STREAMABLE_PATH,
        help="Streamable HTTP endpoint path (default: %(default)s)",
    )
    parser.add_argument(
        "--no-host-check",
        action="store_true",
        help="Disable DNS-rebinding/Host-header validation. Required behind a reverse proxy "
        "or Cloudflare tunnel (which rewrites the Host header). POSTs are still "
        "Content-Type validated. Safe here because the server binds to 127.0.0.1.",
    )
    parser.add_argument(
        "--allowed-host",
        action="append",
        default=[],
        metavar="HOST",
        help="Extra allowed Host value (e.g. 'mcp.example.com:443'). Repeatable. "
        "Keeps Host validation on but permits these hosts.",
    )
    args = parser.parse_args()

    transport_security = _build_transport_security(args.allowed_host, args.no_host_check)

    scheme = "http"
    base = f"{scheme}://{args.host}:{args.port}"
    if args.transport == "sse":
        sse_url = f"{base}{args.sse_path}"
        print(f"Ca_software MCP Server (SSE) starting → {sse_url}", file=sys.stderr, flush=True)
        print(f"  message POST → {base}{args.message_path}", file=sys.stderr, flush=True)
        mcp.run(
            transport="sse",
            host=args.host,
            port=args.port,
            sse_path=args.sse_path,
            message_path=args.message_path,
            transport_security=transport_security,
        )
    else:
        url = f"{base}{args.streamable_path}"
        print(f"Ca_software MCP Server (streamable-http) starting → {url}", file=sys.stderr, flush=True)
        mcp.run(
            transport="streamable-http",
            host=args.host,
            port=args.port,
            streamable_http_path=args.streamable_path,
            transport_security=transport_security,
        )

    if transport_security and not transport_security.enable_dns_rebinding_protection:
        print("  Host validation: disabled (tunnel/proxy mode)", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
