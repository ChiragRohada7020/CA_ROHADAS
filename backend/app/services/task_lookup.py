"""Task lookup service — also serves as the MCP tool backend for task-related calls."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import NotFoundError
from app.models import Task


def list_tasks(
    db: Session,
    *,
    client_id: str | None = None,
    status: str | None = None,
    limit: int = 100,
    tenant_id: str | None = None,
) -> list[Task]:
    stmt = select(Task)
    if tenant_id:
        stmt = stmt.where(Task.tenant_id == tenant_id)
    if client_id:
        stmt = stmt.where(Task.client_id == client_id)
    if status:
        stmt = stmt.where(Task.status == status)
    stmt = stmt.order_by(Task.created_at.desc()).limit(limit)
    return db.execute(stmt).scalars().all()


def get_task_detail(db: Session, task_id: str, tenant_id: str | None = None) -> Task:
    stmt = select(Task).where(Task.id == task_id)
    if tenant_id:
        stmt = stmt.where(Task.tenant_id == tenant_id)
    task = db.execute(stmt).scalar_one_or_none()
    if task is None:
        raise NotFoundError(f"Task {task_id} not found")
    return task


def create_task(
    db: Session,
    payload: Any,
    principal: Any | None = None,
) -> Task:
    task = Task(
        client_id=payload.client_id,
        title=payload.title,
        description=getattr(payload, "description", None),
        tenant_id=getattr(principal, "tenant_id", None) or (
            db.execute(select(Task.tenant_id).where(Task.id == payload.client_id).limit(1)).scalar()
            if False else None
        ),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


async def mcp_list_tasks(ctx: Any, **kwargs: Any) -> Any:
    from mcp.server import types

    db = next(get_db())
    try:
        results = list_tasks(db, **kwargs)
        return types.CallToolResult(
            content=[
                types.TextContent(
                    type="text",
                    text=f"Found {len(results)} task(s):\n"
                    + "\n".join(
                        f"- {t.title} (status: {t.status})"
                        for t in results
                    ),
                )
            ]
        )
    finally:
        db.close()


async def mcp_get_task(ctx: Any, **kwargs: Any) -> Any:
    from mcp.server import types

    db = next(get_db())
    try:
        result = get_task_detail(db, kwargs["task_id"])
        return types.CallToolResult(
            content=[
                types.TextContent(
                    type="text",
                    text=f"Task: {result.title}\nStatus: {result.status}\nDescription: {result.description or 'N/A'}",
                )
            ],
        )
    finally:
        db.close()


async def mcp_create_task(ctx: Any, **kwargs: Any) -> Any:
    from mcp.server import types
    from app.schemas import TaskCreatePayload

    db = next(get_db())
    try:
        payload = TaskCreatePayload(**kwargs)
        task = create_task(db, payload, principal=None)
        return types.CallToolResult(
            content=[
                types.TextContent(
                    type="text",
                    text=f"Created task '{task.title}' with ID {task.id}",
                )
            ],
        )
    finally:
        db.close()
