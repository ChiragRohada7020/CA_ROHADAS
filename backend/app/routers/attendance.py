"""Attendance / leave-records router.

Endpoints:
  GET  /attendance          — list attendance records (filter by user, month, kind)
  POST /attendance          — record / upsert attendance for a user on a date
  PATCH /attendance/{id}    — update an attendance record
  DELETE /attendance/{id}   — delete an attendance record
"""
from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from sqlalchemy import select, text

from app.core.db import get_db
from app.core.security import get_current_user, require_permission

router = APIRouter(tags=["attendance"])


@router.get("/attendance")
async def list_attendance(
    request: Request,
    user_id: str | None = Query(None),
    month: str | None = Query(None, description="YYYY-MM"),
    kind: str | None = Query(None),
    db=Depends(get_db),
    principal: Any = Depends(require_permission("user.read")),
) -> Any:
    """List attendance records for the tenant."""
    tenant_id = principal.tenant_id

    sql = """
        SELECT a.id, a.user_id, u.full_name, u.email, a.on_date, a.kind,
               a.recorded_by, a.recorded_at
        FROM attendances a
        JOIN users u ON u.id = a.user_id
        WHERE a.tenant_id = :tenant_id
    """
    params: dict[str, Any] = {"tenant_id": tenant_id}

    if user_id:
        sql += " AND a.user_id = :user_id"
        params["user_id"] = user_id

    if month:
        year, m = month.split("-")
        sql += " AND EXTRACT(YEAR FROM a.on_date) = :year AND EXTRACT(MONTH FROM a.on_date) = :month"
        params["year"] = int(year)
        params["month"] = int(m)

    if kind:
        sql += " AND a.kind = :kind"
        params["kind"] = kind

    sql += " ORDER BY a.on_date DESC, u.full_name"

    rows = db.execute(text(sql), params).mappings().all()
    return {
        "items": [dict(r) for r in rows],
        "total": len(rows),
    }


@router.post("/attendance")
async def record_attendance(
    request: Request,
    body: Any = Body(...),
    db=Depends(get_db),
    principal: Any = Depends(require_permission("user.write")),
) -> Any:
    """Record or update attendance for a user on a date.

    Body: {"user_id": "...", "on_date": "YYYY-MM-DD", "kind": "present|leave|holiday|half_day"}
    """
    tenant_id = principal.tenant_id
    recorded_by = principal.user_id

    user_id = body.get("user_id")
    on_date = body.get("on_date")
    kind = body.get("kind")

    if not user_id or not on_date or not kind:
        raise HTTPException(status_code=400, detail="user_id, on_date and kind are required")

    if kind not in ("present", "leave", "holiday", "half_day"):
        raise HTTPException(status_code=400, detail="kind must be present, leave, holiday or half_day")

    # Upsert: insert or update existing record for this user+date
    db.execute(text("""
        INSERT INTO attendances (tenant_id, user_id, on_date, kind, recorded_by, recorded_at)
        VALUES (:tenant_id, :user_id, :on_date, :kind, :recorded_by, NOW())
        ON CONFLICT (tenant_id, user_id, on_date)
        DO UPDATE SET kind = EXCLUDED.kind, recorded_by = EXCLUDED.recorded_by, recorded_at = NOW()
    """), {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "on_date": on_date,
        "kind": kind,
        "recorded_by": recorded_by,
    })
    db.commit()
    return {"ok": True, "user_id": user_id, "on_date": on_date, "kind": kind}


@router.patch("/attendance/{attendance_id}")
async def update_attendance(
    attendance_id: str,
    body: Any = Body(...),
    db=Depends(get_db),
    principal: Any = Depends(require_permission("user.write")),
) -> Any:
    """Update an attendance record's kind."""
    kind = body.get("kind")
    if kind not in ("present", "leave", "holiday", "half_day"):
        raise HTTPException(status_code=400, detail="kind must be present, leave, holiday or half_day")

    result = db.execute(text("""
        UPDATE attendances SET kind = :kind, recorded_at = NOW()
        WHERE id = :id AND tenant_id = :tenant_id
        RETURNING id
    """), {"id": attendance_id, "kind": kind, "tenant_id": principal.tenant_id})
    db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    return {"ok": True}


@router.delete("/attendance/{attendance_id}")
async def delete_attendance(
    attendance_id: str,
    db=Depends(get_db),
    principal: Any = Depends(require_permission("user.write")),
) -> Any:
    """Delete an attendance record."""
    result = db.execute(text("""
        DELETE FROM attendances WHERE id = :id AND tenant_id = :tenant_id
    """), {"id": attendance_id, "tenant_id": principal.tenant_id})
    db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    return {"ok": True}
