"""MCP server mount — exposes tool definitions for the MCP client.

Provides:
  MCPMount              — Starlette Route + Mount constants
  get_session_manager() — lazily build and cache an MCP session manager
  build_streamable_http_app() — return the cached Starlette ASGI app
"""
from __future__ import annotations

import contextvars
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

_current_tenant_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "_current_tenant_id", default=None
)


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

    tools.append(Tool(
        name="list_users",
        description="List team members with their names, roles, departments, and workload summary.",
        inputSchema={
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Search by name or email"},
                "department": {"type": "string", "description": "Filter by department"},
                "group": {"type": "string", "description": "Filter by role group: partners, managers, seniors, articles, assistants"},
                "include_inactive": {"type": "boolean", "default": False},
                "limit": {"type": "integer", "default": 50},
            },
        },
    ))

    tools.append(Tool(
        name="get_user_overview",
        description="Get detailed workload and activity for a specific team member, including open tasks, overdue tasks, utilization, and clients.",
        inputSchema={
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "The user UUID"},
            },
            "required": ["user_id"],
        },
    ))

    tools.append(Tool(
        name="list_invoices",
        description="List invoices with client, status, dates, and amounts. Supports search by invoice number.",
        inputSchema={
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Search by invoice number"},
                "client_id": {"type": "string", "description": "Filter by client UUID"},
                "status": {"type": "string", "description": "Filter by status: draft, issued, paid, partially_paid, cancelled"},
                "limit": {"type": "integer", "default": 10},
            },
        },
    ))

    tools.append(Tool(
        name="get_receivables",
        description="Get the firm's receivables summary: total outstanding, overdue amounts, and breakdown by client.",
        inputSchema={
            "type": "object",
            "properties": {},
        },
    ))

    tools.append(Tool(
        name="update_task_status",
        description="Update a task's status (e.g., not_started, in_progress, ready_for_review, completed, etc.).",
        inputSchema={
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "The task UUID", "format": "uuid"},
                "status": {"type": "string", "description": "New status value (e.g., in_progress, ready_for_review, completed, filed, delivered)"},
            },
            "required": ["task_id", "status"],
        },
    ))

    tools.append(Tool(
        name="get_dashboard",
        description="Get the firm's dashboard summary: counts of clients, tasks by status, overdue items, receivables.",
        inputSchema={
            "type": "object",
            "properties": {},
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

    tenant_id = _current_tenant_id.get()
    if tenant_id is not None and isinstance(arguments, dict):
        arguments.setdefault("_tenant_id", tenant_id)

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
        elif name == "list_users":
            return await _tool_list_users(db, arguments)
        elif name == "get_user_overview":
            return await _tool_get_user_overview(db, arguments)
        elif name == "list_invoices":
            return await _tool_list_invoices(db, arguments)
        elif name == "get_receivables":
            return await _tool_get_receivables(db, arguments)
        elif name == "update_task_status":
            return await _tool_update_task_status(db, arguments)
        elif name == "get_dashboard":
            return await _tool_get_dashboard(db, arguments)
        else:
            return f"Unknown tool: {name}"
    finally:
        db.close()


async def _tool_list_clients(db, arguments: dict[str, Any]) -> str:
    from app.models import Client
    from sqlalchemy import select, or_, func

    stmt = select(Client)
    tenant_id = arguments.get("_tenant_id")
    if tenant_id:
        stmt = stmt.where(Client.tenant_id == tenant_id)
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

    tenant_id = arguments.get("_tenant_id")
    if tenant_id and str(client.tenant_id) != str(tenant_id):
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
    from app.models import Task, User
    from sqlalchemy import select
    import json as j

    stmt = select(Task)
    tenant_id = arguments.get("_tenant_id")
    if tenant_id:
        stmt = stmt.where(Task.tenant_id == tenant_id)
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

    # Collect all user IDs from tasks so we can resolve names in one query.
    user_ids: set = set()
    for r in rows:
        for uid in (r.preparer_id, r.reviewer_id, r.approver_id, r.filer_id):
            if uid:
                user_ids.add(uid)
    user_names: dict = {}
    if user_ids:
        name_rows = db.execute(
            select(User.id, User.full_name).where(User.id.in_(list(user_ids)))
        ).all()
        user_names = {uid: name for uid, name in name_rows}

    return j.dumps([
        {
            "id": str(r.id),
            "task_code": r.task_code,
            "title": r.title,
            "status": r.status,
            "category": r.category,
            "statutory_due_date": r.statutory_due_date.isoformat() if r.statutory_due_date else None,
            "progress_percent": r.progress_percent,
            "preparer_id": str(r.preparer_id) if r.preparer_id else None,
            "preparer_name": user_names.get(r.preparer_id, "Unassigned") if r.preparer_id else "Unassigned",
            "reviewer_name": user_names.get(r.reviewer_id) if r.reviewer_id else None,
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

    tenant_id = arguments.get("_tenant_id")
    if tenant_id and str(task.tenant_id) != str(tenant_id):
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
        "preparer_id": str(task.preparer_id) if task.preparer_id else None,
        "reviewer_id": str(task.reviewer_id) if task.reviewer_id else None,
        "progress_percent": task.progress_percent,
    })


async def _tool_create_task(db, arguments: dict[str, Any]) -> str:
    from app.models import Task
    import json
    from app.core.clock import today_local

    now = today_local()
    prefix = f"T{now.strftime('%y%m')}:"

    task = Task(
        tenant_id=arguments.get("_tenant_id", arguments.get("tenant_id", "00000000-0000-0000-0000-000000000000")),
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


async def _tool_list_fy(db, arguments: dict[str, Any]) -> str:
    from app.models import FinancialYear
    from sqlalchemy import select, desc
    import json as j

    stmt = select(FinancialYear).order_by(desc(FinancialYear.start_date))
    tenant_id = arguments.get("_tenant_id")
    if tenant_id:
        stmt = stmt.where(FinancialYear.tenant_id == tenant_id)
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


# ── New tools: users, billing, dashboard, task status ──────────────────

_GROUP_CODES: dict[str, set[str]] = {
    "partners": {"firm_owner", "partner", "branch_partner"},
    "managers": {"manager"},
    "seniors": {"senior_associate", "ca_senior"},
    "articles": {"article_assistant"},
    "assistants": {"accounts_staff", "accountant", "assistant"},
}


async def _tool_list_users(db, arguments: dict[str, Any]) -> str:
    from app.models import User
    from sqlalchemy import text
    import json as j

    stmt = text(
        "SELECT u.id, u.email, u.full_name, u.employee_code, u.designation, "
        "u.department, u.status, u.date_of_joining, u.weekly_capacity_hours, "
        "u.last_login_at, b.name AS branch_name "
        "FROM users u LEFT JOIN branches b ON b.id = u.branch_id "
        "WHERE u.deleted_at IS NULL"
    )
    params = {}

    tenant_id = arguments.get("_tenant_id")
    if tenant_id:
        stmt = text(str(stmt) + " AND u.tenant_id = :tenant_id")
        params["tenant_id"] = tenant_id

    search = arguments.get("search")
    if search:
        pat = f"%{search}%"
        stmt = text(str(stmt) + " AND (u.full_name ILIKE :s OR u.email ILIKE :s)")
        params["s"] = pat

    dept = arguments.get("department")
    if dept:
        stmt = text(str(stmt) + " AND u.department = :dept")
        params["dept"] = dept

    if not arguments.get("include_inactive"):
        stmt = text(str(stmt) + " AND u.status = 'active'")

    role_map: dict = {}
    group = arguments.get("group")

    rows = db.execute(stmt, params).fetchall()
    role_sql = "SELECT ur.user_id, r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id"
    if tenant_id:
        role_sql += " WHERE r.tenant_id = :tenant_id"
    role_rows = db.execute(text(role_sql), params).fetchall()
    for uid, code in role_rows:
        role_map.setdefault(str(uid), set()).add(code)

    open_per_user: dict = {}
    overdue_per_user: dict = {}
    task_sql = (
        "SELECT preparer_id, statutory_due_date, status FROM tasks "
        "WHERE status NOT IN ('completed','filed','delivered','cancelled')"
    )
    if tenant_id:
        task_sql += " AND tenant_id = :tenant_id"
    for t in db.execute(text(task_sql), params).fetchall():
        if t.preparer_id:
            uid = str(t.preparer_id)
            open_per_user[uid] = open_per_user.get(uid, 0) + 1

    limit = arguments.get("limit", 50)
    items = []
    for i, r in enumerate(rows[:limit]):
        roles = sorted(role_map.get(r.id, set()))
        codes = set(roles)
        group_name = None
        for gk, gv in _GROUP_CODES.items():
            if codes & gv:
                group_name = gk
                break
        items.append({
            "id": str(r.id),
            "email": r.email,
            "full_name": r.full_name,
            "employee_code": r.employee_code,
            "designation": r.designation,
            "department": r.department,
            "branch_name": r.branch_name,
            "status": r.status,
            "date_of_joining": r.date_of_joining.isoformat() if r.date_of_joining else None,
            "weekly_capacity_hours": int(r.weekly_capacity_hours) if r.weekly_capacity_hours else 40,
            "last_login_at": r.last_login_at.isoformat() if r.last_login_at else None,
            "group": group_name,
            "roles": roles,
            "open_tasks": open_per_user.get(r.id, 0),
        })

    return j.dumps({"users": items, "total": len(items)})


async def _tool_get_user_overview(db, arguments: dict[str, Any]) -> str:
    from app.models import User
    from sqlalchemy import text
    import json
    from datetime import date

    user_id = arguments.get("user_id")
    if not user_id:
        return json.dumps({"error": "user_id is required"})

    user = db.get(User, user_id)
    if user is None:
        return json.dumps({"error": f"User {user_id} not found"})

    cap = int(user.weekly_capacity_hours) if user.weekly_capacity_hours else 40
    uid = str(user.id)
    tenant_id = arguments.get("_tenant_id")
    today = date.today()

    load_rows = db.execute(text(
        "SELECT id, task_code, title, statutory_due_date, internal_due_date, "
        "estimated_hours, status FROM tasks "
        "WHERE (preparer_id = :uid OR reviewer_id = :uid OR approver_id = :uid) "
        "AND status NOT IN ('completed','filed','delivered','cancelled')"
        + (" AND tenant_id = :tenant_id" if tenant_id else "")
    ), {"uid": uid, **({"tenant_id": tenant_id} if tenant_id else {})}).fetchall()

    open_tasks = len(load_rows)
    overdue_tasks = 0
    weighted = 0.0
    for t in load_rows:
        due = t.statutory_due_date or t.internal_due_date
        if due and due < today:
            overdue_tasks += 1
        weighted += float(t.estimated_hours or 0)
    util = round((weighted / cap * 100), 1) if cap else 0.0

    client_sql = (
        "SELECT c.id, c.client_code, c.legal_name FROM clients c "
        "WHERE (c.partner_id = :uid OR c.manager_id = :uid)"
    )
    client_params = {"uid": uid}
    if tenant_id:
        client_sql += " AND c.tenant_id = :tenant_id"
        client_params["tenant_id"] = tenant_id
    clients = db.execute(text(client_sql), client_params).fetchall()

    activity_sql = (
        "SELECT h.id, h.created_at, h.to_status AS action, t.task_code "
        "FROM task_status_history h JOIN tasks t ON t.id = h.task_id "
        "WHERE h.changed_by_id = :uid"
    )
    activity_params = {"uid": uid}
    if tenant_id:
        activity_sql += " AND t.tenant_id = :tenant_id"
        activity_params["tenant_id"] = tenant_id
    activity_sql += " ORDER BY h.created_at DESC LIMIT 12"
    activity = db.execute(text(activity_sql), activity_params).fetchall()

    return json.dumps({
        "user_id": uid,
        "full_name": user.full_name,
        "email": user.email,
        "designation": user.designation,
        "department": user.department,
        "is_partner": user.is_partner,
        "workload": {
            "open_tasks": open_tasks,
            "overdue_tasks": overdue_tasks,
            "weighted_load_hours": round(weighted, 2),
            "capacity_hours": cap,
            "utilisation_percent": util,
        },
        "clients": [{"id": str(c.id), "code": c.client_code, "name": c.legal_name} for c in clients],
        "recent_activity": [{"task_code": a.task_code, "action": a.to_status, "created_at": a.created_at.isoformat() if a.created_at else None} for a in activity],
    })


async def _tool_list_invoices(db, arguments: dict[str, Any]) -> str:
    from app.models import Invoice
    from sqlalchemy import select
    import json as j

    stmt = select(Invoice)
    tenant_id = arguments.get("_tenant_id")
    if tenant_id:
        stmt = stmt.where(Invoice.tenant_id == tenant_id)
    search = arguments.get("search")
    if search:
        stmt = stmt.where(Invoice.invoice_number.like(f"%{search}%"))
    if arguments.get("client_id"):
        stmt = stmt.where(Invoice.client_id == arguments["client_id"])
    status = arguments.get("status")
    if status:
        stmt = stmt.where(Invoice.status == status)

    limit = arguments.get("limit", 10)
    stmt = stmt.order_by(Invoice.invoice_date.desc()).limit(limit)
    rows = db.execute(stmt).scalars().all()

    return j.dumps([
        {
            "id": str(r.id),
            "invoice_number": r.invoice_number,
            "status": r.status,
            "invoice_date": r.invoice_date.isoformat() if r.invoice_date else None,
            "due_date": r.due_date.isoformat() if r.due_date else None,
            "total": float(r.total) if r.total else 0,
            "amount_paid": float(r.amount_paid) if r.amount_paid else 0,
            "outstanding": float(r.outstanding) if r.outstanding else 0,
            "is_overdue": bool(r.is_overdue) if r.is_overdue else False,
            "client_id": str(r.client_id) if r.client_id else None,
        }
        for r in rows
    ])


async def _tool_get_receivables(db, arguments: dict[str, Any]) -> str:
    from app.models import Invoice
    from sqlalchemy import select, func
    from app.core.clock import today_local
    import json

    today = today_local()
    stmt = select(Invoice).where(
        Invoice.status.in_(["issued", "partially_paid"]),
        Invoice.amount_paid < Invoice.total,
    )
    tenant_id = arguments.get("_tenant_id")
    if tenant_id:
        stmt = stmt.where(Invoice.tenant_id == tenant_id)
    rows = db.execute(stmt).scalars().all()

    invoiced_total = 0.0
    outstanding_total = 0.0
    overdue_total = 0.0
    by_bucket: dict[str, float] = {}
    by_client: dict = {}

    for row in rows:
        outstanding = float(row.total) - float(row.amount_paid)
        invoiced_total += float(row.total)
        outstanding_total += outstanding
        days_overdue = (today - row.due_date).days if row.due_date else 0
        if days_overdue > 0:
            overdue_total += outstanding

        if days_overdue <= 0:
            bucket = "current"
        elif days_overdue <= 30:
            bucket = "1-30"
        elif days_overdue <= 60:
            bucket = "31-60"
        elif days_overdue <= 90:
            bucket = "61-90"
        else:
            bucket = "90+"
        by_bucket[bucket] = by_bucket.get(bucket, 0.0) + outstanding

        cid = str(row.client_id) if row.client_id else None
        c = by_client.setdefault(cid, {
            "client_id": cid,
            "client_name": row.client_name or row.client_code or None,
            "client_code": row.client_code,
            "invoice_count": 0, "billed": 0.0,
            "collected": 0.0, "outstanding": 0.0, "overdue_outstanding": 0.0,
            "worst_days_overdue": 0,
        })
        c["invoice_count"] += 1
        c["billed"] += float(row.total)
        c["collected"] += float(row.amount_paid)
        c["outstanding"] += outstanding
        if days_overdue > 0:
            c["overdue_outstanding"] += outstanding
        if days_overdue > c["worst_days_overdue"]:
            c["worst_days_overdue"] = days_overdue

    return json.dumps({
        "as_of": today.isoformat(),
        "invoiced_total": round(invoiced_total, 2),
        "outstanding_total": round(outstanding_total, 2),
        "overdue_total": round(overdue_total, 2),
        "ageing": {k: round(v, 2) for k, v in by_bucket.items()},
        "by_client": by_client.values(),
    })


async def _tool_update_task_status(db, arguments: dict[str, Any]) -> str:
    from app.models import Task
    import json

    task_id = arguments.get("task_id")
    status = arguments.get("status")
    if not task_id or not status:
        return json.dumps({"error": "task_id and status are required"})

    task = db.get(Task, task_id)
    if task is None:
        return json.dumps({"error": f"Task {task_id} not found"})

    tenant_id = arguments.get("_tenant_id")
    if tenant_id and str(task.tenant_id) != str(tenant_id):
        return json.dumps({"error": f"Task {task_id} not found"})

    valid_statuses = {
        "not_started", "assigned", "in_progress", "waiting_for_client",
        "waiting_for_internal", "ready_for_review", "changes_requested",
        "ready_for_approval", "approved", "ready_to_file", "filed",
        "delivered", "completed", "cancelled",
    }
    if status not in valid_statuses:
        return json.dumps({"error": f"Invalid status: {status}. Valid: {sorted(valid_statuses)}"})

    task.status = status
    db.commit()
    db.refresh(task)

    return json.dumps({
        "success": True, "task_id": task_id,
        "task_code": task.task_code, "title": task.title,
        "old_status": arguments.get("old_status", "unknown"),
        "new_status": status,
    })


async def _tool_get_dashboard(db, arguments: dict[str, Any]) -> str:
    from app.models import Client, Task, Invoice
    from sqlalchemy import func, select
    from app.core.clock import today_local
    import json
    from datetime import timedelta

    today = today_local()
    week_end = today + timedelta(days=14)

    tenant_id = arguments.get("_tenant_id")
    client_filter = [Client.tenant_id == tenant_id] if tenant_id else []
    task_filter = [Task.tenant_id == tenant_id] if tenant_id else []
    inv_filter = [Invoice.tenant_id == tenant_id] if tenant_id else []

    clients_total = db.execute(select(func.count()).select_from(Client).where(*client_filter)).scalar() or 0
    clients_active = db.execute(
        select(func.count()).select_from(Client).where(*client_filter, Client.status == "active")
    ).scalar() or 0

    open_statuses = ["completed", "filed", "delivered", "cancelled"]

    tasks_open = db.execute(
        select(func.count()).select_from(Task).where(*task_filter, Task.status.not_in(open_statuses))
    ).scalar() or 0
    tasks_completed = db.execute(
        select(func.count()).select_from(Task).where(*task_filter, Task.status == "completed")
    ).scalar() or 0
    tasks_overdue = db.execute(
        select(func.count()).select_from(Task).where(
            *task_filter,
            Task.statutory_due_date.is_not(None),
            Task.statutory_due_date < today,
            Task.status.not_in(open_statuses),
        )
    ).scalar() or 0
    tasks_due_this_week = db.execute(
        select(func.count()).select_from(Task).where(
            *task_filter,
            Task.statutory_due_date.is_not(None),
            Task.statutory_due_date >= today,
            Task.statutory_due_date < week_end,
            Task.status.not_in(open_statuses),
        )
    ).scalar() or 0
    awaiting_review = db.execute(
        select(func.count()).select_from(Task).where(*task_filter, Task.status == "ready_for_review")
    ).scalar() or 0

    inv_rows = db.execute(select(Invoice).where(*inv_filter, Invoice.status.in_(["issued", "partially_paid"]))).scalars().all()
    outstanding_total = sum(float(r.total) - float(r.amount_paid) for r in inv_rows)
    overdue_invoices = sum(1 for r in inv_rows if r.due_date and r.due_date < today and float(r.total) - float(r.amount_paid) > 0)

    status_rows = db.execute(
        select(Task.status, func.count().label("cnt")).where(*task_filter).group_by(Task.status)
    ).all()
    tasks_by_status = [{"status": s, "count": int(c)} for s, c in status_rows]

    return json.dumps({
        "clients_total": clients_total,
        "clients_active": clients_active,
        "tasks_open": tasks_open,
        "tasks_completed": tasks_completed,
        "tasks_overdue": tasks_overdue,
        "tasks_due_this_week": tasks_due_this_week,
        "awaiting_review": awaiting_review,
        "receivables_outstanding": round(outstanding_total, 2),
        "overdue_invoices": overdue_invoices,
        "tasks_by_status": tasks_by_status,
    })


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


def _extract_tenant_from_request(scope: dict) -> str | None:
    """Extract tenant_id from the bearer token in the ASGI request scope."""
    if scope.get("type") != "http":
        return None
    headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
    auth = headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    try:
        from app.core.security import decode_token
        payload = decode_token(token, expected_type="access")
        return payload.tenant_id
    except Exception:
        return None


class _TenantMiddleware:
    """ASGI middleware that resolves the caller's tenant_id from the bearer token
    and stores it in a context variable so MCP tools can filter by it."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        tenant_id = _extract_tenant_from_request(scope)
        if tenant_id is not None:
            token_var = _current_tenant_id.set(tenant_id)
        else:
            token_var = None
        try:
            await self.app(scope, receive, send)
        finally:
            if token_var is not None:
                _current_tenant_id.reset(token_var)


def build_streamable_http_app(session_manager: Any | None = None) -> Any:
    """Return the cached Starlette ASGI app for MCP streaming HTTP transport."""
    global _starlette_app

    if _starlette_app is not None:
        return _starlette_app

    with _lock:
        if _starlette_app is not None:
            return _starlette_app

        get_session_manager()

        # Wrap with tenant middleware so MCP tools receive tenant_id
        _starlette_app = _TenantMiddleware(_starlette_app)
        return _starlette_app
