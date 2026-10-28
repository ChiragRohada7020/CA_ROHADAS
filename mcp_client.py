#!/usr/bin/env python
"""Developer CLI for the Rohadas CA MCP server.

This is a *local* command-line client, not part of the deployed backend.  It
speaks to the **domain** MCP server in ``backend/app/mcp_server`` and uses the
provider's native tool-calling API.

Two MCP servers live in this repository, and they are not interchangeable:

* ``backend/app/mcp_server`` — the **domain** server (tasks, clients,
  compliance, documents).  Mounted on the app at ``/mcp/`` and used by the
  in-app assistant.  Safe to expose to signed-in staff.
* ``mcp_server/`` (repo root) — the **developer** server (filesystem, git,
  shell).  It runs over stdio for local tooling only and must never be
  reachable from a browser.

Usage:
    python mcp_client.py "what tasks are overdue?"

Configuration:
    - AI_API_KEY: Your AI model API key
    - AI_PROVIDER: "openai", "anthropic", "groq", or "kilo" (default: "kilo")
    - AI_MODEL: Model name (e.g., "gpt-4o-mini", "kilo-auto/free")
"""
import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))
_BACKEND_DIR = PROJECT_ROOT / "backend"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.assistant.ai import call_chat, format_system_prompt, build_tool_schema
from app.core.config import settings


class ChatResult:
    """Result of a single chat turn."""
    def __init__(self, response: str, session_id: str | None = None,
                 structured: dict | None = None):
        self.response = response
        self.session_id = session_id
        self.structured = structured


def get_ai_client():
    """Read AI configuration from settings and return (api_key, model, provider)."""
    provider = settings.AI_PROVIDER
    api_key = settings.AI_API_KEY
    model = settings.AI_MODEL

    if not api_key:
        print("Error: AI_API_KEY is not configured in the environment.")
        print("Set AI_API_KEY, AI_PROVIDER, and AI_MODEL before running.")
        return None, None, None

    return api_key, model, provider


async def list_mcp_tools(mcp_client) -> list:
    """List all available tools from the MCP server."""
    tools_result = await mcp_client.list_tools()
    return [{"name": t.name, "description": t.description} for t in tools_result.tools]


async def _resolve_mcp_client():
    """Create an in-process MCP client connected to the domain server."""
    from app.mcp_server.server import get_session_manager
    from mcp.client import Client

    server = get_session_manager()
    client = Client(server=server, raise_exceptions=False)
    return client


async def run_chat_turn(
    *,
    api_key: str,
    model: str,
    provider: str,
    mcp_client,
    message: str,
    session_id: str | None = None,
) -> ChatResult:
    """Process a single chat turn and return a ChatResult.

    Sends the user message to the AI provider along with the available MCP
    tool schemas. The AI may emit tool calls, which are executed through the
    MCP client and the results fed back to the AI. Returns the final text
    response and any structured data.
    """
    # Build tool schema list from MCP server
    tools_result = await mcp_client.list_tools()
    tools_schema = [
        build_tool_schema(t.name, t.description, t.inputSchema)
        for t in tools_result.tools
    ]

    messages: list[dict] = [
        {"role": "system", "content": format_system_prompt()},
        {"role": "user", "content": message},
    ]

    tool_calls: list[dict] = []
    content_parts: list[str] = []

    try:
        async for event in call_chat(
            provider=provider,
            api_key=api_key,
            model=model,
            messages=messages,
            tools=tools_schema if tools_schema else None,
        ):
            if event["type"] == "content":
                content_parts.append(event["data"])
            elif event["type"] == "tool_calls":
                tool_calls.extend(event["data"])
    except Exception as exc:
        return ChatResult(
            response=f"AI provider error: {exc}",
            session_id=session_id,
            structured={"error": str(exc)},
        )

    # Execute tool calls if any
    tool_results: list[dict] = []
    for tc in tool_calls:
        tool_name = tc.get("name", "")
        tool_args_str = tc.get("arguments", "") or ""
        try:
            tool_args = json.loads(tool_args_str) if tool_args_str else {}
        except json.JSONDecodeError:
            tool_args = {"raw": tool_args_str}

        try:
            result = await mcp_client.call_tool(tool_name, tool_args)
            result_text = _extract_tool_result(result)
            tool_results.append({
                "tool": tool_name,
                "result": result_text,
            })
        except Exception as exc:
            tool_results.append({
                "tool": tool_name,
                "error": str(exc),
            })

    # Build final response
    response_text = "".join(content_parts) or "I couldn't generate a response."

    structured = None
    if tool_results:
        structured = {"tool_calls": tool_results}

    return ChatResult(
        response=response_text,
        session_id=session_id,
        structured=structured,
    )


def _extract_tool_result(result) -> str:
    """Convert an MCP CallToolResult into a plain text string."""
    if hasattr(result, "structuredContent") and result.structuredContent:
        return json.dumps(result.structuredContent, default=str)
    texts = []
    for item in getattr(result, "content", []) or []:
        text = getattr(item, "text", None)
        if text:
            texts.append(text)
    return "\n".join(texts) if texts else str(result)


async def main():
    parser = argparse.ArgumentParser(description="MCP Client with your own AI model")
    parser.add_argument("command", nargs="?", default=None, help="Command to execute")
    args = parser.parse_args()

    api_key, model, provider = get_ai_client()
    if api_key is None:
        return

    print(f"Using AI: {provider} / {model}")
    print("-" * 60)

    mcp_client = await _resolve_mcp_client()

    async with mcp_client:
        tools = await list_mcp_tools(mcp_client)
        print(f"MCP Server: {len(tools)} tools available")
        for t in tools:
            print(f"  - {t['name']}")
        print("-" * 60)

        if args.command:
            result = await run_chat_turn(
                api_key=api_key,
                model=model,
                provider=provider,
                mcp_client=mcp_client,
                message=args.command,
            )
            print(result.response)
            if result.structured:
                print(json.dumps(result.structured, indent=2, default=str))
            return

        print("Interactive mode. Type 'quit' or 'exit' to end.\n")
        session_id = None
        while True:
            try:
                user_input = input("You: ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\nGoodbye!")
                break
            if user_input.lower() in ("quit", "exit"):
                print("Goodbye!")
                break
            if not user_input:
                continue
            result = await run_chat_turn(
                api_key=api_key,
                model=model,
                provider=provider,
                mcp_client=mcp_client,
                message=user_input,
                session_id=session_id,
            )
            session_id = result.session_id
            print(f"\nAI: {result.response}\n")


if __name__ == "__main__":
    asyncio.run(main())
