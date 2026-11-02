"""Imports router."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.assistant.extract import extract_text
from app.core.db import get_db
from app.core.security import get_current_user
from app.models import Client, ImportJob
from app.routers.clients import _generate_client_code

router = APIRouter(tags=["imports"])

#: Winman CA-ERP MIS report column header -> Client model field.
#: Matching is case-insensitive and ignores trailing punctuation.
_CLIENT_COLUMN_MAP: dict[str, str] = {
    "name": "legal_name",
    "pan": "pan",
    "mobile number": "mobile",
    "email id": "email",
    "telephone no": "phone",
    "dob/doi/dof": "date_of_birth",
    "father name": "father_name",
    "address": "address_line1",
    "area / locality": "locality",
    "city": "city",
    "state": "state",
    "pin / zip code": "pincode",
    "aadhaar no": "aadhaar_no",
    "residential status": "residential_status",
    "status": "status",
    "passport no": "passport_no",
    "file no": "file_no",
}

_VALID_STATUSES = {"prospect", "onboarding", "active", "inactive", "on_hold", "closed"}

_VALID_DATA_TYPES = {"clients", "contacts", "invoices", "services", "other"}


def _normalize_header(header: str) -> str:
    return header.strip().lower().rstrip(".")


def _parse_date(value: str) -> datetime | None:
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d/%m/%y"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def _plan_from_text(
    text: str,
    data_type: str,
    tenant_id: str,
    default_client_type: str,
) -> dict[str, Any]:
    """Build a preview plan from raw text without writing anything."""
    lines = [ln for ln in text.splitlines() if ln.strip()]
    lines = [ln for ln in lines if not ln.startswith("--- Sheet:")]
    if not lines:
        return {
            "rows_read": 0,
            "would_create": 0,
            "would_skip_existing": 0,
            "rows_rejected": 0,
            "mapping": {},
            "unmapped_fields": [],
            "mapping_problems": [],
            "issues": [],
        }

    # Extraction returned an error note (e.g. openpyxl not installed and the
    # ZIP fallback could not recover anything). Report it as a mapping problem
    # instead of parsing the note as a header row — otherwise the UI shows
    # "Not in this file: [Could not read spreadsheet: ...]" and "No Name column
    # found", which hides the real problem.
    first = lines[0]
    if first.startswith("[") and (
        "could not read" in first.lower() or "not installed" in first.lower()
    ):
        return {
            "rows_read": 0,
            "would_create": 0,
            "would_skip_existing": 0,
            "rows_rejected": 0,
            "mapping": {},
            "unmapped_fields": [],
            "mapping_problems": [first],
            "issues": [],
        }

    header_idx = _find_header_row(lines)
    header = [_normalize_header(h) for h in lines[header_idx].split("\t")]
    column_index: dict[str, int] = {}
    for i, h in enumerate(header):
        if h and h not in column_index:
            column_index[h] = i

    mapped: dict[str, str] = {}
    unmapped: list[str] = []
    problems: list[str] = []
    for col, idx in column_index.items():
        model_field = _CLIENT_COLUMN_MAP.get(col)
        if model_field is None:
            unmapped.append(col)
        else:
            mapped[model_field] = col

    if "legal_name" not in mapped:
        problems.append("No Name column found — rows without a legal name will be rejected")

    would_create = 0
    would_skip_existing = 0
    rows_rejected = 0
    seen_pans: set[str] = set()

    for row_number, ln in enumerate(lines[header_idx + 1 :], start=header_idx + 2):
        cells = ln.split("\t")
        if not any(c.strip() for c in cells):
            continue

        fields: dict[str, str] = {}
        for col, idx in column_index.items():
            model_field = _CLIENT_COLUMN_MAP.get(col)
            if model_field is None or idx >= len(cells):
                continue
            value = cells[idx].strip()
            if value:
                fields[model_field] = value

        legal_name = fields.get("legal_name")
        if not legal_name:
            rows_rejected += 1
            continue

        pan = fields.get("pan")
        if pan:
            pan_key = pan.upper().replace(" ", "")
            pan = pan_key
            if pan_key in seen_pans:
                rows_rejected += 1
                continue
            seen_pans.add(pan_key)

        would_create += 1

    return {
        "rows_read": len(lines) - header_idx - 1,
        "would_create": would_create,
        "would_skip_existing": would_skip_existing,
        "rows_rejected": rows_rejected,
        "mapping": mapped,
        "unmapped_fields": unmapped,
        "mapping_problems": problems,
        "issues": [],
    }


def _find_header_row(lines: list[str]) -> int:
    """Find the row index that looks like a column header row.

    Scans the first few rows and picks the one whose cells best match the
    known column map keys (case-insensitive, punctuation stripped). Falls back
    to row 0 if nothing matches well.
    """
    best_idx = 0
    best_score = 0
    for i in range(min(5, len(lines))):
        cells = [_normalize_header(c) for c in lines[i].split("\t")]
        score = sum(1 for c in cells if c in _CLIENT_COLUMN_MAP)
        if score > best_score:
            best_score = score
            best_idx = i
    return best_idx


def _commit_from_text(
    text: str,
    data_type: str,
    tenant_id: str,
    default_client_type: str,
    db: Any,
) -> dict[str, Any]:
    """Actually create clients from raw text."""
    lines = [ln for ln in text.splitlines() if ln.strip()]
    lines = [ln for ln in lines if not ln.startswith("--- Sheet:")]
    if not lines:
        return {
            "job_id": None,
            "created": [],
            "rejected": [],
            "rows_imported": 0,
            "rows_rejected": 0,
        }

    first = lines[0]
    if first.startswith("[") and (
        "could not read" in first.lower() or "not installed" in first.lower()
    ):
        return {
            "job_id": None,
            "created": [],
            "rejected": [
                {"row": "file", "reason": first, "raw_row": {}},
            ],
            "rows_imported": 0,
            "rows_rejected": 1,
        }

    header_idx = _find_header_row(lines)
    header = [_normalize_header(h) for h in lines[header_idx].split("\t")]
    column_index: dict[str, int] = {}
    for i, h in enumerate(header):
        if h and h not in column_index:
            column_index[h] = i

    created: list[dict] = []
    rejected: list[dict] = []
    seen_pans: set[str] = set()

    def raw_row(cells: list[str]) -> dict[str, str]:
        return {header[i]: cells[i] if i < len(cells) else "" for i in range(len(header))}

    for row_number, ln in enumerate(lines[header_idx + 1 :], start=header_idx + 2):
        cells = ln.split("\t")
        if not any(c.strip() for c in cells):
            continue

        fields: dict[str, str] = {}
        for col, idx in column_index.items():
            model_field = _CLIENT_COLUMN_MAP.get(col)
            if model_field is None or idx >= len(cells):
                continue
            value = cells[idx].strip()
            if value:
                fields[model_field] = value

        legal_name = fields.get("legal_name")
        if not legal_name:
            rejected.append({
                "row": row_number,
                "reason": "missing legal_name (Name column)",
                "raw_row": raw_row(cells),
            })
            continue

        pan = fields.get("pan")
        if pan:
            pan_key = pan.upper().replace(" ", "")
            pan = pan_key
            if pan_key in seen_pans:
                rejected.append({
                    "row": row_number,
                    "reason": f"duplicate PAN {pan} within file",
                    "raw_row": raw_row(cells),
                })
                continue
            existing = db.execute(
                select(Client).where(Client.tenant_id == tenant_id).where(Client.pan == pan)
            ).scalar_one_or_none()
            if existing is not None:
                rejected.append({
                    "row": row_number,
                    "reason": f"client with PAN {pan} already exists",
                    "raw_row": raw_row(cells),
                })
                continue
            seen_pans.add(pan_key)

        status = fields.get("status", "prospect")
        if status.lower() not in _VALID_STATUSES:
            status = "prospect"

        dob = _parse_date(fields["date_of_birth"]) if fields.get("date_of_birth") else None

        client = Client(
            tenant_id=tenant_id,
            client_code=_generate_client_code(db),
            client_type=default_client_type,
            legal_name=legal_name,
            pan=pan if pan else None,
            date_of_birth=dob,
            address_line1=fields.get("address_line1"),
            locality=fields.get("locality"),
            city=fields.get("city"),
            state=fields.get("state"),
            pincode=fields.get("pincode"),
            mobile=fields.get("mobile"),
            phone=fields.get("phone"),
            email=fields.get("email"),
            father_name=fields.get("father_name"),
            aadhaar_no=fields.get("aadhaar_no"),
            residential_status=fields.get("residential_status"),
            passport_no=fields.get("passport_no"),
            file_no=fields.get("file_no"),
            status=status,
            kyc_status="not_started",
        )
        db.add(client)
        try:
            db.commit()
            db.refresh(client)
            created.append({
                "id": str(client.id),
                "client_code": client.client_code,
                "legal_name": client.legal_name,
                "status": client.status,
            })
        except IntegrityError:
            db.rollback()
            rejected.append({
                "row": row_number,
                "reason": "duplicate client (PAN or client_code conflict)",
                "raw_row": raw_row(cells),
            })

    job = ImportJob(
        tenant_id=tenant_id,
        provider=data_type,
        job_type="clients",
        status="completed" if not rejected else "partial",
        source_ref=data_type,
        rows_imported=len(created),
        rows_rejected=len(rejected),
        finished_at=datetime.utcnow(),
    )
    db.add(job)
    db.commit()

    return {
        "job_id": str(job.id),
        "created": created,
        "rejected": rejected,
        "rows_imported": len(created),
        "rows_rejected": len(rejected),
    }


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
    payload: Any = Body(...),
    db: SessionLocal = Depends(get_db),
) -> Any:
    from app.core.rbac import Permission as Perm

    principal = await get_current_user(request, db)
    if "client.write" not in principal.permissions and "*:*" not in principal.permissions:
        raise HTTPException(status_code=403, detail="Permission 'client.write' is required")

    tenant_id = principal.tenant_id
    content = payload.get("content", "")
    provider = payload.get("provider", "winman")
    source_ref = payload.get("source_ref") or "import"
    default_client_type = payload.get("default_client_type", "individual")
    data_type = payload.get("data_type", "clients")
    dry_run = bool(payload.get("dry_run", False))

    if data_type not in _VALID_DATA_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid data_type: {data_type}")

    text = extract_text(source_ref, content.encode("utf-8"), "text/plain")

    if dry_run:
        return _plan_from_text(text, data_type, tenant_id, default_client_type)

    return _commit_from_text(text, data_type, tenant_id, default_client_type, db)


@router.post("/imports/upload")
async def import_upload(
    request: Request,
    file: UploadFile = File(...),
    provider: str = Form("winman"),
    source_ref: str | None = Form(None),
    default_client_type: str = Form("individual"),
    data_type: str = Form("clients"),
    dry_run: bool = Form(False),
    db: SessionLocal = Depends(get_db),
) -> Any:
    from app.core.rbac import Permission as Perm

    principal = await get_current_user(request, db)
    if "client.write" not in principal.permissions and "*:*" not in principal.permissions:
        raise HTTPException(status_code=403, detail="Permission 'client.write' is required")

    tenant_id = principal.tenant_id
    filename = source_ref or file.filename or "import"
    data = await file.read()

    if data_type not in _VALID_DATA_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid data_type: {data_type}")

    text = extract_text(filename, data, file.content_type or "")

    if dry_run:
        return _plan_from_text(text, data_type, tenant_id, default_client_type)

    return _commit_from_text(text, data_type, tenant_id, default_client_type, db)
