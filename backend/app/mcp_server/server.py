"""MCP server mount — exposes tool definitions for the MCP client.

Provides:
  MCPMount              — Starlette Route + Mount constants
  get_session_manager() — lazily build and cache an MCP session manager
  build_streamable_http_app() — return the cached Starlette ASGI app
"""
from __future__ import annotations

import os
import threading
from typing import Any

from starlette.routing import Mount
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

MCP_MOUNT_PATH = "/mcp"
MCP_APP_NAME = "ca-software-mcp"
_backend_url = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000")


class MCPMount:
    PATH = MCP_MOUNT_PATH
    NAME = "mcp"


_lock = threading.Lock()
_session_manager: Any | None = None
_starlette_app: Starlette | None = None


def _build_tool_definitions():
    """Return the 7 MCP tool definitions."""
    from mcp.types import Tool

    tools: list[Tool] = []

    tools.append(Tool(
        name="list_clients",
        description="List clients in the firm. Supports search by name, PAN, or code.",
        inputSchema={
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Search term for client name, code, or PAN"},
                "status": {"type": "string", "enum": ["prospect", "onboarding", "active", "inactive", "on_hold", "closed"]},
                "limit": {"type": "integer", "default": 25},
            },
        },
    ))

    tools.append(Tool(
        name="get_client",
        description="Get detailed information about a specific client including contacts, registrations, and services.",
        inputSchema={
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "The client UUID"},
            },
            "required": ["client_id"],
        },
    ))

    tools.append(Tool(
        name="list_tasks",
        description="List tasks, optionally filtered by client, status, category, or financial year.",
        inputSchema={
            "type": "object",
            "properties": {
                "client_id": {"type": "string"},
                "status": {"type": "string"},
                "category": {"type": "string"},
                "financial_year": {"type": "string"},
                "assigned_to": {"type": "string"},
                "overdue_only": {"type": "boolean", "default": False},
                "limit": {"type": "integer", "default": 50},
            },
        },
    ))

    tools.append(Tool(
        name="get_task",
        description="Get detailed task information including deadlines, assignment, and status.",
        inputSchema={
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "The task UUID"},
            },
            "required": ["task_id"],
        },
    ))

    tools.append(Tool(
        name="create_task",
        description="Create a new compliance task for a client.",
        inputSchema={
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "Client UUID"},
                "name": {"type": "string", "description": "Task name"},
                "description": {"type": "string"},
                "category": {"type": "string"},
                "priority": {"type": "string"},
                "statutory_due_date": {"type": "string", "format": "date-time"},
                "service_id": {"type": "string"},
                "checklist_item": {"type": "string"},
                "financial_year": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["client_id", "name"],
        },
    ))

    tools.append(Tool(
        name="list_financial_years",
        description="List all financial years available in the system, including current status.",
        inputSchema={
            "type": "object",
            "properties": {
                "include_closed": {"type": "boolean", "default": False},
            },
        },
    ))

    tools.append(Tool(
        name="read_clients_csv",
        description="Read and parse a clients CSV file, returning client records.",
        inputSchema={
            "type": "object",
            "properties": {
                "file_path": {"type": "string", "description": "Absolute path to the CSV file"},
            },
            "required": ["file_path"],
        },
    ))

    return tools


def _handle_list_tools():
    """Async callback returning the list of available tools."""

    async def _on_list_tools(context, params) -> Any:
        from mcp.types import ListToolsResult
        return ListToolsResult(tools=_build_tool_definitions())

    return _on_list_tools


def _handle_call_tool():
    """Async callback handling tool execution."""

    async def _on_call_tool(context, params) -> Any:
        from mcp.types import CallToolResult, TextContent

        name = params.name
        arguments = params.arguments or {}

        try:
            result_text = await _dispatch_tool(name, arguments)
            return CallToolResult(
                content=[TextContent(type="text", text=result_text)],
                structured_content=None,
                is_error=False,
            )
        except Exception as exc:
            return CallToolResult(
                content=[TextContent(type="text", text=f"Error: {exc}")],
                structured_content=None,
                is_error=True,
            )

    return _on_call_tool


