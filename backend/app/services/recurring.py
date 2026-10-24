"""Recurring task generator: instantiates template tasks into real tasks.

Given a financial year and a set of clients/services, walks the task templates
and creates concrete tasks for each applicable client — respecting each rule's
registration requirements and the client's existing open tasks.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session


def generate_tasks_for_period(
    db: Session,
    financial_year: str,
    *,
    client_ids: list[str] | None = None,
    template_ids: list[str] | None = None,
    dry_run: bool = True,
    tenant_id: str | None = None,
) -> dict[str, Any]:
    """Generate tasks for the given financial year.

    Returns a summary of what was (or would be) created.
    """
    from app.core.clock import today_local
    from app.models import FinancialYear

    fy = db.execute(
        select(FinancialYear).where(FinancialYear.code == financial_year)
    )
    fy_row = fy.scalar_one_or_none()
    if fy_row is None:
        from app.core.errors import NotFoundError
        raise NotFoundError(f"Financial year '{financial_year}' not found")

    client_stmt = select(func.distinct("clients.id"))
    # Simplified: just report what would happen
    if dry_run:
        return {
            "financial_year": financial_year,
            "templates_considered": 0,
            "clients_considered": 0,
            "created": 0,
            "skipped_existing": 0,
            "skipped_not_applicable": 0,
            "dry_run": True,
            "created_task_ids": [],
            "skipped_reasons": {"dry_run": "Not yet implemented"},
        }

    return {
        "financial_year": financial_year,
        "templates_considered": 0,
        "clients_considered": 0,
        "created": 0,
        "skipped_existing": 0,
        "skipped_not_applicable": 0,
        "dry_run": False,
        "created_task_ids": [],
        "skipped_reasons": {"not_implemented": "Task generation not yet wired"},
    }
