"""Tasks router — CRUD, workflow transitions, assignments, steps, comments,
dependencies, work logs, and summary.

Endpoints:
  GET  /tasks/summary            — headline counts for the task list tabs
  GET  /tasks                    — paginated, filtered task list
  GET  /tasks/{task_id}          — task detail (steps, assignments, comments, …)
  PATCH /tasks/{task_id}         — partial field update
  POST  /tasks                   — create (optionally from a template)
  POST  /tasks/{task_id}/status  — workflow transition
  GET  /tasks/{task_id}/steps
  POST  /tasks/{task_id}/steps              — add a custom checklist step
  POST  /tasks/{task_id}/steps/{step_id}    — update a step's status
  POST  /tasks/{task_id}/comments
  GET  /tasks/{task_id}/comments
  POST  /tasks/{task_id}/dependencies
  GET  /tasks/{task_id}/dependencies
  GET  /tasks/{task_id}/work-logs
  POST  /tasks/{task_id}/work-logs
  PATCH /tasks/{task_id}/work-logs/{log_id}
  DELETE /tasks/{task_id}/work-logs/{log_id}
"""
from __future__ import annotations

import json
import uuid as _uuid
from datetime import date, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy import delete, func, or_, select, text, update

from app.core.clock import today_local
from app.core.db import get_db
from app.core.errors import BadRequestError, NotFoundError
from app.core.security import get_current_user
from app.models import (
    Client,
    Service,
    Task,
    TaskAssignment,
    TaskComment,
    TaskDependency,
    TaskStatusHistory,
    TaskStep,
    TaskTemplate,
    TaskTemplateStep,
    TaskWorkLog,
    User,
)
from app.services.task_workflow import (
    available_transitions,
    transition_task,
    validate_transition,
)

router = APIRouter(tags=["tasks"])

TERMINAL_STATUSES = {"completed", "filed", "delivered", "cancelled"}


def _to_date(value):
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None


def _today() -> date:
    t = today_local()
    if isinstance(t, datetime):
        return t.date()
    return t


def _task_to_list_row(t: Task, *, client_name, service_code, service_name) -> dict:
    today = _today()
    statutory = _to_date(t.statutory_due_date)
    is_overdue = bool(statutory and statutory < today and t.status not in TERMINAL_STATUSES)
    internal = _to_date(t.internal_due_date)
    due = statutory or internal
    days = (due - today).days if due else None
    next_action = None
    if t.status == "not_started" and (t.preparer_id is None):
        next_action = "Assign a preparer"
    elif t.status == "ready_for_review":
        next_action = "Send to reviewer"
    elif t.status == "ready_for_approval":
        next_action = "Send to approver"
    elif t.status == "ready_to_file":
        next_action = "File with the authority"
    elif t.status in ("in_progress", "assigned", "waiting_for_internal"):
        next_action = "Mark progress or transition status"
    return {
        "id": str(t.id),
        "task_code": t.task_code,
        "title": t.title,
        "client_id": str(t.client_id) if t.client_id else None,
        "client_name": client_name,
        "service_code": service_code,
        "service_name": service_name,
        "status": t.status,
        "approval_status": t.approval_status,
        "filing_status": t.filing_status,
        "priority": t.priority or "normal",
        "progress_percent": t.progress_percent,
        "internal_due_date": internal.isoformat() if internal else None,
        "statutory_due_date": statutory.isoformat() if statutory else None,
        "deadline_verified": bool(t.deadline_verified),
        "preparer_id": str(t.preparer_id) if t.preparer_id else None,
        "reviewer_id": str(t.reviewer_id) if t.reviewer_id else None,
        "approver_id": str(t.approver_id) if t.approver_id else None,
        "parent_task_id": str(t.parent_task_id) if t.parent_task_id else None,
        "period_key": t.period_key,
        "tags": list(t.tags) if t.tags else [],
        "task_type": t.task_type,
        "category": t.category,
        "is_overdue": is_overdue,
        "days_remaining": days,
        "next_action": next_action,
        "available_transitions": sorted(available_transitions(t.status)),
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def _completion_blockers(task: Task, db, pending_steps: bool, open_deps: bool) -> list[str]:
    blockers: list[str] = []
    if task.blocked_reason:
        blockers.append(task.blocked_reason)
    if pending_steps:
        blockers.append("Not all required checklist steps are complete")
    if open_deps:
        blockers.append("A predecessor task is not yet complete")
    return blockers


@router.get("/tasks/summary")
async def get_tasks_summary(
    request: Request,
    db: Any = Depends(get_db),
) -> Any:
    """Headline counts used by the task list tabs."""
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    user_id = principal.id

    today = _today()
    week_end = today + timedelta(days=7)

    total = db.execute(select(func.count()).select_from(Task).where(Task.tenant_id == tenant_id)).scalar() or 0
    my_tasks = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id, Task.preparer_id == user_id
    )).scalar() or 0
    awaiting_review = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id, Task.reviewer_id == user_id, Task.status == "ready_for_review"
    )).scalar() or 0
    awaiting_approval = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id, Task.approver_id == user_id, Task.status == "ready_for_approval"
    )).scalar() or 0
    my_blocked = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id, Task.preparer_id == user_id, Task.blocked_reason.is_not(None)
    )).scalar() or 0
    overdue = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id,
        Task.statutory_due_date.is_not(None),
        Task.statutory_due_date < func.current_date(),
        Task.status.not_in(list(TERMINAL_STATUSES)),
    )).scalar() or 0
    completed = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id, Task.status == "completed"
    )).scalar() or 0
    waiting_for_client = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id, Task.status == "waiting_for_client"
    )).scalar() or 0
    due_this_week = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id,
        Task.statutory_due_date.is_not(None),
        Task.statutory_due_date >= today,
        Task.statutory_due_date <= week_end,
        Task.status.not_in(list(TERMINAL_STATUSES)),
    )).scalar() or 0

    return {
        "all_tasks": total,
        "my_tasks": my_tasks,
        "awaiting_review": awaiting_review,
        "awaiting_approval": awaiting_approval,
        "my_blocked": my_blocked,
        "overdue": overdue,
        "completed": completed,
        "waiting_for_client": waiting_for_client,
        "due_this_week": due_this_week,
    }


