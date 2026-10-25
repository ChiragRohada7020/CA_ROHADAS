"""Assistant router — AI chat streaming and conversation sessions.

Endpoints:
  POST /assistant/chat/stream   — SSE stream for AI chat
  POST /assistant/chat          — non-streaming chat (buffer all content)
  DELETE /assistant/chat/{session_id} — clear a conversation session
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.assistant.chat import handle_chat_stream
from app.assistant.sessions import clear_session
from app.core.db import get_db

router = APIRouter(tags=["assistant"])


@router.post("/assistant/chat/stream")
async def assistant_chat_stream(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    body = await request.json()
    return await handle_chat_stream(
        request,
        db=db,
        message=body.get("message", ""),
        session_id=body.get("session_id"),
        confirm=body.get("confirm", False),
        tool_args=body.get("tool_args"),
    )


@router.get("/assistant/chat/stream")
async def assistant_chat_stream_get(
    request: Request,
    db: Session = Depends(get_db),
    session_id: str | None = None,
    message: str | None = None,
    confirm: bool = False,
) -> Any:
    return await handle_chat_stream(
        request,
        db=db,
        message=message or "",
        session_id=session_id,
        confirm=confirm,
    )


@router.post("/assistant/chat")
async def assistant_chat(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    body = await request.json()
    streaming_response = await handle_chat_stream(
        request,
        db=db,
        message=body.get("message", ""),
        session_id=body.get("session_id"),
    )
    buffer: list[str] = []
    async for chunk in streaming_response.body_iterator:
        buffer.append(chunk)
    content = "".join(buffer)
    return {"role": "assistant", "content": content}


@router.delete("/assistant/chat/{session_id}")
async def clear_chat_session(
    request: Request,
    session_id: str,
) -> Any:
    clear_session(session_id)
    return {"cleared": True, "session_id": session_id}
