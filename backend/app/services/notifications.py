"""Notification dispatch service.

Creates, queues, and marks as-read notifications across all channels
(in-app, email, WhatsApp, SMS). The actual delivery is handled by
Celery workers; this module is responsible for the data layer.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models import Notification


def get_unread_count(db: Session, user_id: str | None = None, tenant_id: str | None = None) -> int:
    stmt = select(func.count(Notification.id)).where(Notification.status != "read")
    if user_id:
        stmt = stmt.where(Notification.user_id == user_id)
    if tenant_id:
        stmt = stmt.where(Notification.tenant_id == tenant_id)
    return db.execute(stmt).scalar() or 0


def mark_notification_read(db: Session, notification_id: str, user_id: str | None = None) -> bool:
    notification = db.get(Notification, notification_id)
    if notification is None:
        return False
    notification.status = "read"
    notification.read_at = datetime.utcnow()
    notification.is_read = True
    db.commit()
    return True


def mark_all_read(db: Session, user_id: str | None = None, tenant_id: str | None = None) -> int:
    stmt = (
        update(Notification)
        .where(Notification.status != "read")
        .values(status="read", read_at=datetime.utcnow(), is_read=True)
    )
    if user_id:
        stmt = stmt.where(Notification.user_id == user_id)
    if tenant_id:
        stmt = stmt.where(Notification.tenant_id == tenant_id)
    result = db.execute(stmt)
    db.commit()
    return result.rowcount or 0


def enqueue_notification(*, user_id: str, tenant_id: str, channel: str = "in_app",
                        title: str, body: str | None = None,
                        entity_type: str | None = None, entity_id: str | None = None,
                        template: str | None = None) -> bool:
    """Create a notification record for a user."""
    from app.core.db import SessionLocal
    from app.models import Notification
    db = SessionLocal()
    try:
        note = Notification(
            tenant_id=tenant_id,
            user_id=user_id,
            channel=channel,
            template=template,
            title=title,
            body=body,
            entity_type=entity_type,
            entity_id=entity_id,
            status="queued",
        )
        db.add(note)
        db.commit()
        return True
    except Exception:
        db.rollback()
        return False
    finally:
        db.close()


def list_notifications(
    db: Session,
    *,
    user_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
    tenant_id: str | None = None,
) -> list[Notification]:
    stmt = select(Notification)
    if tenant_id:
        stmt = stmt.where(Notification.tenant_id == tenant_id)
    if user_id:
        stmt = stmt.where(Notification.user_id == user_id)
    stmt = stmt.order_by(Notification.created_at.desc()).limit(limit).offset(offset)
    return db.execute(stmt).scalars().all()
