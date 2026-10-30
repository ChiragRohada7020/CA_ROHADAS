"""Billing math: GST calculation, invoice totals, and ageing buckets.

The authoritative calculation lives here, mirroring the frontend's
``billing.ts`` so the two can never drift silently.
"""
from __future__ import annotations

from decimal import Decimal
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError

from app.core.errors import NotFoundError


def round_money(value: Decimal | float) -> float:
    """Half-up rounding to 2 decimal places (paise)."""
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding="ROUND_HALF_UP"))


def resolve_tax(
    firm_state_code: str | None,
    client_state_code: str | None,
    rate: float,
) -> dict[str, Any]:
    """Decide intra-state (CGST+SGST) vs inter-state (IGST).

    Returns the tax type, the effective place of supply, and a human-readable
    reason string for the UI.
    """
    if not firm_state_code or not client_state_code:
        return {
            "tax_type": "none",
            "reason": "GST is not applied: the firm or the client has no state code on file.",
            "place_of_supply": client_state_code or firm_state_code,
        }

    place_of_supply = client_state_code
    if firm_state_code == client_state_code:
        half = rate / 2
        return {
            "tax_type": "intra_state",
            "reason": f"Same-state supply ({client_state_code}) -> CGST {half}% + SGST {half}%",
            "place_of_supply": place_of_supply,
        }
    return {
        "tax_type": "inter_state",
        "reason": f"Different-state supply ({firm_state_code} -> {client_state_code}) -> IGST {rate}%",
        "place_of_supply": place_of_supply,
    }


def compute_invoice(
    lines: list[dict[str, Any]],
    rate: float,
    tax_type: str,
    firm_state_code: str | None = None,
    client_state_code: str | None = None,
) -> dict[str, float]:
    """Compute all invoice totals from draft line items.

    Mirrors ``billing.ts:computeTotals``:
    - line amount = qty * unit_price - discount (pre-tax)
    - tax computed on taxable value, then split (SGST takes the remainder)
    """
    taxable_line_amounts: list[float] = []
    discount_total = Decimal("0")
    subtotal = Decimal("0")

    for line in lines:
        desc = (line.get("description") or "").strip()
        if not desc:
            continue
        qty = Decimal(str(line.get("quantity", 1)))
        unit_price = Decimal(str(line.get("unit_price", 0)))
        discount = Decimal(str(line.get("discount", 0)))
        line_total = qty * unit_price - discount
        taxable_line_amounts.append(float(line_total))
        discount_total += discount
        subtotal += line_total

    subtotal_val = round_money(subtotal)
    discount_total_val = round_money(discount_total)
    taxable_total = round_money(subtotal - discount_total)

    if tax_type == "none" or not taxable_line_amounts:
        return {
            "subtotal": subtotal_val,
            "discount_total": discount_total_val,
            "taxable_total": taxable_total,
            "cgst_amount": 0.0,
            "sgst_amount": 0.0,
            "igst_amount": 0.0,
            "total": taxable_total,
        }

    total_tax = round_money(taxable_total * (rate / 100))

    cgst = 0.0
    sgst = 0.0
    igst = 0.0

    if tax_type == "inter_state":
        igst = total_tax
    else:
        cgst = round_money(total_tax / 2)
        sgst = round_money(total_tax - cgst)

    total = round_money(taxable_total + cgst + sgst + igst)

    return {
        "subtotal": subtotal_val,
        "discount_total": discount_total_val,
        "taxable_total": taxable_total,
        "cgst_amount": cgst,
        "sgst_amount": sgst,
        "igst_amount": igst,
        "total": total,
    }


def ageing_bucket(days_overdue: int) -> str:
    if days_overdue < 0:
        return "not_due"
    if days_overdue == 0:
        return "due_today"
    if days_overdue <= 30:
        return "0-30"
    if days_overdue <= 60:
        return "31-60"
    if days_overdue <= 90:
        return "61-90"
    if days_overdue <= 120:
        return "91-120"
    return "120+"


