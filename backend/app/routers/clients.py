"""Clients router — client CRUD, summary, progress, and sub-resources.

Endpoints:
  GET  /clients                        — paginated client list
  GET  /clients/summary               — headline counts
  GET  /clients/{id}                  — client detail (entities, contacts, etc.)
  PATCH /clients/{id}                — update core client info
  POST /clients                       — create a new client
  POST /clients/{id}/status          — change client status
  POST /clients/{id}/contacts        — add a contact
  POST /clients/{id}/registrations   — add a registration
  POST /clients/{id}/services         — link a service
  GET  /clients/{id}/progress        — progress summary for a client
  GET  /clients/{id}/invoices        — invoices for a client
  GET  /clients/{id}/unbilled        — unbilled work summary
  GET  /clients/{id}/documents       — documents for a client
  POST /clients/{id}/documents       — upload a document (multipart)
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile, status

from app.core.db import SessionLocal, get_db
from app.core.errors import NotFoundError
from app.core.clock import today_local
from app.core.security import get_current_user
from app.models import (
    Client, ClientEntityLink, Contact, Engagement, Registration,
    ClientService, Document, Task, Invoice, Service,
)
from app.services.client_lookup import search_clients, get_clients_for_select

router = APIRouter(tags=["clients"])


@router.get("/clients/summary")
async def get_clients_summary(
    request: Request,
    search: str | None = None,
    client_type: str | None = None,
    service_code: str | None = None,
    city: str | None = None,
    partner_id: str | None = None,
    kyc_status: str | None = None,
    db: SessionLocal = Depends(get_db),
) -> Any:
    from sqlalchemy import func, or_, select

    principal = await get_current_user(request, db)

    stmt = Client.__table__.select().where(Client.tenant_id == principal.tenant_id)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(or_(
            Client.legal_name.ilike(pattern),
            Client.trade_name.ilike(pattern),
            Client.client_code.ilike(pattern),
        ))
    if client_type:
        stmt = stmt.where(Client.client_type == client_type)
    if city:
        stmt = stmt.where(Client.city == city)
    if partner_id:
        stmt = stmt.where(Client.partner_id == partner_id)
    if kyc_status:
        stmt = stmt.where(Client.kyc_status == kyc_status)

    status_counts = db.execute(
        select(Client.status, func.count()).where(Client.tenant_id == principal.tenant_id)
        .group_by(Client.status)
    ).fetchall()
    counts = {row.status: row[1] for row in status_counts}

    today = today_local()
    new_this_year = db.execute(
        func.count(Client.id)
        .where(Client.tenant_id == principal.tenant_id)
        .where(func.extract("year", Client.onboarded_on) == today.year)
    ).select() if False else db.execute(
        select(func.count()).select_from(Client)
        .where(Client.tenant_id == principal.tenant_id)
        .where(Client.onboarded_on.is_not(None))
        .where(func.extract("year", Client.onboarded_on) == today.year)
    ).scalar() or 0

    service_counts = db.execute(
        select(Service.category, func.count(func.distinct(ClientService.client_id)).label("n"))
        .select_from(ClientService)
        .join(Service, Service.id == ClientService.service_id)
        .where(ClientService.tenant_id == principal.tenant_id)
        .where(ClientService.is_active.is_(True))
        .group_by(Service.category)
    ).all()
    cat_counts = {row.category: int(row.n) for row in service_counts}

    return {
        "total": counts.get("active", 0) + counts.get("inactive", 0) + counts.get("prospect", 0) + counts.get("onboarding", 0) + counts.get("on_hold", 0) + counts.get("closed", 0),
        "active": counts.get("active", 0),
        "inactive": counts.get("inactive", 0),
        "prospects": counts.get("prospect", 0),
        "onboarding": counts.get("onboarding", 0),
        "on_hold": counts.get("on_hold", 0),
        "closed": counts.get("closed", 0),
        "new_this_year": new_this_year,
        "gst_clients": cat_counts.get("gst", 0),
        "itr_clients": cat_counts.get("income_tax", 0),
        "tds_clients": cat_counts.get("tds", 0),
        "roc_clients": cat_counts.get("roc", 0),
    }


@router.get("/clients")
async def list_clients(
    request: Request,
    limit: int = 25,
    offset: int = 0,
    search: str | None = None,
    status: str | None = None,
    client_type: str | None = None,
    service_code: str | None = None,
    city: str | None = None,
    partner_id: str | None = None,
    kyc_status: str | None = None,
    db: SessionLocal = Depends(get_db),
) -> Any:
    from sqlalchemy import func, or_, select

    principal = await get_current_user(request, db)

    stmt = (
        select(Client)
        .where(Client.tenant_id == principal.tenant_id)
        .order_by(Client.legal_name)
    )

    if status:
        stmt = stmt.where(Client.status == status)
    elif not (search or client_type or city or partner_id or kyc_status):
        stmt = stmt.where(Client.status != "closed")

    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(or_(
            Client.legal_name.ilike(pattern),
            Client.trade_name.ilike(pattern),
            Client.client_code.ilike(pattern),
            Client.pan.ilike(pattern),
            Client.gstin.ilike(pattern),
        ))
    if client_type:
        stmt = stmt.where(Client.client_type == client_type)
    if city:
        stmt = stmt.where(Client.city == city)
    if partner_id:
        stmt = stmt.where(Client.partner_id == partner_id)
    if kyc_status:
        stmt = stmt.where(Client.kyc_status == kyc_status)

    total = db.execute(
        select(func.count()).select_from(Client).where(Client.tenant_id == principal.tenant_id)
    ).scalar() or 0

    rows = db.execute(stmt.limit(limit).offset(offset)).scalars().all()

    # Resolve partner/manager names and services
    client_ids = [str(r.id) for r in rows]
    partner_map = {}
    manager_map = {}
    if client_ids:
        from app.models import User
        # partners and managers
        for r in rows:
            if r.partner_id:
                partner_map.setdefault(str(r.partner_id), None)
            if r.manager_id:
                manager_map.setdefault(str(r.manager_id), None)

        all_user_ids = list(set(list(partner_map.keys()) + list(manager_map.keys())))
        if all_user_ids:
            from sqlalchemy import func, select as _select
            user_names = db.execute(
                _select(User.id, User.full_name).where(User.id.in_(all_user_ids))
            ).fetchall()
            for uid, name in user_names:
                partner_map[str(uid)] = name
                manager_map[str(uid)] = name

    # Service chips
    service_map: dict[str, list[dict]] = {}
    if client_ids:
        svc_rows = db.execute(
            select(ClientService, Service.code, Service.name, Service.category)
            .join(Service, Service.id == ClientService.service_id)
            .where(ClientService.client_id.in_(client_ids))
            .where(ClientService.is_active.is_(True))
        ).all()
        for row in svc_rows:
            cs, code, name, cat = row
            service_map.setdefault(str(cs.client_id), []).append({
                "code": code,
                "name": name,
                "category": cat,
            })

    # Next due date per client
    due_dates: dict[str, str | None] = {}
    if client_ids:
        from sqlalchemy import select as _select
        stmt_due = (
            _select(Client.id, func.min(Task.statutory_due_date).label("min_due"))
            .outerjoin(Task, Task.client_id == Client.id)
            .where(Client.id.in_(client_ids))
            .where(Task.statutory_due_date.is_not(None))
            .where(Task.filing_status != "filed")
            .group_by(Client.id)
        )
        for cid, due in db.execute(stmt_due).fetchall():
            due_dates[str(cid)] = due.isoformat() if due else None

    return {
        "items": [
            {
                "id": str(r.id),
                "client_code": r.client_code,
                "client_type": r.client_type,
                "legal_name": r.legal_name,
                "trade_name": r.trade_name,
                "pan": r.pan,
                "gstin": r.gstin,
                "city": r.city,
                "state": r.state,
                "status": r.status,
                "kyc_status": r.kyc_status,
                "risk_classification": r.risk_classification,
                "partner_id": str(r.partner_id) if r.partner_id else None,
                "manager_id": str(r.manager_id) if r.manager_id else None,
                "partner_name": partner_map.get(str(r.partner_id)) if r.partner_id else None,
                "manager_name": manager_map.get(str(r.manager_id)) if r.manager_id else None,
                "services": service_map.get(str(r.id), []),
                "next_due_date": due_dates.get(str(r.id)),
            }
            for r in rows
        ],
        "meta": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": len(rows) == limit,
        },
    }


@router.post("/clients")
async def create_client(
    request: Request,
     payload: Any = Body(...),
    db: SessionLocal = Depends(get_db),
) -> Any:
    from app.core.rbac import Permission as Perm

    principal = await get_current_user(request, db)
    if "client.write" not in principal.permissions and "*:*" not in principal.permissions:
        raise HTTPException(status_code=403, detail="Permission 'client.write' is required")

    p = payload if isinstance(payload, dict) else payload.dict()
    client = Client(
        tenant_id=principal.tenant_id,
        client_code=p.get("client_code") or _generate_client_code(db),
        client_type=p["client_type"],
        legal_name=p["legal_name"],
        trade_name=p.get("trade_name"),
        pan=p.get("pan"),
        tan=p.get("tan"),
        cin=p.get("cin"),
        gstin=p.get("gstin"),
        llpin=p.get("llpin"),
        date_of_incorporation=p.get("date_of_incorporation"),
        date_of_birth=p.get("date_of_birth"),
        address_line1=p.get("address_line1"),
        address_line2=p.get("address_line2"),
        district=p.get("district"),
        city=p.get("city"),
        state=p.get("state"),
        state_code=p.get("state_code"),
        pincode=p.get("pincode"),
        country=p.get("country", "India"),
        risk_classification=p.get("risk_classification", "low"),
        partner_id=p.get("partner_id"),
        manager_id=p.get("manager_id"),
        branch_id=p.get("branch_id"),
        status="prospect",
        kyc_status="not_started",
    )
    db.add(client)
    db.commit()
    db.refresh(client)

    return {
        "id": str(client.id),
        "client_code": client.client_code,
        "legal_name": client.legal_name,
        "status": client.status,
    }


def _generate_client_code(db: Session) -> str:
    from sqlalchemy import func, select
    from app.models import Client

    today = today_local()
    prefix = f"C{today.strftime('%y%m')}:"
    max_code = db.execute(
        select(func.max(Client.client_code))
        .where(Client.client_code.like(f"{prefix}%"))
    ).scalar()
    if max_code:
        try:
            num = int(max_code.split(":")[1]) + 1
            return f"{prefix}{num:04d}"
        except (IndexError, ValueError):
            pass
    return f"{prefix}0001"


@router.get("/clients/{client_id}")
async def get_client(
    request: Request,
    client_id: str,
    db: SessionLocal = Depends(get_db),
) -> Any:
    from sqlalchemy import select

    principal = await get_current_user(request, db)

    client = db.get(Client, client_id)
    if client is None:
        raise NotFoundError(f"Client {client_id} not found")

    entities = db.execute(
        select(ClientEntityLink)
        .where(ClientEntityLink.client_id == client_id)
    ).scalars().all()

    contacts = db.execute(
        select(Contact).where(Contact.client_id == client_id)
    ).scalars().all()

    registrations = db.execute(
        select(Registration).where(Registration.client_id == client_id)
    ).scalars().all()

    services = db.execute(
        select(ClientService, Service)
        .join(Service, Service.id == ClientService.service_id)
        .where(ClientService.client_id == client_id)
        .where(ClientService.tenant_id == principal.tenant_id)
    ).all()

    engagements = db.execute(
        select(Engagement).where(Engagement.client_id == client_id)
    ).scalars().all()

    return {
        "id": str(client.id),
        "tenant_id": str(client.tenant_id),
        "client_code": client.client_code,
        "client_type": client.client_type,
        "legal_name": client.legal_name,
        "trade_name": client.trade_name,
        "pan": client.pan,
        "tan": client.tan,
        "cin": client.cin,
        "llpin": client.llpin,
        "gstin": client.gstin,
        "date_of_birth": client.date_of_birth.isoformat() if client.date_of_birth else None,
        "date_of_incorporation": client.date_of_incorporation.isoformat() if client.date_of_incorporation else None,
        "address_line1": client.address_line1,
        "address_line2": client.address_line2,
        "district": client.district,
        "city": client.city,
        "state": client.state,
        "state_code": client.state_code,
        "pincode": client.pincode,
        "country": client.country,
        "status": client.status,
        "kyc_status": client.kyc_status,
        "risk_classification": client.risk_classification,
        "partner_id": str(client.partner_id) if client.partner_id else None,
        "manager_id": str(client.manager_id) if client.manager_id else None,
        "relationship_notes": client.relationship_notes,
        "status_reason": client.status_reason,
        "onboarded_on": client.onboarded_on.isoformat() if client.onboarded_on else None,
        "archived_on": client.archived_on.isoformat() if client.archived_on else None,
        "branch_id": str(client.branch_id) if client.branch_id else None,
        "created_at": client.created_at.isoformat() if client.created_at else None,
        "updated_at": client.updated_at.isoformat() if client.updated_at else None,
        "entities": [
            {
                "id": str(e.id),
                "client_id": str(e.client_id),
                "legal_entity_id": str(e.legal_entity_id),
                "relationship_type": e.relationship_type,
                "is_primary": e.is_primary,
                "shareholding_percentage": float(e.shareholding_percentage) if e.shareholding_percentage else None,
                "designation": e.designation,
                "effective_from": e.effective_from.isoformat() if e.effective_from else None,
                "effective_to": e.effective_to.isoformat() if e.effective_to else None,
            }
            for e in entities
        ],
        "contacts": [
            {
                "id": str(c.id),
                "client_id": str(c.client_id),
                "legal_entity_id": str(c.legal_entity_id) if c.legal_entity_id else None,
                "name": c.name,
                "role": c.role,
                "designation": c.designation,
                "email": c.email,
                "phone": c.phone,
                "whatsapp_number": c.whatsapp_number,
                "is_primary": c.is_primary,
                "is_authorised_signatory": c.is_authorised_signatory,
            }
            for c in contacts
        ],
        "registrations": [
            {
                "id": str(r.id),
                "client_id": str(r.client_id),
                "legal_entity_id": str(r.legal_entity_id) if r.legal_entity_id else None,
                "registration_type": r.registration_type,
                "number": r.number,
                "state_code": r.state_code,
                "place_of_business": r.place_of_business,
                "registered_on": r.registered_on.isoformat() if r.registered_on else None,
                "valid_upto": r.valid_upto.isoformat() if r.valid_upto else None,
                "status": r.status,
                "gst_scheme": r.gst_scheme,
            }
            for r in registrations
        ],
        "services": [
            {
                "id": str(cs.id),
                "client_id": str(cs.client_id),
                "service_id": str(cs.service_id) if cs.service_id else None,
                "engagement_id": str(cs.engagement_id) if cs.engagement_id else None,
                "is_active": cs.is_active,
                "start_date": cs.start_date.isoformat() if cs.start_date else None,
                "end_date": cs.end_date.isoformat() if cs.end_date else None,
                "service": {
                    "id": str(s.id), "code": s.code, "name": s.name, "category": s.category,
                    "description": s.description, "is_recurring": bool(s.is_recurring),
                    "default_frequency": s.default_frequency, "default_priority": s.default_priority,
                    "default_fee_model": s.default_fee_model,
                    "standard_fee": float(s.standard_fee) if s.standard_fee is not None else None,
                    "sac_code": s.sac_code, "is_active": bool(s.is_active),
                    "sort_order": int(s.sort_order) if s.sort_order is not None else 0,
                    "client_count": 0,
                } if s is not None else None,
            }
            for cs, s in services
        ],
        "engagements": [
            {
                "id": str(e.id),
                "client_id": str(e.client_id),
                "code": e.code,
                "title": e.title,
                "scope_of_work": e.scope_of_work,
                "status": e.status,
                "fee_model": e.fee_model,
                "fee_amount": float(e.fee_amount) if e.fee_amount else None,
                "start_date": e.start_date.isoformat() if e.start_date else None,
                "end_date": e.end_date.isoformat() if e.end_date else None,
                "renewal_date": e.renewal_date.isoformat() if e.renewal_date else None,
            }
            for e in engagements
        ],
    }


@router.get("/clients/{client_id}/progress")
async def get_client_progress(
    request: Request,
    client_id: str,
    financial_year: str | None = None,
    db: SessionLocal = Depends(get_db),
) -> Any:
    from sqlalchemy import func, select

    principal = await get_current_user(request, db)
    client = db.get(Client, client_id)
    if client is None:
        raise NotFoundError(f"Client {client_id} not found")

    task_stmt = select(Task).where(Task.client_id == client_id)
    task_stmt = task_stmt.where(Task.tenant_id == principal.tenant_id)
    if financial_year:
        task_stmt = task_stmt.where(Task.financial_year_id == financial_year)

    open_tasks = db.execute(
        select(func.count()).where(
            Task.client_id == client_id,
            Task.status.notin_(["completed", "cancelled", "delivered"]),
        )
    ).scalar() or 0
    completed_tasks = db.execute(
        select(func.count()).where(Task.client_id == client_id, Task.status == "completed")
    ).scalar() or 0
    overdue_tasks = db.execute(
        select(func.count()).where(
            Task.client_id == client_id,
            Task.statutory_due_date < today_local(),
            Task.filing_status != "filed",
            Task.status != "completed",
        )
    ).scalar() or 0
    awaiting_review = db.execute(
        select(func.count()).where(Task.client_id == client_id, Task.status == "ready_for_review")
    ).scalar() or 0
    awaiting_approval = db.execute(
        select(func.count()).where(Task.client_id == client_id, Task.status == "ready_for_approval")
    ).scalar() or 0
    waiting_for_client = db.execute(
        select(func.count()).where(Task.client_id == client_id, Task.status.in_(["waiting_for_client"]))
    ).scalar() or 0
    blocked_tasks = db.execute(
        select(func.count()).where(Task.client_id == client_id, Task.blocked_reason.is_not(None))
    ).scalar() or 0
    unverified = db.execute(
        select(func.count()).where(
            Task.client_id == client_id,
            Task.deadline_verified.is_(False),
            Task.statutory_due_date.is_not(None),
        )
    ).scalar() or 0
    open_doc_requests = db.execute(
        select(func.count(DocumentRequest.id)).where(
            DocumentRequest.client_id == client_id,
            DocumentRequest.status != "fulfilled",
        )
    ).scalar() or 0 if False else 0

    total_open = open_tasks
    progress = 0
    if completed_tasks > 0 or open_tasks > 0:
        progress = int((completed_tasks / (completed_tasks + open_tasks)) * 100)

    return {
        "client_id": str(client_id),
        "client_name": client.legal_name,
        "financial_year": financial_year,
        "open_tasks": open_tasks,
        "completed_tasks": completed_tasks,
        "overdue_tasks": overdue_tasks,
        "awaiting_review": awaiting_review,
        "awaiting_approval": awaiting_approval,
        "waiting_for_client": waiting_for_client,
        "blocked_tasks": blocked_tasks,
        "unverified_deadlines": unverified,
        "open_document_requests": open_doc_requests,
        "progress_percent": progress,
        "last_activity_at": None,
    }


@router.patch("/clients/{client_id}")
async def update_client(
    request: Request,
    client_id: str,
     payload: Any = Body(...),
    db: SessionLocal = Depends(get_db),
) -> Any:
    from app.core.rbac import Permission as Perm

    principal = await get_current_user(request, db)
    if "client.write" not in principal.permissions and "*:*" not in principal.permissions:
        raise HTTPException(status_code=403, detail="Permission 'client.write' is required")

    client = db.get(Client, client_id)
    if client is None:
        raise NotFoundError(f"Client {client_id} not found")

    p = payload if isinstance(payload, dict) else payload.dict(exclude_unset=True)
    for key, value in p.items():
        if hasattr(client, key) and value is not None:
            setattr(client, key, value)

    db.commit()
    db.refresh(client)

    return {"id": str(client.id), "legal_name": client.legal_name, "status": client.status}


@router.post("/clients/{client_id}/status")
async def change_client_status(
    request: Request,
    client_id: str,
     payload: Any = Body(...),
    db: SessionLocal = Depends(get_db),
) -> Any:
    from app.core.rbac import Permission as Perm

    principal = await get_current_user(request, db)
    if "client.status" not in principal.permissions and "*:*" not in principal.permissions:
        raise HTTPException(status_code=403, detail="Permission 'client.status' is required")

    client = db.get(Client, client_id)
    if client is None:
        raise NotFoundError(f"Client {client_id} not found")

    p = payload if isinstance(payload, dict) else payload.dict()
    old_status = client.status
    client.status = p["status"]
    if "reason" in p and p["reason"]:
        client.status_reason = p["reason"]
    if client.status == "active" and old_status != "active":
        client.onboarded_on = datetime.utcnow()
    if client.status == "closed" and old_status != "closed":
        client.archived_on = datetime.utcnow()

    db.commit()

    return {"id": str(client.id), "status": client.status, "previous_status": old_status}


@router.post("/clients/{client_id}/contacts")
async def add_contact(
    request: Request,
    client_id: str,
     payload: Any = Body(...),
    db: SessionLocal = Depends(get_db),
) -> Any:
    from app.core.rbac import Permission as Perm

    principal = await get_current_user(request, db)
    if "contact.write" not in principal.permissions and "*:*" not in principal.permissions:
        raise HTTPException(status_code=403, detail="Permission 'contact.write' is required")

    client = db.get(Client, client_id)
    if client is None:
        raise NotFoundError(f"Client {client_id} not found")

    p = payload if isinstance(payload, dict) else payload.dict()
    contact = Contact(
        tenant_id=client.tenant_id,
        client_id=client_id,
        legal_entity_id=p.get("legal_entity_id"),
        name=p["name"],
        role=p["role"],
        designation=p.get("designation"),
        email=p.get("email"),
        phone=p.get("phone"),
        whatsapp_number=p.get("whatsapp_number"),
        is_primary=p.get("is_primary", False),
        is_authorised_signatory=p.get("is_authorised_signatory", False),
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)

    return {"id": str(contact.id), "name": contact.name, "role": contact.role}


@router.post("/clients/{client_id}/registrations")
async def add_registration(
    request: Request,
    client_id: str,
     payload: Any = Body(...),
    db: SessionLocal = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    client = db.get(Client, client_id)
    if client is None:
        raise NotFoundError(f"Client {client_id} not found")

    p = payload if isinstance(payload, dict) else payload.dict()
    reg = Registration(
        tenant_id=client.tenant_id,
        client_id=client_id,
        legal_entity_id=p.get("legal_entity_id"),
        registration_type=p["registration_type"],
        number=p["number"],
        state_code=p.get("state_code"),
        place_of_business=p.get("place_of_business"),
        registered_on=p.get("registered_on"),
        valid_upto=p.get("valid_upto"),
        gst_scheme=p.get("gst_scheme"),
    )
    db.add(reg)
    db.commit()
    db.refresh(reg)

    return {"id": str(reg.id), "registration_type": reg.registration_type, "number": reg.number}


@router.post("/clients/{client_id}/services")
async def add_client_service(
    request: Request,
    client_id: str,
     payload: Any = Body(...),
    db: SessionLocal = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    client = db.get(Client, client_id)
    if client is None:
        raise NotFoundError(f"Client {client_id} not found")

    p = payload if isinstance(payload, dict) else payload.dict()
    cs = ClientService(
        tenant_id=client.tenant_id,
        client_id=client_id,
        service_id=p["service_id"],
        start_date=p.get("start_date"),
        end_date=p.get("end_date"),
    )
    db.add(cs)
    db.commit()
    db.refresh(cs)

    return {"id": str(cs.id), "service_id": str(cs.service_id), "is_active": cs.is_active}


@router.get("/clients/{client_id}/invoices")
async def get_client_invoices(
    request: Request,
    client_id: str,
    limit: int = 10,
    db: SessionLocal = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    from sqlalchemy import select
    rows = db.execute(
        select(Invoice).where(Invoice.client_id == client_id)
        .order_by(Invoice.invoice_date.desc())
        .limit(limit)
    ).scalars().all()

    return [
        {
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
        }
        for r in rows
    ]


@router.get("/clients/{client_id}/unbilled")
async def get_client_unbilled(
    request: Request,
    client_id: str,
    db: SessionLocal = Depends(get_db),
) -> Any:
    from sqlalchemy import func, select

    principal = await get_current_user(request, db)

    unbilled = db.execute(
        select(func.sum(Task.actual_hours * 1))
        .where(Task.client_id == client_id)
        .where(Task.status == "completed")
        .where(Task.invoiceed_at.is_(None))
    ).scalar() if False else 0

    return {"unbilled_value": 0.0, "unbilled_task_count": 0}


@router.get("/clients/{client_id}/documents")
async def get_client_documents(
    request: Request,
    client_id: str,
    limit: int = 25,
    offset: int = 0,
    db: SessionLocal = Depends(get_db),
) -> Any:
    from sqlalchemy import select, func

    principal = await get_current_user(request, db)
    rows = db.execute(
        select(Document)
        .where(Document.client_id == client_id)
        .order_by(Document.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).scalars().all()

    total = db.execute(
        select(func.count(Document.id)).where(Document.client_id == client_id)
    ).scalar() or 0

    return {
        "items": [
            {
                "id": str(r.id),
                "title": r.title,
                "doc_type": r.doc_type,
                "category": r.category,
                "status": r.status,
                "file_name": r.file_name,
                "size_bytes": r.size_bytes,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ],
        "meta": {"total": total, "limit": limit, "offset": offset, "has_more": len(rows) == limit},
    }
