"""Communications router — messaging, conversations, knowledge base.

Endpoints:
  GET  /messaging/conversations              — conversation list
  GET  /messaging/conversations/{id}/messages — messages in a conversation
  GET  /messaging/knowledge                  — knowledge articles
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request

from app.core.db import SessionLocal, get_db
from app.core.security import get_current_user
from app.models import Conversation, ConversationMessage

router = APIRouter(tags=["communications"])


@router.get("/messaging/conversations")
async def list_conversations(
    request: Request,
    search: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    stmt = select(Conversation).where(Conversation.tenant_id == tenant_id)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(Conversation.subject.ilike(pattern))

    rows = db.execute(stmt.order_by(Conversation.updated_at.desc()).limit(limit)).scalars().all()

    items = []
    for c in rows:
        items.append({
            "id": str(c.id),
            "client_id": str(c.client_id) if c.client_id else None,
            "client_name": None,
            "subject": c.subject,
            "channel": c.channel,
            "last_message": c.last_message,
            "last_message_at": c.last_message_at.isoformat() if c.last_message_at else None,
            "unread_count": c.unread_count,
        })

    return {"items": items, "meta": {"total": len(items), "limit": limit, "offset": 0, "has_more": False}}


@router.get("/messaging/conversations/{conversation_id}/messages")
async def list_messages(
    request: Request,
    conversation_id: str,
    limit: int = 50,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    conversation = db.get(Conversation, conversation_id)
    if conversation is None or conversation.tenant_id != tenant_id:
        from app.core.errors import NotFoundError
        raise NotFoundError(f"Conversation {conversation_id} not found")

    rows = db.execute(
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.sent_at.desc())
        .limit(limit)
    ).scalars().all()

    items = []
    for m in rows:
        items.append({
            "id": str(m.id),
            "conversation_id": str(m.conversation_id),
            "author_type": m.author_type,
            "body": m.body,
            "sent_at": m.sent_at.isoformat() if m.sent_at else None,
            "author_id": str(m.author_id) if m.author_id else None,
            "author_name": None,
        })

    return {"items": items, "meta": {"total": len(items), "limit": limit, "offset": 0, "has_more": False}}


@router.get("/messaging/knowledge")
async def list_knowledge(
    request: Request,
    search: str | None = None,
    category: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> Any:
    # Knowledge articles model not yet in schema — return empty list
    return []