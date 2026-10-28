"""Users / team-directory router.

Endpoints:
  GET  /users                       — paginated staff list (search, department, status, group, include_inactive)
  GET  /users/{user_id}             — staff detail (UserDetailRow)
  GET  /users/{user_id}/overview    — member drawer panels (workload, clients, activity, leave)
  GET  /users/summary               — team screen summary cards / tabs / panels
  GET  /branches                    — branch picker for create forms
  GET  /users/roles                 — role catalogue for the create form
  PATCH /users/{user_id}           — update a team member (profile fields, role, status)
  DELETE /users/{user_id}          — deactivate a team member
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy import select, text

from app.core.db import get_db
from app.core.security import get_current_user, hash_password, require_permission
from app.models import User
from app.routers.roles import assignable_roles_for

router = APIRouter(tags=["users"])

TERMINAL_TASK_STATUSES = {"completed", "filed", "delivered", "cancelled"}

_GROUP_CODES: dict[str, set[str]] = {
    "partners": {"firm_owner", "partner", "branch_partner"},
    "managers": {"manager"},
    "seniors": {"senior_associate", "ca_senior"},
    "articles": {"article_assistant"},
    "assistants": {"accounts_staff", "accountant", "assistant"},
}
_TAB_KEYS = ["all", "partners", "managers", "seniors", "articles", "assistants"]


def _group_for_codes(codes: set[str]) -> str | None:
    for group, g in _GROUP_CODES.items():
        if codes & g:
            return group
    return None


def _user_row(u: Any, branch_name: Any) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "full_name": u.full_name,
        "designation": u.designation,
        "department": u.department,
        "employee_code": u.employee_code,
        "phone": u.phone,
        "branch_id": str(u.branch_id) if u.branch_id else None,
        "branch_name": branch_name,
        "reporting_to_id": str(u.reporting_to_id) if u.reporting_to_id else None,
        "is_partner": bool(u.is_partner),
        "status": u.status,
        "date_of_joining": u.date_of_joining.isoformat() if u.date_of_joining else None,
        "weekly_capacity_hours": int(u.weekly_capacity_hours) if u.weekly_capacity_hours else 0,
        "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
        "roles": list(u.roles) if getattr(u, "roles", None) is not None else [],
    }


@router.get("/users")
async def list_users(
    request: Request,
    search: str | None = None,
    department: str | None = None,
    status: str | None = None,
    group: str | None = None,
    include_inactive: bool = False,
    limit: int = 50,
    offset: int = 0,
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    stmt = (
        text(
            "SELECT u.id, u.email, u.full_name, u.employee_code, u.designation, u.department, "
            "u.phone, u.branch_id, u.reporting_to_id, u.is_partner, u.status, u.date_of_joining, "
             "u.weekly_capacity_hours, u.last_login_at, "
             "u.created_at, u.updated_at, b.name AS branch_name "
             "FROM users u LEFT JOIN branches b ON b.id = u.branch_id "
             "WHERE u.tenant_id = CAST(:tenant AS uuid)"
        )
    )
    params: dict = {"tenant": str(tenant_id)}

    if not include_inactive:
        stmt = text(str(stmt) + " AND u.status = 'active'")
    if status:
        stmt = text(str(stmt) + " AND u.status = :status")
        params["status"] = status
    if department:
        stmt = text(str(stmt) + " AND u.department = :dept")
        params["dept"] = department
    if search:
        pat = f"%{search}%"
        stmt = text(str(stmt) + " AND (u.full_name ILIKE :s OR u.email ILIKE :s OR u.employee_code ILIKE :s)")
        params["s"] = pat
    if group and group in _GROUP_CODES:
        codes = _GROUP_CODES[group]
        in_list = ",".join(f"'{c}'" for c in codes)
        stmt = text(
            str(stmt)
            + f" AND u.id IN (SELECT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id "
            f"WHERE r.tenant_id = CAST(:tenant AS uuid) AND r.code IN ({in_list}))"
        )

    count_sql = text(
        f"SELECT count(*) FROM ({stmt.text}) _sub"
    )
    total = db.execute(count_sql, params).scalar() or 0

    stmt = text(str(stmt) + " ORDER BY u.full_name LIMIT :limit OFFSET :offset")
    params["limit"] = limit
    params["offset"] = offset
    rows = db.execute(stmt, params).fetchall()

    role_map: dict = {}
    for uid_s, code in db.execute(text(
        "SELECT ur.user_id, r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id "
        "WHERE r.tenant_id = CAST(:tenant AS uuid)"
    ), {"tenant": str(tenant_id)}).fetchall():
        role_map.setdefault(str(uid_s), set()).add(code)

    items = []
    for r in rows:
        roles = sorted(role_map.get(str(r.id), set()))
        u_obj = {
            "id": r.id, "email": r.email, "full_name": r.full_name, "employee_code": r.employee_code,
            "designation": r.designation, "department": r.department, "phone": r.phone,
            "branch_id": r.branch_id, "reporting_to_id": r.reporting_to_id, "is_partner": r.is_partner,
         "status": r.status, "date_of_joining": r.date_of_joining, "weekly_capacity_hours": r.weekly_capacity_hours,
             "last_login_at": r.last_login_at, "created_at": r.created_at, "updated_at": r.updated_at,
            "roles": roles,
        }
        items.append(_user_row(_UProxy(u_obj), r.branch_name))

    return {
        "items": items,
        "meta": {"total": total, "limit": limit, "offset": offset, "has_more": offset + len(items) < total},
    }


class _UProxy:
    def __init__(self, d):
        self._d = d

    def __getattr__(self, k):
        return self._d[k]


@router.get("/users/summary")
async def get_team_summary(
    request: Request,
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    role_map: dict = {}
    for uid_s, code in db.execute(text(
        "SELECT ur.user_id, r.code FROM user_roles ur "
        "JOIN roles r ON r.id = ur.role_id "
        "JOIN users u ON u.id = ur.user_id "
        "WHERE u.tenant_id = CAST(:tenant AS uuid)"
    ), {"tenant": str(tenant_id)}).fetchall():
        role_map.setdefault(str(uid_s), set()).add(code)

    users = db.execute(text(
        "SELECT id, full_name, email, is_partner, weekly_capacity_hours, date_of_joining, status, department "
        "FROM users WHERE tenant_id = CAST(:tenant AS uuid)"
    ), {"tenant": str(tenant_id)}).fetchall()

    today = date.today()
    fy_start = date(today.year, 1, 1)

    open_per_user: dict = {}
    overdue_per_user: dict = {}
    weighted_per_user: dict = {}
    total_open = 0
    total_overdue = 0

    task_stmt = text(
        "SELECT id, preparer_id, reviewer_id, approver_id, estimated_hours, statutory_due_date, "
        "internal_due_date, status FROM tasks t "
        "WHERE t.tenant_id = CAST(:tenant AS uuid) AND t.deleted_at IS NULL "
        "AND t.status NOT IN ('completed','filed','delivered','cancelled')"
    )
    for t in db.execute(task_stmt, {"tenant": str(tenant_id)}).fetchall():
        owner = None
        for cand in (t.preparer_id, t.reviewer_id, t.approver_id):
            if cand is not None:
                owner = str(cand)
                break
        if not owner:
            continue
        total_open += 1
        open_per_user[owner] = open_per_user.get(owner, 0) + 1
        due = t.statutory_due_date or t.internal_due_date
        if due and due.date() < today:
            total_overdue += 1
            overdue_per_user[owner] = overdue_per_user.get(owner, 0) + 1
        est = float(t.estimated_hours or 0)
        weighted_per_user[owner] = round(weighted_per_user.get(owner, 0.0) + est, 2)

    tab_counts = {k: 0 for k in _TAB_KEYS}
    active = 0
    inactive = 0
    joined_this_year = 0
    utilisation_vals = []
    over_capacity = 0
    departments_set: set = set()
    workload = []

    for u in users:
        uid_s = str(u.id)
        codes = role_map.get(uid_s, set())
        group = _group_for_codes(codes)
        tab_counts["all"] += 1
        if group:
            tab_counts[group] += 1
        if u.status == "active":
            active += 1
        else:
            inactive += 1
        if u.date_of_joining:
            doj = u.date_of_joining
            if hasattr(doj, "date"):
                doj = doj.date()
            if doj >= fy_start:
                joined_this_year += 1
        if u.department:
            departments_set.add(u.department)
        cap = int(u.weekly_capacity_hours) if u.weekly_capacity_hours else 40
        w = weighted_per_user.get(uid_s, 0.0)
        util = round((w / cap * 100), 1) if cap else 0.0
        if util > 100:
            over_capacity += 1
        utilisation_vals.append(util)
        workload.append({
            "user_id": uid_s,
            "full_name": u.full_name,
            "open_tasks": open_per_user.get(uid_s, 0),
            "overdue_tasks": overdue_per_user.get(uid_s, 0),
            "weighted_load_hours": w,
            "capacity_hours": cap,
            "utilisation_percent": util,
        })

    by_department = []
    dept_totals: dict = {}
    for t_row in db.execute(text(
        "SELECT u.department AS department, count(*) AS n FROM tasks t "
        "JOIN users u ON u.id = t.preparer_id "
        "WHERE t.tenant_id = CAST(:tenant AS uuid) AND t.deleted_at IS NULL "
        "AND t.status NOT IN ('completed','filed','delivered','cancelled') AND u.department IS NOT NULL "
        "GROUP BY u.department"
    ), {"tenant": str(tenant_id)}).fetchall():
        dept_totals[t_row.department] = int(t_row.n)
    for d, n in dept_totals.items():
        pct = round(n / total_open * 100, 1) if total_open else 0.0
        by_department.append({"department": d, "open_tasks": n, "percent": pct})

    avg_util = round(sum(utilisation_vals) / len(utilisation_vals), 1) if utilisation_vals else 0.0

    import calendar as _cal
    leave = _leave_calendar(db, tenant_id, None, today.year, today.month, _cal)

    return {
        "total_members": tab_counts["all"],
        "active_members": active,
        "inactive_members": inactive,
        "joined_this_year": joined_this_year,
        "total_open_tasks": total_open,
        "total_overdue_tasks": total_overdue,
        "average_utilisation": avg_util,
        "over_capacity": over_capacity,
        "tab_counts": tab_counts,
        "by_department": by_department,
        "workload": workload,
        "leave": leave,
        "departments": sorted(departments_set),
    }


@router.get("/users/roles")
async def list_user_roles(
    request: Request,
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    role_rows = db.execute(text(
        "SELECT r.id, r.code, r.name, r.description, r.data_scope, r.is_system, r.is_active "
        "FROM roles r WHERE (r.tenant_id = CAST(:tenant AS uuid) OR r.tenant_id IS NULL) "
        "ORDER BY r.name"
    ), {"tenant": str(tenant_id)}).fetchall()
    perms = db.execute(text(
        "SELECT code, module, action, description FROM permissions ORDER BY module, action"
    )).fetchall()

    roles = [
        {
            "id": str(r.id), "code": r.code, "name": r.name, "description": r.description,
            "data_scope": r.data_scope, "is_system": bool(r.is_system), "is_active": bool(r.is_active),
            "permissions": [],
        }
        for r in role_rows
    ]
    catalogue = [{"code": p.code, "module": p.module, "action": p.action, "description": p.description} for p in perms]
    return {"roles": roles, "catalogue": catalogue}


@router.get("/users/{user_id}")
async def get_user(
    request: Request,
    user_id: str,
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    row = db.execute(text(
        "SELECT u.id, u.email, u.full_name, u.employee_code, u.designation, u.department, u.phone, "
        "u.branch_id, u.reporting_to_id, u.is_partner, u.status, u.date_of_joining, "
        "u.weekly_capacity_hours, u.last_login_at, "
        "u.created_at, u.updated_at, b.name AS branch_name "
        "FROM users u LEFT JOIN branches b ON b.id = u.branch_id "
        "WHERE u.id = CAST(:id AS uuid) AND u.tenant_id = CAST(:tenant AS uuid)"
    ), {"id": user_id, "tenant": str(tenant_id)}).fetchone()
    if row is None:
        from app.core.errors import NotFoundError
        raise NotFoundError(f"User {user_id} not found")

    roles = db.execute(text(
        "SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id "
        "WHERE ur.user_id = CAST(:id AS uuid) AND r.tenant_id = CAST(:tenant AS uuid)"
    ), {"id": user_id, "tenant": str(tenant_id)}).scalars().all()

    data = {
        "id": str(row.id),
        "email": row.email,
        "full_name": row.full_name,
        "designation": row.designation,
        "department": row.department,
        "employee_code": row.employee_code,
        "phone": row.phone,
        "branch_id": str(row.branch_id) if row.branch_id else None,
        "branch_name": row.branch_name,
        "reporting_to_id": str(row.reporting_to_id) if row.reporting_to_id else None,
        "is_partner": bool(row.is_partner),
        "status": row.status,
        "date_of_joining": row.date_of_joining.isoformat() if row.date_of_joining else None,
        "weekly_capacity_hours": int(row.weekly_capacity_hours) if row.weekly_capacity_hours else 0,
        "last_login_at": row.last_login_at.isoformat() if row.last_login_at else None,
        "roles": roles,
        "work_location": None,
        "skills": [],
        "system_access": [],
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }
    return data


@router.get("/users/{user_id}/overview")
async def get_user_overview(
    request: Request,
    user_id: str,
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    user = db.get(User, user_id)
    if user is None or str(user.tenant_id) != str(tenant_id):
        from app.core.errors import NotFoundError
        raise NotFoundError(f"User {user_id} not found")

    uid = str(user.id)
    cap = int(user.weekly_capacity_hours) if user.weekly_capacity_hours else 40

    load_rows = db.execute(text(
        "SELECT t.id, t.task_code, t.title, t.statutory_due_date, t.internal_due_date, "
        "t.estimated_hours, t.client_id "
        "FROM tasks t "
        "WHERE t.tenant_id = CAST(:tenant AS uuid) AND t.deleted_at IS NULL "
        "AND (t.preparer_id = CAST(:uid AS uuid) OR t.reviewer_id = CAST(:uid AS uuid) "
        " OR t.approver_id = CAST(:uid AS uuid)) "
        "AND t.status NOT IN ('completed','filed','delivered','cancelled')"
    ), {"tenant": str(tenant_id), "uid": uid}).fetchall()

    open_tasks = len(load_rows)
    overdue_tasks = 0
    weighted = 0.0
    today = date.today()
    for t in load_rows:
        due = t.statutory_due_date or t.internal_due_date
        if due and due.date() < today:
            overdue_tasks += 1
        weighted += float(t.estimated_hours or 0)

    util = round((weighted / cap * 100), 1) if cap else 0.0

    clients = db.execute(text(
        "SELECT c.id, c.client_code, c.legal_name FROM clients c "
        "WHERE c.tenant_id = CAST(:tenant AS uuid) AND c.archived_on IS NULL "
        "AND (c.partner_id = CAST(:uid AS uuid) OR c.manager_id = CAST(:uid AS uuid)) "
        "ORDER BY c.legal_name"
    ), {"tenant": str(tenant_id), "uid": uid}).fetchall()
    client_objs = []
    for c in clients:
        open_c = db.execute(text(
            "SELECT count(*) FROM tasks t WHERE t.tenant_id = CAST(:tenant AS uuid) "
            " AND t.deleted_at IS NULL AND t.client_id = CAST(:cid AS uuid) "
            " AND (t.preparer_id = CAST(:uid AS uuid) OR t.reviewer_id = CAST(:uid AS uuid) OR t.approver_id = CAST(:uid AS uuid)) "
            " AND t.status NOT IN ('completed','filed','delivered','cancelled')"
        ), {"tenant": str(tenant_id), "cid": str(c.id), "uid": uid}).scalar() or 0
        client_objs.append({
            "client_id": str(c.id), "client_code": c.client_code, "legal_name": c.legal_name, "open_tasks": int(open_c),
        })

    activity = db.execute(text(
        "SELECT h.id, h.created_at, h.to_status AS action, t.id AS task_id, t.task_code "
        "FROM task_status_history h JOIN tasks t ON t.id = h.task_id "
        "WHERE t.tenant_id = CAST(:tenant AS uuid) AND h.changed_by_id = CAST(:uid AS uuid) "
        "ORDER BY h.created_at DESC LIMIT 12"
    ), {"tenant": str(tenant_id), "uid": uid}).fetchall()

    now = date.today()
    first = date(now.year, now.month, 1)
    import calendar as _cal
    leave = _leave_calendar(db, tenant_id, uid, first.year, first.month, _cal)

    return {
        "workload": {
            "user_id": uid,
            "full_name": user.full_name,
            "open_tasks": open_tasks,
            "overdue_tasks": overdue_tasks,
            "weighted_load_hours": round(weighted, 2),
            "capacity_hours": cap,
            "utilisation_percent": util,
        } if (open_tasks or weighted) else None,
        "clients": client_objs,
        "client_count": len(client_objs),
        "activity": [
            {
                "id": str(a.id),
                "summary": a.task_code,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "entity_type": "task",
                "entity_id": str(a.task_id) if a.task_id else None,
                "action": a.action,
            }
            for a in activity
        ],
        "leave": leave,
    }


def _leave_calendar(db, tenant_id, user_id, year, month, _cal=None) -> Any:
    """Build a month attendance/leave calendar for a tenant (optionally a user).

    The ``leave_records`` table may not exist in every deployment; in that case
    the calendar degrades to an empty month (all days unrecorded) so the team
    summary / member-overview endpoints never 500 on this feature.
    """
    if _cal is None:
        import calendar as _cal
    days_in_month = _cal.monthrange(year, month)[1]
    rows = []
    try:
        stmt = text(
            "SELECT on_date, kind FROM leave_records "
            "WHERE tenant_id = CAST(:tenant AS uuid) "
            + ("AND user_id = CAST(:uid AS uuid) " if user_id else "")
            + "AND on_date >= :start AND on_date <= :end"
        )
        params = {
            "tenant": str(tenant_id),
            "start": date(year, month, 1),
            "end": date(year, month, days_in_month),
        }
        if user_id:
            params["uid"] = str(user_id)
        rows = db.execute(stmt, params).fetchall()
    except Exception:
        rows = []

    counts: dict = {}
    present = leave_cnt = holiday = half = 0
    for r in rows:
        d = int(r.on_date.day)
        counts.setdefault(d, {"present": 0, "leave": 0, "holiday": 0, "half_day": 0})
        if r.kind in counts[d]:
            counts[d][r.kind] += 1
    days = []
    for d in range(1, days_in_month + 1):
        c = counts.get(d, {"present": 0, "leave": 0, "holiday": 0, "half_day": 0})
        present += c["present"]; leave_cnt += c["leave"]; holiday += c["holiday"]; half += c["half_day"]
        days.append({
            "day": d, "present": c["present"], "leave": c["leave"], "holiday": c["holiday"],
            "half_day": c["half_day"], "recorded": (c["present"] + c["leave"] + c["holiday"] + c["half_day"]) > 0,
        })
    label = _cal.month_name[month] + f" {year}"
    return {
        "year": year, "month": month, "label": label, "days": days,
        "present": present, "leave": leave_cnt, "holiday": holiday, "half_day": half,
    }


@router.get("/branches")
async def list_branches(
    request: Request,
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    rows = db.execute(text(
        "SELECT id, code, name, state_code, is_active FROM branches "
        "WHERE tenant_id = CAST(:tenant AS uuid) ORDER BY name"
    ), {"tenant": str(principal.tenant_id)}).fetchall()
    return [
        {
            "id": str(r.id), "code": r.code, "name": r.name,
            "state_code": r.state_code, "is_active": bool(r.is_active),
        }
        for r in rows
    ]


@router.post("/users")
async def create_user(
    request: Request,
    db: Any = Depends(get_db),
    payload: Any = Body(...),
    principal: Any = Depends(require_permission("user.write")),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    user_id = principal.id

    email = (payload.get("email") or "").strip().lower()
    full_name = (payload.get("full_name") or "").strip()
    if not email or not full_name:
        raise HTTPException(422, "email and full_name are required")

    # Role-assignment policy: the caller may only assign roles within their
    # own tier. Firm owner / admin may assign anything; a partner may not
    # assign a partner-or-above role; a manager may only assign seniors and
    # below. Anything else — including no role — is allowed.
    role_code = (payload.get("role_code") or "").strip().lower()
    assignable = assignable_roles_for(principal)
    if role_code:
        role_row = db.execute(text(
            "SELECT id, is_system, tenant_id FROM roles "
            "WHERE code = :code AND (tenant_id = CAST(:tenant AS uuid) OR tenant_id IS NULL) "
            "ORDER BY tenant_id NULLS LAST LIMIT 1"
        ), {"code": role_code, "tenant": str(tenant_id)}).fetchone()
        if role_row is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown role '{role_code}'. Check /roles for valid options.",
            )
        if role_row.is_system:
            # Built-in role: enforce the tier policy by code.
            if role_code not in assignable:
                raise HTTPException(
                    status_code=403,
                    detail=f"You are not permitted to assign the '{role_code}' role.",
                )
        else:
            # A firm-defined custom role is not a system tier, so only a
            # partner-or-above caller may hand it out.
            caller_tiers = {"firm_owner", "admin", "partner", "branch_partner"}
            if not (caller_tiers & set(principal.roles)):
                raise HTTPException(
                    status_code=403,
                    detail=f"You are not permitted to assign the '{role_code}' role.",
                )

    from app.core.security import hash_password
    pw = payload.get("password") or _random_password()

    result = db.execute(text(
        "INSERT INTO users (id, tenant_id, email, full_name, password_hash, employee_code, designation, "
        "department, phone, branch_id, is_partner, status, date_of_joining, weekly_capacity_hours, "
        "reporting_to_id, created_at, updated_at) "
        "VALUES (gen_random_uuid(), CAST(:tenant AS uuid), :email, :name, :pw, :emp, :desig, :dept, :phone, "
        " CAST(:branch AS uuid), :partner, :status, :joining, :capacity, :reporting, NOW(), NOW()) "
        "RETURNING id"
    ), {
        "tenant": str(tenant_id), "email": email, "name": full_name,         "pw": hash_password(pw),
        "emp": payload.get("employee_code"), "desig": payload.get("designation"),
        "dept": payload.get("department"), "phone": payload.get("phone"),
        "branch": payload.get("branch_id"), "partner": bool(payload.get("is_partner")),
        "status": "invited" if not payload.get("password") else "active",
        "joining": payload.get("date_of_joining"),
        "capacity": int(payload.get("weekly_capacity_hours") or 40),
        "reporting": payload.get("reporting_to_id"),
    })
    db.commit()
    new_id = result.fetchone()[0]

    if role_code:
        role = db.execute(text(
            "SELECT id FROM roles WHERE code = :code AND (tenant_id = CAST(:tenant AS uuid) OR tenant_id IS NULL) "
            "ORDER BY tenant_id NULLS LAST LIMIT 1"
        ), {"code": role_code, "tenant": str(tenant_id)}).scalar()
        if role:
            db.execute(text(
                "INSERT INTO user_roles (user_id, role_id, assigned_by_id, created_at) "
                "VALUES (CAST(:uid AS uuid), CAST(:rid AS uuid), CAST(:by AS uuid), NOW())"
            ), {"uid": str(new_id), "rid": str(role), "by": str(user_id)})
            db.commit()

    row = db.execute(text(
        "SELECT u.id, u.email, u.full_name, u.employee_code, u.designation, u.department, u.phone, "
        "u.branch_id, u.reporting_to_id, u.is_partner, u.status, u.date_of_joining, "
        "u.weekly_capacity_hours, u.last_login_at, u.created_at, u.updated_at FROM users u WHERE u.id = CAST(:id AS uuid)"
    ), {"id": str(new_id)}).fetchone()
    return dict(row._mapping) if row else {"id": str(new_id)}




@router.patch("/users/{user_id}")
async def update_user(
    request: Request,
    user_id: str,
    payload: Any = Body(...),
    db: Any = Depends(get_db),
    principal: Any = Depends(require_permission("user.write")),
) -> Any:
    """Update a team member's profile, role, and/or status."""
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    user = db.get(User, user_id)
    if user is None or str(user.tenant_id) != str(tenant_id):
        raise HTTPException(status_code=404, detail="User not found")

    # Email uniqueness check (within the same tenant).
    new_email = payload.get("email")
    if new_email and new_email.lower() != user.email.lower():
        existing = db.execute(
            select(User).where(
                User.tenant_id == str(tenant_id),
                User.email == new_email,
            )
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=409,
                detail="Another user with this email already exists.",
            )
        user.email = new_email

    # Updatable profile fields.
    if "full_name" in payload:
        user.full_name = payload["full_name"]
    if "designation" in payload:
        user.designation = payload["designation"] or None
    if "department" in payload:
        user.department = payload["department"] or None
    if "phone" in payload:
        user.phone = payload["phone"] or None
    if "employee_code" in payload:
        user.employee_code = payload["employee_code"] or None
    if "is_partner" in payload:
        user.is_partner = bool(payload["is_partner"])
    if "status" in payload:
        user.status = payload["status"]
    if "date_of_joining" in payload:
        user.date_of_joining = payload["date_of_joining"] or None
    if "weekly_capacity_hours" in payload:
        user.weekly_capacity_hours = int(payload["weekly_capacity_hours"] or 40)
    if "branch_id" in payload:
        user.branch_id = payload["branch_id"] or None
    if "reporting_to_id" in payload:
        user.reporting_to_id = payload["reporting_to_id"] or None
    user.updated_at = datetime.now(timezone.utc)

    # Role reassignment.
    role_code = (payload.get("role_code") or "").strip().lower()
    if role_code:
        assignable = assignable_roles_for(principal)
        role_row = db.execute(text(
            "SELECT id, is_system FROM roles "
            "WHERE code = :code AND (tenant_id = CAST(:tenant AS uuid) OR tenant_id IS NULL) "
            "ORDER BY tenant_id NULLS LAST LIMIT 1"
        ), {"code": role_code, "tenant": str(tenant_id)}).fetchone()
        if role_row is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown role '{role_code}'. Check /roles for valid options.",
            )
        if role_row.is_system and role_code not in assignable:
            raise HTTPException(
                status_code=403,
                detail=f"You are not permitted to assign the '{role_code}' role.",
            )
        db.execute(text(
            "DELETE FROM user_roles WHERE user_id = CAST(:uid AS uuid)"
        ), {"uid": str(user_id)})
        db.execute(text(
            "INSERT INTO user_roles (user_id, role_id, assigned_by_id, created_at) "
            "VALUES (CAST(:uid AS uuid), CAST(:rid AS uuid), CAST(:by AS uuid), NOW())"
        ), {"uid": str(user_id), "rid": str(role_row.id), "by": str(principal.id)})

    # Password reset (if provided — e.g. when an admin sets a temporary password).
    if payload.get("password"):
        user.password_hash = hash_password(payload["password"])

    # Revoke refresh tokens so permission changes take effect immediately.
    db.execute(text(
        "UPDATE refresh_tokens SET revoked_at = NOW() "
        "WHERE user_id = CAST(:uid AS uuid) AND revoked_at IS NULL"
    ), {"uid": str(user_id)})

    db.commit()

    row = db.execute(text(
        "SELECT u.id, u.email, u.full_name, u.employee_code, u.designation, u.department, u.phone, "
        "u.branch_id, u.reporting_to_id, u.is_partner, u.status, u.date_of_joining, "
        "u.weekly_capacity_hours, u.last_login_at, u.created_at, u.updated_at "
        "FROM users u WHERE u.id = CAST(:id AS uuid)"
    ), {"id": str(user_id)}).fetchone()
    return dict(row._mapping) if row else {"id": str(user_id)}


