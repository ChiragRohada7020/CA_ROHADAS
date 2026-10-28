"""Compliance router — rules, calendar, and deadlines.

Endpoints:
  GET /compliance/calendar   — compliance calendar entries
  GET /compliance/rules      — compliance rules
  GET /compliance/filings    — filing records for a task
  POST /compliance/filings   — record a filing for a task
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, Request, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models import Client, ComplianceRule, Deadline, DeadlineOverride, FilingRecord, Task, User

router = APIRouter(tags=["compliance"])


@router.get("/compliance/calendar")
async def get_compliance_calendar(
    request: Request,
    from_date: str | None = None,
    to_date: str | None = None,
    only_unverified: bool = False,
    include_filed: bool = False,
    limit: int = 500,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    today = date.fromisoformat(from_date) if from_date else date.today()
    end = date.fromisoformat(to_date) if to_date else date.today()

    stmt = (
        select(
            Deadline.id.label("deadline_id"),
            Deadline.client_id.label("client_id"),
            Deadline.compliance_rule_id.label("compliance_rule_id"),
            Deadline.task_id.label("task_id"),
            Deadline.statutory_due_date.label("statutory_due_date"),
            Deadline.internal_due_date.label("internal_due_date"),
            Deadline.verified.label("verified"),
            Deadline.notes.label("notes"),
            Deadline.period_key.label("period_key"),
            ComplianceRule.name.label("rule_name"),
            ComplianceRule.code.label("rule_code"),
            Client.trade_name.label("trade_name"),
            Client.legal_name.label("legal_name"),
            Client.client_code.label("client_code"),
            Task.status.label("task_status"),
            Task.priority.label("priority"),
            Task.filed_at.label("filed_at"),
            Task.approval_status.label("approval_status"),
            Task.filing_status.label("task_filing_status"),
        )
        .select_from(
            Deadline.__table__.outerjoin(ComplianceRule, ComplianceRule.id == Deadline.compliance_rule_id)
            .outerjoin(Client, Client.id == Deadline.client_id)
            .outerjoin(Task, Task.id == Deadline.task_id)
        )
        .where(
            Deadline.tenant_id == tenant_id,
            Deadline.statutory_due_date.is_not(None),
            Deadline.statutory_due_date >= datetime.combine(today, datetime.min.time()),
            Deadline.statutory_due_date <= datetime.combine(end, datetime.max.time()),
        )
        .order_by(Deadline.statutory_due_date.asc())
        .limit(limit)
    )

    if only_unverified:
        stmt = stmt.where(Deadline.verified.is_(False))
    if not include_filed:
        stmt = stmt.where((Task.filed_at.is_(None)) & (Deadline.verified.is_(False)))

    rows = db.execute(stmt).all()

    entries = []
    for r in rows:
        due_date = r.statutory_due_date.date() if isinstance(r.statutory_due_date, datetime) else r.statutory_due_date
        days_remaining = (due_date - today).days if due_date else 0
        is_filed = bool(r.filed_at) or bool(r.verified)
        if is_filed:
            status = "filed"
        elif r.task_status:
            status = r.task_status
        else:
            status = "open"
        client_name = r.trade_name or r.legal_name or r.client_code or None
        rule_name = r.rule_name or r.notes or "Compliance obligation"
        entries.append({
            "task_id": str(r.task_id) if r.task_id else None,
            "deadline_id": str(r.deadline_id),
            "client_id": str(r.client_id) if r.client_id else None,
            "client_name": client_name,
            "compliance_rule_id": str(r.compliance_rule_id) if r.compliance_rule_id else None,
            "rule_name": rule_name,
            "filing_type": r.task_filing_status,
            "period_key": r.period_key,
            "statutory_due_date": due_date.isoformat() if due_date else None,
            "internal_due_date": r.internal_due_date.isoformat() if isinstance(r.internal_due_date, date) else (r.internal_due_date.date().isoformat() if isinstance(r.internal_due_date, datetime) else None),
            "verified": bool(r.verified),
            "status": status,
            "priority": (r.priority or "normal"),
            "preparer_id": None,
            "reviewer_id": None,
            "days_remaining": days_remaining,
            "is_overdue": days_remaining < 0,
            "is_filed": bool(is_filed),
            "authority": None,
        })

    return {
        "from_date": today.isoformat(),
        "to_date": end.isoformat(),
        "total": len(entries),
        "overdue_count": sum(1 for e in entries if e["is_overdue"]),
        "unverified_count": sum(1 for e in entries if not e["verified"]),
        "entries": entries,
    }


@router.get("/compliance/rules")
async def get_compliance_rules(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    rules = db.execute(
        select(
            ComplianceRule.id,
            ComplianceRule.name,
            ComplianceRule.code,
            ComplianceRule.description,
            ComplianceRule.category,
            ComplianceRule.authority,
            ComplianceRule.filing_type,
            ComplianceRule.default_frequency,
            ComplianceRule.lead_days,
            ComplianceRule.status,
        ).where(ComplianceRule.tenant_id == tenant_id)
    ).all()

    return [
        {
            "id": str(r.id),
            "code": r.code,
            "name": r.name,
            "description": r.description,
            "category": r.category,
            "filing_type": r.filing_type,
            "authority": r.authority,
            "frequency": r.default_frequency,
            "lead_days": r.lead_days,
            "is_active": r.status == "active",
        }
        for r in rules
    ]


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    v = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(v)
    except ValueError:
        if "T" not in v:
            return datetime.combine(date.fromisoformat(v), datetime.min.time())
        return None


def _row_from_record(fr: FilingRecord, filed_by_name: str | None) -> dict:
    return {
        "id": str(fr.id),
        "task_id": str(fr.task_id) if fr.task_id else None,
        "client_id": str(fr.client_id) if fr.client_id else None,
        "compliance_rule_id": str(fr.compliance_rule_id) if fr.compliance_rule_id else None,
        "period_key": fr.period_key,
        "filing_type": fr.filing_type,
        "filed_on": fr.filed_on.isoformat() if fr.filed_on else None,
        "acknowledgement_number": fr.acknowledgement_number,
        "portal_reference": fr.portal_reference,
        "filed_by_id": str(fr.filed_by_id) if fr.filed_by_id else None,
        "filed_by_name": filed_by_name,
        "proof_document_id": str(fr.proof_document_id) if fr.proof_document_id else None,
        "status": fr.status,
        "late_fee_paid": int(fr.late_fee_paid) if fr.late_fee_paid is not None else None,
        "remarks": fr.remarks,
        "created_at": fr.created_at.isoformat() if fr.created_at else None,
    }


@router.get("/compliance/filings")
async def list_filing_records(
    request: Request,
    task_id: str | None = None,
    client_id: str | None = None,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    if not task_id and not client_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="task_id or client_id is required",
        )

    stmt = select(FilingRecord).where(FilingRecord.tenant_id == tenant_id)
    if task_id:
        stmt = stmt.where(FilingRecord.task_id == task_id)
    if client_id:
        stmt = stmt.where(FilingRecord.client_id == client_id)
    stmt = stmt.order_by(FilingRecord.created_at.desc()).limit(200)

    rows = db.execute(stmt).scalars().all()
    return {"items": [_row_from_record(r, None) for r in rows]}


@router.post("/compliance/filings")
async def create_filing_record(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    payload: dict = await request.json()
    client_id = payload.get("client_id")
    task_id = payload.get("task_id")
    filing_type = payload.get("filing_type") or payload.get("filing_type")
    filing_status = payload.get("status", "pending")

    if not client_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="client_id is required")
    if not filing_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="filing_type is required")

    client = db.get(Client, client_id)
    if client is None or str(client.tenant_id) != str(tenant_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Client {client_id} not found")

    task = None
    if task_id:
        task = db.get(Task, task_id)
        if task is None or str(task.tenant_id) != str(tenant_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                                detail=f"Task {task_id} not found")
        # (client, task) must belong together
        if task.client_id and str(task.client_id) != str(client_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Task does not belong to the given client")

    fr = FilingRecord(
        tenant_id=tenant_id,
        client_id=client_id,
        task_id=task_id,
        filing_type=filing_type,
        status=filing_status,
        filed_on=_parse_dt(payload.get("filed_on")),
        acknowledgement_number=payload.get("acknowledgement_number"),
        portal_reference=payload.get("portal_reference"),
        period_key=payload.get("period_key"),
        late_fee_paid=int(payload["late_fee_paid"]) if payload.get("late_fee_paid") is not None else 0,
        remarks=payload.get("remarks"),
        filed_by_id=principal.user_id,
        created_at=datetime.utcnow(),
    )
    db.add(fr)
    db.flush()

    # Advance the task's filing axis as the UI contract describes: an ARN
    # means "acknowledged", otherwise "filed".
    if task is not None and not getattr(task, "_filing_advanced", False):
        if fr.acknowledgement_number:
            task.filing_status = "acknowledged"
        else:
            task.filing_status = "filed"
        task.filed_at = fr.filed_on or fr.created_at
        task._filing_advanced = True

    db.commit()
    db.refresh(fr)
    name = None
    if fr.filed_by_id:
        u = db.get(User, fr.filed_by_id)
        name = u.full_name if u else None
    return _row_from_record(fr, name)


@router.get("/compliance/rules")
async def list_compliance_rules(
    request: Request,
    service_id: str | None = None,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    stmt = select(ComplianceRule).where(ComplianceRule.tenant_id == tenant_id)
    if service_id:
        stmt = stmt.where(ComplianceRule.service_id == service_id)
    stmt = stmt.order_by(ComplianceRule.created_at.asc())
    rows = db.execute(stmt).scalars().all()
    return [
        {
            "id": str(r.id),
            "service_id": str(r.service_id) if r.service_id else None,
            "rule_code": r.rule_code,
            "name": r.name,
            "description": r.description,
            "recurrence": r.recurrence,
            "due_day_token": r.due_day_token,
            "applies_to_entity_type": r.applies_to_entity_type,
            "turnover_threshold": r.turnover_threshold,
            "is_mandatory": bool(r.is_mandatory),
            "active": bool(r.active),
            "deadline_verified": bool(r.deadline_verified),
            "effective_from": r.effective_from.isoformat() if r.effective_from else None,
            "effective_to": r.effective_to.isoformat() if r.effective_to else None,
        }
        for r in rows
    ]


@router.post("/compliance/rules", dependencies=[Depends(require_permission("compliance.manage"))])
async def create_compliance_rule(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    payload = await request.json()
    rule = ComplianceRule(
        tenant_id=tenant_id,
        service_id=payload.get("service_id") if payload.get("service_id") else None,
        rule_code=payload.get("rule_code") or payload.get("code"),
        name=payload.get("name"),
        description=payload.get("description"),
        recurrence=payload.get("recurrence") or "annual",
        due_day_token=payload.get("due_day_token") or payload.get("due_rule"),
        applies_to_entity_type=payload.get("applies_to_entity_type"),
        turnover_threshold=int(payload.get("turnover_threshold")) if payload.get("turnover_threshold") is not None else None,
        is_mandatory=bool(payload.get("is_mandatory", True)),
        active=bool(payload.get("active", True)),
        deadline_verified=bool(payload.get("deadline_verified", False)),
        effective_from=_parse_dt(payload.get("effective_from")) or datetime.utcnow(),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return {"id": str(rule.id)}


@router.put("/compliance/rules/{rule_id}", dependencies=[Depends(require_permission("compliance.manage"))])
async def update_compliance_rule(
    request: Request,
    rule_id: str,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    rule = db.get(ComplianceRule, rule_id)
    if rule is None or str(rule.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Rule {rule_id} not found")
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    for k in ["name", "description", "recurrence", "due_day_token", "applies_to_entity_type", "rule_code"]:
        if k in payload and payload[k] is not None:
            setattr(rule, k, payload[k])
    if "service_id" in payload:
        rule.service_id = payload["service_id"] or None
    if "turnover_threshold" in payload:
        rule.turnover_threshold = int(payload["turnover_threshold"]) if payload["turnover_threshold"] is not None else None
    if "is_mandatory" in payload:
        rule.is_mandatory = bool(payload["is_mandatory"])
    if "active" in payload:
        rule.active = bool(payload["active"])
    if "deadline_verified" in payload:
        rule.deadline_verified = bool(payload["deadline_verified"])
    if "effective_from" in payload and payload.get("effective_from"):
        rule.effective_from = _parse_dt(payload["effective_from"]) or rule.effective_from
    if "effective_to" in payload:
        rule.effective_to = _parse_dt(payload["effective_to"])
    rule.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rule)
    return {"id": str(rule.id)}


@router.get("/compliance/deadlines/overrides")
async def list_deadline_overrides(
    request: Request,
    task_id: str | None = None,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    stmt = select(DeadlineOverride).where(DeadlineOverride.tenant_id == tenant_id)
    if task_id:
        stmt = stmt.where(DeadlineOverride.task_id == task_id)
    rows = db.execute(stmt.order_by(DeadlineOverride.created_at.desc())).scalars().all()
    return [
        {
            "id": str(r.id),
            "task_id": str(r.task_id),
            "compliance_rule_id": str(r.compliance_rule_id) if r.compliance_rule_id else None,
            "original_due_date": r.original_due_date.isoformat() if r.original_due_date else None,
            "new_due_date": r.new_due_date.isoformat() if r.new_due_date else None,
            "reason": r.reason,
            "status": r.status,
            "requested_by_id": str(r.requested_by_id) if r.requested_by_id else None,
            "approved_by_id": str(r.approved_by_id) if r.approved_by_id else None,
            "approved_at": r.approved_at.isoformat() if r.approved_at else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.post("/compliance/deadlines/override", dependencies=[Depends(require_permission("compliance.override"))])
async def request_deadline_override(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    task_id = payload.get("task_id")
    if not task_id:
        raise HTTPException(status_code=400, detail="task_id is required")
    task = db.get(Task, task_id)
    if task is None or str(task.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Task {task_id} not found")
    original = _parse_dt(payload.get("original_due_date")) or task.statutory_due_date
    new_due = _parse_dt(payload.get("new_due_date"))
    if not new_due:
        raise HTTPException(status_code=400, detail="new_due_date is required")
    reason = payload.get("reason") or ""
    if not reason.strip():
        raise HTTPException(status_code=400, detail="reason is required")

    ov = DeadlineOverride(
        tenant_id=tenant_id,
        task_id=task_id,
        compliance_rule_id=payload.get("compliance_rule_id") or None,
        original_due_date=original,
        new_due_date=new_due,
        reason=reason,
        status="pending",
        requested_by_id=principal.id,
        created_at=datetime.utcnow(),
    )
    db.add(ov)
    db.commit()
    db.refresh(ov)
    return {"id": str(ov.id), "status": ov.status}


@router.post("/compliance/deadlines/override/{override_id}/approve", dependencies=[Depends(require_permission("compliance.override"))])
async def approve_deadline_override(
    request: Request,
    override_id: str,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    ov = db.get(DeadlineOverride, override_id)
    if ov is None or str(ov.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Override {override_id} not found")
    if ov.status != "pending":
        raise HTTPException(status_code=400, detail="Override already processed")
    ov.status = "approved"
    ov.approved_by_id = principal.id
    ov.approved_at = datetime.utcnow()
    task = db.get(Task, ov.task_id)
    if task and str(task.tenant_id) == str(tenant_id):
        task.statutory_due_date = ov.new_due_date
        task.internal_due_date = ov.new_due_date
    db.commit()
    return {"id": str(ov.id), "status": ov.status}
