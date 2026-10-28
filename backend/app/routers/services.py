"""Services router — service catalogue, service assignments to clients, and related data.

Endpoints:
  GET  /services                     — paginated service catalogue
  POST /services                     — create a service
  GET  /services/{id}                — service detail
  PATCH /services/{id}               — update a service
  GET  /services/by-client/{id}     — services linked to a client
  GET  /services/categories          — distinct service categories
  POST /services/{id}/activate       — activate a client service
  POST /services/{id}/deactivate     — deactivate a client service
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status

from app.core.db import SessionLocal, get_db
from app.core.errors import NotFoundError
from app.core.security import get_current_user
from sqlalchemy.exc import IntegrityError
from app.models import Client, Service, ClientService, Document, TaskTemplate

router = APIRouter(tags=["services"])


def _service_detail_row(svc: Service, db: SessionLocal, principal: Any) -> dict:
    """Build the ServiceDetailRow-shaped dict the frontend consumes.

    Centralised so GET /services/{id}, POST /services and PATCH /services/{id}
    all return the same shape (the field names the frontend type expects, plus the
    nested ``templates``, ``clients`` and ``client_count`` the drawer relies on).
    """
    from sqlalchemy import select
    from app.routers.task_templates import _template_row

    templates = db.execute(
        select(TaskTemplate)
        .where(TaskTemplate.tenant_id == principal.tenant_id)
        .where(TaskTemplate.service_id == svc.id)
        .order_by(TaskTemplate.name)
    ).scalars().all()
    template_rows = [_template_row(t, db, include_steps=True) for t in templates]

    client_links = db.execute(
        select(ClientService, Client)
        .join(Client, Client.id == ClientService.client_id)
        .where(ClientService.tenant_id == principal.tenant_id)
        .where(ClientService.service_id == svc.id)
        .order_by(Client.legal_name)
    ).all()
    clients = [
        {
            "client_id": str(cs.client_id),
            "client_code": client.client_code,
            "legal_name": client.legal_name,
            "client_status": client.status,
            "link_is_active": bool(cs.is_active),
            "start_date": cs.start_date.isoformat() if cs.start_date else None,
        }
        for cs, client in client_links
    ]

    return {
        "id": str(svc.id),
        "code": svc.code,
        "name": svc.name,
        "description": svc.description,
        "category": svc.category,
        "is_recurring": bool(svc.is_recurring),
        "default_frequency": svc.default_frequency,
        "default_priority": svc.default_priority,
        "default_fee_model": svc.default_fee_model,
        "standard_fee": svc.standard_fee,
        "sac_code": svc.sac_code,
        "is_active": bool(svc.is_active),
        "sort_order": svc.sort_order,
        "client_count": len(clients),
        "clients": clients,
        "templates": template_rows,
    }


def _service_write_permission(principal: Any) -> bool:
    perms = principal.permissions
    return (
        "service.create" in perms
        or "service.update" in perms
        or "service.write" in perms
        or "*:*" in perms
    )


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
    # `db.get` fetches by PK regardless of tenant; reject anything that does not
    # belong to the caller so a service id from another tenant never leaks across.
    if svc is None or str(svc.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Service {service_id} not found")

    return _service_detail_row(svc, db, principal)


@router.post("/services")
async def create_service(
    request: Request,
    payload: Any = Body(...),
    db: SessionLocal = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    if not _service_write_permission(principal):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission 'service.create' is required",
        )

    p = payload if isinstance(payload, dict) else payload.dict()
    svc = Service(
        tenant_id=principal.tenant_id,
        code=p["code"],
        name=p["name"],
        category=p["category"],
        description=p.get("description"),
        is_recurring=p.get("is_recurring", False),
        default_frequency=p.get("default_frequency"),
        default_priority=p.get("default_priority", "normal"),
        default_fee_model=p.get("default_fee_model"),
        standard_fee=p.get("standard_fee"),
        sac_code=p.get("sac_code") or "9982",
        is_active=p.get("is_active", True),
        sort_order=p.get("sort_order", 0),
    )
    db.add(svc)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A service with code '{svc.code}' already exists for this firm.",
        )
    db.refresh(svc)
    return _service_detail_row(svc, db, principal)


@router.patch("/services/{service_id}")
async def update_service(
    request: Request,
    service_id: str,
    payload: Any = Body(...),
    db: SessionLocal = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    if not _service_write_permission(principal):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission 'service.update' is required",
        )

    svc = db.get(Service, service_id)
    if svc is None or str(svc.tenant_id) != str(principal.tenant_id):
        raise NotFoundError(f"Service {service_id} not found")

    p = payload if isinstance(payload, dict) else payload.dict()
    updatable = [
        "name", "category", "description", "is_recurring", "default_frequency",
        "default_priority", "default_fee_model", "sac_code", "is_active", "sort_order",
    ]
    for field in updatable:
        if field in p and p[field] is not None:
            setattr(svc, field, p[field])
    # The fee needs three-way handling: unchanged, set to a number, or cleared.
    if p.get("clear_fee"):
        svc.standard_fee = None
    elif "standard_fee" in p and p["standard_fee"] is not None:
        svc.standard_fee = p["standard_fee"]

    db.commit()
    db.refresh(svc)
    return _service_detail_row(svc, db, principal)


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