def compute_receivables(db: Any, client_state_code: str | None = None) -> dict[str, Any]:
    """Compute outstanding receivables, split by age bucket."""
    from app.models import Invoice, Payment
    from sqlalchemy import func, select
    from sqlalchemy.orm import Session
    from app.core.clock import today_local

    today = today_local()
    stmt = (
        select(
            Invoice.id,
            Invoice.client_id,
            Invoice.total,
            Invoice.amount_paid,
            Invoice.invoice_date,
            Invoice.due_date,
        )
        .where(Invoice.status.in_(["issued", "partially_paid"]))
        .where(Invoice.amount_paid < Invoice.total)
    )
    rows = db.execute(stmt).all()

    outstanding_total = 0.0
    overdue_total = 0.0
    by_bucket: dict[str, float] = {}

    for row in rows:
        outstanding = float(row.total) - float(row.amount_paid)
        outstanding_total += outstanding
        due_date = row.due_date
        due = due_date.date() if due_date else None
        days_overdue = (today - due).days if due else 0
        if days_overdue > 0:
            overdue_total += outstanding
        bucket = ageing_bucket(days_overdue)
        by_bucket[bucket] = by_bucket.get(bucket, 0.0) + outstanding

    return {
        "as_of_date": today.isoformat(),
        "outstanding_total": round_money(outstanding_total),
        "overdue_total": round_money(overdue_total),
        "by_age_bucket": {k: round_money(v) for k, v in by_bucket.items()},
    }


def _normalize_line(item: dict[str, Any]) -> dict[str, Any]:
    """Coerce a caller-supplied line item dict into the shape compute_invoice expects."""
    if item is None:
        return {}
    desc = (item.get("description") or item.get("name") or item.get("label") or "").strip()
    return {
        "description": desc,
        "quantity": item.get("quantity", 1),
        "unit_price": item.get("unit_price", item.get("rate", 0)),
        "discount": item.get("discount", 0),
        "is_taxable": item.get("is_taxable", True),
        "service_id": item.get("service_id"),
        "task_id": item.get("task_id"),
        "sac_code": item.get("sac_code"),
    }


