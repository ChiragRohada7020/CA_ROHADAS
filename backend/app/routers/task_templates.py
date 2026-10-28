"""Task templates router — list templates (with their steps) for new-task scaffolding.

Endpoints:
  GET  /task-templates                 — paginated template list
  POST /task-templates                 — create a template (optionally with steps)
  GET  /task-templates/{template_id}   — template detail with steps
  PATCH /task-templates/{template_id}  — update a template
  DELETE /task-templates/{template_id} — delete a template (steps cascade)
  GET  /task-templates/{template_id}/steps
  POST /task-templates/{template_id}/steps
  PATCH /task-templates/{template_id}/steps/{step_id}
  DELETE /task-templates/{template_id}/steps/{step_id}
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from sqlalchemy import func, select

from app.core.db import get_db
from app.core.errors import NotFoundError
from app.core.security import get_current_user
from app.models import Service, TaskTemplate, TaskTemplateStep

router = APIRouter(tags=["task_templates"])


def _service_write_ok(principal: Any) -> bool:
    """A service's checklist is managed with service-level write access."""
    perms = principal.permissions
    return (
        "service.create" in perms
        or "service.update" in perms
        or "service.write" in perms
        or "*:*" in perms
    )


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


def _get_owned_template(db: Any, template_id: str, principal: Any) -> TaskTemplate:
    """Fetch a template by id, 404ing if it is missing or belongs to another tenant."""
    t = db.get(TaskTemplate, template_id)
    if t is None or str(t.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Task template {template_id} not found")
    return t


@router.post("/task-templates")
async def create_task_template(
    request: Request,
    payload: Any = Body(...),
    db: Any = Depends(get_db),
) -> Any:
    """Create a task template. A checklist can be supplied inline via `steps`,
    which is how the Add-service form seeds a brand-new service's checklist."""
    principal = await get_current_user(request, db)
    if not _service_write_ok(principal):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission 'service.create' or 'service.update' is required",
        )

    p = payload if isinstance(payload, dict) else payload.dict()

    # A template may be linked to a service, but only one the caller can see.
    service_id = p.get("service_id")
    if service_id:
        svc = db.get(Service, service_id)
        if svc is None or str(svc.tenant_id) != str(principal.tenant_id):
            raise NotFoundError(f"Service {service_id} not found")

    template = TaskTemplate(
        tenant_id=principal.tenant_id,
        service_id=service_id,
        workflow_template_id=p.get("workflow_template_id"),
        compliance_rule_id=p.get("compliance_rule_id"),
        code=p["code"],
        name=p["name"],
        description=p.get("description"),
        is_recurring=p.get("is_recurring", False),
        frequency=p.get("frequency"),
        default_priority=p.get("default_priority", "normal"),
        default_complexity=p.get("default_complexity", "moderate"),
        lead_days=p.get("lead_days", 14),
        estimated_hours=p.get("estimated_hours"),
        title_template=p.get("title_template"),
        is_active=p.get("is_active", True),
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    # Optional nested steps, supplied by the Add-service checklist builder.
    for idx, step in enumerate((p.get("steps") or []), start=1):
        db.add(TaskTemplateStep(
            template_id=template.id,
            sequence=step.get("sequence", idx),
            name=step["name"],
            description=step.get("description"),
            is_mandatory=step.get("is_mandatory", True),
            requires_review=step.get("requires_review", False),
            requires_approval=step.get("requires_approval", False),
            requires_filing=step.get("requires_filing", False),
            requires_document=step.get("requires_document", False),
            estimated_hours=step.get("estimated_hours"),
            role_hint=step.get("role_hint"),
        ))
    db.commit()
    db.refresh(template)
    return _template_row(template, db, include_steps=True)


@router.patch("/task-templates/{template_id}")
async def update_task_template(
    request: Request,
    template_id: str,
    payload: Any = Body(...),
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    if not _service_write_ok(principal):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission 'service.update' is required",
        )
    template = _get_owned_template(db, template_id, principal)

    p = payload if isinstance(payload, dict) else payload.dict()
    updatable = [
        "code", "name", "description", "is_recurring", "frequency", "default_priority",
        "default_complexity", "lead_days", "estimated_hours", "title_template", "is_active",
    ]
    for field in updatable:
        if field in p and p[field] is not None:
            setattr(template, field, p[field])
    db.commit()
    db.refresh(template)
    return _template_row(template, db, include_steps=True)


@router.delete("/task-templates/{template_id}")
async def delete_task_template(
    request: Request,
    template_id: str,
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    if not _service_write_ok(principal):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission 'service.update' is required",
        )
    template = _get_owned_template(db, template_id, principal)
    db.delete(template)
    db.commit()
    return {"id": str(template.id), "deleted": True}


@router.post("/task-templates/{template_id}/steps")
async def add_template_step(
    request: Request,
    template_id: str,
    payload: Any = Body(...),
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    if not _service_write_ok(principal):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission 'service.update' is required",
        )
    template = _get_owned_template(db, template_id, principal)

    p = payload if isinstance(payload, dict) else payload.dict()
    next_seq = (
        db.execute(
            select(func.max(TaskTemplateStep.sequence)).where(TaskTemplateStep.template_id == template_id)
        ).scalar() or 0
    ) + 1
    step = TaskTemplateStep(
        template_id=template.id,
        sequence=int(p.get("sequence", next_seq)),
        name=p["name"],
        description=p.get("description"),
        is_mandatory=p.get("is_mandatory", True),
        requires_review=p.get("requires_review", False),
        requires_approval=p.get("requires_approval", False),
        requires_filing=p.get("requires_filing", False),
        requires_document=p.get("requires_document", False),
        estimated_hours=p.get("estimated_hours"),
        role_hint=p.get("role_hint"),
    )
    db.add(step)
    db.commit()
    db.refresh(step)
    return _step_row(step)


@router.patch("/task-templates/{template_id}/steps/{step_id}")
async def update_template_step(
    request: Request,
    template_id: str,
    step_id: str,
    payload: Any = Body(...),
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    if not _service_write_ok(principal):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission 'service.update' is required",
        )
    _get_owned_template(db, template_id, principal)  # ensures the template exists & is owned

    step = db.get(TaskTemplateStep, step_id)
    if step is None or str(step.template_id) != str(template_id):
        raise NotFoundError(f"Step {step_id} not found")

    p = payload if isinstance(payload, dict) else payload.dict()
    updatable = [
        "name", "description", "sequence", "is_mandatory", "requires_review",
        "requires_approval", "requires_filing", "requires_document",
        "estimated_hours", "role_hint",
    ]
    for field in updatable:
        if field in p:
            setattr(step, field, p[field])
    db.commit()
    db.refresh(step)
    return _step_row(step)


@router.delete("/task-templates/{template_id}/steps/{step_id}")
async def delete_template_step(
    request: Request,
    template_id: str,
    step_id: str,
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    if not _service_write_ok(principal):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission 'service.update' is required",
        )
    _get_owned_template(db, template_id, principal)

    step = db.get(TaskTemplateStep, step_id)
    if step is None or str(step.template_id) != str(template_id):
        raise NotFoundError(f"Step {step_id} not found")
    db.delete(step)
    db.commit()
    return {"id": str(step.id), "deleted": True}
