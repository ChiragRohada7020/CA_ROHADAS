"""Integrations router."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select

from app.core.db import get_db
from app.core.security import get_current_user
from app.models import IntegrationConnection

router = APIRouter(tags=["integrations"])


@router.get("/integrations/providers")
async def list_providers(
    request: Request,
    db: SessionLocal = Depends(get_db),
) -> Any:
    return [
        {
            "provider": "tally",
            "name": "Tally",
            "mechanism": "File import",
            "supports": ["Masters", "Vouchers"],
            "limitations": ["Depends on export format"],
        },
        {
            "provider": "busy",
            "name": "Busy",
            "mechanism": "File import",
            "supports": ["Masters"],
            "limitations": ["Format varies by version"],
        },
    ]


@router.get("/integrations/connections")
async def list_connections(
    request: Request,
    limit: int = 50,
    db: SessionLocal = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    rows = db.execute(
        select(IntegrationConnection).where(IntegrationConnection.tenant_id == tenant_id).limit(limit)
    ).scalars().all()

    items = []
    for conn in rows:
        items.append(
            {
                "id": str(conn.id),
                "tenant_id": str(conn.tenant_id),
                "provider": conn.provider,
                "name": conn.name,
                "status": conn.status,
                "is_enabled": conn.is_enabled,
                "credential_ref": conn.credential_ref,
                "last_error": conn.last_error,
                "last_sync_at": conn.last_sync_at.isoformat() if conn.last_sync_at else None,
            }
        )

    return {"items": items, "meta": {"total": len(items), "limit": limit, "offset": 0, "has_more": False}}
