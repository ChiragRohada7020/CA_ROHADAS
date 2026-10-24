"""Notifications router.

Endpoints:
  GET  /notifications              — notification list
  GET  /notifications/unread-count — unread count for the current user
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select

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
            Notification.status == "unread",
        )
    ).scalar() or 0

    return {"unread": int(unread)}


@router.get("/notifications")
async def list_notifications(
    request: Request,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    user_id = principal.id

    rows = db.execute(
        select(Notification)
        .where(Notification.tenant_id == tenant_id, Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).scalars().all()

    return [
        {
            "id": str(n.id),
            "channel": n.channel,
            "title": n.title,
            "body": n.body,
            "status": n.status,
            "entity_type": n.entity_type,
            "entity_id": str(n.entity_id) if n.entity_id else None,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in rows
    ]