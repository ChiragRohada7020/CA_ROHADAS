"""Task templates router — list templates (with their steps) for new-task scaffolding.

Endpoints:
  GET /task-templates                 — paginated template list
  GET /task-templates/{template_id}   — template detail with steps
  GET /task-templates/{template_id}/steps
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select

from app.core.db import get_db
from app.core.errors import NotFoundError
from app.core.security import get_current_user
from app.models import Service, TaskTemplate, TaskTemplateStep

router = APIRouter(tags=["task_templates"])


def _step_row(s: TaskTemplateStep) -> dict:
    return {
        "id": str(s.id),
        "template_id": str(s.template_id),
        "sequence": s.sequence,
        "name": s.name,
        "description": s.description,
        "is_mandatory": bool(s.is_mandatory),
        "requires_review": bool(s.requires_review),
        "requires_approval": bool(s.requires_approval),
        "requires_filing": bool(s.requires_filing),
        "requires_document": bool(s.requires_document),
        "estimated_hours": s.estimated_hours,
        "role_hint": s.role_hint,
    }


def _template_row(t: TaskTemplate, db: Any, *, include_steps: bool) -> dict:
    service_code = None
    service_name = None
    if t.service_id:
        s = db.get(Service, t.service_id)
        if s:
            service_code = s.code
            service_name = s.name
    steps = []
    if include_steps:
        step_rows = db.execute(
            select(TaskTemplateStep).where(TaskTemplateStep.template_id == t.id)
            .order_by(TaskTemplateStep.sequence)
        ).scalars().all()
        steps = [_step_row(s) for s in step_rows]
    return {
        "id": str(t.id),
        "tenant_id": str(t.tenant_id),
        "service_id": str(t.service_id) if t.service_id else None,
        "service_code": service_code,
        "service_name": service_name,
        "workflow_template_id": str(t.workflow_template_id) if t.workflow_template_id else None,
        "compliance_rule_id": str(t.compliance_rule_id) if t.compliance_rule_id else None,
        "code": t.code,
        "name": t.name,
        "description": t.description,
        "is_recurring": bool(t.is_recurring),
        "frequency": t.frequency,
        "default_priority": t.default_priority,
        "default_complexity": t.default_complexity,
        "lead_days": t.lead_days,
        "estimated_hours": t.estimated_hours,
        "title_template": t.title_template,
        "is_active": bool(t.is_active),
        "steps": steps,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.get("/task-templates")
async def list_task_templates(
    request: Request,
    service_id: str | None = None,
    is_active: bool = True,
    limit: int = 200,
    offset: int = 0,
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    stmt = select(TaskTemplate).where(TaskTemplate.tenant_id == tenant_id)
    if service_id:
        stmt = stmt.where(TaskTemplate.service_id == service_id)
    if is_active:
        stmt = stmt.where(TaskTemplate.is_active.is_(True))

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar() or 0
    rows = db.execute(stmt.order_by(TaskTemplate.name).limit(limit).offset(offset)).scalars().all()
    return {
        "items": [_template_row(t, db, include_steps=False) for t in rows],
        "meta": {"total": total, "limit": limit, "offset": offset, "has_more": offset + len(rows) < total},
    }


@router.get("/task-templates/{template_id}")
async def get_task_template(
    request: Request,
    template_id: str,
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    t = db.get(TaskTemplate, template_id)
    if t is None or str(t.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Task template {template_id} not found")
    return _template_row(t, db, include_steps=True)


@router.get("/task-templates/{template_id}/steps")
async def get_template_steps(
    request: Request,
    template_id: str,
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    t = db.get(TaskTemplate, template_id)
    if t is None or str(t.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Task template {template_id} not found")
    rows = db.execute(
        select(TaskTemplateStep).where(TaskTemplateStep.template_id == template_id)
        .order_by(TaskTemplateStep.sequence)
    ).scalars().all()
    return [_step_row(s) for s in rows]
