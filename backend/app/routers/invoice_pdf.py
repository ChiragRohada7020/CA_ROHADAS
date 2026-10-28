"""Invoice PDF download endpoint."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from app.core.db import get_db
from app.core.errors import NotFoundError
from app.core.security import get_current_user
from app.models import Invoice, Client, BillingSettings, InvoiceLine
from app.services.pdf_invoice_service import generate_invoice_pdf_better

router = APIRouter(tags=["invoices"])


@router.get("/invoices/{invoice_id}/pdf")
async def download_invoice_pdf(request: Request, invoice_id: str, db=Depends(get_db)) -> Any:
    principal = await get_current_user(request, db)
    invoice = db.get(Invoice, invoice_id)
    if invoice is None or str(invoice.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Invoice {invoice_id} not found")

    client = db.get(Client, invoice.client_id) if invoice.client_id else None
    firm = db.query(BillingSettings).filter(BillingSettings.tenant_id == principal.tenant_id).first()
    lines = db.query(InvoiceLine).filter(InvoiceLine.invoice_id == invoice.id).order_by(InvoiceLine.sequence).all()

    try:
        pdf_bytes = generate_invoice_pdf_better(invoice, lines, client, firm)
    except Exception as e:
        # Fallback to old method
        from app.services.whatsapp_service import generate_invoice_pdf
        invoice_dict = {
            "id": str(invoice.id),
            "invoice_number": invoice.invoice_number,
            "invoice_date": invoice.invoice_date.isoformat() if invoice.invoice_date else None,
            "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
            "status": invoice.status,
            "subtotal": float(invoice.subtotal or 0),
            "cgst_amount": float(invoice.cgst_amount or 0),
            "sgst_amount": float(invoice.sgst_amount or 0),
            "igst_amount": float(invoice.igst_amount or 0),
            "total": float(invoice.total or 0),
            "amount_paid": float(invoice.amount_paid or 0),
            "outstanding": float(invoice.outstanding or 0),
            "notes": invoice.notes,
            "terms": invoice.terms,
            "gst_tax_type": invoice.gst_tax_type,
            "tax_rate": float(invoice.tax_rate or 0),
        }
        client_dict = {
            "id": str(client.id) if client else None,
            "client_code": getattr(client, 'client_code', None) if client else None,
            "legal_name": getattr(client, 'legal_name', None) if client else None,
            "trade_name": getattr(client, 'trade_name', None) if client else None,
            "email": getattr(client, 'email', None) if client else None,
            "phone": getattr(client, 'phone', None) if client else None,
            "gstin": getattr(client, 'gstin', None) if client else None,
            "pan": getattr(client, 'pan', None) if client else None,
        } if client else None
        firm_dict = {
            "legal_name": getattr(firm, 'legal_name', None) if firm else None,
            "trade_name": getattr(firm, 'trade_name', None) if firm else None,
            "address_line1": getattr(firm, 'address_line1', None) if firm else None,
            "address_line2": getattr(firm, 'address_line2', None) if firm else None,
            "city": getattr(firm, 'city', None) if firm else None,
            "state": getattr(firm, 'state', None) if firm else None,
            "pincode": getattr(firm, 'pincode', None) if firm else None,
            "gstin": getattr(firm, 'gstin', None) if firm else None,
            "pan": getattr(firm, 'pan', None) if firm else None,
            "email": getattr(firm, 'email', None) if firm else None,
            "phone": getattr(firm, 'phone', None) if firm else None,
        } if firm else None
        line_dicts = [
            {
                "description": line.description,
                "sac_code": line.sac_code,
                "quantity": line.quantity,
                "unit_price": float(line.unit_price or 0),
                "amount": float(line.amount or 0),
                "discount": float(line.discount or 0),
                "is_taxable": line.is_taxable,
            }
            for line in lines
        ]
        pdf_bytes = generate_invoice_pdf(invoice_dict, client_dict, firm_dict, line_dicts)

    filename = f"Invoice_{invoice.invoice_number or invoice.id}.pdf".replace("/", "_").replace(":", "_")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
