"""WhatsApp router — QR pairing, status, and invoice delivery via WhatsApp.

Endpoints (all under ``/api``):
  GET    /whatsapp/status        — gateway connection status
  GET    /whatsapp/qr            — pairing QR code (data URL)
  POST   /whatsapp/pair          — request a pairing code for a phone number
  POST   /whatsapp/send-message  — send a plain-text WhatsApp message
  POST   /whatsapp/send-invoice/{invoice_id} — send an invoice PDF via WhatsApp
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user, require_permission
from app.services.whatsapp_service import (
    get_whatsapp_status,
    get_whatsapp_qr,
    pair_whatsapp,
    send_whatsapp_message,
    send_invoice_via_whatsapp,
)

router = APIRouter(tags=["whatsapp"])


@router.get("/whatsapp/status")
async def whatsapp_status(
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    await get_current_user(request, db)
    return await get_whatsapp_status()


@router.get("/whatsapp/qr")
async def whatsapp_qr(
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    await get_current_user(request, db)
    return await get_whatsapp_qr()


@router.post("/whatsapp/pair")
async def whatsapp_pair(
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    await get_current_user(request, db)
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    phone_number = body.get("phone_number") if isinstance(body, dict) else None
    if not phone_number:
        from app.core.errors import BadRequestError
        raise BadRequestError("phone_number is required")
    return await pair_whatsapp(phone_number)


@router.post("/whatsapp/send-message")
async def whatsapp_send_message(
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    await get_current_user(request, db)
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    phone_number = body.get("phone_number") if isinstance(body, dict) else None
    message = body.get("message") if isinstance(body, dict) else None
    if not phone_number:
        from app.core.errors import BadRequestError
        raise BadRequestError("phone_number is required")
    if not message:
        from app.core.errors import BadRequestError
        raise BadRequestError("message is required")
    return await send_whatsapp_message(phone_number, message)


@router.post("/whatsapp/send-invoice/{invoice_id}")
async def whatsapp_send_invoice(
    request: Request,
    invoice_id: str,
    db: Session = Depends(get_db),
    principal: Any = Depends(require_permission("invoice.send")),
) -> dict[str, Any]:
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    message = body.get("message") if isinstance(body, dict) else None
    return await send_invoice_via_whatsapp(
        db,
        tenant_id=principal.tenant_id,
        invoice_id=invoice_id,
        message=message,
        user_id=principal.id,
    )