@router.delete("/users/{user_id}")
async def delete_user(
    request: Request,
    user_id: str,
    db: Any = Depends(get_db),
    principal: Any = Depends(require_permission("user.write")),
) -> Any:
    """Deactivate a team member (soft delete).

    Sets ``status`` to ``disabled`` and revokes all active refresh tokens so the
    user cannot start a new session. The row is preserved for audit history.
    """
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    user = db.get(User, user_id)
    if user is None or str(user.tenant_id) != str(tenant_id):
        raise HTTPException(status_code=404, detail="User not found")

    if str(user.id) == str(principal.id):
        raise HTTPException(
            status_code=400,
            detail="You cannot deactivate your own account.",
        )

    user.status = "disabled"
    user.updated_at = datetime.now(timezone.utc)
    db.execute(text(
        "UPDATE refresh_tokens SET revoked_at = NOW() "
        "WHERE user_id = CAST(:uid AS uuid) AND revoked_at IS NULL"
    ), {"uid": str(user_id)})
    db.commit()

    return {"id": str(user_id), "status": "disabled", "message": "User deactivated."}


def _random_password() -> str:
    import secrets
    import string
    return "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(14))


@router.post("/users/invite", dependencies=[Depends(require_permission("user.write"))])
async def invite_user(
    request: Request,
    db: Any = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    try:
        body = await request.json()
    except Exception:
        body = {}

    email = (body.get("email") or "").strip().lower()
    full_name = (body.get("full_name") or body.get("name") or "").strip()
    role_codes = body.get("role_codes") or body.get("roles") or []
    if isinstance(role_codes, str):
        role_codes = [role_codes]
    designation = body.get("designation")
    department = body.get("department")
    phone = body.get("phone")
    branch_id = body.get("branch_id")

    if not email or not full_name:
        raise HTTPException(status_code=400, detail="email and full_name are required")

    from app.models import User
    existing = db.execute(text("SELECT id FROM users WHERE tenant_id = CAST(:tenant AS uuid) AND email = :email"), {"tenant": str(tenant_id), "email": email}).first()
    if existing:
        raise HTTPException(status_code=409, detail="User with this email already exists")

    temp_password = _random_password()
    user_id = __import__("uuid").uuid4()
    now = datetime.now(timezone.utc)
    db.execute(text(
        "INSERT INTO users (id, tenant_id, email, full_name, password_hash, designation, department, phone, branch_id, is_partner, status, created_at, updated_at) "
        "VALUES (CAST(:id AS uuid), CAST(:tenant AS uuid), :email, :full_name, :pwd, :designation, :department, :phone, CAST(:branch AS uuid), false, 'active', :now, :now)"
    ), {
        "id": str(user_id),
        "tenant": str(tenant_id),
        "email": email,
        "full_name": full_name,
        "pwd": hash_password(temp_password),
        "designation": designation,
        "department": department,
        "phone": phone,
        "branch": str(branch_id) if branch_id else None,
        "now": now,
    })

    if role_codes:
        for code in role_codes:
            r = db.execute(text("SELECT id FROM roles WHERE tenant_id = CAST(:tenant AS uuid) AND code = :code"), {"tenant": str(tenant_id), "code": code}).first()
            if r:
                db.execute(text("INSERT INTO user_roles (user_id, role_id) VALUES (CAST(:uid AS uuid), CAST(:rid AS uuid)) ON CONFLICT DO NOTHING"), {"uid": str(user_id), "rid": str(r.id)})

    db.commit()
    return {"id": str(user_id), "email": email, "full_name": full_name, "status": "active", "temporary_password": temp_password}
