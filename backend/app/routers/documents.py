"""Documents router — document management and requests.

Endpoints:
  GET  /documents              — paginated document list
  GET  /documents/summary      — document summary
  POST  /documents/request     — request a document from a client
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models import Document, DocumentVersion

router = APIRouter(tags=["documents"])


@router.get("/documents/summary")
async def get_document_summary(
    request: Request,
    client_id: str | None = None,
    doc_type: str | None = None,
    search: str | None = None,
    confidential_only: bool = False,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    stmt = select(Document).where(Document.tenant_id == tenant_id)
    if client_id:
        stmt = stmt.where(Document.client_id == client_id)

    rows = db.execute(stmt).scalars().all()

    status_counts = {}
    for r in rows:
        status_counts[r.status] = status_counts.get(r.status, 0) + 1

    return {
        "total_files": len(rows),
        "status_counts": status_counts,
    }


@router.get("/documents")
async def list_documents(
    request: Request,
    client_id: str | None = None,
    task_id: str | None = None,
    doc_type: str | None = None,
    search: str | None = None,
    confidential_only: bool = False,
    status: str | None = None,
    limit: int = 25,
    offset: int = 0,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    stmt = select(Document).where(Document.tenant_id == tenant_id)
    if client_id:
        stmt = stmt.where(Document.client_id == client_id)
    if task_id:
        stmt = stmt.where(Document.task_id == task_id)
    if doc_type:
        stmt = stmt.where(Document.doc_type == doc_type)
    if status:
        stmt = stmt.where(Document.status == status)

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar() or 0

    joined = (
        stmt.outerjoin(DocumentVersion, DocumentVersion.id == Document.current_version_id)
        .order_by(Document.created_at.desc())
        .limit(limit).offset(offset)
    )
    rows = db.execute(joined).all()

    items = []
    for r in rows:
        dv = r[1] if len(r) > 1 and r[1] is not None else None
        items.append({
            "id": str(r[0].id),
            "title": r[0].title,
            "doc_type": r[0].doc_type,
            "category": r[0].category,
            "status": r[0].status,
            "file_name": dv.file_name if dv else None,
            "size_bytes": int(dv.size_bytes) if dv and dv.size_bytes else None,
            "client_id": str(r[0].client_id) if r[0].client_id else None,
            "created_at": r[0].created_at.isoformat() if r[0].created_at else None,
            "updated_at": r[0].updated_at.isoformat() if r[0].updated_at else None,
            "description": r[0].description,
        })

    return {
        "items": items,
        "meta": {"total": total, "limit": limit, "offset": offset, "has_more": offset + len(items) < total},
    }


@router.post("/documents/request")
async def request_document(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    user_id = principal.id

    body = await request.json()

    result = db.execute(text(
        "INSERT INTO document_requests (tenant_id, client_id, title, description, doc_type, "
        "due_date, status, requested_by_id, reminder_count) "
        "VALUES (CAST(:tenant AS uuid), CAST(:client AS uuid), :title, :desc, :doctype, :due, "
        "CAST(:status AS document_request_status), CAST(:req AS uuid), :reminders) "
        "RETURNING id, status"
    ), {
        "tenant": str(tenant_id),
        "client": str(body.get("client_id")) if body.get("client_id") else None,
        "title": body.get("title", "") or "",
        "desc": body.get("description"),
        "doctype": body.get("doc_type"),
        "due": body.get("due_date"),
        "status": body.get("status") or "open",
        "req": str(user_id),
        "reminders": 0,
    })
    db.commit()
    row = result.fetchone()
    return {"id": str(row[0]), "status": row[1]}