"""Chat orchestration: SSE streaming, MCP tool calls, and AI dispatch.

The ``handle_chat_stream`` endpoint is the single entry point for the
assistant UI. It:
  1. Resolves or creates a session
  2. Emits ``thinking`` → ``tool_start`` / ``tool_end`` → ``done`` frames
  3. Forwards tool calls to the MCP server over HTTP (StreamableHTTP),
     preserving the caller's bearer token / cookies
  4. Calls the configured AI provider with tool results
  5. Falls back to a structured response (no LLM) when offline
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, AsyncIterator

from fastapi import HTTPException, Request, status, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.assistant import ai
from app.assistant.sessions import (
    add_message,
    get_or_create_session,
    get_session,
)
from app.assistant.transport import MCPTransport
from app.core.config import settings
from app.core.db import get_db

logger = logging.getLogger("ca_software.assistant")


class SSE:
    """Minimal Server-Sent Events writer."""

    def __init__(self) -> None:
        self._buffer: list[str] = []
        self._sent = False

    def event(self, event_type: str, data: Any) -> str:
        if isinstance(data, dict):
            data = {"type": event_type, **data}
        else:
            data = {"type": event_type, "data": data}
        payload = json.dumps(data, default=str)
        return f"event: {event_type}\ndata: {payload}\n\n"

    def text(self, text: str) -> str:
        return f"data: {text}\n\n"

    def error(self, message: str, status_code: int = 500) -> str:
        payload = json.dumps({"type": "error", "status": status_code, "message": message})
        return f"event: error\ndata: {payload}\n\n"


def _emit_error(sse: SSE, message: str, status_code: int = 500) -> str:
    return sse.error(message, status_code)


async def handle_chat_stream(
    request: Request,
    *,
    db: Session,
    message: str,
    session_id: str | None = None,
    confirm: bool = False,
    tool_args: dict[str, Any] | None = None,
) -> StreamingResponse:
    """Process a chat message and return an SSE stream."""

    async def _stream() -> AsyncIterator[str]:
        sse = SSE()

        try:
            from app.core.security import get_current_user
            principal = await get_current_user(request, db)
        except HTTPException:
            yield sse.error("Not authenticated", 401)
            return

        session = get_or_create_session(
            session_id,
            tenant_id=principal.tenant_id,
            user_id=principal.user_id,
        )

        if not settings.AI_API_KEY:
            yield _emit_error(
                sse,
                "AI provider API key is not configured. Set AI_API_KEY in the environment.",
                503,
            )
            return

        yield sse.text("")  # flush
        yield sse.event("thinking", {"round": 1})

        # ── Build message history ──────────────────────────────────────────
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": ai.format_system_prompt()},
        ]
        messages.extend(session.messages[-20:])  # last 10 exchanges
        messages.append({"role": "user", "content": message})

        # ── First turn: call MCP tools to gather context ───────────────────
        mcp_results: list[dict[str, Any]] = []
        tool_calls: list[dict[str, Any]] = []

        # If tool_args is provided, the user confirmed a pending tool call
        if tool_args and session.tool_results:
            last_result = session.tool_results[-1]
            if last_result.get("tool") == tool_args.get("tool"):
                # Re-call with confirmed arguments
                tool_calls.append(tool_args)
            else:
                tool_calls.append(tool_args)
        else:
            # Auto-detect what tools to call based on intent keywords
            tool_calls = _intent_to_tool_calls(message)

        # Execute tool calls
        async with MCPTransport.for_request(request) as mcp_client:
            for tc in tool_calls:
                tool_name = tc["tool"]
                tool_args_obj = tc.get("arguments", {})

                yield sse.event("tool_start", {
                    "tool": tool_name,
                    "arguments": tool_args_obj,
                })

                try:
                    result = await mcp_client.call_tool(tool_name, tool_args_obj)
                    result_text = _extract_tool_result(result)
                    mcp_results.append({
                        "tool": tool_name,
                        "result": result_text,
                    })

                    yield sse.event("tool_end", {
                        "tool": tool_name,
                        "status": "ok",
                        "count": len(result_text.split("\n")) if result_text else 0,
                    })
                except Exception as exc:
                    logger.warning("MCP tool %s failed: %s", tool_name, exc)
                    yield sse.event("tool_end", {
                        "tool": tool_name,
                        "status": "error",
                        "message": str(exc),
                    })
                    mcp_results.append({
                        "tool": tool_name,
                        "result": f"Error: {exc}",
                        "error": True,
                    })

        # ── Build AI messages with intent-based tool results ─────────────────
        # OpenAI chat format requires an assistant message with ``tool_calls``
        # before each ``tool`` role message, plus a ``tool_call_id`` linking
        # them.  The intent-detector tools are synthetic, so we fabricate IDs.
        if mcp_results:
            messages.append({
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {
                        "id": f"intentional_call_{i}",
                        "type": "function",
                        "function": {
                            "name": mr["tool"],
                            "arguments": json.dumps(tool_calls[i].get("arguments", {})) if i < len(tool_calls) else "{}",
                        },
                    }
                    for i, mr in enumerate(mcp_results)
                ],
            })
            for i, mr in enumerate(mcp_results):
                messages.append({
                    "role": "tool",
                    "tool_call_id": f"intentional_call_{i}",
                    "content": mr["result"],
                })

        add_message(session.id, {"role": "user", "content": message})

        # ── Call the AI provider ───────────────────────────────────────────
        tools_schema = _get_tool_schema()
        response_buffer = ""
        tool_calls_from_ai: list[dict[str, Any]] = []

        try:
            async for event in ai.call_chat(
                provider=settings.AI_PROVIDER,
                api_key=settings.AI_API_KEY,
                model=settings.AI_MODEL,
                messages=messages,
                tools=tools_schema,
            ):
                if event["type"] == "content":
                    response_buffer += event["data"]
                    yield sse.text(event["data"])
                elif event["type"] == "tool_calls":
                    tool_calls_from_ai.extend(event["data"])
        except HTTPException as exc:
            yield sse.error(
                f"AI provider error: {exc.detail}",
                exc.status_code,
            )
            return

        # ── If AI returned tool calls, execute them and do a follow-up call ──
        if tool_calls_from_ai:
            # Add an assistant message with the AI's tool_calls so the
            # conversation flow is correct for the OpenAI chat format.
            messages.append({
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {
                        "id": f"ai_call_{i}",
                        "type": "function",
                        "function": {
                            "name": tc["name"],
                            "arguments": tc.get("arguments", ""),
                        },
                    }
                    for i, tc in enumerate(tool_calls_from_ai)
                ],
            })

            for i, tc in enumerate(tool_calls_from_ai):
                tool_name = tc["name"]
                tool_args_str = tc.get("arguments", "") or ""
                try:
                    tool_args_obj = json.loads(tool_args_str) if tool_args_str else {}
                except json.JSONDecodeError:
                    tool_args_obj = {"raw": tool_args_str}

                yield sse.event("tool_start", {
                    "tool": tool_name,
                    "arguments": tool_args_obj,
                })
                try:
                    async with MCPTransport.for_request(request) as mcp_client:
                        result = await mcp_client.call_tool(tool_name, tool_args_obj)
                    result_text = _extract_tool_result(result)
                    messages.append({
                        "role": "tool",
                        "tool_call_id": f"ai_call_{i}",
                        "content": result_text,
                    })
                    mcp_results.append({
                        "tool": tool_name,
                        "result": result_text,
                    })
                    yield sse.event("tool_end", {
                        "tool": tool_name,
                        "status": "ok",
                        "count": len(result_text.split("\n")) if result_text else 0,
                    })
                except Exception as exc:
                    logger.warning("MCP tool %s failed: %s", tool_name, exc)
                    messages.append({
                        "role": "tool",
                        "tool_call_id": f"ai_call_{i}",
                        "content": f"Error: {exc}",
                    })
                    mcp_results.append({
                        "tool": tool_name,
                        "result": f"Error: {exc}",
                        "error": True,
                    })
                    yield sse.event("tool_end", {
                        "tool": tool_name,
                        "status": "error",
                        "message": str(exc),
                    })

            # ── Second AI call: generate the final response text ───────────
            response_buffer = ""
            try:
                async for event in ai.call_chat(
                    provider=settings.AI_PROVIDER,
                    api_key=settings.AI_API_KEY,
                    model=settings.AI_MODEL,
                    messages=messages,
                    tools=tools_schema,
                ):
                    if event["type"] == "content":
                        response_buffer += event["data"]
                        yield sse.text(event["data"])
            except HTTPException as exc:
                yield sse.error(
                    f"AI provider error: {exc.detail}",
                    exc.status_code,
                )
                return

        full_response = response_buffer.strip()
        if not full_response:
            full_response = "I couldn't generate a response. Please try rephrasing your question."

        add_message(session.id, {"role": "assistant", "content": full_response})

        tool_names = [mr["tool"] for mr in mcp_results]
        yield sse.event("done", {
            "payload": {
                "success": True,
                "response": full_response,
                "session_id": session.id,
                "tool_calls": {
                    "count": len(tool_names),
                    "tools": [{"tool": t} for t in tool_names],
                } if tool_names else None,
            },
        })

    return StreamingResponse(
        _iter_with_done(
            _stream(),
            request,
        ),
        media_type="text/event-stream",
        headers={"cache-control": "no-cache", "connection": "keep-alive"},
    )


async def _iter_with_done(
    async_gen: AsyncIterator[str],
    request: Request,
) -> AsyncIterator[str]:
    """Yield from the async generator, breaking early if the client disconnects."""
    try:
        async for chunk in async_gen:
            yield chunk
            if await request.is_disconnected():
                break
    except Exception as exc:
        logger.exception("Chat stream error")
        yield SSE().error(f"Internal error: {exc}", 500)


def _extract_tool_result(result: Any) -> str:
    """Convert an MCP CallToolResult into a plain text string."""
    if hasattr(result, "structuredContent") and result.structuredContent:
        return json.dumps(result.structuredContent, default=str)

    texts = []
    for item in getattr(result, "content", []) or []:
        text = getattr(item, "text", None)
        if text:
            texts.append(text)
    return "\n".join(texts) if texts else str(result)


def _intent_to_tool_calls(message: str) -> list[dict[str, Any]]:
    """Heuristic: decide which MCP tools to call based on the user's message."""
    calls: list[dict[str, Any]] = []
    msg_lower = message.lower()

    if any(w in msg_lower for w in ["task", "overdue", "due", "deadline", "pending", "ready for"]):
        calls.append({"tool": "list_tasks", "arguments": {"limit": 50}})

    if any(w in msg_lower for w in ["client", "customer", "customer"]):
        calls.append({"tool": "list_clients", "arguments": {"limit": 50}})

    if any(w in msg_lower for w in ["financial year", "fy", "financial_year"]):
        calls.append({"tool": "list_financial_years", "arguments": {"include_closed": True}})

    if any(w in msg_lower for w in ["invoice", "bill", "payment", "receivable"]):
        # These are handled by the AI via the data it already has
        pass

    return calls


def _get_tool_schema() -> list[dict[str, Any]]:
    """Return the tool schema for the AI provider."""
    from app.mcp_server.server import _build_tool_definitions

    schemas = _build_tool_definitions()
    return [
        {
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description or "",
                "parameters": t.input_schema or {},
            },
        }
        for t in schemas
    ]
