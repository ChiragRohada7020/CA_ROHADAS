"""Financial years router.

Endpoints:
  GET /financial-years   — list financial years
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select

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