"""Financial years router.

Endpoints:
  GET /financial-years   — list financial years
  PATCH /financial-years/{fy_id}/activate   — activate a financial year
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update

from app.core.db import SessionLocal, get_db
from app.core.security import get_current_user
from app.models import FinancialYear

router = APIRouter(tags=["financial_years"])


@router.get("/financial-years")
async def list_financial_years(
    request: Request,
    include_closed: bool = False,
    limit: int = 50,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    stmt = select(FinancialYear).where(FinancialYear.tenant_id == tenant_id)
    if not include_closed:
        stmt = stmt.where(FinancialYear.is_closed.is_(False))

    rows = db.execute(stmt.order_by(FinancialYear.start_date.desc()).limit(limit)).scalars().all()

    return [
        {
            "id": str(f.id),
            "code": f.code,
            "label": f.label,
            "start_date": f.start_date.strftime("%Y-%m-%d") if f.start_date else None,
            "end_date": f.end_date.strftime("%Y-%m-%d") if f.end_date else None,
            "assessment_year": f.assessment_year,
            "is_active": f.is_active,
            "is_closed": f.is_closed,
            "closed_on": f.closed_on.strftime("%Y-%m-%d") if f.closed_on else None,
        }
        for f in rows
    ]


@router.patch("/financial-years/{fy_id}/activate")
async def activate_financial_year(
    fy_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    stmt = (
        update(FinancialYear)
        .where(FinancialYear.id == fy_id, FinancialYear.tenant_id == tenant_id)
        .values(is_active=True)
    )
    result = db.execute(stmt)
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Financial year not found")

    stmt = (
        update(FinancialYear)
        .where(FinancialYear.tenant_id == tenant_id, FinancialYear.id != fy_id)
        .values(is_active=False)
    )
    db.execute(stmt)
    db.commit()

    fy = (
        db.execute(select(FinancialYear).where(FinancialYear.id == fy_id)).scalars().first()
    )
    if not fy:
        raise HTTPException(status_code=404, detail="Financial year not found")

    return {
        "id": str(fy.id),
        "code": fy.code,
        "label": fy.label,
        "start_date": fy.start_date.strftime("%Y-%m-%d") if fy.start_date else None,
        "end_date": fy.end_date.strftime("%Y-%m-%d") if fy.end_date else None,
        "assessment_year": fy.assessment_year,
        "is_active": True,
        "is_closed": fy.is_closed,
        "closed_on": fy.closed_on.strftime("%Y-%m-%d") if fy.closed_on else None,
    }