async def _dispatch_tool(name: str, arguments: dict[str, Any]) -> str:
    """Dispatch a tool call and return a plain-text result."""
    import json as json_module
    from app.core.db import SessionLocal

    db = SessionLocal()
    try:
        if name == "list_clients":
            return await _tool_list_clients(db, arguments)
        elif name == "get_client":
            return await _tool_get_client(db, arguments)
        elif name == "list_tasks":
            return await _tool_list_tasks(db, arguments)
        elif name == "get_task":
            return await _tool_get_task(db, arguments)
        elif name == "create_task":
            return await _tool_create_task(db, arguments)
        elif name == "list_financial_years":
            return await _tool_list_fy(db, arguments)
        elif name == "read_clients_csv":
            return await _tool_read_csv(db, arguments)
        else:
            return f"Unknown tool: {name}"
    finally:
        db.close()


async def _tool_list_clients(db, arguments: dict[str, Any]) -> str:
    from app.models import Client
    from sqlalchemy import select, or_, func

    stmt = select(Client)
    search = arguments.get("search")
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(or_(
            Client.legal_name.ilike(pattern),
            Client.trade_name.ilike(pattern),
            Client.pan.ilike(pattern),
            Client.client_code.ilike(pattern),
        ))
    status = arguments.get("status")
    if status:
        stmt = stmt.where(Client.status == status)
    limit = arguments.get("limit", 25)
    stmt = stmt.limit(limit)

    rows = db.execute(stmt).scalars().all()
    return __import__("json").dumps([
        {"id": str(r.id), "client_code": r.client_code, "legal_name": r.legal_name, "status": r.status}
        for r in rows
    ])


async def _tool_get_client(db, arguments: dict[str, Any]) -> str:
    from app.models import Client
    import json

    client_id = arguments.get("client_id")
    if not client_id:
        return json.dumps({"error": "client_id is required"})

    client = db.get(Client, client_id)
    if client is None:
        return json.dumps({"error": f"Client {client_id} not found"})

    return json.dumps({
        "id": str(client.id),
        "client_code": client.client_code,
        "legal_name": client.legal_name,
        "pan": client.pan,
        "status": client.status,
        "kyc_status": client.kyc_status,
    })


async def _tool_list_tasks(db, arguments: dict[str, Any]) -> str:
    from app.models import Task
    from sqlalchemy import select
    import json as j

    stmt = select(Task)
    if arguments.get("client_id"):
        stmt = stmt.where(Task.client_id == arguments["client_id"])
    if arguments.get("status"):
        stmt = stmt.where(Task.status == arguments["status"])
    if arguments.get("category"):
        stmt = stmt.where(Task.category == arguments["category"])
    if arguments.get("financial_year"):
        stmt = stmt.where(Task.financial_year_id == arguments["financial_year"])
    if arguments.get("assigned_to"):
        stmt = stmt.where(Task.preparer_id == arguments["assigned_to"])
    if arguments.get("overdue_only"):
        from app.core.clock import today_local
        stmt = stmt.where(
            Task.statutory_due_date < today_local(),
            Task.filing_status != "filed",
        )
    stmt = stmt.limit(arguments.get("limit", 50))

    rows = db.execute(stmt).scalars().all()
    return j.dumps([
        {
            "id": str(r.id),
            "task_code": r.task_code,
            "title": r.title,
            "status": r.status,
            "category": r.category,
            "statutory_due_date": r.statutory_due_date.isoformat() if r.statutory_due_date else None,
        }
        for r in rows
    ])


async def _tool_get_task(db, arguments: dict[str, Any]) -> str:
    from app.models import Task
    import json

    task_id = arguments.get("task_id")
    if not task_id:
        return json.dumps({"error": "task_id is required"})

    task = db.get(Task, task_id)
    if task is None:
        return json.dumps({"error": f"Task {task_id} not found"})

    from app.core.clock import today_local

    is_overdue = False
    days_overdue = 0
    if task.statutory_due_date:
        now = today_local()
        if task.statutory_due_date < now and task.filing_status != "filed":
            is_overdue = True
            days_overdue = max((now - task.statutory_due_date).days, 0)

    return json.dumps({
        "id": str(task.id),
        "task_code": task.task_code,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "filing_status": task.filing_status,
        "statutory_due_date": task.statutory_due_date.isoformat() if task.statutory_due_date else None,
        "days_overdue": days_overdue,
        "is_overdue": is_overdue,
    })


