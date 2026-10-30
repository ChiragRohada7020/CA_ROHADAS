"""Reports router — dashboard, workload, deadlines, and analytics.

Endpoints:
  GET /reports/dashboard              — FirmDashboard totals + trends
  GET /reports/weekly-change          — WeeklyChangeSummary
  GET /reports/workload               — WorkloadRow[]
  GET /reports/at-risk-clients        — ClientRiskRow[]
  GET /reports/service-turnaround     — ServiceTurnaroundRow[]
  GET /reports/upcoming-deadlines     — DeadlineAlertRow[]
  GET /reports/productivity           — ProductivityReport
  GET /reports/bottlenecks            — BottleneckReport
  GET /reports/client-services        — ClientServiceStatusReport
  GET /reports/monthly-trends         — Last 6 months invoiced/collected/tasks
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select, text

from app.core.db import SessionLocal, get_db
from app.core.security import get_current_user
from app.core.clock import today_local
from app.models import Task, Client, Invoice, User, Service, ClientService, Deadline, FinancialYear, Payment, Engagement

router = APIRouter(tags=["reports"])


@router.get("/reports/dashboard")
async def get_dashboard(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    from app.core.clock import today_local
    today = today_local()
    month_start = today.replace(day=1)
    year_start = today.replace(month=1, day=1)
    from datetime import timedelta
    week_end = today + timedelta(days=14)
    next_month = today.replace(day=28) + timedelta(days=5)

    open_statuses = ["completed", "filed", "delivered", "cancelled"]

    clients_total = db.execute(select(func.count()).select_from(Client).where(Client.tenant_id == tenant_id)).scalar() or 0
    clients_active = db.execute(select(func.count()).select_from(Client).where(
        Client.tenant_id == tenant_id, Client.status == "active"
    )).scalar() or 0

    tasks_open = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id,
        Task.status.not_in(open_statuses)
    )).scalar() or 0
    tasks_completed = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id, Task.status == "completed"
    )).scalar() or 0
    tasks_blocked = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id, Task.blocked_reason.is_not(None)
    )).scalar() or 0
    tasks_overdue = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id,
        Task.statutory_due_date.is_not(None),
        Task.statutory_due_date < today,
        Task.status.not_in(open_statuses)
    )).scalar() or 0
    tasks_due_today = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id,
        Task.statutory_due_date == today,
        Task.status.not_in(open_statuses)
    )).scalar() or 0
    tasks_due_this_week = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id,
        Task.statutory_due_date.is_not(None),
        Task.statutory_due_date >= today,
        Task.statutory_due_date < week_end,
        Task.status.not_in(open_statuses)
    )).scalar() or 0
    tasks_due_this_month = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id,
        Task.statutory_due_date.is_not(None),
        Task.statutory_due_date >= today,
        Task.statutory_due_date < next_month,
        Task.status.not_in(open_statuses)
    )).scalar() or 0
    awaiting_review = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id, Task.status == "ready_for_review"
    )).scalar() or 0
    awaiting_approval = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id, Task.status == "ready_for_approval"
    )).scalar() or 0
    waiting_for_client = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id, Task.status == "waiting_for_client"
    )).scalar() or 0

    # Compliance by service category. A task may carry its own `category` or inherit
    # it from the linked service — coalesce both so the ring is never empty just
    # because the explicit field was left null at task creation.
    COMPLETED_STATUSES = {"completed", "filed", "delivered"}
    compliance_due_soon_end = today + timedelta(days=7)
    cat_rows = db.execute(text(
        "SELECT COALESCE(t.category, s.category) AS cat, t.status, t.statutory_due_date "
        "FROM tasks t LEFT JOIN services s ON s.id = t.service_id "
        "WHERE t.tenant_id = CAST(:tenant AS uuid) AND t.deleted_at IS NULL "
        "AND COALESCE(t.category, s.category) IS NOT NULL"
    ), {"tenant": str(tenant_id)}).fetchall()

    buckets: dict = {}
    for r in cat_rows:
        cat = r[0]
        if cat is None:
            continue
        b = buckets.setdefault(cat, {"total": 0, "completed": 0, "overdue": 0, "due_soon": 0})
        b["total"] += 1
        if r.status in COMPLETED_STATUSES:
            b["completed"] += 1
            continue
        sdue = r[2]
        if sdue is not None:
            sdue_d = sdue.date() if hasattr(sdue, "date") else sdue
            if sdue_d < today:
                b["overdue"] += 1
            elif sdue_d < compliance_due_soon_end:
                b["due_soon"] += 1

    compliance = []
    total_compliance_tasks = 0
    for cat, b in buckets.items():
        in_progress = max(b["total"] - b["completed"] - b["overdue"] - b["due_soon"], 0)
        compliance.append({
            "category": cat,
            "label": cat.replace("_", " ").title(),
            "total": b["total"],
            "overdue": b["overdue"],
            "due_soon": b["due_soon"],
            "in_progress": in_progress,
            "completed": b["completed"],
        })
        total_compliance_tasks += b["total"]
    compliance.sort(key=lambda x: x["total"], reverse=True)

    # tasks_by_status
    status_rows = db.execute(
        select(Task.status, func.count().label("cnt"))
        .where(Task.tenant_id == tenant_id)
        .group_by(Task.status)
    ).all()
    tasks_by_status = [{"status": s, "count": int(c)} for s, c in status_rows]

    # pipeline stages
    pipeline = [
        {"key": "not_started", "label": "Not Started", "count": db.execute(select(func.count()).select_from(Task).where(
            Task.tenant_id == tenant_id, Task.status == "not_started")).scalar() or 0, "statuses": ["not_started"]},
        {"key": "in_progress", "label": "In Progress", "count": db.execute(select(func.count()).select_from(Task).where(
            Task.tenant_id == tenant_id, Task.status == "in_progress")).scalar() or 0, "statuses": ["in_progress"]},
        {"key": "needs_review", "label": "Needs Review", "count": awaiting_review, "statuses": ["ready_for_review"]},
        {"key": "blocked", "label": "Blocked", "count": tasks_blocked, "statuses": ["blocked"]},
        {"key": "overdue", "label": "Overdue", "count": tasks_overdue, "statuses": ["overdue"]},
    ]

    # portfolio
    new_clients_this_fy = db.execute(select(func.count()).select_from(Client).where(
        Client.tenant_id == tenant_id, Client.created_at >= year_start
    )).scalar() or 0
    portfolio = {
        "clients_total": clients_total,
        "clients_active": clients_active,
        "clients_inactive": clients_total - clients_active,
        "engagements_active": db.execute(select(func.count()).select_from(Engagement).where(Engagement.tenant_id == tenant_id)).scalar() or 0,
        "new_clients_this_fy": new_clients_this_fy,
    }

    # financials
    invoiced_this_month = db.execute(select(func.coalesce(func.sum(Invoice.total), 0)).select_from(Invoice).where(
        Invoice.tenant_id == tenant_id, Invoice.invoice_date >= month_start
    )).scalar() or 0
    collected = db.execute(select(func.coalesce(func.sum(Payment.amount), 0)).select_from(Payment).join(Invoice).where(
        Invoice.tenant_id == tenant_id, Payment.paid_on >= month_start
    )).scalar() or 0
    outstanding = db.execute(select(func.coalesce(func.sum(Invoice.outstanding), 0)).select_from(Invoice).where(
        Invoice.tenant_id == tenant_id, Invoice.status != "draft"
    )).scalar() or 0
    overdue_total = db.execute(select(func.coalesce(func.sum(Invoice.outstanding), 0)).select_from(Invoice).where(
        Invoice.tenant_id == tenant_id, Invoice.is_overdue.is_(True)
    )).scalar() or 0
    invoice_count = db.execute(select(func.count()).select_from(Invoice).where(
        Invoice.tenant_id == tenant_id, Invoice.invoice_date >= month_start,
        Invoice.status.in_(["issued", "partially_paid", "paid"])
    )).scalar() or 0
    financials = {
        "period_label": "This month",
        "from_date": month_start.isoformat(),
        "to_date": today.isoformat(),
        "fees_invoiced": float(invoiced_this_month),
        "fees_collected": float(collected),
        "invoice_count": invoice_count,
        "outstanding_total": float(outstanding),
        "overdue_total": float(overdue_total),
        "unbilled_value": 0.0,
        "unbilled_task_count": 0,
        "unbillable_task_count": 0,
        "notes": [],
    }

    # workload
    workload_rows = db.execute(
        select(User.id, User.full_name, User.branch_id, User.weekly_capacity_hours)
        .where(User.tenant_id == tenant_id, User.status == "active")
    ).fetchall()
    workload = []
    for r in workload_rows:
        uid = str(r.id)
        open_t = db.execute(select(func.count()).select_from(Task).where(
            Task.tenant_id == tenant_id, Task.preparer_id == uid, Task.status.not_in(open_statuses)
        )).scalar() or 0
        over_t = db.execute(select(func.count()).select_from(Task).where(
            Task.tenant_id == tenant_id, Task.preparer_id == uid,
            Task.statutory_due_date.is_not(None), Task.statutory_due_date < today,
            Task.status.not_in(open_statuses)
        )).scalar() or 0
        cap = 40.0
        try:
            cap = float(r.weekly_capacity_hours)
        except (ValueError, TypeError):
            pass
        weighted = open_t * 2.0
        workload.append({
            "user_id": uid,
            "full_name": r.full_name,
            "branch_id": str(r.branch_id) if r.branch_id else None,
            "open_tasks": open_t,
            "overdue_tasks": over_t,
            "awaiting_review": 0,
            "due_this_week": 0,
            "weighted_load_hours": float(weighted),
            "capacity_hours": cap,
            "utilisation_percent": round((weighted / cap * 100), 1) if cap > 0 else 0.0,
        })

    # at_risk_clients (top by overdue + open tasks)
    clients = db.execute(select(Client).where(Client.tenant_id == tenant_id)).scalars().all()
    at_risk = []
    for c in clients:
        open_t = db.execute(select(func.count()).select_from(Task).where(
            Task.tenant_id == tenant_id, Task.client_id == c.id, Task.status.not_in(open_statuses)
        )).scalar() or 0
        over_t = db.execute(select(func.count()).select_from(Task).where(
            Task.tenant_id == tenant_id, Task.client_id == c.id,
            Task.statutory_due_date.is_not(None), Task.statutory_due_date < today,
            Task.status.not_in(open_statuses)
        )).scalar() or 0
        if open_t == 0 and over_t == 0:
            continue
        at_risk.append({
            "client_id": str(c.id),
            "client_code": c.client_code or "",
            "client_name": c.legal_name or "",
            "open_tasks": open_t,
            "overdue_tasks": over_t,
            "unverified_deadlines": 0,
            "open_document_requests": 0,
            "progress_percent": 0,
            "risk_classification": c.risk_classification or "low",
            "last_activity_at": c.updated_at.isoformat() if c.updated_at else None,
        })
    at_risk.sort(key=lambda x: (x["overdue_tasks"], x["open_tasks"]), reverse=True)
    at_risk_clients = at_risk[:12]

    # upcoming deadlines
    deadlines = db.execute(select(Deadline.id, Deadline.client_id, Deadline.task_id, Deadline.notes,
        Deadline.statutory_due_date, Deadline.internal_due_date, Deadline.verified).where(
        Deadline.tenant_id == tenant_id,
        Deadline.statutory_due_date.is_not(None),
        Deadline.statutory_due_date >= today,
        Deadline.statutory_due_date < week_end,
    ).order_by(Deadline.statutory_due_date.asc())).all()
    upcoming_deadlines = []
    for dl in deadlines:
        due_d = dl.statutory_due_date.date() if dl.statutory_due_date and hasattr(dl.statutory_due_date, "date") else dl.statutory_due_date
        days_remaining = (due_d - today).days if due_d else 0
        upcoming_deadlines.append({
            "task_id": str(dl.task_id) if dl.task_id else None,
            "client_id": str(dl.client_id) if dl.client_id else None,
            "client_name": None,
            "title": dl.notes or "Compliance deadline",
            "statutory_due_date": dl.statutory_due_date.isoformat(),
            "internal_due_date": dl.internal_due_date.isoformat() if dl.internal_due_date else None,
            "days_remaining": days_remaining,
            "verified": dl.verified,
            "status": "open",
            "owner_name": None,
        })

    # recent activity from task status changes / completions
    recent_tasks = db.execute(select(Task).where(
        Task.tenant_id == tenant_id, Task.completed_at.is_not(None)
    ).order_by(Task.completed_at.desc()).limit(10)).scalars().all()
    recent_activity = []
    for t in recent_tasks:
        recent_activity.append({
            "id": str(t.id),
            "action": "completed",
            "entity_type": "task",
            "entity_id": str(t.id),
            "entity_label": t.title,
            "summary": t.title,
            "actor_label": None,
            "actor_type": "user",
            "created_at": t.completed_at.isoformat() if t.completed_at else None,
        })

    open_doc_requests = db.execute(text(
        "SELECT count(*) FROM document_requests "
        "WHERE tenant_id = CAST(:tenant AS uuid) AND status = :st"
    ), {"tenant": str(tenant_id), "st": "open"}).scalar() or 0
    clients_missing_docs = db.execute(text(
        "SELECT count(DISTINCT client_id) FROM document_requests "
        "WHERE tenant_id = CAST(:tenant AS uuid) AND status = :st AND client_id IS NOT NULL"
    ), {"tenant": str(tenant_id), "st": "open"}).scalar() or 0

    fy = db.execute(select(FinancialYear).where(
        FinancialYear.tenant_id == tenant_id, FinancialYear.is_active.is_(True)
    )).scalars().first()

    return {
        "generated_at": today.isoformat(),
        "as_of_date": today.isoformat(),
        "scope": "firm",
        "financial_year": fy.code if fy else None,
        "totals": {
            "clients_total": clients_total,
            "clients_active": clients_active,
            "engagements_active": portfolio["engagements_active"],
            "tasks_open": tasks_open,
            "tasks_completed": tasks_completed,
            "tasks_blocked": tasks_blocked,
            "tasks_overdue": tasks_overdue,
            "tasks_due_today": tasks_due_today,
            "tasks_due_this_week": tasks_due_this_week,
            "tasks_due_this_month": tasks_due_this_month,
            "awaiting_review": awaiting_review,
            "awaiting_approval": awaiting_approval,
            "waiting_for_client": waiting_for_client,
            "unverified_deadlines": 0,
            "clients_with_missing_documents": int(clients_missing_docs),
            "open_document_requests": int(open_doc_requests),
        },
        "tasks_by_status": tasks_by_status,
        "trends": [],
        "compliance": compliance,
        "pipeline": pipeline,
        "portfolio": portfolio,
        "financials": financials,
        "workload": workload,
        "at_risk_clients": at_risk_clients,
        "upcoming_deadlines": upcoming_deadlines,
        "recent_activity": recent_activity,
    }


@router.get("/reports/weekly-change")
async def get_weekly_change(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    from datetime import timedelta
    today = today_local()
    from_date = today - timedelta(days=7)
    from app.models import Invoice, Payment
    from sqlalchemy import select

    invoices_issued = db.execute(
        select(func.count()).select_from(Invoice).where(
            Invoice.tenant_id == tenant_id,
            Invoice.issued_at.is_not(None),
            Invoice.issued_at >= from_date,
        )
    ).scalar() or 0
    payments_received = db.execute(
        select(func.count()).select_from(Payment).join(Invoice).where(
            Invoice.tenant_id == tenant_id,
            Payment.paid_on >= from_date,
        )
    ).scalar() or 0
    tasks_created = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id,
        Task.created_at >= from_date,
    )).scalar() or 0
    tasks_completed = db.execute(select(func.count()).select_from(Task).where(
        Task.tenant_id == tenant_id,
        Task.status == "completed",
        Task.updated_at >= from_date,
    )).scalar() or 0
    return {
        "from_date": from_date.isoformat(),
        "to_date": today.isoformat(),
        "tasks_created": tasks_created,
        "tasks_completed": tasks_completed,
        "tasks_opened": tasks_created,
        "tasks_closed": tasks_completed,
        "clients_added": 0,
        "documents_uploaded": 0,
        "invoices_issued": invoices_issued,
        "payments_received": payments_received,
    }


@router.get("/reports/workload")
async def get_workload(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    users = db.execute(select(User).where(User.tenant_id == tenant_id)).scalars().all()
    rows = []
    for u in users:
        open_tasks = db.execute(select(func.count()).select_from(Task).where(
            Task.tenant_id == tenant_id, Task.preparer_id == u.id,
            Task.status.not_in(["completed", "filed", "delivered", "cancelled"])
        )).scalar() or 0
        overdue_tasks = db.execute(select(func.count()).select_from(Task).where(
            Task.tenant_id == tenant_id, Task.preparer_id == u.id,
            Task.statutory_due_date.is_not(None),
            Task.statutory_due_date < today_local(),
            Task.status.not_in(["completed", "filed", "delivered", "cancelled"])
        )).scalar() or 0
        rows.append({
            "user_id": str(u.id),
            "full_name": u.full_name,
            "branch_id": str(u.branch_id) if u.branch_id else None,
            "open_tasks": open_tasks,
            "overdue_tasks": overdue_tasks,
            "awaiting_review": 0,
            "due_this_week": 0,
            "weighted_load_hours": float(open_tasks) * 2.0,
            "capacity_hours": 40.0,
            "utilisation_percent": round((open_tasks / 40.0) * 100, 1) if open_tasks else 0.0,
        })
    return rows


@router.get("/reports/at-risk-clients")
async def get_at_risk_clients(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    clients = db.execute(select(Client).where(Client.tenant_id == tenant_id)).scalars().all()
    rows = []
    for c in clients:
        open_tasks = db.execute(select(func.count()).select_from(Task).where(
            Task.tenant_id == tenant_id, Task.client_id == c.id,
            Task.status.not_in(["completed", "filed", "delivered", "cancelled"])
        )).scalar() or 0
        overdue_tasks = db.execute(select(func.count()).select_from(Task).where(
            Task.tenant_id == tenant_id, Task.client_id == c.id,
            Task.statutory_due_date.is_not(None),
            Task.statutory_due_date < today_local(),
            Task.status.not_in(["completed", "filed", "delivered", "cancelled"])
        )).scalar() or 0
        rows.append({
            "client_id": str(c.id),
            "client_code": c.client_code,
            "client_name": c.legal_name,
            "open_tasks": open_tasks,
            "overdue_tasks": overdue_tasks,
            "unverified_deadlines": 0,
            "open_document_requests": 0,
            "progress_percent": 0,
            "risk_classification": c.risk_classification or "low",
            "last_activity_at": c.updated_at.isoformat() if c.updated_at else None,
        })
    return rows


@router.get("/reports/service-turnaround")
async def get_service_turnaround(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    return []


@router.get("/reports/upcoming-deadlines")
async def get_upcoming_deadlines(
    request: Request,
    days: int = 30,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    from datetime import timedelta
    today = today_local()
    end_date = today + timedelta(days=days)

    deadlines = db.execute(select(Deadline).where(
        Deadline.tenant_id == tenant_id,
        Deadline.statutory_due_date >= today,
        Deadline.statutory_due_date <= end_date,
    )).scalars().all()

    rows = []
    for dl in deadlines:
        due_date = dl.statutory_due_date.date() if dl.statutory_due_date else None
        days_remaining = (due_date - today).days if due_date else 0
        client = db.get(Client, dl.client_id) if dl.client_id else None
        rows.append({
            "task_id": str(dl.task_id) if dl.task_id else None,
            "client_id": str(dl.client_id) if dl.client_id else None,
            "client_name": client.legal_name if client else None,
            "title": dl.notes or "Compliance deadline",
            "statutory_due_date": dl.statutory_due_date.isoformat() if dl.statutory_due_date else None,
            "internal_due_date": dl.internal_due_date.isoformat() if dl.internal_due_date else None,
            "days_remaining": days_remaining,
            "verified": dl.verified,
            "status": "filed" if dl.task and dl.task.filing_status == "filed" else "open",
            "owner_name": None,
        })
    return rows


@router.get("/reports/productivity")
async def get_productivity(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    from datetime import date, timedelta
    today = date.today()
    return {
        "total_completed": 0,
        "total_logged_hours": 0,
        "period_start": (today - timedelta(days=30)).isoformat(),
        "period_end": today.isoformat(),
        "rows": [],
        "notes": [],
    }


@router.get("/reports/bottlenecks")
async def get_bottlenecks(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    return {
        "slowest_stage": None,
        "aging": [],
        "dwell": [],
        "recurrence_delay": [],
        "notes": [],
    }


@router.get("/reports/monthly-trends")
async def get_monthly_trends(
    request: Request,
    from_date: str | None = None,
    to_date: str | None = None,
    db: Session = Depends(get_db),
) -> Any:
    """Monthly invoiced, collected, and task volumes — for charts.

    When ``from_date`` / ``to_date`` are omitted, the last 6 calendar months are
    returned.  Both bounds are inclusive.
    """
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    from datetime import timedelta
    from calendar import monthrange

    today = today_local()

    if from_date:
        from datetime import date as _date
        start = _date.fromisoformat(from_date)
    else:
        start = date(today.year, today.month, 1) - timedelta(days=180)

    if to_date:
        from datetime import date as _date
        end = _date.fromisoformat(to_date)
    else:
        end = today

    # Walk month by month between start and end.
    rows = []
    cursor = date(start.year, start.month, 1)
    while cursor <= end:
        last_day = monthrange(cursor.year, cursor.month)[1]
        month_end = date(cursor.year, cursor.month, last_day)

        invoiced = db.execute(
            select(func.coalesce(func.sum(Invoice.total), 0)).where(
                Invoice.tenant_id == tenant_id,
                Invoice.invoice_date >= cursor,
                Invoice.invoice_date <= month_end,
            )
        ).scalar() or 0

        collected = db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0))
            .select_from(Payment)
            .join(Invoice, Invoice.id == Payment.invoice_id)
            .where(
                Invoice.tenant_id == tenant_id,
                Payment.paid_on >= cursor,
                Payment.paid_on <= month_end,
            )
        ).scalar() or 0

        tasks_created = db.execute(
            select(func.count()).select_from(Task).where(
                Task.tenant_id == tenant_id,
                Task.created_at >= cursor,
                Task.created_at <= month_end,
            )
        ).scalar() or 0

        tasks_completed = db.execute(
            select(func.count()).select_from(Task).where(
                Task.tenant_id == tenant_id,
                Task.status == "completed",
                Task.updated_at >= cursor,
                Task.updated_at <= month_end,
            )
        ).scalar() or 0

        rows.append({
            "month": cursor.strftime("%b %Y"),
            "month_key": cursor.isoformat()[:7],
            "invoiced": float(invoiced),
            "collected": float(collected),
            "tasks_created": int(tasks_created),
            "tasks_completed": int(tasks_completed),
        })

        # Advance to first day of next month.
        if cursor.month == 12:
            cursor = date(cursor.year + 1, 1, 1)
        else:
            cursor = date(cursor.year, cursor.month + 1, 1)

    return rows


@router.get("/reports/gst-summary")
async def get_gst_summary(
    request: Request,
    from_date: str | None = None,
    to_date: str | None = None,
    db: Session = Depends(get_db),
) -> Any:
    """Monthly GST breakdown (CGST / SGST / IGST) — for charts.

    Returns one row per month within the range, or the last 6 months when no
    bounds are given.  Totals are also returned for headline figures.
    """
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    from datetime import date as _date
    from calendar import monthrange
    from datetime import timedelta

    today = today_local()

    if from_date:
        start = _date.fromisoformat(from_date)
    else:
        start = date(today.year, today.month, 1) - timedelta(days=180)

    if to_date:
        end = _date.fromisoformat(to_date)
    else:
        end = today

    rows = []
    cursor = date(start.year, start.month, 1)
    while cursor <= end:
        last_day = monthrange(cursor.year, cursor.month)[1]
        month_end = date(cursor.year, cursor.month, last_day)

        month_rows = db.execute(
            select(Invoice.cgst_amount, Invoice.sgst_amount, Invoice.igst_amount)
            .where(
                Invoice.tenant_id == tenant_id,
                Invoice.invoice_date >= cursor,
                Invoice.invoice_date <= month_end,
                Invoice.status.in_(["issued", "partially_paid", "paid"]),
            )
        ).all()

        cgst = sum(float(r[0] or 0) for r in month_rows)
        sgst = sum(float(r[1] or 0) for r in month_rows)
        igst = sum(float(r[2] or 0) for r in month_rows)

        rows.append({
            "month": cursor.strftime("%b %Y"),
            "month_key": cursor.isoformat()[:7],
            "cgst": round(cgst, 2),
            "sgst": round(sgst, 2),
            "igst": round(igst, 2),
            "total_tax": round(cgst + sgst + igst, 2),
        })

        if cursor.month == 12:
            cursor = date(cursor.year + 1, 1, 1)
        else:
            cursor = date(cursor.year, cursor.month + 1, 1)

    totals = {
        "cgst": round(sum(r["cgst"] for r in rows), 2),
        "sgst": round(sum(r["sgst"] for r in rows), 2),
        "igst": round(sum(r["igst"] for r in rows), 2),
    }
    totals["total_tax"] = round(totals["cgst"] + totals["sgst"] + totals["igst"], 2)

    return {"months": rows, "totals": totals}


@router.get("/reports/client-services")
async def get_client_services(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    clients = db.execute(select(Client).where(Client.tenant_id == tenant_id)).scalars().all()
    rows = []
    notes = []
    for c in clients:
        services = db.execute(select(ClientService).where(
            ClientService.client_id == c.id, ClientService.is_active.is_(True)
        )).scalars().all()
        rows.append({
            "client_id": str(c.id),
            "client_name": c.legal_name,
            "client_code": c.client_code,
            "service_count": len(services),
            "active_services": sum(1 for s in services if s.is_active),
            "open_tasks": 0,
            "overdue_tasks": 0,
            "awaiting_review": 0,
            "waiting_for_client": 0,
            "completion_percent": 0,
        })
    return {
        "rows": rows,
        "notes": notes,
    }