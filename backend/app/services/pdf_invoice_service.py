from __future__ import annotations

from io import BytesIO
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from app.services.pdf_templates import generateInvoicePDF, mergeTheme
from app.services.pdf_templates.theme import DEFAULT_THEME


def generate_invoice_pdf_better(invoice_db, invoice_lines, client, firm, tenant_id=None):
    # Build computed invoice structure
    from app.core.utils import decimalize

    currency = "INR"
    taxable_value = Decimal(str(invoice_db.subtotal or 0))
    cgst = Decimal(str(invoice_db.cgst_amount or 0))
    sgst = Decimal(str(invoice_db.sgst_amount or 0))
    igst = Decimal(str(invoice_db.igst_amount or 0))
    discount = Decimal(str(invoice_db.discount_total or 0))
    total = Decimal(str(invoice_db.total or 0))
    grand_total = total

    # Determine inter state
    is_inter_state = (invoice_db.gst_tax_type or "").lower() in ("inter_state", "inter-state")

    items = []
    for idx, line in enumerate(invoice_lines):
        qty = int(getattr(line, 'quantity', 1) or 1)
        rate = Decimal(str(getattr(line, 'unit_price', 0) or 0))
        amount = Decimal(str(getattr(line, 'amount', qty * float(rate)) or 0))
        items.append({
            "id": str(getattr(line, 'id', idx)),
            "description": getattr(line, 'description', '') or '',
            "hsnSac": getattr(line, 'sac_code', '') or '',
            "quantity": qty,
            "unit": "NOS",
            "rate": float(rate),
            "amount": float(amount),
            "taxableValue": float(amount),
            "discount": float(getattr(line, 'discount', 0) or 0),
        })

    invoice_data = {
        "id": str(invoice_db.id),
        "meta": {
            "invoiceNumber": invoice_db.invoice_number or f"INV-{invoice_db.id}",
            "invoiceDate": invoice_db.invoice_date.strftime('%d-%m-%Y') if invoice_db.invoice_date else datetime.now().strftime('%d-%m-%Y'),
            "dueDate": invoice_db.due_date.strftime('%d-%m-%Y') if invoice_db.due_date else None,
            "placeOfSupply": "",
            "reverseCharge": False,
        },
        "seller": {
            "name": getattr(firm, 'legal_name', None) or getattr(firm, 'trade_name', None) or "CA Firm",
            "address": ", ".join(filter(None, [getattr(firm, 'address_line1', None), getattr(firm, 'address_line2', None)])),
            "city": getattr(firm, 'city', None) or "",
            "state": getattr(firm, 'state', None) or "",
            "pincode": getattr(firm, 'pincode', None) or "",
            "gstin": getattr(firm, 'gstin', None) or "",
            "pan": getattr(firm, 'pan', None) or "",
            "email": getattr(firm, 'email', None) or "",
            "phone": getattr(firm, 'phone', None) or "",
        },
        "buyer": {
            "name": getattr(client, 'trade_name', None) or getattr(client, 'legal_name', None) or invoice_db.client_name or "",
            "address": getattr(client, 'address_line1', None) or getattr(invoice_db, 'client_address', None) or "",
            "city": getattr(client, 'city', None) or "",
            "state": getattr(client, 'state', None) or "",
            "pincode": getattr(client, 'pincode', None) or "",
            "gstin": getattr(client, 'gstin', None) or "",
            "pan": getattr(client, 'pan', None) or "",
            "email": getattr(client, 'email', None) or "",
            "phone": getattr(client, 'phone', None) or "",
        },
        "shipTo": None,
        "items": items,
        "totals": {
            "taxableValue": float(taxable_value),
            "discount": float(discount),
            "cgst": float(cgst),
            "sgst": float(sgst),
            "igst": float(igst),
            "cess": 0.0,
            "roundOff": 0.0,
            "grandTotal": float(grand_total),
        },
        "currency": currency,
        "notes": invoice_db.notes or "",
        "termsAndConditions": invoice_db.terms or "",
        "bankDetails": invoice_db.bank_details or None,
        "isInterState": is_inter_state,
    }

    pdf_bytes = generateInvoicePDF(invoice_data, {"template": "modern"})
    return pdf_bytes
