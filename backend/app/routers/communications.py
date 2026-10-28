"""Communications router — messaging, conversations, knowledge base.

Endpoints:
  GET  /messaging/conversations              — conversation list
  GET  /messaging/conversations/{id}/messages — messages in a conversation
  GET  /messaging/knowledge                  — knowledge articles
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select

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
            "last_message": getattr(c, "last_message", None),
            "last_message_at": getattr(c, "last_message_at").isoformat() if getattr(c, "last_message_at", None) else None,
            "unread_count": getattr(c, "unread_count", 0) or 0,
        })

    return {"items": items, "meta": {"total": len(items), "limit": limit, "offset": 0, "has_more": False}}


@router.post("/messaging/conversations")
async def create_conversation(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    body = await request.json()

    conv = Conversation(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        client_id=body.get("client_id"),
        subject=body.get("name") or body.get("subject") or body.get("title") or "New Conversation",
        channel=body.get("channel_type") or body.get("channel") or "whatsapp",
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)

    return {
        "id": str(conv.id),
        "client_id": str(conv.client_id) if conv.client_id else None,
        "subject": conv.subject,
        "channel": conv.channel,
    }


@router.post("/messaging/conversations/{conversation_id}/messages")
async def send_message(
    request: Request,
    conversation_id: str,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    conversation = db.get(Conversation, conversation_id)
    if conversation is None or str(conversation.tenant_id) != str(tenant_id):
        from app.core.errors import NotFoundError

        raise NotFoundError(f"Conversation {conversation_id} not found")

    body = await request.json()
    msg = ConversationMessage(
        id=uuid.uuid4(),
        conversation_id=conversation.id,
        author_type=body.get("author_type") or "user",
        author_id=principal.id,
        body=body.get("body") or body.get("message") or "",
    )
    db.add(msg)
    conversation.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(msg)

    return {
        "id": str(msg.id),
        "conversation_id": str(msg.conversation_id),
        "author_type": msg.author_type,
        "author_id": str(msg.author_id) if msg.author_id else None,
        "body": msg.body,
        "sent_at": msg.sent_at.isoformat() if msg.sent_at else None,
    }


@router.post("/messaging/messages/{message_id}/reactions")
async def add_reaction(
    request: Request,
    message_id: str,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    # Minimal stub
    return {"ok": True}


@router.post("/messaging/messages/{message_id}/save")
async def save_message(
    request: Request,
    message_id: str,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    # Minimal stub
    return {"ok": True}


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