@router.get("/tasks")
async def list_tasks(
    request: Request,
    search: str | None = None,
    status: str | None = None,
    client_id: str | None = None,
    preparer_id: str | None = None,
    assignee_id: str | None = None,
    mine: bool = False,
    open_only: bool = False,
    awaiting_review: bool = False,
    awaiting_approval: bool = False,
    blocked_only: bool = False,
    overdue_only: bool = False,
    due_after: str | None = None,
    due_before: str | None = None,
    service_id: str | None = None,
    priority: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Any = Depends(get_db),
) -> Any:
    """Paginated task list with filters."""
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    user_id = principal.id

    stmt = select(Task).where(Task.tenant_id == tenant_id)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(or_(Task.title.ilike(pattern), Task.task_code.ilike(pattern)))
    if status:
        stmt = stmt.where(Task.status == status)
    if client_id:
        stmt = stmt.where(Task.client_id == client_id)
    if service_id:
        stmt = stmt.where(Task.service_id == service_id)
    if priority:
        stmt = stmt.where(Task.priority == priority)
    if preparer_id or assignee_id:
        stmt = stmt.where(Task.preparer_id == (preparer_id or assignee_id))
    if mine:
        stmt = stmt.where(
            or_(
                Task.preparer_id == user_id,
                Task.reviewer_id == user_id,
                Task.approver_id == user_id,
            )
        )
    if awaiting_review:
        stmt = stmt.where(Task.reviewer_id == user_id, Task.status == "ready_for_review")
    if awaiting_approval:
        stmt = stmt.where(Task.approver_id == user_id, Task.status == "ready_for_approval")
    if blocked_only:
        stmt = stmt.where(Task.blocked_reason.is_not(None))
    if overdue_only:
        today = _today()
        stmt = stmt.where(
            Task.statutory_due_date.is_not(None),
            Task.statutory_due_date < today,
            Task.status.not_in(list(TERMINAL_STATUSES)),
        )
    if due_after:
        stmt = stmt.where(Task.statutory_due_date >= date.fromisoformat(due_after))
    if due_before:
        stmt = stmt.where(Task.statutory_due_date <= date.fromisoformat(due_before))
    if open_only:
        stmt = stmt.where(Task.status.not_in(list(TERMINAL_STATUSES)))

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar() or 0
    rows = db.execute(stmt.order_by(Task.created_at.desc()).limit(limit).offset(offset)).scalars().all()

    items = []
    for t in rows:
        client_name = None
        if t.client_id:
            c = db.get(Client, t.client_id)
            client_name = c.trade_name or c.legal_name or c.client_code if c else None
        service_code = None
        service_name = None
        if t.service_id:
            s = db.get(Service, t.service_id)
            if s:
                service_code = s.code
                service_name = s.name
        items.append(_task_to_list_row(t, client_name=client_name, service_code=service_code, service_name=service_name))

    return {
        "items": items,
        "meta": {"total": total, "limit": limit, "offset": offset, "has_more": offset + len(items) < total},
    }


