"""The MCP transport used by the assistant.

The domain MCP server is mounted on this very FastAPI app at ``/mcp``.  Two
details matter and both were wrong before:

1. **The URL needs its trailing slash.**  ``/mcp`` is answered with a 307
   redirect to ``/mcp/``; ``httpx`` does not follow redirects by default, so
   the POST that carries the JSON-RPC body never reached the server.
2. **The caller's credentials must be forwarded.**  The domain tools resolve
   the authenticated ``Principal`` from the HTTP request, so the assistant has
   to present the same bearer token / ``ca_staff_token`` cookie the user
   presented.  Otherwise every tool would run as an anonymous caller.
"""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse, urlunparse

from fastapi import Request

#: Path the MCP sub-application is mounted at (see ``app/main.py``).
MCP_MOUNT_PATH = "/mcp/"


def build_mcp_url(base_url: str) -> str:
    """Return the absolute MCP URL for a given base URL.

    The trailing slash is not optional.  ``/mcp`` redirects to ``/mcp/`` and
    ``httpx`` will not follow it.
    """
    return f"{base_url.rstrip('/')}{MCP_MOUNT_PATH}"


def _forwarded_headers(request: Request) -> dict[str, str]:
    """The auth headers that must travel with the MCP request."""
    headers: dict[str, str] = {}
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        headers["Authorization"] = auth_header
    return headers


def _forwarded_cookies(request: Request) -> dict[str, str] | None:
    """The cookies that must travel with the MCP request."""
    raw_cookie = request.headers.get("cookie")
    if not raw_cookie:
        return None
    cookies: dict[str, str] = {}
    for pair in raw_cookie.split(";"):
        if "=" not in pair:
            continue
        name, _, value = pair.partition("=")
        cookies[name.strip()] = value.strip()
    return cookies or None


class _ClientScope:
    """An async context manager that also closes the HTTP client it was given.

    ``streamable_http_client`` only manages the client's lifecycle when *it*
    created the client (``if not client_provided: await stack.enter_async_context(client)``).
    Because we pass one in so that the caller's credentials travel with the MCP
    request, nothing closes it - and an ``httpx.AsyncClient`` holds a connection
    pool. One assistant turn per leaked pool means sockets to the backend
    accumulate for as long as the process lives, which surfaces as intermittent
    ``ECONNRESET``/``socket hang up`` failures long before anything is exhausted
    outright. So this wrapper closes both: the MCP session, then the HTTP client.
    """

    def __init__(self, client: Any, http_client: Any) -> None:
        self._client = client
        self._http_client = http_client

    async def __aenter__(self) -> Any:
        await self._client.__aenter__()
        return self._client

    async def __aexit__(self, exc_type, exc, tb) -> Any:
        try:
            return await self._client.__aexit__(exc_type, exc, tb)
        finally:
            # Closing must happen even when the MCP session teardown raises -
            # otherwise a failed turn leaks the pool it was using.
            await self._http_client.aclose()


class MCPTransport:
    """Factory for the MCP client the assistant talks to.

    Kept as a class (rather than a bare function) so the chat router has one
    importable name to use and so the URL construction is testable without a
    live server.
    """

    @staticmethod
    def url_for(request: Request) -> str:
        """The MCP URL for the server this request arrived at.

        Uses 127.0.0.1 as the host so the backend can reach its own MCP
        endpoint even when the request arrived via a public IP (which the
        server may not be able to route to itself).
        """
        base = str(request.base_url)
        parsed = urlparse(base)
        local = parsed._replace(
            netloc=f"127.0.0.1:{parsed.port or 8000}"
        )
        return build_mcp_url(urlunparse(local))

    @staticmethod
    def for_request(request: Request) -> Any:
        """Build an MCP client bound to this request's credentials.

        Returns an async context manager yielding the MCP client. It must be
        used as ``async with`` - see :class:`_ClientScope` for why.
        """
        import httpx
        from mcp.client import Client
        from mcp.client.streamable_http import streamable_http_client

        url = MCPTransport.url_for(request)
        http_client = httpx.AsyncClient(
            headers=_forwarded_headers(request),
            cookies=_forwarded_cookies(request),
            follow_redirects=False,
            timeout=httpx.Timeout(60.0, connect=10.0),
        )
        transport = streamable_http_client(
            url, http_client=http_client, terminate_on_close=False
        )
        client = Client(server=transport, raise_exceptions=False)
        return _ClientScope(client, http_client)
