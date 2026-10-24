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
    - AI_PROVIDER: "openai", "anthropic", "groq", or "kilo" (default: "openai")
    - AI_MODEL: Model name (e.g., "gpt-4o-mini", "kilo-auto/free")
    - AI_BASE_URL: Base URL for the API (custom providers like Kilo)
"""
import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))
# The backend package holds the domain MCP server and the assistant package.
_BACKEND_DIR = PROJECT_ROOT / "backend"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

# The assistant package loads the ``AI_*`` settings and the native tool-calling
# loop; the domain server holds the tools.
from app.assistant.ai import get_ai_client  # noqa: E402
from app.assistant.chat import run_chat_turn  # noqa: E402


async def list_mcp_tools(mcp_client) -> list:
    """List all available tools from the MCP server."""
    tools_result = await mcp_client.list_tools()
    return [{"name": t.name, "description": t.description} for t in tools_result.tools]


async def main():
    parser = argparse.ArgumentParser(description="MCP Client with your own AI model")
    parser.add_argument("command", nargs="?", default=None, help="Command to execute")
    parser.add_argument(
        "--provider",
        default=os.environ.get("AI_PROVIDER", "openai"),
        choices=["openai", "anthropic", "groq", "kilo"],
    )
    parser.add_argument("--model", default=None)
    args = parser.parse_args()

    try:
        ai_client, model, provider = get_ai_client()
    except ImportError:
        print("Error: Missing dependency. Install with:")
        print("  pip install openai     # for OpenAI")
        print("  pip install anthropic  # for Anthropic")
        print("  pip install groq       # for Groq")
        return
    except ValueError as e:
        print(f"Error: {e}")
        return

    print(f"Using AI: {provider} / {model}")
    print("-" * 60)

    from app.mcp_server.server import mcp
    from mcp.client import Client

    mcp_client = Client(server=mcp, raise_exceptions=False)

    async with mcp_client:
        tools = await list_mcp_tools(mcp_client)
        print(f"MCP Server: {len(tools)} tools available")
        for t in tools:
            print(f"  - {t['name']}")
        print("-" * 60)

        if args.command:
            result = await run_chat_turn(
                ai_client=ai_client,
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
                ai_client=ai_client,
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

