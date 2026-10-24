"""Document requests router — list and create document requests tied to a task/client.

Endpoints:
  GET  /document-requests          — paginated list (filter by task_id / client_id)
  GET  /document-requests/missing  — requests still awaiting client documents
  POST /document-requests          — create a request
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy import func, select, text

from app.core.clock import today_local
from app.core.db import get_db
from app.core.security import get_current_user
from app.models import Client, DocumentRequest


def _today_local():
    t = today_local()
    if isinstance(t, datetime):
        return t.date()
    return t


def _coerce_date(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    return value

router = APIRouter(tags=["document_requests"])


def _row(r: DocumentRequest) -> dict:
    return {
        "id": str(r.id),
        "tenant_id": str(r.tenant_id),
        "client_id": str(r.client_id) if r.client_id else None,
        "task_id": str(r.task_id) if r.task_id else None,
        "engagement_id": str(r.engagement_id) if r.engagement_id else None,
        "financial_year_id": str(r.financial_year_id) if r.financial_year_id else None,
        "period_key": r.period_key,
        "title": r.title,
        "description": r.description,
        "doc_type": r.doc_type,
        "due_date": r.due_date.isoformat() if r.due_date else None,
        "status": r.status,
        "requested_by_id": str(r.requested_by_id) if r.requested_by_id else None,
        "reminder_count": r.reminder_count,
        "last_reminder_at": r.last_reminder_at.isoformat() if r.last_reminder_at else None,
        "fulfilled_at": r.fulfilled_at.isoformat() if r.fulfilled_at else None,
        "is_overdue": bool(
            r.due_date
            and _coerce_date(r.due_date) < _today_local()
            and r.status not in ("fulfilled", "cancelled")
        ),
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if getattr(r, "updated_at", None) else None,
    }


@router.get("/document-requests")
async def list_document_requests(
    request: Request,
    client_id: str | None = None,
    task_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    stmt = select(DocumentRequest).where(DocumentRequest.tenant_id == tenant_id)
    if client_id:
        stmt = stmt.where(DocumentRequest.client_id == client_id)
    if task_id:
        stmt = stmt.where(DocumentRequest.task_id == task_id)
    if status:
        stmt = stmt.where(DocumentRequest.status == status)

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar() or 0
    rows = db.execute(
        stmt.order_by(DocumentRequest.created_at.desc()).limit(limit).offset(offset)
    ).scalars().all()

    return {
        "items": [_row(r) for r in rows],
        "meta": {"total": total, "limit": limit, "offset": offset, "has_more": offset + len(rows) < total},
    }


@router.get("/document-requests/missing")
async def missing_document_requests(
    request: Request,
    client_id: str | None = None,
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    stmt = (
        select(DocumentRequest).where(DocumentRequest.tenant_id == tenant_id)
        .where(text(
            "status IN ('open'::document_request_status, 'partially_received'::document_request_status)"
        ))
    )
    if client_id:
        stmt = stmt.where(DocumentRequest.client_id == client_id)
    stmt = stmt.order_by(DocumentRequest.due_date.asc().nulls_last(), DocumentRequest.created_at.desc())
    rows = db.execute(stmt).scalars().all()
    return [_row(r) for r in rows]


@router.post("/document-requests")
async def create_document_request(
    request: Request,
    db: Any = Depends(get_db),
    payload: Any = Body(...),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    user_id = principal.id

    title = payload.get("title")
    if not title:
        raise HTTPException(422, "title is required")

    client_id = payload.get("client_id")
    if client_id:
        db.get(Client, client_id)

    result = db.execute(text(
        "INSERT INTO document_requests (tenant_id, client_id, task_id, engagement_id, "
        " financial_year_id, period_key, title, description, doc_type, due_date, status, "
        " requested_by_id, reminder_count) "
        "VALUES (CAST(:tenant AS uuid), CAST(:client AS uuid), CAST(:task AS uuid), "
        " CAST(:eng AS uuid), CAST(:fy AS uuid), :period, :title, :desc, :doctype, :due, "
        " CAST(:status AS document_request_status), CAST(:req AS uuid), :reminders) "
        "RETURNING id"
    ), {
        "tenant": str(tenant_id), "client": str(client_id) if client_id else None,
        "task": str(payload.get("task_id")) if payload.get("task_id") else None,
        "eng": str(payload.get("engagement_id")) if payload.get("engagement_id") else None,
        "fy": str(payload.get("financial_year_id")) if payload.get("financial_year_id") else None,
        "period": payload.get("period_key"), "title": title, "desc": payload.get("description"),
        "doctype": payload.get("doc_type"), "due": payload.get("due_date"),
        "status": payload.get("status") or "open", "req": str(user_id), "reminders": 0,
    })
    db.commit()
    new_id = result.fetchone()[0]
    created = db.get(DocumentRequest, new_id)
    if created:
        return _row(created)
    return {"id": str(new_id), "status": "pending"}
