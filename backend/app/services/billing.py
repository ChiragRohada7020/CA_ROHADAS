"""Billing math: GST calculation, invoice totals, and ageing buckets.

The authoritative calculation lives here, mirroring the frontend's
``billing.ts`` so the two can never drift silently.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any


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
        days_overdue = (today - due_date).days if due_date else 0
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