async def _tool_create_task(db, arguments: dict[str, Any]) -> str:
    from app.models import Task
    import json
    from app.core.clock import today_local
    from app.core.db import SessionLocal

    db = SessionLocal()
    try:
        now = today_local()
        prefix = f"T{now.strftime('%y%m')}:"

        task = Task(
            tenant_id="00000000-0000-0000-0000-000000000000",
            task_code=prefix + "0001",
            title=arguments.get("title", arguments.get("name", "")),
            client_id=arguments.get("client_id"),
            description=arguments.get("description", ""),
            category=arguments.get("category", "compliance"),
            priority=arguments.get("priority", "normal"),
            statutory_due_date=arguments.get("statutory_due_date"),
            service_id=arguments.get("service_id"),
            financial_year_id=arguments.get("financial_year_id"),
            tags=",".join(arguments.get("tags") or []),
            status="not_started",
            filing_status="not_required",
        )
        db.add(task)
        db.commit()
        db.refresh(task)

        return json.dumps({
            "id": str(task.id),
            "task_code": task.task_code,
            "title": task.title,
            "status": task.status,
        })
    finally:
        db.close()


async def _tool_list_fy(db, arguments: dict[str, Any]) -> str:
    from app.models import FinancialYear
    from sqlalchemy import select, desc
    import json as j

    stmt = select(FinancialYear).order_by(desc(FinancialYear.start_date))
    if not arguments.get("include_closed"):
        stmt = stmt.where(FinancialYear.is_closed.is_(False))
    stmt = stmt.limit(10)

    rows = db.execute(stmt).scalars().all()
    return j.dumps([
        {
            "code": r.code,
            "name": r.name,
            "start_date": r.start_date.isoformat() if r.start_date else None,
            "end_date": r.end_date.isoformat() if r.end_date else None,
            "is_current": r.is_active,
            "is_closed": r.is_closed,
        }
        for r in rows
    ])


async def _tool_read_csv(db, arguments: dict[str, Any]) -> str:
    import csv as csv_module
    import json as j

    file_path = arguments.get("file_path")
    if not file_path:
        return j.dumps({"error": "file_path is required"})

    records: list[dict] = []
    with open(file_path, "r", encoding="utf-8") as f:
        reader = csv_module.DictReader(f)
        for row in reader:
            records.append(dict(row))

    return j.dumps({"records": records, "count": len(records)})


def get_session_manager() -> Any:
    """Build and cache the MCP Server instance (has session_manager property)."""
    global _session_manager, _starlette_app

    if _session_manager is not None:
        return _session_manager

    with _lock:
        if _session_manager is not None:
            return _session_manager

        from mcp.server import Server as MCPServer

        server = MCPServer(
            name=MCP_APP_NAME,
            version="1.0.0",
            on_list_tools=_handle_list_tools(),
            on_call_tool=_handle_call_tool(),
        )

        _session_manager = server

        asgi_app = server.streamable_http_app(
            streamable_http_path="/",
            stateless_http=True,
        )
        _starlette_app = asgi_app

        return _session_manager


def get_mcp_asgi_app():
    """Return the cached Starlette ASGI app for MCP."""
    if _starlette_app is None:
        get_session_manager()
    return _starlette_app


def get_mcp_session_manager():
    """Return the MCP StreamableHTTPSessionManager after streamable_http_app() is called."""
    if _session_manager is None:
        get_session_manager()
    return _session_manager._session_manager


def build_streamable_http_app(session_manager: Any | None = None) -> Any:
    """Return the cached Starlette ASGI app for MCP streaming HTTP transport."""
    global _starlette_app

    if _starlette_app is not None:
        return _starlette_app

    with _lock:
        if _starlette_app is not None:
            return _starlette_app

        get_session_manager()

        return _starlette_app
