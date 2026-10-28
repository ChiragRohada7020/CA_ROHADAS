"""Invoice PDF download endpoint."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from app.core.db import get_db
from app.core.errors import NotFoundError
from app.core.security import get_current_user
from app.models import Invoice
from app.services.whatsapp_service import generate_invoice_pdf

router = APIRouter(tags=["invoices"])


@router.get("/invoices/{invoice_id}/pdf")
async def download_invoice_pdf(request: Request, invoice_id: str, db=Depends(get_db)) -> Any:
    principal = await get_current_user(request, db)
    invoice = db.get(Invoice, invoice_id)
    if invoice is None or str(invoice.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Invoice {invoice_id} not found")
    pdf_bytes = generate_invoice_pdf(db, invoice)
    filename = f"Invoice_{invoice.invoice_number or invoice.id}.pdf".replace("/", "_").replace(":", "_")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
