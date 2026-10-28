"""Credit note service."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select

from app.core.errors import NotFoundError, ValidationError


def _round(v: float) -> float:
    return float(Decimal(str(v)).quantize(Decimal("0.01")))


def create_credit_note(
    db,
    *,
    tenant_id: str,
    invoice_id: str,
    items: list[dict[str, Any]],
    reason: str | None = None,
    tax_rate: float = 0.0,
    note_type: str = "credit",
    created_by_id: str | None = None,
):
    from app.models import Invoice, CreditNote, Client, BillingSettings
    from app.services.billing import compute_invoice, resolve_tax

    invoice = db.get(Invoice, invoice_id)
    if invoice is None or str(invoice.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Invoice {invoice_id} not found")
    if invoice.status not in ("issued", "partially_paid", "paid"):
        raise ValidationError("Credit notes can only be created for issued/paid invoices")

    client = db.get(Client, invoice.client_id)
    settings_row = db.execute(
        select(BillingSettings).where(BillingSettings.tenant_id == tenant_id)
    ).scalars().first()

    firm_state = (settings_row.state_code or "").strip().upper() if settings_row else ""
    client_state = (client.state_code or "").strip().upper() if client else ""
    tax_kind = resolve_tax(firm_state, client_state, tax_rate)["tax_type"]
    totals = compute_invoice(items, tax_rate, tax_kind, firm_state, client_state)

    cn = CreditNote(
        tenant_id=str(tenant_id),
        invoice_id=invoice_id,
        client_id=invoice.client_id,
        reason=reason,
        status="draft",
        note_type=note_type,
        subtotal=totals["subtotal"],
        discount_total=totals["discount_total"],
        taxable_total=totals["taxable_total"],
        cgst_amount=totals["cgst_amount"],
        sgst_amount=totals["sgst_amount"],
        igst_amount=totals["igst_amount"],
        total=totals["total"],
        created_by_id=created_by_id,
    )
    db.add(cn)
    db.flush()

    prefix = f"CN-{datetime.utcnow().strftime('%y%m')}-"
    max_num = db.execute(
        select(CreditNote.note_number).where(
            CreditNote.note_number.like(f"{prefix}%"),
            CreditNote.tenant_id == tenant_id,
        )
    ).all()
    nums = []
    for (n,) in max_num:
        if n and ":" in n:
            try:
                nums.append(int(n.split(":")[1]))
            except Exception:
                pass
    cn.note_number = f"{prefix}{(max(nums) + 1 if nums else 1):04d}"
    db.add(cn)
    db.commit()
    db.refresh(cn)
    return cn


def issue_credit_note(db, tenant_id, credit_note_id):
    from app.models import CreditNote
    from app.core.clock import now_local

    cn = db.get(CreditNote, credit_note_id)
    if cn is None or str(cn.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Credit note {credit_note_id} not found")
    if cn.status == "cancelled":
        raise ValidationError("Cancelled credit note cannot be issued")
    if cn.status == "draft":
        cn.status = "issued"
        cn.issued_at = now_local()
    db.add(cn)
    db.commit()
    db.refresh(cn)
    return cn


def apply_credit_note(db, tenant_id, credit_note_id):
    from app.models import CreditNote, Invoice
    from decimal import Decimal

    cn = db.get(CreditNote, credit_note_id)
    if cn is None or str(cn.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Credit note {credit_note_id} not found")
    if cn.status != "issued":
        raise ValidationError("Only issued credit notes can be applied")
    if not cn.invoice_id:
        raise ValidationError("Credit note must be linked to an invoice")

    invoice = db.get(Invoice, cn.invoice_id)
    if invoice is None or str(invoice.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Invoice {cn.invoice_id} not found")

    cn_total = Decimal(str(cn.total or 0))
    outstanding = Decimal(str(invoice.outstanding or 0))
    amt_paid = Decimal(str(invoice.amount_paid or 0))
    new_outstanding = outstanding - cn_total
    if new_outstanding < Decimal("0"):
        new_outstanding = Decimal("0")
    new_paid = amt_paid + cn_total if new_outstanding == Decimal("0") and (amt_paid + cn_total) >= Decimal(str(invoice.total or 0)) else amt_paid
    # simpler: reduce outstanding by credit note amount
    invoice.outstanding = float((Decimal(str(invoice.total or 0)) - (Decimal(str(invoice.amount_paid or 0)) + cn_total)).quantize(Decimal("0.01")))
    if invoice.outstanding < 0:
        invoice.outstanding = 0.0
    if invoice.outstanding == 0.0:
        invoice.status = "paid"
    elif Decimal(str(invoice.amount_paid or 0)) > 0:
        invoice.status = "partially_paid"
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return {"invoice": invoice, "credit_note": cn}


def cancel_credit_note(db, tenant_id, credit_note_id):
    from app.models import CreditNote
    from app.core.clock import now_local

    cn = db.get(CreditNote, credit_note_id)
    if cn is None or str(cn.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Credit note {credit_note_id} not found")
    if cn.status == "cancelled":
        raise ValidationError("Already cancelled")
    cn.status = "cancelled"
    db.add(cn)
    db.commit()
    db.refresh(cn)
    return cn
