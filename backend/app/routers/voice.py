"""Voice assistant routes - realtime conversation."""
from __future__ import annotations

import json
import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.core.db import get_db
from app.core.security import get_current_user
from app.core.config import settings

router = APIRouter(prefix="/voice", tags=["voice"])


class SessionRequest(BaseModel):
    voice: str | None = None
    model: str | None = None


@router.post("/session")
async def create_voice_session(
    request: Request,
    body: SessionRequest | None = None,
    db=Depends(get_db),
):
    """Create ephemeral session credentials for realtime voice."""
    try:
        principal = await get_current_user(request, db)
    except Exception:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # For now, return configuration for client-side voice
    return {
        "type": "session",
        "user_id": str(principal.user_id),
        "tenant_id": str(principal.tenant_id),
        "provider": settings.AI_PROVIDER,
        "model": settings.AI_MODEL or "gpt-4o-mini",
        "ice_servers": [{"urls": ["stun:stun.l.google.com:19302"]}],
        "turn_config": {},
    }


@router.get("/config")
async def voice_config(request: Request, db=Depends(get_db)):
    try:
        principal = await get_current_user(request, db)
    except Exception:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return {
        "enabled": True,
        "provider": settings.AI_PROVIDER,
        "model": settings.AI_MODEL,
        "supports_realtime": bool(settings.OPENAI_API_KEY or settings.AI_API_KEY),
    }
