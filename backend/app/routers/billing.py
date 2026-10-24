"""Billing router — invoices, receivables, and summary."""
from __future__ import annotations

from typing import Any
from datetime import date

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy import func, select

from app.core.db import SessionLocal, get_db
from app.core.errors import NotFoundError
from app.core.security import get_current_user
from app.core.clock import today_local
from app.models import BillingSettings, Client, Invoice, InvoiceLine, Payment, Task, Engagement, Service, ClientService

router = APIRouter(tags=["billing"])


@router.post("/invoices/generate")
async def generate_invoices(
    request: Request,
    db: Session = Depends(get_db),
    payload: Any = Body(...),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    client_id = payload.get("client_id") if isinstance(payload, dict) else None
    completed_from = payload.get("completed_from") if isinstance(payload, dict) else None
    apply = bool(payload.get("apply")) if isinstance(payload, dict) else False

    today = today_local()

    task_stmt = select(Task).where(
        Task.tenant_id == tenant_id,
        Task.status == "completed",
    )
    if client_id:
        task_stmt = task_stmt.where(Task.client_id == client_id)
    if completed_from:
        task_stmt = task_stmt.where(
            Task.completed_at.is_not(None), Task.completed_at >= completed_from
        )
    tasks = db.execute(task_stmt).scalars().all()

    grouped: dict[str, list] = {}
    for t in tasks:
        grouped.setdefault(str(t.client_id), []).append(t)

    settings = db.execute(
        select(BillingSettings).where(BillingSettings.tenant_id == tenant_id)
    ).scalars().first()

    proposed = []
    notes = []
    sequence = []
    next_no = 1

    for cid, ctasks in grouped.items():
        total = 0.0
        lines = []
        for t in ctasks:
            rate = 0.0
            svc = None
            if t.service_id:
                svc = db.get(Service, t.service_id)
            if svc is None and t.engagement_id:
                eng = db.get(Engagement, t.engagement_id)
                if eng is not None and eng.service_id:
                    svc = db.get(Service, eng.service_id)
            if svc is not None:
                rate = float(svc.standard_fee or 0)
            if rate == 0.0:
                cs = db.execute(
                    select(ClientService).where(
                        ClientService.tenant_id == tenant_id,
                        ClientService.client_id == t.client_id,
                    )
                ).scalars().first()
                if cs is not None and cs.engagement_id and t.engagement_id:
                    pass
                if cs is not None:
                    cs_svc = db.get(Service, cs.service_id) if cs.service_id else None
                    if cs_svc is not None:
                        rate = float(cs_svc.standard_fee or 0)

            hours = float(t.estimated_hours or 0)
            line_total = round(hours * rate, 2)
            total += line_total
            lines.append({
                "task_id": str(t.id),
                "description": t.title,
                "quantity": round(hours, 2),
                "unit_price": round(rate, 2),
                "total": line_total,
            })

        if not lines:
            continue

        inv_obj = None
        if apply:
            inv_obj = Invoice(
                tenant_id=tenant_id,
                client_id=cid,
                invoice_number=f"INV-{next_no:04d}",
                status="draft",
                invoice_date=today,
                due_date=today.replace(day=(today.day % 28) + 1),
                subtotal=round(total, 2),
                tax_rate=(float(settings.tax_rate) if settings and settings.tax_rate is not None else 0.0),
                outstanding=round(total, 2),
                created_at=today,
            )
            db.add(inv_obj)
            db.flush()
            db.commit()
            db.refresh(inv_obj)
            sequence.append({"client_id": cid, "number": inv_obj.invoice_number, "status": inv_obj.status})
            notes.append(f"Client {cid}: invoice {inv_obj.invoice_number} created (saved).")
        else:
            notes.append(f"Client {cid}: {len(lines)} line(s) ready, {len(lines)} task(s), total {round(total,2)}.")

        proposed.append({
            "client_id": cid,
            "lines": lines,
            "subtotal": round(total, 2),
            "status": inv_obj.status if inv_obj is not None else "draft",
            "invoice": {
                "id": str(inv_obj.id) if inv_obj is not None else None,
                "number": inv_obj.invoice_number if inv_obj is not None else f"INV-{next_no:04d}",
                "total": round(total, 2),
                "due_date": inv_obj.due_date.isoformat() if inv_obj is not None and inv_obj.due_date else None,
            } if inv_obj is not None else None,
        })
        next_no += 1

    return {
        "dry_run": not apply,
        "invoices": proposed,
        "sequence": sequence,
        "notes": notes,
        "generated_at": today.isoformat(),
    }




@router.get("/billing/invoices/summary")
async def get_invoice_summary(
    request: Request,
    search: str | None = None,
    client_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    stmt = select(Invoice).where(Invoice.tenant_id == tenant_id)
    if client_id:
        stmt = stmt.where(Invoice.client_id == client_id)

    rows = db.execute(stmt).scalars().all()

    invoiced_total = sum(float(r.total) for r in rows)
    collected_total = sum(float(r.amount_paid) for r in rows)
    outstanding_total = invoiced_total - collected_total
    overdue_total = sum(
        (float(r.total) - float(r.amount_paid))
        for r in rows
        if r.due_date and r.due_date < today_local() and (float(r.total) - float(r.amount_paid)) > 0
    )

    return {
        "invoiced_total": round(invoiced_total, 2),
        "collected_total": round(collected_total, 2),
        "outstanding_total": round(outstanding_total, 2),
        "overdue_total": round(overdue_total, 2),
        "invoiced_count": len(rows),
        "collected_count": sum(1 for r in rows if r.status == "paid"),
        "outstanding_count": sum(1 for r in rows if (float(r.total) - float(r.amount_paid)) > 0),
        "overdue_count": sum(1 for r in rows if r.due_date and r.due_date < today_local() and (float(r.total) - float(r.amount_paid)) > 0),
        "ageing": {},
    }


@router.get("/invoices", name="invoices-list", operation_id="list_invoices_alias")
@router.get("/billing/invoices", name="billing-invoices", operation_id="list_billing_invoices")
async def list_invoices(
    request: Request,
    search: str | None = None,
    client_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    group: str | None = None,
    limit: int = 10,
    offset: int = 0,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    stmt = select(Invoice).where(Invoice.tenant_id == tenant_id)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(Invoice.invoice_number.ilike(pattern))
    if client_id:
        stmt = stmt.where(Invoice.client_id == client_id)
    if group:
        stmt = stmt.where(Invoice.status == group)

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar() or 0
    stmt = stmt.order_by(Invoice.invoice_date.desc()).limit(limit).offset(offset)
    rows = db.execute(stmt).scalars().all()

    items = []
    for r in rows:
        items.append({
            "id": str(r.id),
            "invoice_number": r.invoice_number,
            "status": r.status,
            "invoice_date": r.invoice_date.isoformat() if r.invoice_date else None,
            "due_date": r.due_date.isoformat() if r.due_date else None,
            "total": r.total,
            "amount_paid": r.amount_paid,
            "outstanding": r.outstanding,
            "is_overdue": r.is_overdue,
            "days_overdue": r.days_overdue,
            "client_id": str(r.client_id) if r.client_id else None,
        })

    return {
        "items": items,
        "meta": {"total": total, "limit": limit, "offset": offset, "has_more": offset + len(items) < total},
    }


@router.get("/billing/invoices/{invoice_id}")
async def get_invoice(
    request: Request,
    invoice_id: str,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    invoice = db.get(Invoice, invoice_id)
    if invoice is None or invoice.tenant_id != tenant_id:
        raise NotFoundError(f"Invoice {invoice_id} not found")

    lines = db.execute(
        select(InvoiceLine).where(InvoiceLine.invoice_id == invoice_id)
    ).scalars().all()
    payments = db.execute(
        select(Payment).where(Payment.invoice_id == invoice_id)
    ).scalars().all()

    return {
        "id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "status": invoice.status,
        "invoice_date": invoice.invoice_date.isoformat() if invoice.invoice_date else None,
        "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
        "total": invoice.total,
        "amount_paid": invoice.amount_paid,
        "outstanding": invoice.outstanding,
        "is_overdue": invoice.is_overdue,
        "days_overdue": invoice.days_overdue,
        "client_id": str(invoice.client_id) if invoice.client_id else None,
        "lines": [{"id": str(l.id), "description": l.description, "quantity": l.quantity, "unit_price": l.unit_price, "amount": l.amount} for l in lines],
        "payments": [{"id": str(p.id), "amount": p.amount, "paid_on": p.paid_on.isoformat() if p.paid_on else None, "method": p.method} for p in payments],
    }


@router.post("/billing/invoices")
async def create_invoice(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    user_id = principal.id

    body = await request.json()

    invoice = Invoice(
        tenant_id=tenant_id,
        client_id=body.get("client_id"),
        invoice_number=body.get("invoice_number", f"INV-{today_local().strftime('%Y%m%d')}-001"),
        invoice_date=body.get("invoice_date"),
        due_date=body.get("due_date"),
        lines=body.get("lines", []),
        notes=body.get("notes"),
        terms=body.get("terms"),
        total=0.0,
        amount_paid=0.0,
        outstanding=0.0,
        status="draft",
        created_by_id=user_id,
        updated_by_id=user_id,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    return {"id": str(invoice.id), "invoice_number": invoice.invoice_number, "status": invoice.status}


@router.get("/billing/receivables")
async def get_receivables(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    today = today_local()
    stmt = select(Invoice).where(
        Invoice.tenant_id == tenant_id,
        Invoice.status.in_(["issued", "partially_paid"]),
        Invoice.amount_paid < Invoice.total,
    )
    rows = db.execute(stmt).scalars().all()

    outstanding_total = 0.0
    overdue_total = 0.0
    by_bucket = {}
    by_client_map: dict = {}

    for row in rows:
        outstanding = float(row.total) - float(row.amount_paid)
        outstanding_total += outstanding
        days_overdue = (today - row.due_date).days if row.due_date else 0
        if days_overdue > 0:
            overdue_total += outstanding
        bucket = "current" if days_overdue <= 0 else str(days_overdue)
        by_bucket[bucket] = by_bucket.get(bucket, 0.0) + outstanding

        cid = str(row.client_id) if row.client_id else None
        c = by_client_map.setdefault(cid, {
            "client_id": cid,
            "client_name": row.client_name or row.client_code or None,
            "client_code": row.client_code,
            "invoice_count": 0,
            "billed": 0.0,
            "collected": 0.0,
            "outstanding": 0.0,
            "overdue_outstanding": 0.0,
            "oldest_due_date": row.due_date,
            "worst_days_overdue": 0,
        })
        c["invoice_count"] += 1
        c["billed"] += float(row.total)
        c["collected"] += float(row.amount_paid)
        c["outstanding"] += outstanding
        if days_overdue > 0:
            c["overdue_outstanding"] += outstanding
        if row.due_date is not None:
            if c["oldest_due_date"] is None or row.due_date < c["oldest_due_date"]:
                c["oldest_due_date"] = row.due_date
        if days_overdue > c["worst_days_overdue"]:
            c["worst_days_overdue"] = days_overdue

    by_client = []
    for c in by_client_map.values():
        by_client.append({
            "client_id": c["client_id"],
            "client_name": c["client_name"],
            "client_code": c["client_code"],
            "invoice_count": c["invoice_count"],
            "billed": round(c["billed"], 2),
            "collected": round(c["collected"], 2),
            "outstanding": round(c["outstanding"], 2),
            "overdue_outstanding": round(c["overdue_outstanding"], 2),
            "oldest_due_date": c["oldest_due_date"].isoformat() if c["oldest_due_date"] else None,
            "worst_days_overdue": c["worst_days_overdue"],
        })

    collected_stmt = select(func.coalesce(func.sum(Payment.amount), 0)).select_from(Payment).join(Invoice).where(
        Invoice.tenant_id == tenant_id, Payment.paid_on >= today.replace(day=1)
    )
    collected_total = db.execute(collected_stmt).scalar() or 0.0

    return {
        "as_of_date": today.isoformat(),
        "invoiced_total": round(outstanding_total + overdue_total, 2),
        "collected_total": round(float(collected_total), 2),
        "outstanding_total": round(outstanding_total, 2),
        "overdue_total": round(overdue_total, 2),
        "overdue_count": sum(1 for r in rows if (float(r.total) - float(r.amount_paid)) > 0 and r.due_date and r.due_date < today),
        "by_age_bucket": {k: round(v, 2) for k, v in by_bucket.items()},
        "by_client": by_client,
        "recent": [],
        "notes": [],
    }


@router.get("/billing/settings")
async def get_billing_settings(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    settings = db.execute(
        select(BillingSettings).where(BillingSettings.tenant_id == tenant_id)
    ).scalars().first()

    if settings is None:
        return {
            "name": "",
            "legal_name": None,
            "gstin": None,
            "pan": None,
            "registration_no": None,
            "address_line1": None,
            "address_line2": None,
            "city": None,
            "state": None,
            "state_code": None,
            "pincode": None,
            "email": None,
            "phone": None,
            "currency": "INR",
            "invoice_prefix": "INV",
            "next_invoice_number": 1,
            "default_gst_rate": 18.0,
            "gst_registered": False,
        }

    tenant_name = getattr(principal, "tenant_name", None) or settings.legal_name or ""

    return {
        "name": tenant_name,
        "legal_name": settings.legal_name,
        "gstin": settings.gstin,
        "pan": settings.pan,
        "registration_no": None,
        "address_line1": settings.address_line1,
        "address_line2": settings.address_line2,
        "city": settings.city,
        "state": settings.state,
        "state_code": settings.state_code,
        "pincode": settings.pincode,
        "email": settings.email,
        "phone": settings.phone,
        "currency": "INR",
        "invoice_prefix": "INV",
        "next_invoice_number": 1,
        "default_gst_rate": float(settings.tax_rate) if settings.tax_rate else 18.0,
        "gst_registered": bool(settings.gstin),
    }


@router.patch("/billing/settings")
async def update_billing_settings(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    user_id = principal.id

    body = await request.json()

    settings = db.execute(
        select(BillingSettings).where(BillingSettings.tenant_id == tenant_id)
    ).scalars().first()

    if settings is None:
        settings = BillingSettings(
            tenant_id=tenant_id,
        )
        db.add(settings)

    # Update fields that exist on the model
    updatable_fields = [
        "legal_name", "trade_name", "pan", "gstin",
        "address_line1", "address_line2", "city", "state",
        "state_code", "pincode", "country", "phone", "email",
        "gst_tax_type", "sac_code", "payment_terms_days", "round_off",
    ]
    for field in updatable_fields:
        if field in body:
            setattr(settings, field, body[field])

    db.commit()
    db.refresh(settings)

    tenant_name = getattr(principal, "tenant_name", None) or settings.legal_name or ""

    return {
        "name": tenant_name,
        "legal_name": settings.legal_name,
        "gstin": settings.gstin,
        "pan": settings.pan,
        "registration_no": None,
        "address_line1": settings.address_line1,
        "address_line2": settings.address_line2,
        "city": settings.city,
        "state": settings.state,
        "state_code": settings.state_code,
        "pincode": settings.pincode,
        "email": settings.email,
        "phone": settings.phone,
        "currency": "INR",
        "invoice_prefix": "INV",
        "next_invoice_number": 1,
        "default_gst_rate": float(settings.tax_rate) if settings.tax_rate else 18.0,
        "gst_registered": bool(settings.gstin),
    }