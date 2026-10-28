"""Compliance engine: computes statutory deadlines from rules.

Given a compliance rule + a client's registrations + the current financial year,
this module decides whether a compliance obligation applies and, if so, produces
a deadline. The task workflow service is responsible for turning those deadlines
into actual workflow tasks.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session


@dataclass
class DeadlineResult:
    applies: bool
    statutory_due_date: str | None
    reason: str
    required_registration: str | None


def _get_required_registration(rule: ComplianceRule) -> str | None:
    """Read the required registration type from the rule's ``applicability_rule`` field.

    The ``ComplianceRule`` model does not have a dedicated ``required_registration``
    column; the ``applicability_rule`` Text field stores the condition that
    determines whether a rule applies. When it is non-empty it is treated as
    the registration type the client must hold. ``None`` means the rule
    applies to all clients regardless of registration.
    """
    val = getattr(rule, "applicability_rule", None)
    if val and isinstance(val, str) and val.strip():
        return val.strip()
    return None


def _compute_next_due_date(rule: ComplianceRule, today: date, *,
                           db: Session | None = None,
                           financial_year_id: str | None = None) -> date | None:
    """Compute the next statutory due date for a compliance rule.

    Strategy (in priority order):
    1. If ``db`` is provided, look up an active ``Period`` row for this rule
       whose ``[start_date, end_date]`` brackets ``today``. Return ``end_date``
       as the statutory due date.
    2. Fall back to frequency-based computation from ``default_frequency``
       anchored on the financial year (if provided) or ``today``.
    3. Return ``None`` when the frequency is missing or unsupported.
    """
    # 1. Try period-based lookup
    if db is not None:
        from app.models import Period
        stmt = (
            select(Period)
            .where(Period.compliance_rule_id == rule.id)
            .where(Period.start_date <= today)
            .where(Period.end_date >= today)
            .where(Period.is_active.is_(True))
        )
        if financial_year_id:
            stmt = stmt.where(Period.tenant_id == rule.tenant_id)
        period = db.execute(stmt).scalars().first()
        if period and period.end_date:
            return period.end_date.date() if hasattr(period.end_date, "date") else period.end_date

    # 2. Frequency-based fallback
    freq = getattr(rule, "default_frequency", None)
    if not freq:
        return None

    fy_start: date | None = None
    if db is not None and financial_year_id:
        from app.models import FinancialYear
        fy = db.get(FinancialYear, financial_year_id)
        if fy and fy.start_date:
            fy_start = fy.start_date.date() if hasattr(fy.start_date, "date") else fy.start_date

    anchor = fy_start or today

    freq_lower = freq.lower().strip()
    if freq_lower in ("monthly", "month", "monthly"):
        # End of the current month
        if anchor.month == 12:
            next_month = date(anchor.year + 1, 1, 1)
        else:
            next_month = date(anchor.year, anchor.month + 1, 1)
        return next_month - timedelta(days=1)
    elif freq_lower in ("quarterly", "quarter"):
        quarter = ((anchor.month - 1) // 3) * 3 + 1
        q_end_month = quarter + 2
        if q_end_month > 12:
            q_end = date(anchor.year + 1, q_end_month - 12, 1) - timedelta(days=1)
        else:
            q_end = date(anchor.year, q_end_month + 1, 1) - timedelta(days=1)
        return q_end
    elif freq_lower in ("half_yearly", "half-yearly", "semi_yearly", "semi-yearly"):
        if anchor.month <= 6:
            return date(anchor.year, 6, 30)
        else:
            return date(anchor.year, 12, 31)
    elif freq_lower in ("yearly", "annual", "year"):
        # End of the financial year containing the anchor date
        if fy_start:
            fy_end = fy_start.replace(year=fy_start.year + 1) - timedelta(days=1)
            # If anchor is before FY end, use this FY; else next FY end
            if anchor <= fy_end:
                return fy_end
            else:
                fy_end_next = fy_start.replace(year=fy_start.year + 2) - timedelta(days=1)
                return fy_end_next
        else:
            # Calendar year end
            return date(anchor.year, 12, 31)
    else:
        return None


def evaluate_rule_for_client(
    db: Session,
    rule_id: str,
    client_id: str,
    *,
    financial_year_id: str | None = None,
    period_key: str | None = None,
) -> DeadlineResult:
    """Check whether a compliance rule applies to a client.

    A rule applies when the client (or its legal entity) holds at least one of
    the registrations the rule requires. Returns the statutory due date computed
    from the rule's frequency template, or ``None`` when the rule doesn't apply.
    """
    from app.models import (
        ComplianceRule,
        FinancialYear,
        Registration,
    )
    from app.core.clock import today_local

    rule = db.get(ComplianceRule, rule_id)
    if rule is None:
        return DeadlineResult(False, None, f"Rule {rule_id} not found", None)

    required_reg = _get_required_registration(rule)
    if required_reg:
        reg_found = db.execute(
            select(Registration.registration_type)
            .where(Registration.client_id == client_id)
            .where(Registration.status == "active")
            .where(Registration.tenant_id == rule.tenant_id)
        ).scalars().all()

        all_reg_types = set(reg_found)
        if required_reg not in all_reg_types:
            return DeadlineResult(
                applies=False,
                statutory_due_date=None,
                reason=f"Rule requires {required_reg}, client does not have it",
                required_registration=required_reg,
            )

    today = today_local()
    due_date = _compute_next_due_date(rule, today, db=db, financial_year_id=financial_year_id)

    return DeadlineResult(
        applies=True,
        statutory_due_date=due_date.isoformat() if due_date else None,
        reason="Rule applies",
        required_registration=required_reg,
    )


def list_calendar_entries(
    db: Session,
    *,
    client_id: str | None = None,
    from_date: str,
    to_date: str,
    only_unverified: bool = False,
    limit: int = 500,
    tenant_id: str | None = None,
) -> list[dict[str, Any]]:
    """Build calendar entries spanning [from_date, to_date].

    Entries come from two sources:
    1. Deadlines from the ``deadlines`` table (verified statutory dates).
    2. Open tasks with statutory due dates in the range.
    """
    from app.models import Deadline, Task
    from datetime import date

    fd = date.fromisoformat(from_date)
    td = date.fromisoformat(to_date)

    entries: list[dict[str, Any]] = []

    deadline_stmt = (
        select(Deadline)
        .where(Deadline.statutory_due_date >= fd)
        .where(Deadline.statutory_due_date <= td)
    )
    if tenant_id:
        deadline_stmt = deadline_stmt.where(Deadline.tenant_id == tenant_id)
    if client_id:
        deadline_stmt = deadline_stmt.where(Deadline.client_id == client_id)
    if only_unverified:
        deadline_stmt = deadline_stmt.where(Deadline.verified.is_(False))
    deadlines = db.execute(deadline_stmt).scalars().all()

    for dl in deadlines:
        entries.append(_deadline_to_entry(dl, today_local().date()))

    task_stmt = (
        select(Task)
        .where(Task.statutory_due_date >= fd)
        .where(Task.statutory_due_date <= td)
        .where(Task.filing_status != "filed")
    )
    if tenant_id:
        task_stmt = task_stmt.where(Task.tenant_id == tenant_id)
    if client_id:
        task_stmt = task_stmt.where(Task.client_id == client_id)
    if only_unverified:
        task_stmt = task_stmt.where(Task.deadline_verified.is_(False))
    tasks = db.execute(task_stmt).scalars().all()

    for t in tasks:
        if t.statutory_due_date:
            entries.append(_task_to_entry(t, today_local().date()))

    entries.sort(key=lambda e: (e["statutory_due_date"] or "9999", e["client_name"] or ""))
    return entries[:limit]


def _deadline_to_entry(dl: Any, today: Any) -> dict[str, Any]:
    days_remaining = (dl.statutory_due_date - today).days if dl.statutory_due_date else 0
    return {
        "task_id": str(dl.task_id) if dl.task_id else None,
        "deadline_id": str(dl.id),
        "client_id": str(dl.client_id),
        "client_name": getattr(dl.client, "legal_name", None) if hasattr(dl, "client") else None,
        "compliance_rule_id": str(dl.compliance_rule_id) if dl.compliance_rule_id else None,
        "rule_name": getattr(dl.compliance_rule, "name", None) if dl.compliance_rule else None,
        "filing_type": getattr(dl.compliance_rule, "filing_type", None) if dl.compliance_rule else None,
        "period_key": dl.period_key,
        "statutory_due_date": dl.statutory_due_date.isoformat() if dl.statutory_due_date else None,
        "internal_due_date": dl.internal_due_date.isoformat() if dl.internal_due_date else None,
        "verified": dl.verified,
        "status": "filed" if dl.task and dl.task.filing_status == "filed" else "open",
        "priority": dl.task.priority if dl.task else "normal",
        "preparer_id": str(dl.task.preparer_id) if dl.task and dl.task.preparer_id else None,
        "reviewer_id": str(dl.task.reviewer_id) if dl.task and dl.task.reviewer_id else None,
        "days_remaining": days_remaining,
        "is_overdue": days_remaining < 0,
        "is_filed": bool(dl.task and dl.task.filing_status == "filed"),
        "authority": getattr(dl.compliance_rule, "authority", None) if dl.compliance_rule else None,
    }


def _task_to_entry(t: Any, today: Any) -> dict[str, Any]:
    days_remaining = (t.statutory_due_date - today).days if t.statutory_due_date else 0
    return {
        "task_id": str(t.id),
        "deadline_id": None,
        "client_id": str(t.client_id),
        "client_name": None,
        "compliance_rule_id": str(t.compliance_rule_id) if t.compliance_rule_id else None,
        "rule_name": None,
        "filing_type": None,
        "period_key": t.period_key,
        "statutory_due_date": t.statutory_due_date.isoformat() if t.statutory_due_date else None,
        "internal_due_date": t.internal_due_date.isoformat() if t.internal_due_date else None,
        "verified": t.deadline_verified,
        "status": t.status,
        "priority": t.priority,
        "preparer_id": str(t.preparer_id) if t.preparer_id else None,
        "reviewer_id": str(t.reviewer_id) if t.reviewer_id else None,
        "days_remaining": days_remaining,
        "is_overdue": days_remaining < 0,
        "is_filed": t.filing_status == "filed",
        "authority": None,
    }
