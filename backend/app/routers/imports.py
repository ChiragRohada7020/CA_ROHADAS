"""Imports router."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select

from app.core.db import get_db
from app.core.security import get_current_user
from app.models import ImportJob

router = APIRouter(tags=["imports"])


@router.get("/imports")
async def list_imports(
    request: Request,
    limit: int = 25,
    offset: int = 0,
    db: SessionLocal = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    rows = db.execute(
        select(ImportJob)
        .where(ImportJob.tenant_id == tenant_id)
        .order_by(ImportJob.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).scalars().all()

    items = []
    for job in rows:
        items.append(
            {
                "id": str(job.id),
                "provider": job.provider,
                "job_type": job.job_type,
                "status": job.status,
                "source_ref": job.source_ref,
                "rows_imported": job.rows_imported,
                "rows_rejected": job.rows_rejected,
                "started_at": job.started_at.isoformat() if job.started_at else None,
                "finished_at": job.finished_at.isoformat() if job.finished_at else None,
                "error": job.error,
                "reconciliation_status": getattr(job, "reconciliation_status", None),
                "created_at": job.created_at.isoformat() if job.created_at else None,
            }
        )

    return {"items": items, "meta": {"total": len(items), "limit": limit, "offset": offset, "has_more": False}}


@router.get("/imports/{job_id}")
async def get_import(
    request: Request,
    job_id: str,
    db: SessionLocal = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    job = db.get(ImportJob, job_id)
    if job is None or str(job.tenant_id) != str(tenant_id):
        from app.core.errors import NotFoundError

        raise NotFoundError(f"Import {job_id} not found")

    return {
        "id": str(job.id),
        "provider": job.provider,
        "job_type": job.job_type,
        "status": job.status,
        "source_ref": job.source_ref,
        "rows_imported": job.rows_imported,
        "rows_rejected": job.rows_rejected,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "error": job.error,
        "reconciliation_status": getattr(job, "reconciliation_status", None),
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "error_count": 0,
        "warning_count": 0,
        "errors": [],
    }


@router.post("/imports/clients")
async def import_clients(
    request: Request,
    db: SessionLocal = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    # Minimal stub to satisfy API calls
    return {"ok": True}
