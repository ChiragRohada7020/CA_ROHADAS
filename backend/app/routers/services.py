"""Services router — service catalogue, service assignments to clients, and related data.

Endpoints:
  GET  /services                     — paginated service catalogue
  GET  /services/{id}                — service detail
  GET  /services/by-client/{id}     — services linked to a client
  GET  /services/categories          — distinct service categories
  POST /services/{id}/activate       — activate a client service
  POST /services/{id}/deactivate     — deactivate a client service
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request

from app.core.db import SessionLocal, get_db
from app.core.errors import NotFoundError
from app.core.security import get_current_user
from app.models import Client, Service, ClientService, Document

router = APIRouter(tags=["services"])


@router.get("/services/categories")
async def get_service_categories(
    request: Request,
    db: SessionLocal = Depends(get_db),
) -> Any:
    from sqlalchemy import func, select

    principal = await get_current_user(request, db)

    counts = db.execute(
        select(Service.category, func.count().label("cnt"))
        .where(Service.tenant_id == principal.tenant_id)
        .group_by(Service.category)
    ).fetchall()
    count_map = {row[0]: row[1] for row in counts}

    labels = {
        "gst": "GST",
        "income_tax": "Income Tax",
        "tds": "TDS",
        "audit": "Audit & Assurance",
        "roc": "ROC",
        "accounting": "Accounting",
        "payroll": "Payroll",
        "advisory": "Advisory",
        "other": "Other",
    }
    return [
        {"value": val, "label": labels.get(val, val), "service_count": count_map.get(val, 0)}
        for val in ["gst", "income_tax", "tds", "audit", "roc", "accounting", "payroll", "advisory", "other"]
    ]


@router.get("/services/summary")
async def get_services_summary(
    request: Request,
    db: SessionLocal = Depends(get_db),
) -> Any:
    from sqlalchemy import func, select

    principal = await get_current_user(request, db)

    total_services = db.execute(
        select(func.count()).select_from(Service).where(Service.tenant_id == principal.tenant_id)
    ).scalar() or 0
    active_services = db.execute(
        select(func.count()).select_from(Service).where(Service.tenant_id == principal.tenant_id).where(Service.is_active.is_(True))
    ).scalar() or 0
    inactive_services = total_services - active_services
    total_assignments = db.execute(
        select(func.count()).select_from(ClientService).where(ClientService.tenant_id == principal.tenant_id)
    ).scalar() or 0
    recurring_services = db.execute(
        select(func.count()).select_from(Service).where(Service.tenant_id == principal.tenant_id).where(Service.is_recurring.is_(True))
    ).scalar() or 0

    cat_rows = db.execute(
        select(Service.category, func.count().label("cnt"))
        .where(Service.tenant_id == principal.tenant_id)
        .group_by(Service.category)
    ).fetchall()
    cat_map = {row[0]: row[1] for row in cat_rows}

    labels = {
        "gst": "GST", "income_tax": "Income Tax", "tds": "TDS",
        "audit": "Audit & Assurance", "roc": "ROC", "accounting": "Accounting",
        "payroll": "Payroll", "advisory": "Advisory", "other": "Other",
    }

    by_category = []
    for val, label in labels.items():
        svc_count = cat_map.get(val, 0)
        client_count = db.execute(
            select(func.count(func.distinct(ClientService.client_id)))
            .where(ClientService.tenant_id == principal.tenant_id)
            .join(Service, Service.id == ClientService.service_id)
            .where(Service.category == val)
        ).scalar() or 0
        by_category.append({
            "value": val, "label": label,
            "service_count": svc_count, "client_count": client_count,
        })
    assign_rows = db.execute(
        select(
            Service.id.label("service_id"), Service.code, Service.name, Service.category,
            Service.default_frequency.label("frequency"), Service.standard_fee,
            func.count(func.distinct(ClientService.client_id)).label("total_clients"),
        )
        .outerjoin(ClientService, ClientService.service_id == Service.id)
        .where(Service.tenant_id == principal.tenant_id)
        .group_by(Service.id, Service.code, Service.name, Service.category, Service.default_frequency, Service.standard_fee)
        .order_by(func.count(func.distinct(ClientService.client_id)).desc())
    ).fetchall()

    assignments = []
    total_annual = 0.0
    for r in assign_rows:
        fee = float(r.standard_fee) if r.standard_fee else 0.0
        annual = fee if (r.frequency and r.frequency == "one_time") else (fee * 12 if fee else 0.0)
        if annual:
            total_annual += annual
        total_c = r.total_clients or 0
        active_c = db.execute(
            select(func.count(func.distinct(ClientService.client_id)))
            .where(ClientService.service_id == r.service_id)
            .where(ClientService.is_active.is_(True))
        ).scalar() or 0
        assignments.append({
            "service_id": str(r.service_id),
            "code": r.code,
            "name": r.name,
            "category": r.category,
            "frequency": r.frequency,
            "standard_fee": r.standard_fee,
            "annual_fee": round(annual, 2) if annual else None,
            "total_clients": r.total_clients if r.total_clients else 0,
            "active_clients": active_c,
            "inactive_clients": (r.total_clients or 0) - active_c,
            "annual_fees": round(annual * active_c, 2) if annual else 0.0,
        })

    tab_counts = {val: cat_map.get(val, 0) for val in labels}
    tab_counts["recurring_services"] = recurring_services

    return {
        "total_services": total_services,
        "active_services": active_services,
        "inactive_services": inactive_services,
        "total_assignments": total_assignments,
        "recurring_services": recurring_services,
        "total_annual_fees": round(total_annual, 2),
        "by_category": by_category,
        "assignments": assignments,
        "tab_counts": tab_counts,
    }


@router.get("/services")
async def list_services(
    request: Request,
    db: SessionLocal = Depends(get_db),
    limit: int = 50,
    category: str | None = None,
    search: str | None = None,
) -> Any:
    from sqlalchemy import func, select, or_

    principal = await get_current_user(request, db)

    stmt = select(Service).where(Service.tenant_id == principal.tenant_id)
    if category:
        stmt = stmt.where(Service.category == category)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(or_(Service.name.ilike(pattern), Service.code.ilike(pattern)))

    total = db.execute(
        select(func.count()).select_from(Service).where(Service.tenant_id == principal.tenant_id)
    ).scalar() or 0
    rows = db.execute(stmt.limit(limit)).scalars().all()

    return {
        "items": [
            {
                "id": str(r.id),
                "code": r.code,
                "name": r.name,
                "description": r.description,
                "category": r.category,
                "default_duration_days": getattr(r, "default_duration_days", None),
                "default_fee": getattr(r, "default_fee", None) or getattr(r, "standard_fee", None),
                "is_active": r.is_active,
                "is_statutory": getattr(r, "is_statutory", False),
                "applicable_for": getattr(r, "applicable_for", None),
                "filing_frequency": getattr(r, "filing_frequency", None) or r.default_frequency,
                "filing_due_offset_days": getattr(r, "filing_due_offset_days", None),
            }
            for r in rows
        ],
        "meta": {"total": total, "limit": limit, "offset": 0, "has_more": total > limit},
    }


@router.get("/services/{service_id}")
async def get_service(
    request: Request,
    service_id: str,
    db: SessionLocal = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    svc = db.get(Service, service_id)
    if svc is None:
        raise NotFoundError(f"Service {service_id} not found")

    return {
        "id": str(svc.id),
        "code": svc.code,
        "name": svc.name,
        "description": svc.description,
        "category": svc.category,
        "default_duration_days": getattr(svc, "default_duration_days", None),
        "default_fee": getattr(svc, "default_fee", None) or getattr(svc, "standard_fee", None),
        "is_active": svc.is_active,
        "is_statutory": getattr(svc, "is_statutory", False),
        "applicable_for": getattr(svc, "applicable_for", None),
        "filing_frequency": getattr(svc, "filing_frequency", None) or svc.default_frequency,
        "filing_due_offset_days": getattr(svc, "filing_due_offset_days", None),
        "created_at": svc.created_at.isoformat() if svc.created_at else None,
    }


@router.get("/services/by-client/{client_id}")
async def get_services_for_client(
    request: Request,
    client_id: str,
    db: SessionLocal = Depends(get_db),
) -> Any:
    from sqlalchemy import select

    principal = await get_current_user(request, db)
    client = db.get(Client, client_id)
    if client is None:
        raise NotFoundError(f"Client {client_id} not found")

    rows = db.execute(
        select(ClientService)
        .where(ClientService.client_id == client_id)
        .where(ClientService.is_active.is_(True))
        .join(Service, Service.id == ClientService.service_id)
    ).scalars().all()

    return [
        {
            "id": str(cs.id),
            "service_id": str(cs.service_id),
            "service_code": svc.code if (svc := db.get(Service, cs.service_id)) else None,
            "service_name": svc.name if (svc := db.get(Service, cs.service_id)) else None,
            "service_category": svc.category if (svc := db.get(Service, cs.service_id)) else None,
            "start_date": cs.start_date.isoformat() if cs.start_date else None,
            "end_date": cs.end_date.isoformat() if cs.end_date else None,
            "fee_amount": cs.fee_amount,
        }
        for cs in rows
    ]


@router.post("/services/{client_service_id}/activate")
async def activate_client_service(
    request: Request,
    client_service_id: str,
    db: SessionLocal = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    cs = db.get(ClientService, client_service_id)
    if cs is None:
        raise NotFoundError(f"ClientService {client_service_id} not found")

    cs.is_active = True
    db.commit()
    return {"id": str(cs.id), "is_active": cs.is_active}


@router.post("/services/{client_service_id}/deactivate")
async def deactivate_client_service(
    request: Request,
    client_service_id: str,
    db: SessionLocal = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    cs = db.get(ClientService, client_service_id)
    if cs is None:
        raise NotFoundError(f"ClientService {client_service_id} not found")

    cs.is_active = False
    cs.end_date = db.execute(__import__("sqlalchemy").func.now()) if False else None
    db.commit()
    return {"id": str(cs.id), "is_active": cs.is_active}
