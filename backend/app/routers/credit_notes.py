"""Credit notes router."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Request

from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import NotFoundError
from app.core.security import get_current_user, require_permission
from app.services import credit_note as credit_note_service
from app.models import CreditNote, Invoice

router = APIRouter(tags=["credit-notes"])


@router.post("/credit-notes", dependencies=[Depends(require_permission("credit_note.write"))])
async def create_credit_note(
    request: Request,
    db: Session = Depends(get_db),
    payload: Any = Body(...),
) -> Any:
    principal = await get_current_user(request, db)
    invoice_id = payload.get("invoice_id") if isinstance(payload, dict) else None
    if not invoice_id:
        raise NotFoundError("invoice_id is required")
    items = payload.get("items") or payload.get("lines") or []
    cn = credit_note_service.create_credit_note(
        db,
        tenant_id=principal.tenant_id,
        invoice_id=invoice_id,
        items=items,
        reason=payload.get("reason"),
        tax_rate=float(payload.get("tax_rate") or 0),
        note_type=payload.get("note_type") or "credit",
        created_by_id=principal.id,
    )
    if payload.get("issue"):
        cn = credit_note_service.issue_credit_note(db, principal.tenant_id, str(cn.id))
    return {
        "id": str(cn.id),
        "note_number": cn.note_number,
        "invoice_id": str(cn.invoice_id) if cn.invoice_id else None,
        "client_id": str(cn.client_id),
        "status": cn.status,
        "total": cn.total,
    }


@router.get("/credit-notes")
async def list_credit_notes(request: Request, db: Session = Depends(get_db)) -> Any:
    principal = await get_current_user(request, db)
    rows = db.query(CreditNote).filter(CreditNote.tenant_id == principal.tenant_id).order_by(CreditNote.created_at.desc()).all()
    return [
        {
            "id": str(r.id),
            "note_number": r.note_number,
            "invoice_id": str(r.invoice_id) if r.invoice_id else None,
            "client_id": str(r.client_id),
            "status": r.status,
            "total": r.total,
            "reason": r.reason,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/credit-notes/{credit_note_id}")
async def get_credit_note(request: Request, credit_note_id: str, db: Session = Depends(get_db)) -> Any:
    principal = await get_current_user(request, db)
    cn = db.get(CreditNote, credit_note_id)
    if cn is None or str(cn.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Credit note {credit_note_id} not found")
    return {
        "id": str(cn.id),
        "note_number": cn.note_number,
        "invoice_id": str(cn.invoice_id) if cn.invoice_id else None,
        "client_id": str(cn.client_id),
        "status": cn.status,
        "reason": cn.reason,
        "subtotal": cn.subtotal,
        "taxable_total": cn.taxable_total,
        "cgst_amount": cn.cgst_amount,
        "sgst_amount": cn.sgst_amount,
        "igst_amount": cn.igst_amount,
        "total": cn.total,
        "issued_at": cn.issued_at.isoformat() if cn.issued_at else None,
        "created_at": cn.created_at.isoformat() if cn.created_at else None,
    }


@router.post("/credit-notes/{credit_note_id}/issue", dependencies=[Depends(require_permission("credit_note.write"))])
async def issue_credit_note(request: Request, credit_note_id: str, db: Session = Depends(get_db)) -> Any:
    principal = await get_current_user(request, db)
    cn = credit_note_service.issue_credit_note(db, principal.tenant_id, credit_note_id)
    return {"id": str(cn.id), "status": cn.status}


@router.post("/credit-notes/{credit_note_id}/apply", dependencies=[Depends(require_permission("credit_note.write"))])
async def apply_credit_note(request: Request, credit_note_id: str, db: Session = Depends(get_db)) -> Any:
    principal = await get_current_user(request, db)
    result = credit_note_service.apply_credit_note(db, principal.tenant_id, credit_note_id)
    return {"status": "applied", "invoice_outstanding": result["invoice"].outstanding}


@router.post("/credit-notes/{credit_note_id}/cancel", dependencies=[Depends(require_permission("credit_note.write"))])
async def cancel_credit_note(request: Request, credit_note_id: str, db: Session = Depends(get_db)) -> Any:
    principal = await get_current_user(request, db)
    cn = credit_note_service.cancel_credit_note(db, principal.tenant_id, credit_note_id)
    return {"id": str(cn.id), "status": cn.status}


@router.get("/invoices/{invoice_id}/credit-notes")
async def list_invoice_credit_notes(request: Request, invoice_id: str, db: Session = Depends(get_db)) -> Any:
    principal = await get_current_user(request, db)
    rows = db.query(CreditNote).filter(CreditNote.tenant_id == principal.tenant_id, CreditNote.invoice_id == invoice_id).all()
    return [
        {
            "id": str(r.id),
            "note_number": r.note_number,
            "status": r.status,
            "total": r.total,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
