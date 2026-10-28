"""Notifications router.

Endpoints:
  GET  /notifications              — notification list
  GET  /notifications/unread-count — unread count for the current user
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import String, cast, func, select

from app.core.db import SessionLocal, get_db
from app.core.security import get_current_user
from app.models import Notification

router = APIRouter(tags=["notifications"])


@router.get("/notifications/unread-count")
async def get_unread_count(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    user_id = principal.id

    unread = db.execute(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.tenant_id == tenant_id,
            Notification.user_id == user_id,
            cast(Notification.status, String) == "unread",
        )
    ).scalar() or 0

    return {"unread": int(unread)}


@router.post("/notifications/mark-read")
async def mark_notifications_read(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    user_id = principal.id

    try:
        body = await request.json()
    except Exception:
        body = []

    ids = body if isinstance(body, list) else body.get("ids") if isinstance(body, dict) else []

    if not ids:
        return {"ok": True, "count": 0}

    from sqlalchemy import update

    stmt = (
        update(Notification)
        .where(
            Notification.tenant_id == tenant_id,
            Notification.user_id == user_id,
            Notification.id.in_([id if isinstance(id, str) else id for id in ids]),
        )
        .values(status="read", is_read=True, read_at=datetime.utcnow())
    )
    result = db.execute(stmt)
    db.commit()
    return {"ok": True, "count": result.rowcount or 0}