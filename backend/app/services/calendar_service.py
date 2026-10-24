"""Calendar / compliance scheduling service.

Computes statutory deadlines, calendar entries, and financial-year context.
Also provides the MCP tool handler for listing financial years.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import NotFoundError
from app.models import FinancialYear
from app.core.clock import today_local


def get_current_financial_year(db: Session, tenant_id: str | None = None) -> FinancialYear | None:
    today = today_local()
    stmt = select(FinancialYear).where(
        FinancialYear.start_date <= today,
        FinancialYear.end_date >= today,
    )
    if tenant_id:
        stmt = stmt.where(FinancialYear.tenant_id == tenant_id)
    return db.execute(stmt).scalar_one_or_none()


def get_financial_years(
    db: Session,
    *,
    include_closed: bool = False,
    tenant_id: str | None = None,
    limit: int = 50,
) -> list[FinancialYear]:
    stmt = select(FinancialYear)
    if tenant_id:
        stmt = stmt.where(FinancialYear.tenant_id == tenant_id)
    if not include_closed:
        stmt = stmt.where(FinancialYear.is_closed.is_(False))
    stmt = stmt.order_by(FinancialYear.start_date.desc()).limit(limit)
    return db.execute(stmt).scalars().all()


async def mcp_list_financial_years(ctx: Any, **kwargs: Any) -> Any:
    from mcp.server import types

    db = next(get_db())
    try:
        include_closed = kwargs.get("include_closed", False)
        results = get_financial_years(db, include_closed=include_closed)
        return types.CallToolResult(
            content=[
                types.TextContent(
                    type="text",
                    text=f"Found {len(results)} financial year(s):\n"
                    + "\n".join(
                        f"- {fy.code}: {fy.label} ({fy.start_date} to {fy.end_date})"
                        for fy in results
                    ),
                )
            ]
        )
    finally:
        db.close()