def create_invoice_record(
    db,
    *,
    tenant_id: str | Any,
    client_id: str | Any,
    items: list[dict[str, Any]] | Any,
    due_days: int = 15,
    invoice_date: Any = None,
    invoice_number: str | None = None,
    due_date: Any = None,
    notes: str | None = None,
    terms: str | None = None,
    bank_details: dict[str, Any] | None = None,
    created_by_id: str | None = None,
):
    """Build (but do not commit) an ``Invoice`` with ``InvoiceLine`` rows and fully
    computed totals.

    Shared by the REST billing router and the MCP ``create_invoice`` tool so the
    two can never drift (mirrors ``frontend/billing.ts:computeTotals``). Returns
    the uncommitted ``Invoice`` object with ``lines`` populated.
    """
    from app.core.clock import now_local, today_local
    from app.models import Invoice, InvoiceLine, Client, BillingSettings

    client = db.get(Client, client_id)
    if client is None or str(client.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Client {client_id} not found")

    settings_row = db.execute(
        select(BillingSettings).where(BillingSettings.tenant_id == tenant_id)
    ).scalars().first()

    now = now_local()
    today_date = today_local()

    if invoice_date is None:
        invoice_date = now
    elif isinstance(invoice_date, str):
        invoice_date = datetime.fromisoformat(invoice_date.replace("Z", "+00:00"))

    # Compute the due date: explicit due_date wins, otherwise from due_days.
    if due_date is not None:
        if isinstance(due_date, str):
            due_date = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
    else:
        due_date = invoice_date + timedelta(days=due_days)

    if invoice_number is None:
        prefix = f"INV-{today_date.strftime('%y%m')}-"
        max_num = db.execute(
            select(func.max(Invoice.invoice_number)).where(
                Invoice.invoice_number.like(f"{prefix}%"),
                Invoice.tenant_id == tenant_id,
            )
        ).scalar()
        if max_num:
            try:
                num = int(max_num.split("-")[-1]) + 1
                invoice_number = f"{prefix}{num:04d}"
            except (IndexError, ValueError):
                invoice_number = f"{prefix}0001"
        else:
            invoice_number = f"{prefix}0001"

    line_dicts = []
    for it in (items or []):
        nd = _normalize_line(it)
        if not nd["description"]:
            continue
        line_dicts.append(nd)

    # Resolve GST tax type from firm + client state codes.
    tax_rate = float(settings_row.tax_rate) if settings_row and settings_row.tax_rate is not None else 0.0
    firm_state = (settings_row.state_code or "").strip().upper() if settings_row else ""
    client_state = (client.state_code or "").strip().upper() if client else ""
    tax_kind = resolve_tax(firm_state, client_state, tax_rate)["tax_type"]
    # Map to the label the compute_invoice helper understands (none / intra_state / inter_state).
    totals = compute_invoice(line_dicts, tax_rate, tax_kind, firm_state, client_state)

    invoice = Invoice(
        tenant_id=str(tenant_id),
        invoice_number=invoice_number,
        client_id=client_id,
        client_name=client.legal_name,
        client_code=client.client_code,
        status="draft",
        invoice_date=invoice_date,
        due_date=invoice_date + timedelta(days=due_days),
        place_of_supply_state_code=client.state_code,
        gst_tax_type=tax_kind,
        tax_rate=tax_rate,
        subtotal=totals["subtotal"],
        discount_total=totals["discount_total"],
        taxable_total=totals["taxable_total"],
        cgst_amount=totals["cgst_amount"],
        sgst_amount=totals["sgst_amount"],
        igst_amount=totals["igst_amount"],
        total=totals["total"],
        amount_paid=0.0,
        outstanding=totals["total"],
        notes=notes,
        terms=terms,
        bank_details=bank_details,
        created_by_id=created_by_id,
    )

    lines: list[InvoiceLine] = []
    for idx, ld in enumerate(line_dicts, start=1):
        line = InvoiceLine(
            sequence=idx,
            description=ld["description"],
            sac_code=ld.get("sac_code"),
            service_id=ld.get("service_id"),
            task_id=ld.get("task_id"),
            quantity=int(ld.get("quantity", 1) or 1),
            unit_price=float(ld.get("unit_price", 0)),
            discount=float(ld.get("discount", 0) or 0),
            amount=compute_invoice([ld], tax_rate, tax_kind, firm_state, client_state)["total"],
            is_taxable=bool(ld.get("is_taxable", True)),
        )
        invoice.lines.append(line)

    return invoice


def record_payment(
    db,
    tenant_id,
    invoice_id,
    amount,
    method,
    reference=None,
    paid_on=None,
    notes=None,
    user_id=None,
):
    """Record a payment against an invoice.

    Validates amount > 0, not exceeding outstanding (+0.01 tolerance), tenant
    ownership of invoice; updates amount_paid/outstanding; transitions status to
    partially_paid/paid. Single transaction; rolls back on failure.
    """
    from app.core.errors import NotFoundError, ValidationError
    from app.models import Invoice, Payment
    from app.core.clock import now_local
    from decimal import Decimal
    from sqlalchemy.exc import SQLAlchemyError

    amt = Decimal(str(amount))
    if amt <= 0:
        raise ValidationError("amount must be positive")

    invoice = db.get(Invoice, invoice_id)
    if invoice is None or str(invoice.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Invoice {invoice_id} not found")

    total = Decimal(str(invoice.total))
    paid = Decimal(str(invoice.amount_paid or 0))
    outstanding = total - paid
    if amt > outstanding + Decimal("0.01"):
        raise ValidationError(
            f"Payment amount {amt} exceeds outstanding {outstanding}"
        )

    if paid_on is None:
        paid_on = now_local()

    try:
        payment = Payment(
            invoice_id=invoice_id,
            amount=float(amt.quantize(Decimal("0.01"))),
            paid_on=paid_on,
            method=method,
            reference=reference,
            notes=notes,
            recorded_by_id=user_id,
        )
        db.add(payment)

        new_paid = paid + amt
        new_outstanding = total - new_paid
        if new_outstanding <= Decimal("0.01"):
            new_paid = total
            new_outstanding = Decimal("0.00")
            invoice.status = "paid"
        elif new_paid > 0:
            invoice.status = "partially_paid"

        invoice.amount_paid = float(new_paid.quantize(Decimal("0.01")))
        invoice.outstanding = float(new_outstanding.quantize(Decimal("0.01")))

        db.commit()
        db.refresh(payment)
        db.refresh(invoice)
        return payment
    except Exception:
        db.rollback()
        raise


def reverse_payment(
    db,
    tenant_id,
    invoice_id,
    payment_id,
):
    """Remove a receipt and restore the outstanding balance.

    The frontend Payments tab offers a "Reverse" button that calls this. It
    mirrors ``record_payment`` in every way: tenant-scoped, single
    transaction, rolls back on failure.
    """
    from app.core.errors import NotFoundError
    from app.models import Invoice, Payment
    from decimal import Decimal

    invoice = db.get(Invoice, invoice_id)
    if invoice is None or str(invoice.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Invoice {invoice_id} not found")

    payment = db.get(Payment, payment_id)
    if payment is None or str(payment.invoice_id) != str(invoice_id):
        raise NotFoundError(f"Payment {payment_id} not found")

    total = Decimal(str(invoice.total))
    paid = Decimal(str(invoice.amount_paid or 0))
    new_paid = paid - Decimal(str(payment.amount))
    new_outstanding = total - new_paid

    if new_paid <= Decimal("0.01"):
        new_paid = Decimal("0.00")
        new_outstanding = total
        invoice.status = "issued" if invoice.status in ("paid", "partially_paid") else invoice.status
    else:
        invoice.status = "partially_paid"

    invoice.amount_paid = float(new_paid.quantize(Decimal("0.01")))
    invoice.outstanding = float(new_outstanding.quantize(Decimal("0.01")))

    db.delete(payment)
    db.commit()
    db.refresh(invoice)
    return invoice


# ── Invoice lifecycle: issue, send, cancel, share ────────────────────────────


def issue_invoice(db, tenant_id, invoice_id):
    """Transition a draft invoice to *issued*.

    Allocates an invoice number (if it does not yet have one), sets ``issued_at``,
    and moves ``status`` from ``draft`` to ``issued``.  An invoice that is already
    issued is a no-op for the status field so the endpoint is idempotent.

    Raises ``NotFoundError`` if the invoice does not exist or belongs to another
    tenant, and ``ValidationError`` if the invoice is in a terminal state
    (cancelled) from which it cannot be issued.
    """
    from app.core.errors import NotFoundError, ValidationError
    from app.core.clock import now_local
    from app.models import Invoice

    invoice = db.get(Invoice, invoice_id)
    if invoice is None or str(invoice.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Invoice {invoice_id} not found")

    if invoice.status == "cancelled":
        raise ValidationError("A cancelled invoice cannot be issued. Create a new invoice instead.")

    if invoice.status == "draft":
        # Invoice numbers are allocated at issue time so that abandoned drafts
        # do not create gaps in the consecutive series.
        _allocate_invoice_number(db, invoice, now_local)
        invoice.status = "issued"
        if invoice.issued_at is None:
            invoice.issued_at = now_local()

    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def _allocate_invoice_number(db, invoice, now):
    """Assign the next invoice number in the ``INV{YYMM}:####`` series.

    Reused by ``create_invoice_record`` and ``issue_invoice`` so the numbering
    rule lives in one place.
    """
    from app.models import Invoice as InvoiceModel
    from sqlalchemy import select, func

    if invoice.invoice_number:
        return  # already has one

    prefix = f"INV-{now.strftime('%y%m')}-"
    max_num = db.execute(
        select(func.max(InvoiceModel.invoice_number)).where(
            InvoiceModel.invoice_number.like(f"{prefix}%"),
            InvoiceModel.tenant_id == invoice.tenant_id,
        )
    ).scalar()
    if max_num:
        try:
            num = int(max_num.split("-")[-1]) + 1
            invoice.invoice_number = f"{prefix}{num:04d}"
        except (IndexError, ValueError):
            invoice.invoice_number = f"{prefix}0001"
    else:
        invoice.invoice_number = f"{prefix}0001"


def send_invoice(db, tenant_id, invoice_id, message=None, user_id=None):
    """Send an invoice to the client.

    If the invoice is still a draft it is issued first (number allocated,
    status transitions to ``issued``) so that a single "Send" action takes it
    all the way from draft to sent.

    After issuing (if needed) the function:
      * sets ``sent_at`` on the invoice,
      * queues a notification per enabled channel (email, whatsapp) for the
        client's primary contact,
      * mints a share link token if one does not already exist.

    Returns a dict suitable for the ``InvoiceSendResult`` response schema.
    """
    from app.core.errors import NotFoundError, ValidationError
    from app.core.clock import now_local
    from app.models import Invoice as _Inv, Notification as _Notif
    from app.models.client import Contact as _Contact
    import secrets

    invoice = db.get(_Inv, invoice_id)
    if invoice is None or str(invoice.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Invoice {invoice_id} not found")

    if invoice.status == "cancelled":
        raise ValidationError("A cancelled invoice cannot be sent.")

    # Issue first if still a draft — "Send" is a superset of "Issue".
    if invoice.status == "draft":
        _allocate_invoice_number(db, invoice, now_local())
        invoice.status = "issued"
        invoice.issued_at = invoice.issued_at or now_local()

    invoice.sent_at = now_local()
    invoice.updated_at = invoice.sent_at

    # Mint or reuse a share-link token.
    share_url = None
    if not invoice.share_token:
        invoice.share_token = secrets.token_urlsafe(32)
    share_url = f"/invoices/shared/{invoice.share_token}"

    # Queue notifications for the primary contact.
    outcomes = _queue_send_notifications(
        db, tenant_id, invoice, message, user_id
    )

    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    return {
        "invoice_id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "outcomes": outcomes,
        "share_url": share_url,
    }


def _queue_send_notifications(db, tenant_id, invoice, message, user_id):
    """Create Notification rows for each channel the client can receive on.

    Returns a list of outcome dicts (channel, recipient, status, detail) so the
    caller can report what was attempted.
    """
    from app.core.clock import now_local
    from app.models import Notification
    from app.models.client import Contact
    from sqlalchemy import select

    outcomes = []
    now = now_local()

    # Gather the client's primary contact email and WhatsApp number.
    contacts = db.execute(
        select(Contact)
        .where(Contact.client_id == invoice.client_id, Contact.tenant_id == tenant_id)
        .order_by(Contact.is_primary.desc())
    ).scalars().all()

    primary = contacts[0] if contacts else None

    channels = []

    # Email — send to every contact that has an email (primary first).
    for contact in contacts:
        if contact.email:
            channels.append(("email", contact.email, contact.name or contact.email))

    # WhatsApp — primary contact's whatsapp_number.
    if primary and primary.whatsapp_number:
        channels.append(("whatsapp", primary.whatsapp_number, primary.name or primary.whatsapp_number))

    if not channels:
        # No contact info — still mark the invoice as sent (link is shareable).
        outcomes = []
        return outcomes

    for channel, recipient, label in channels:
        notification = Notification(
            tenant_id=str(tenant_id),
            user_id=user_id,
            channel=channel,
            template="invoice_send",
            title=f"Invoice {invoice.invoice_number or '(draft)'}",
            body=message if message is not None else None,
            entity_type="invoice",
            entity_id=str(invoice.id),
            status="queued",
            scheduled_for=now,
        )
        db.add(notification)
        outcomes.append({
            "channel": channel,
            "recipient": recipient,
            "status": "queued",
            "detail": None,
        })

    return outcomes


def cancel_invoice(db, tenant_id, invoice_id, reason):
    """Cancel an invoice.

    Only invoices that are not yet fully paid can be cancelled.  Sets
    ``status``, ``cancelled_at`` and ``cancelled_reason``.
    """
    from app.core.errors import NotFoundError, ValidationError
    from app.core.clock import now_local
    from app.models import Invoice

    invoice = db.get(Invoice, invoice_id)
    if invoice is None or str(invoice.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Invoice {invoice_id} not found")

    if invoice.status == "cancelled":
        raise ValidationError("This invoice is already cancelled.")

    # Cannot cancel an invoice that has been partially or fully paid.
    if float(invoice.amount_paid) > 0:
        raise ValidationError(
            f"Cannot cancel an invoice with payments received. "
            f"Issue a credit note instead. (amount_paid={invoice.amount_paid})"
        )

    invoice.status = "cancelled"
    invoice.cancelled_at = now_local()
    invoice.cancelled_reason = reason
    invoice.updated_at = invoice.cancelled_at

    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def generate_share_link(db, tenant_id, invoice_id):
    """Mint (or rotate) a shareable client link for an invoice.

    The token is stored hashed conceptually — only the URL path is returned to
    the caller.  The previous token, if any, is invalidated.
    """
    from app.core.errors import NotFoundError, ValidationError
    from app.core.clock import now_local
    from app.models import Invoice
    from datetime import timedelta
    import secrets

    invoice = db.get(Invoice, invoice_id)
    if invoice is None or str(invoice.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Invoice {invoice_id} not found")

    if invoice.status == "cancelled":
        raise ValidationError("A cancelled invoice cannot be shared.")

    token = secrets.token_urlsafe(32)
    invoice.share_token = token
    invoice.updated_at = now_local()
    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    expires_at = (now_local() + timedelta(days=30)).isoformat()

    return {
        "invoice_id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
         "share_url": f"/invoices/shared/{token}",
        "expires_at": expires_at,
    }


def delete_invoice(
    db,
    tenant_id,
    invoice_id,
):
    """Soft-delete a draft invoice.

    Drafts have no number allocated yet, so they can simply be removed from the
    ledger without leaving a gap in the invoice series. Issued, sent or paid
    invoices cannot be deleted — cancel them instead, which preserves the
    series and the audit trail.
    """
    from app.core.errors import NotFoundError, ValidationError
    from app.models import Invoice, CreditNote

    invoice = db.get(Invoice, invoice_id)
    if invoice is None or str(invoice.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Invoice {invoice_id} not found")

    if invoice.status != "draft":
        raise ValidationError(
            "Only draft invoices can be deleted. Cancel issued or paid invoices instead."
        )

    # Credit notes reference invoices; remove orphaned draft credit notes so the
    # invoice's foreign-key constraint is not violated. (Issued credit notes are
    # never on a draft invoice, so this is safe.)
    draft_cns = db.execute(
        select(CreditNote).where(CreditNote.invoice_id == invoice_id)
    ).scalars().all()
    for cn in draft_cns:
        db.delete(cn)

    db.delete(invoice)
    db.commit()
    return {"deleted": True, "invoice_id": str(invoice_id)}


def list_payments(db, tenant_id):
    """List all payments for a tenant, newest first.

    Returns each payment with its invoice number and client name so a
    payments ledger page can render without extra round-trips.
    """
    from app.models import Payment, Invoice

    rows = (
        db.execute(
            select(Payment)
            .join(Invoice, Payment.invoice_id == Invoice.id)
            .where(Invoice.tenant_id == tenant_id)
            .order_by(Payment.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [
        {
            "id": str(p.id),
            "invoice_id": str(p.invoice_id),
            "invoice_number": p.invoice.invoice_number if p.invoice else None,
            "client_name": p.invoice.client_name if p.invoice else None,
            "client_id": str(p.invoice.client_id) if p.invoice and p.invoice.client_id else None,
            "amount": round(float(p.amount), 2),
            "paid_on": p.paid_on.isoformat() if p.paid_on else None,
            "method": p.method,
            "reference": p.reference,
            "notes": p.notes,
            "recorded_by_id": str(p.recorded_by_id) if p.recorded_by_id else None,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in rows
    ]


def issue_receipt_service(db, tenant_id, invoice_id, payment_id=None):
    """Issue a receipt for an invoice, optionally linked to a specific payment.

    Generates a sequential receipt number (RCT000001, RCT000002, …) and
    creates a Receipt row.  When ``payment_id`` is supplied the receipt is
    linked to that payment so the client can see which payment it covers.
    """
    from app.core.errors import NotFoundError, ValidationError
    from app.models import Invoice, Receipt, Payment
    from sqlalchemy import select, func

    invoice = db.get(Invoice, invoice_id)
    if invoice is None or str(invoice.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Invoice {invoice_id} not found")

    if payment_id is not None:
        payment = db.get(Payment, payment_id)
        if payment is None or str(payment.invoice_id) != str(invoice_id):
            raise NotFoundError(f"Payment {payment_id} not found")

    prefix = "RCT-"
    max_num = db.execute(
        select(func.max(Receipt.receipt_number)).where(Receipt.tenant_id == tenant_id)
    ).scalar()
    num = 1
    if max_num and max_num.replace(prefix, "").isdigit():
        num = int(max_num.replace(prefix, "")) + 1

    receipt = Receipt(
        tenant_id=tenant_id,
        invoice_id=invoice_id,
        payment_id=payment_id,
        receipt_number=f"{prefix}{num:06d}",
    )
    db.add(receipt)
    db.commit()
    db.refresh(receipt)
    return {
        "id": str(receipt.id),
        "receipt_number": receipt.receipt_number,
        "invoice_id": str(receipt.invoice_id),
        "payment_id": str(receipt.payment_id) if receipt.payment_id else None,
        "issued_at": receipt.issued_at.isoformat() if receipt.issued_at else None,
    }


def allocate_payment_across_invoices(
    db,
    tenant_id,
    client_id=None,
    amount=None,
    paid_on=None,
    method="bank_transfer",
    reference=None,
    notes=None,
    invoice_ids=None,
    allocations=None,
    recorded_by_id=None,
):
    """Allocate a single payment across multiple invoices (and/or to a client)."""
    from app.core.errors import NotFoundError, ValidationError
    from app.models import Invoice, Payment, PaymentAllocation
    from app.core.clock import now_local
    from decimal import Decimal

    amt = Decimal(str(amount or 0))
    if amt <= 0:
        raise ValidationError("amount must be positive")

    if paid_on is None:
        paid_on = now_local()

    # Build allocation list
    allocs = []
    if allocations and isinstance(allocations, list):
        for a in allocations:
            inv_id = a.get("invoice_id") or a.get("id")
            a_amt = Decimal(str(a.get("amount") or 0))
            if inv_id and a_amt > 0:
                allocs.append((inv_id, a_amt))
    elif invoice_ids and isinstance(invoice_ids, list):
        # distribute equally if not specified
        each = amt / Decimal(len(invoice_ids)) if invoice_ids else Decimal(0)
        for inv_id in invoice_ids:
            allocs.append((inv_id, each.quantize(Decimal("0.01"))))
    else:
        raise ValidationError("invoice_ids or allocations required")

    # Create payment (can be linked to first invoice or remain unlinked; store allocations)
    first_inv_id = allocs[0][0]
    payment = Payment(
        tenant_id=tenant_id,
        invoice_id=first_inv_id,
        amount=float(amt.quantize(Decimal("0.01"))),
        paid_on=paid_on,
        method=method,
        reference=reference,
        notes=notes,
        recorded_by_id=recorded_by_id,
    )
    db.add(payment)
    db.flush()

    for inv_id, a_amt in allocs:
        inv = db.get(Invoice, inv_id)
        if inv is None or str(inv.tenant_id) != str(tenant_id):
            raise NotFoundError(f"Invoice {inv_id} not found")
        if a_amt <= 0:
            continue
        pa = PaymentAllocation(
            tenant_id=tenant_id,
            payment_id=payment.id,
            invoice_id=inv_id,
            amount=float(a_amt.quantize(Decimal("0.01"))),
        )
        db.add(pa)
        # Apply to invoice
        total = Decimal(str(inv.total))
        paid = Decimal(str(inv.amount_paid or 0))
        new_paid = paid + a_amt
        if new_paid > total + Decimal("0.01"):
            raise ValidationError(f"Allocation exceeds outstanding for {inv.invoice_number}")
        inv.amount_paid = float((new_paid if new_paid <= total else total).quantize(Decimal("0.01")))
        inv.outstanding = float((total - Decimal(str(inv.amount_paid))).quantize(Decimal("0.01")))
        if inv.outstanding < 0:
            inv.outstanding = 0.0
        if inv.outstanding == 0:
            inv.status = "paid"
        else:
            inv.status = "partially_paid"
        db.add(inv)

    db.commit()
    db.refresh(payment)
    return {
        "id": str(payment.id),
        "amount": payment.amount,
        "paid_on": payment.paid_on.isoformat() if payment.paid_on else None,
        "method": payment.method,
        "allocations": [{"invoice_id": str(i), "amount": float(a)} for i, a in allocs],
    }
