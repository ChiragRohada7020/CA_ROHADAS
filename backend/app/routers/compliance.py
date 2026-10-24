"""Compliance router — rules, calendar, and deadlines.

Endpoints:
  GET /compliance/calendar   — compliance calendar entries
  GET /compliance/rules      — compliance rules
"""
from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select

from app.core.db import get_db
from app.core.security import get_current_user
from app.models import Client, ComplianceRule, Deadline, Task

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
            Deadline.statutory_due_date >= today,
            Deadline.statutory_due_date <= end,
        )
        .order_by(Deadline.statutory_due_date.asc())
        .limit(limit)
    )

    if only_unverified:
        stmt = stmt.where(Deadline.verified.is_(False))
    if not include_filed:
        stmt = stmt.where(Task.filed_at.is_(None) & Deadline.verified.is_(False))

    rows = db.execute(stmt).all()

    entries = []
    for r in rows:
        days_remaining = (r.statutory_due_date - today).days if r.statutory_due_date else 0
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
            "statutory_due_date": r.statutory_due_date.isoformat() if r.statutory_due_date else None,
            "internal_due_date": r.internal_due_date.isoformat() if r.internal_due_date else None,
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
        ).where(ComplianceRule.tenant_id == tenant_id)
    ).all()

    return [
        {
            "id": str(r.id),
            "code": r.code,
            "name": r.name,
            "description": r.description,
            "category": None,
            "filing_type": None,
            "authority": None,
            "frequency": None,
            "lead_days": 0,
            "is_active": True,
        }
        for r in rules
    ]

    return [
        {
            "id": str(r.id),
            "code": r.code,
            "name": r.name,
            "description": r.description,
            "category": None,
            "filing_type": None,
            "authority": None,
            "frequency": None,
            "lead_days": 0,
            "is_active": True,
        }
        for r in rules
    ]