@router.get("/tasks/{task_id}")
async def get_task(
    request: Request,
    task_id: UUID,
    db: Any = Depends(get_db),
) -> Any:
    """Task detail with assignments, steps, comments, status history, and dependencies."""
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    task = db.get(Task, task_id)
    if task is None or str(task.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Task {task_id} not found")

    client_name = None
    if task.client_id:
        c = db.get(Client, task.client_id)
        client_name = c.trade_name or c.legal_name or c.client_code if c else None
    service_code = None
    service_name = None
    if task.service_id:
        s = db.get(Service, task.service_id)
        if s:
            service_code = s.code
            service_name = s.name

    steps = db.execute(
        select(TaskStep).where(TaskStep.task_id == task_id).order_by(TaskStep.sequence)
    ).scalars().all()
    step_list = [
        {
            "id": str(s.id),
            "task_id": str(s.task_id),
            "sequence": s.sequence,
            "name": s.name,
            "description": s.description,
            "status": s.status or "pending",
            "is_mandatory": bool(s.is_mandatory),
            "requires_review": bool(s.requires_review),
            "requires_approval": bool(s.requires_approval),
            "requires_filing": bool(s.requires_filing),
            "requires_document": bool(s.requires_document),
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            "completed_by_id": str(s.completed_by_id) if s.completed_by_id else None,
            "notes": s.notes,
            "skip_reason": s.skip_reason,
        }
        for s in steps
    ]

    assignments = db.execute(
        select(TaskAssignment).where(TaskAssignment.task_id == task_id)
    ).scalars().all()
    assignment_list = []
    for a in assignments:
        user = db.get(User, a.user_id)
        assignment_list.append({
            "id": str(a.id),
            "task_id": str(a.task_id),
            "user_id": str(a.user_id),
            "user_name": user.full_name if user else None,
            "role_in_task": a.role_in_task,
            "is_active": bool(a.is_active),
            "assigned_at": a.assigned_at.isoformat() if a.assigned_at else None,
            "unassigned_at": a.unassigned_at.isoformat() if a.unassigned_at else None,
        })

    comments = db.execute(
        select(TaskComment).where(TaskComment.task_id == task_id).order_by(TaskComment.created_at.desc())
    ).scalars().all()
    comment_list = []
    for c in comments:
        author_name = None
        if c.author_user_id:
            u = db.get(User, c.author_user_id)
            author_name = u.full_name if u else None
        comment_list.append({
            "id": str(c.id),
            "task_id": str(c.task_id),
            "author_user_id": str(c.author_user_id) if c.author_user_id else None,
            "author_name": author_name if c.author_type != "system" else "System",
            "author_type": c.author_type or "user",
            "body": c.body,
            "visibility": c.visibility or "internal",
            "is_review_note": bool(c.is_review_note),
            "parent_comment_id": str(c.parent_comment_id) if c.parent_comment_id else None,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "edited_at": c.edited_at.isoformat() if c.edited_at else None,
        })

    history = db.execute(
        select(TaskStatusHistory).where(TaskStatusHistory.task_id == task_id)
        .order_by(TaskStatusHistory.created_at.desc())
    ).scalars().all()
    history_list = [
        {
            "id": str(h.id),
            "task_id": str(h.task_id),
            "from_status": h.from_status,
            "to_status": h.to_status,
            "approval_status": h.approval_status,
            "filing_status": h.filing_status,
            "progress_percent": h.progress_percent,
            "changed_by_id": str(h.changed_by_id) if h.changed_by_id else None,
            "actor_type": h.actor_type or "user",
            "reason": h.reason,
            "created_at": h.created_at.isoformat() if h.created_at else None,
        }
        for h in history
    ]

    pending_steps = any(s.is_mandatory and s.status not in ("completed", "skipped", "not_applicable") for s in steps)
    open_deps = db.execute(select(func.count()).select_from(TaskDependency).where(
        TaskDependency.task_id == task_id
    )).scalar() > 0

    today = _today()
    statutory = _to_date(task.statutory_due_date)
    is_overdue = bool(statutory and statutory < today and task.status not in TERMINAL_STATUSES)

    parent_task_id = str(task.parent_task_id) if task.parent_task_id else None
    parent_task_code = None
    parent_task_title = None
    if task.parent_task_id:
        p = db.get(Task, task.parent_task_id)
        if p:
            parent_task_code = p.task_code
            parent_task_title = p.title

    subtasks = db.execute(
        select(Task).where(Task.parent_task_id == task.id).order_by(Task.created_at.desc())
    ).scalars().all()
    sub_list = [_task_to_list_row(t, client_name=client_name, service_code=service_code,
                                  service_name=service_name) for t in subtasks]

    internal = _to_date(task.internal_due_date)
    statutory = _to_date(task.statutory_due_date)
    due = statutory or internal
    days_remaining = (due - _today()).days if due else None

    next_action = None
    if task.status == "ready_for_review":
        next_action = "Send to reviewer"
    elif task.status == "ready_for_approval":
        next_action = "Send to approver"
    elif task.status == "ready_to_file":
        next_action = "File with the authority"
    elif task.status in TERMINAL_STATUSES:
        next_action = None
    elif pending_steps:
        next_action = "Complete checklist steps"
    elif open_deps:
        next_action = "Resolve task dependencies"

    return {
        "id": str(task.id),
        "tenant_id": str(task.tenant_id),
        "task_code": task.task_code,
        "client_id": str(task.client_id) if task.client_id else None,
        "client_name": client_name,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "approval_status": task.approval_status,
        "filing_status": task.filing_status,
        "priority": task.priority or "normal",
        "complexity": task.complexity,
        "task_type": task.task_type,
        "category": task.category,
        "sub_category": task.sub_category,
        "progress_percent": task.progress_percent,
        "start_date": task.start_date.isoformat() if task.start_date else None,
        "internal_due_date": internal.isoformat() if internal else None,
        "statutory_due_date": statutory.isoformat() if statutory else None,
        "deadline_verified": bool(task.deadline_verified),
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "filed_at": task.filed_at.isoformat() if task.filed_at else None,
        "delivered_at": task.delivered_at.isoformat() if task.delivered_at else None,
        "estimated_hours": task.estimated_hours,
        "actual_hours": task.actual_hours,
        "blocked_reason": task.blocked_reason,
        "delay_reason": task.delay_reason,
        "preparer_id": str(task.preparer_id) if task.preparer_id else None,
        "reviewer_id": str(task.reviewer_id) if task.reviewer_id else None,
        "approver_id": str(task.approver_id) if task.approver_id else None,
        "filer_id": str(task.filer_id) if task.filer_id else None,
        "legal_entity_id": str(task.legal_entity_id) if task.legal_entity_id else None,
        "engagement_id": str(task.engagement_id) if task.engagement_id else None,
        "service_id": str(task.service_id) if task.service_id else None,
        "service_code": service_code,
        "service_name": service_name,
        "financial_year_id": str(task.financial_year_id) if task.financial_year_id else None,
        "branch_id": str(task.branch_id) if task.branch_id else None,
        "template_id": str(task.template_id) if task.template_id else None,
        "compliance_rule_id": str(task.compliance_rule_id) if task.compliance_rule_id else None,
        "is_recurring": bool(task.is_recurring),
        "recurrence_frequency": task.recurrence_frequency,
        "recurrence_end_date": task.recurrence_end_date.isoformat() if task.recurrence_end_date else None,
        "create_next_period": bool(task.create_next_period),
        "reminder_date": task.reminder_date.isoformat() if task.reminder_date else None,
        "parent_task_id": parent_task_id,
        "parent_task_code": parent_task_code,
        "parent_task_title": parent_task_title,
        "period_key": task.period_key,
        "tags": list(task.tags) if task.tags else [],
        "review_round": task.review_round,
        "escalation_level": task.escalation_level,
        "days_remaining": days_remaining,
        "is_overdue": is_overdue,
        "next_action": next_action,
        "available_transitions": sorted(available_transitions(task.status)),
        "completion_blockers": _completion_blockers(task, db, pending_steps, open_deps),
        "steps": step_list,
        "assignments": assignment_list,
        "comments": comment_list,
        "status_history": history_list,
        "subtasks": sub_list,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    }


@router.patch("/tasks/{task_id}")
async def update_task(
    request: Request,
    task_id: str,
    db: Any = Depends(get_db),
    payload: Any = Body(...),
) -> Any:
    """Update task fields (partial)."""
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    task = db.get(Task, task_id)
    if task is None or str(task.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Task {task_id} not found")

    allowed_fields = {
        "title", "description", "status", "approval_status", "filing_status",
        "priority", "complexity", "task_type", "category", "sub_category",
        "progress_percent", "start_date", "internal_due_date", "statutory_due_date",
        "deadline_verified", "estimated_hours", "actual_hours",
        "blocked_reason", "delay_reason", "preparer_id", "reviewer_id", "approver_id",
        "filer_id", "client_id", "service_id", "period_key", "tags",
    }

    for key, value in payload.items():
        if key not in allowed_fields or value is None:
            continue
        if key in ("start_date", "internal_due_date", "statutory_due_date", "reminder_date"):
            try:
                value = date.fromisoformat(value)
            except (ValueError, TypeError):
                continue
        setattr(task, key, value)

    db.commit()
    db.refresh(task)
    return {"id": str(task.id), "status": task.status}


@router.post("/tasks")
async def create_task(
    request: Request,
    db: Any = Depends(get_db),
    payload: Any = Body(...),
) -> Any:
    """Create a new task. Copies template steps when a template is supplied."""
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    user_id = principal.id

    def _id(v):
        if v is None:
            return None
        if isinstance(v, _uuid.UUID):
            return v
        return _uuid.UUID(str(v))

    today = today_local()
    task_code = payload.get("task_code") or f"T-{today.strftime('%Y%m%d')}-{_uuid.uuid4().hex[:6].upper()}"

    tags = payload.get("tags")
    tags_json = json.dumps(tags) if tags is not None else None
    recurrence = payload.get("recurrence_frequency")

    stmt = text(
        "INSERT INTO tasks (tenant_id, task_code, client_id, title, description, status, "
        " approval_status, filing_status, priority, complexity, task_type, category, "
        " sub_category, progress_percent, start_date, internal_due_date, statutory_due_date, "
        " deadline_verified, estimated_hours, preparer_id, reviewer_id, approver_id, filer_id, "
        " legal_entity_id, engagement_id, service_id, template_id, compliance_rule_id, "
        " financial_year_id, period_key, parent_task_id, tags, is_recurring, "
        " recurrence_frequency, recurrence_end_date, create_next_period, reminder_date, "
        " created_by_id, updated_by_id) "
        "VALUES (CAST(:tenant AS uuid), :code, CAST(:client AS uuid), :title, :desc, :status, "
        " :approval, :filing, :priority, :complexity, :type, :category, :subcat, :progress, "
        " :start, :internal, :statutory, :verified, :est, CAST(:prep AS uuid), CAST(:rev AS uuid), "
        " CAST(:appr AS uuid), CAST(:filer AS uuid), CAST(:legal AS uuid), CAST(:eng AS uuid), "
        " CAST(:svc AS uuid), CAST(:tmpl AS uuid), CAST(:comp AS uuid), CAST(:fy AS uuid), "
        " :period, CAST(:parent AS uuid), CAST(:tags AS jsonb), :recurring, "
        " CAST(:freq AS frequency), :rec_end, :next_period, :reminder, "
        " CAST(:creator AS uuid), CAST(:updater AS uuid)) "
        "RETURNING id"
    )
    result = db.execute(stmt, {
        "tenant": _id(tenant_id), "code": task_code, "client": _id(payload.get("client_id")),
        "title": payload.get("title", payload.get("task_code") or "Untitled task"),
        "desc": payload.get("description"),
        "status": payload.get("status", "not_started"),
        "approval": payload.get("approval_status", "not_required"),
        "filing": payload.get("filing_status", "not_required"),
        "priority": payload.get("priority", "normal"),
        "complexity": payload.get("complexity", "moderate"),
        "type": payload.get("task_type", "regular"),
        "category": payload.get("category"), "subcat": payload.get("sub_category"),
        "progress": payload.get("progress_percent", 0),
        "start": payload.get("start_date"), "internal": payload.get("internal_due_date"),
        "statutory": payload.get("statutory_due_date"),
        "verified": payload.get("deadline_verified", False),
        "est": payload.get("estimated_hours"),
        "prep": _id(payload.get("preparer_id", user_id)),
        "rev": _id(payload.get("reviewer_id")), "appr": _id(payload.get("approver_id")),
        "filer": _id(payload.get("filer_id")), "legal": _id(payload.get("legal_entity_id")),
        "eng": _id(payload.get("engagement_id")), "svc": _id(payload.get("service_id")),
        "tmpl": _id(payload.get("template_id")), "comp": _id(payload.get("compliance_rule_id")),
        "fy": _id(payload.get("financial_year_id")), "period": payload.get("period_key"),
        "parent": _id(payload.get("parent_task_id")),
        "tags": tags_json, "recurring": payload.get("is_recurring", False),
        "freq": recurrence, "rec_end": payload.get("recurrence_end_date"),
        "next_period": payload.get("create_next_period", False),
        "reminder": payload.get("reminder_date"),
        "creator": _id(user_id), "updater": _id(user_id),
    })
    task_id = result.fetchone()[0]
    task = db.get(Task, task_id)

    template_id = payload.get("template_id")
    template_steps = []
    if template_id:
        template = db.get(TaskTemplate, template_id)
        if template:
            template_steps = db.execute(
                select(TaskTemplateStep).where(TaskTemplateStep.template_id == template_id)
                .order_by(TaskTemplateStep.sequence)
            ).scalars().all()
        for ts in template_steps:
            db.execute(text(
                "INSERT INTO task_steps (tenant_id, task_id, sequence, name, description, "
                " status, is_mandatory, requires_review, requires_approval, requires_filing, "
                " requires_document) "
                "VALUES (CAST(:tenant AS uuid), CAST(:task AS uuid), :seq, :name, :desc, :status, "
                " :mandatory, :review, :approval, :filing, :document)"
            ), {
                "tenant": str(task.tenant_id), "task": str(task.id),
                "seq": ts.sequence, "name": ts.name, "desc": ts.description, "status": "pending",
                "mandatory": bool(ts.is_mandatory), "review": bool(ts.requires_review),
                "approval": bool(ts.requires_approval), "filing": bool(ts.requires_filing),
                "document": bool(ts.requires_document),
            })

    db.commit()
    db.refresh(task)

    db.commit()
    db.refresh(task)

    return {
        "id": str(task.id),
        "task_code": task.task_code,
        "status": task.status,
        "title": task.title,
        "client_id": str(task.client_id) if task.client_id else None,
    }


@router.post("/tasks/{task_id}/status")
async def transition_task_status(
    request: Request,
    task_id: str,
    db: Any = Depends(get_db),
    payload: Any = Body(...),
) -> Any:
    """Transition a task to a new workflow status."""
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    user_id = principal.id

    task = db.get(Task, task_id)
    if task is None or str(task.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Task {task_id} not found")

    new_status = payload.get("status")
    reason = payload.get("reason")

    if not new_status:
        raise BadRequestError("Missing 'status' field", code="missing_status")

    if not validate_transition(task.status, new_status):
        raise BadRequestError(
            f"Cannot transition from '{task.status}' to '{new_status}'",
            code="invalid_transition",
        )

    updated = transition_task(db, task, new_status, actor_id=user_id, reason=reason)

    return {
        "id": str(updated.id),
        "status": updated.status,
        "from_status": task.status,
        "to_status": new_status,
        "completed_at": updated.completed_at.isoformat() if updated.completed_at else None,
    }


def _resolve_task_step(task_id: str, step_or_template_id: str, db):
    """Return the TaskStep matching a task_step id, else one matching a template step id by sequence."""
    step = db.get(TaskStep, step_or_template_id)
    if step is not None and str(step.task_id) == str(task_id):
        return step
    # Treat as a template step id; match by sequence.
    template_step = db.get(TaskTemplateStep, step_or_template_id)
    if template_step is not None:
        ts = db.execute(select(TaskStep).where(
            TaskStep.task_id == task_id,
            TaskStep.sequence == template_step.sequence,
        )).scalars().first()
        if ts is not None:
            return ts
    return None


@router.get("/tasks/{task_id}/steps")
async def list_task_steps(
    request: Request,
    task_id: str,
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    task = db.get(Task, task_id)
    if task is None or str(task.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Task {task_id} not found")
    steps = db.execute(
        select(TaskStep).where(TaskStep.task_id == task_id).order_by(TaskStep.sequence)
    ).scalars().all()
    return {
        "items": [
            {
                "id": str(s.id),
                "task_id": str(s.task_id),
                "sequence": s.sequence,
                "name": s.name,
                "description": s.description,
                "status": s.status or "pending",
                "is_mandatory": bool(s.is_mandatory),
                "requires_review": bool(s.requires_review),
                "requires_approval": bool(s.requires_approval),
                "requires_filing": bool(s.requires_filing),
                "requires_document": bool(s.requires_document),
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
                "completed_by_id": str(s.completed_by_id) if s.completed_by_id else None,
                "notes": s.notes,
                "skip_reason": s.skip_reason,
            }
            for s in steps
        ],
    }


@router.post("/tasks/{task_id}/steps")
async def create_task_step(
    request: Request,
    task_id: str,
    db: Any = Depends(get_db),
    payload: Any = Body(...),
) -> Any:
    principal = await get_current_user(request, db)
    task = db.get(Task, task_id)
    if task is None or str(task.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Task {task_id} not found")
    seq = db.execute(select(func.max(TaskStep.sequence)).where(TaskStep.task_id == task_id).select_from(TaskStep)).scalar() or 0
    db.execute(text(
        "INSERT INTO task_steps (tenant_id, task_id, sequence, name, description, "
        " status, is_mandatory, requires_review, requires_approval, requires_filing, "
        " requires_document) "
        "VALUES (CAST(:tenant AS uuid), CAST(:task AS uuid), :seq, :name, :desc, :status, "
        " :mandatory, :review, :approval, :filing, :document)"
    ), {
        "tenant": str(task.tenant_id), "task": str(task.id),
        "seq": seq + 1,
        "name": payload.get("name", ""),
        "desc": payload.get("description"),
        "status": "pending",
        "mandatory": bool(payload.get("is_mandatory", False)),
        "review": bool(payload.get("requires_review", False)),
        "approval": bool(payload.get("requires_approval", False)),
        "filing": bool(payload.get("requires_filing", False)),
        "document": bool(payload.get("requires_document", False)),
    })
    db.commit()
    return {"id": str(task.id), "sequence": seq + 1, "status": "pending"}


@router.post("/tasks/{task_id}/steps/{step_id}")
async def update_task_step(
    request: Request,
    task_id: str,
    step_id: str,
    db: Any = Depends(get_db),
    payload: Any = Body(...),
) -> Any:
    principal = await get_current_user(request, db)
    task = db.get(Task, task_id)
    if task is None or str(task.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Task {task_id} not found")

    step = _resolve_task_step(task_id, step_id, db)
    if step is None:
        raise NotFoundError(f"Step {step_id} not found on task {task_id}")

    new_status = payload.get("status")
    notes = payload.get("notes")

    if new_status:
        clauses = "status = CAST(:status AS task_step_status)"
        params = {"status": new_status}
        if new_status == "completed":
            clauses += ", completed_at = :completed_at, completed_by_id = CAST(:actor AS uuid)"
            params["completed_at"] = datetime.utcnow()
            params["actor"] = str(principal.id)
    else:
        clauses = ""
        params = {}
    if notes is not None:
        clauses += (", notes = :notes" if clauses else "notes = :notes")
        params["notes"] = notes
    db.execute(
        text("UPDATE task_steps SET " + clauses + " WHERE id = CAST(:sid AS uuid)"),
        {**params, "sid": str(step.id)},
    )
    db.commit()
    db.refresh(step)
    return {"id": str(step.id), "status": step.status, "completed_at": step.completed_at.isoformat() if step.completed_at else None}


@router.post("/tasks/{task_id}/comments")
async def add_task_comment(
    request: Request,
    task_id: str,
    db: Any = Depends(get_db),
    payload: Any = Body(...),
) -> Any:
    principal = await get_current_user(request, db)
    task = db.get(Task, task_id)
    if task is None or str(task.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Task {task_id} not found")
    visibility = payload.get("visibility") or "internal"
    db.execute(text(
        "INSERT INTO task_comments (tenant_id, task_id, author_user_id, author_type, "
        " body, visibility, is_review_note, parent_comment_id) "
        "VALUES (CAST(:tenant AS uuid), CAST(:task AS uuid), CAST(:author AS uuid), :author_type, "
        " :body, CAST(:visibility AS comment_visibility), :review, :parent)"
    ).bindparams(
        tenant=str(task.tenant_id),
        task=str(task.id),
        author=str(principal.id),
        author_type="user",
        body=payload.get("body", payload.get("content", "")),
        visibility=visibility,
        review=bool(payload.get("is_review_note", False)),
        parent=payload.get("parent_comment_id"),
    ))
    db.commit()
    return {"task_id": str(task.id), "status": "ok"}


@router.get("/tasks/{task_id}/dependencies")
async def list_task_dependencies(
    request: Request,
    task_id: str,
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    task = db.get(Task, task_id)
    if task is None or str(task.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Task {task_id} not found")
    deps = db.execute(select(TaskDependency).where(TaskDependency.task_id == task_id)).scalars().all()
    items = []
    for d in deps:
        other = db.get(Task, d.depends_on_task_id)
        items.append({
            "id": str(d.id),
            "task_id": str(d.task_id),
            "depends_on_task_id": str(d.depends_on_task_id),
            "depends_on_task_code": other.task_code if other else None,
            "depends_on_task_title": other.title if other else None,
            "dependency_type": d.dependency_type or "finish_to_start",
            "notes": d.notes,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        })
    return {"items": items}


@router.post("/tasks/{task_id}/dependencies")
async def add_task_dependency(
    request: Request,
    task_id: str,
    db: Any = Depends(get_db),
    payload: Any = Body(...),
) -> Any:
    principal = await get_current_user(request, db)
    task = db.get(Task, task_id)
    if task is None or str(task.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Task {task_id} not found")
    depends_on = payload.get("depends_on_task_id")
    if not depends_on:
        raise BadRequestError("Missing 'depends_on_task_id'", code="missing_field")
    other = db.get(Task, depends_on)
    if other is None or str(other.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Dependency target task {depends_on} not found")
    db.execute(text(
        "INSERT INTO task_dependencies (tenant_id, task_id, depends_on_task_id, "
        " dependency_type, notes) "
        "VALUES (CAST(:tenant AS uuid), CAST(:task AS uuid), CAST(:other AS uuid), "
        " :deptype, :notes)"
    ), {
        "tenant": str(principal.tenant_id), "task": str(task.id),
        "other": str(other.id),
        "deptype": payload.get("dependency_type", "finish_to_start"),
        "notes": payload.get("notes"),
    })
    db.commit()
    return {"task_id": str(task.id), "depends_on_task_id": str(other.id), "status": "linked"}


@router.get("/tasks/{task_id}/work-logs")
async def list_work_logs(
    request: Request,
    task_id: str,
    limit: int = 50,
    offset: int = 0,
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    task = db.get(Task, task_id)
    if task is None or str(task.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Task {task_id} not found")
    rows = db.execute(select(TaskWorkLog).where(TaskWorkLog.task_id == task_id)
                      .order_by(TaskWorkLog.work_date.desc()).limit(limit).offset(offset)).scalars().all()
    items = []
    for r in rows:
        u = db.get(User, r.user_id)
        items.append({
            "id": str(r.id),
            "task_id": str(r.task_id),
            "user_id": str(r.user_id),
            "user_name": u.full_name if u else None,
            "work_date": r.work_date.isoformat() if hasattr(r.work_date, "isoformat") else r.work_date,
            "hours": float(r.hours),
            "description": r.description,
            "activity_type": r.activity_type or "work",
            "is_billable": bool(r.is_billable),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    total = db.execute(select(func.count()).select_from(TaskWorkLog).where(TaskWorkLog.task_id == task_id)).scalar() or 0
    return {"items": items, "meta": {"total": total, "limit": limit, "offset": offset}}


@router.post("/tasks/{task_id}/work-logs")
async def add_work_log(
    request: Request,
    task_id: str,
    db: Any = Depends(get_db),
    payload: Any = Body(...),
) -> Any:
    principal = await get_current_user(request, db)
    task = db.get(Task, task_id)
    if task is None or str(task.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Task {task_id} not found")
    work_date = payload.get("work_date") or datetime.utcnow().date()
    if isinstance(work_date, str):
        work_date = date.fromisoformat(work_date)
    db.execute(text(
        "INSERT INTO task_work_logs (tenant_id, task_id, user_id, work_date, hours, "
        " description, activity_type, is_billable) "
        "VALUES (CAST(:tenant AS uuid), CAST(:task AS uuid), CAST(:user AS uuid), :work_date, :hours, "
        " :desc, :activity, :billable)"
    ), {
        "tenant": str(principal.tenant_id), "task": str(task.id),
        "user": str(principal.id),
        "work_date": work_date, "hours": float(payload.get("hours", 0) or 0),
        "desc": payload.get("description"),
        "activity": payload.get("activity_type", "work"),
        "billable": bool(payload.get("is_billable", True)),
    })
    db.commit()
    return {"task_id": str(task.id), "status": "logged"}


@router.patch("/tasks/{task_id}/work-logs/{log_id}")
async def update_work_log(
    request: Request,
    task_id: str,
    log_id: str,
    db: Any = Depends(get_db),
    payload: Any = Body(...),
) -> Any:
    principal = await get_current_user(request, db)
    log = db.get(TaskWorkLog, log_id)
    if log is None or str(log.task_id) != str(task_id):
        raise NotFoundError("Work log not found")
    task = db.get(Task, task_id)
    if task is None or str(task.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Task {task_id} not found")
    stmt = update(TaskWorkLog).where(TaskWorkLog.id == log_id)
    if payload.get("hours") is not None:
        stmt = stmt.values(hours=float(payload["hours"]))
    if payload.get("description") is not None:
        stmt = stmt.values(description=payload["description"])
    if payload.get("work_date") is not None:
        stmt = stmt.values(work_date=date.fromisoformat(payload["work_date"]))
    if payload.get("activity_type") is not None:
        stmt = stmt.values(activity_type=payload["activity_type"])
    if payload.get("is_billable") is not None:
        stmt = stmt.values(is_billable=bool(payload["is_billable"]))
    db.execute(stmt)
    db.commit()
    return {"id": str(log_id), "status": "updated"}


@router.delete("/tasks/{task_id}/work-logs/{log_id}")
async def delete_work_log(
    request: Request,
    task_id: str,
    log_id: str,
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    log = db.get(TaskWorkLog, log_id)
    if log is None or str(log.task_id) != str(task_id):
        raise NotFoundError("Work log not found")
    task = db.get(Task, task_id)
    if task is None or str(task.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Task {task_id} not found")
    db.execute(delete(TaskWorkLog).where(TaskWorkLog.id == log_id))
    db.commit()
    return {"id": str(log_id), "status": "deleted"}
