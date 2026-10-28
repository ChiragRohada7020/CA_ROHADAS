"""Documents router — document management and requests.

Endpoints:
  GET  /documents              — paginated document list
  GET  /documents/summary      — document summary
  GET  /documents/{id}         — document detail with versions and links
  POST /documents/upload       — upload a new document
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import NotFoundError
from app.core.security import get_current_user, require_permission
from app.models import Document, DocumentVersion

router = APIRouter(tags=["documents"])


@router.get("/documents/summary")
async def get_document_summary(
    request: Request,
    client_id: str | None = None,
    doc_type: str | None = None,
    search: str | None = None,
    confidential_only: bool = False,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    stmt = select(Document).where(Document.tenant_id == tenant_id)
    if client_id:
        stmt = stmt.where(Document.client_id == client_id)

    rows = db.execute(stmt).scalars().all()

    status_counts = {}
    for r in rows:
        status_counts[r.status] = status_counts.get(r.status, 0) + 1

    return {
        "total_files": len(rows),
        "status_counts": status_counts,
    }


@router.get("/documents")
async def list_documents(
    request: Request,
    client_id: str | None = None,
    task_id: str | None = None,
    doc_type: str | None = None,
    search: str | None = None,
    confidential_only: bool = False,
    status: str | None = None,
    limit: int = 25,
    offset: int = 0,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    stmt = select(Document).where(Document.tenant_id == tenant_id)
    if client_id:
        stmt = stmt.where(Document.client_id == client_id)
    if task_id:
        stmt = stmt.where(Document.task_id == task_id)
    if doc_type:
        stmt = stmt.where(Document.doc_type == doc_type)
    if status:
        stmt = stmt.where(Document.status == status)

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar() or 0

    joined = (
        stmt.outerjoin(DocumentVersion, DocumentVersion.id == Document.current_version_id)
        .order_by(Document.created_at.desc())
        .limit(limit).offset(offset)
    )
    rows = db.execute(joined).all()

    items = []
    for r in rows:
        dv = r[1] if len(r) > 1 and r[1] is not None else None
        items.append({
            "id": str(r[0].id),
            "title": r[0].title,
            "doc_type": r[0].doc_type,
            "category": r[0].category,
            "status": r[0].status,
            "file_name": dv.file_name if dv else None,
            "size_bytes": int(dv.size_bytes) if dv and dv.size_bytes else None,
            "client_id": str(r[0].client_id) if r[0].client_id else None,
            "created_at": r[0].created_at.isoformat() if r[0].created_at else None,
            "updated_at": r[0].updated_at.isoformat() if r[0].updated_at else None,
            "description": r[0].description,
        })

    return {
        "items": items,
        "meta": {"total": total, "limit": limit, "offset": offset, "has_more": offset + len(items) < total},
    }


@router.get("/documents/{document_id}")
async def get_document(
    request: Request,
    document_id: str,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id

    # Guard against non-UUID path values so the driver doesn't raise 500.
    try:
        uuid.UUID(document_id)
    except (ValueError, AttributeError, TypeError):
        raise NotFoundError(f"Document {document_id} not found")

    doc = db.get(Document, document_id)
    if doc is None or str(doc.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Document {document_id} not found")

    version = db.get(DocumentVersion, doc.current_version_id) if doc.current_version_id else None

    tags = None
    if doc.tags:
        try:
            import json as _json
            tags = _json.loads(doc.tags)
        except (ValueError, TypeError):
            tags = None

    result = {
        "id": str(doc.id),
        "client_id": str(doc.client_id) if doc.client_id else None,
        "engagement_id": str(doc.engagement_id) if doc.engagement_id else None,
        "financial_year_id": str(doc.financial_year_id) if doc.financial_year_id else None,
        "task_id": str(doc.task_id) if doc.task_id else None,
        "document_request_id": str(doc.document_request_id) if doc.document_request_id else None,
        "category": doc.category,
        "doc_type": doc.doc_type,
        "title": doc.title,
        "description": doc.description,
        "period_key": doc.period_key,
        "status": doc.status,
        "is_confidential": bool(doc.is_confidential),
        "from_client": bool(doc.from_client),
        "current_version_id": str(doc.current_version_id) if doc.current_version_id else None,
        "version_count": doc.version_count or 0,
        "rejection_reason": doc.rejection_reason,
        "tags": tags,
        "size_bytes": int(version.size_bytes) if version and version.size_bytes else None,
        "file_name": version.file_name if version else None,
        "uploaded_by_name": None,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
    }

    versions = []
    for v in doc.versions:
        uploader_name = None
        if v.uploaded_by_id and v.uploaded_by_type == "user":
            from app.models import User
            uploader = db.get(User, v.uploaded_by_id)
            if uploader:
                uploader_name = uploader.full_name
        versions.append({
            "id": str(v.id),
            "document_id": str(v.document_id),
            "version_no": v.version_no,
            "file_name": v.file_name,
            "mime_type": v.mime_type,
            "size_bytes": int(v.size_bytes) if v.size_bytes else 0,
            "checksum_sha256": v.checksum_sha256 or "",
            "blob_url": v.blob_url,
            "uploaded_by_id": str(v.uploaded_by_id) if v.uploaded_by_id else None,
            "uploaded_by_type": v.uploaded_by_type,
            "ocr_status": v.ocr_status,
            "notes": v.notes,
            "uploaded_by_name": uploader_name,
            "created_at": v.created_at.isoformat() if v.created_at else None,
        })

    links = []
    for link in doc.links:
        links.append({
            "id": str(link.id),
            "document_id": str(link.document_id),
            "linked_type": link.linked_type,
            "linked_id": str(link.linked_id) if link.linked_id else None,
            "purpose": link.purpose,
            "created_at": link.created_at.isoformat() if link.created_at else None,
        })

    result["versions"] = versions
    result["links"] = links

    return result


@router.post("/documents/upload")
async def upload_document(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    user_id = principal.id

    # Accept multipart
    content_type = request.headers.get("content-type", "")
    filename = "upload"
    file_data = b""
    if "multipart" in content_type:
        form = await request.form()
        # find file
        for k, v in form.items():
            from fastapi import UploadFile

            if hasattr(v, "filename") and hasattr(v, "read"):
                filename = v.filename or filename
                try:
                    file_data = await v.read()
                except Exception:
                    file_data = b""
                break
        # also look for task_id/client_id
        task_id = form.get("task_id")
        client_id = form.get("client_id")
    else:
        try:
            body = await request.json()
        except Exception:
            body = {}
        task_id = body.get("task_id")
        client_id = body.get("client_id")

    from sqlalchemy import text

    doc_id = uuid.uuid4()
    version_id = uuid.uuid4()
    now = datetime.utcnow()

    # Create document
    db.execute(
        text(
            "INSERT INTO documents (id, tenant_id, client_id, task_id, title, doc_type, category, status, current_version_id, is_confidential, from_client, version_count, created_at, updated_at) "
            "VALUES (CAST(:id AS uuid), CAST(:tenant AS uuid), CAST(:client AS uuid), CAST(:task AS uuid), :title, :doctype, :category, :status, CAST(:ver AS uuid), false, false, 0, :now, :now)"
        ),
        {
            "id": str(doc_id),
            "tenant": str(tenant_id),
            "client": str(client_id) if client_id else None,
            "task": str(task_id) if task_id else None,
            "title": filename,
            "doctype": "other",
            "category": "general",
            "status": "received",
            "ver": str(version_id),
            "now": now,
        },
    )

    # Create version
    db.execute(
        text(
            "INSERT INTO document_versions (id, document_id, version_no, file_name, blob_pathname, mime_type, size_bytes, checksum_sha256, uploaded_by_id, uploaded_by_type, ocr_status, created_at) "
            "VALUES (CAST(:id AS uuid), CAST(:doc AS uuid), :vnum, :fname, :fpath, :mime, :size, :sha, CAST(:uid AS uuid), :ubtype, :ocr, :now)"
        ),
        {
            "id": str(version_id),
            "doc": str(doc_id),
            "vnum": 1,
            "fname": filename,
            "fpath": f"/uploads/{doc_id}/{filename}",
            "mime": "application/octet-stream",
            "size": len(file_data) if file_data else 0,
            "sha": "",
            "uid": str(user_id),
            "ubtype": "user",
            "ocr": "pending",
            "now": now,
        },
    )

    db.commit()

    return {
        "id": str(doc_id),
        "title": filename,
        "doc_type": "other",
        "category": "general",
        "status": "received",
        "file_name": filename,
        "size_bytes": len(file_data) if file_data else 0,
        "created_at": now.isoformat(),
    }


@router.post("/documents/{document_id}/accept", dependencies=[Depends(require_permission("document.write"))])
async def accept_document(
    request: Request,
    document_id: str,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    try:
        uuid.UUID(document_id)
    except Exception:
        raise NotFoundError(f"Document {document_id} not found")
    doc = db.get(Document, document_id)
    if doc is None or str(doc.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Document {document_id} not found")
    doc.status = "accepted"
    doc.rejection_reason = None
    from datetime import datetime
    doc.updated_at = datetime.utcnow()
    db.commit()
    return {"id": str(doc.id), "status": doc.status}


@router.post("/documents/{document_id}/reject", dependencies=[Depends(require_permission("document.write"))])
async def reject_document(
    request: Request,
    document_id: str,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    try:
        uuid.UUID(document_id)
    except Exception:
        raise NotFoundError(f"Document {document_id} not found")
    doc = db.get(Document, document_id)
    if doc is None or str(doc.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Document {document_id} not found")
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    reason = payload.get("reason") or payload.get("rejection_reason") or ""
    doc.status = "rejected"
    doc.rejection_reason = reason
    from datetime import datetime
    doc.updated_at = datetime.utcnow()
    db.commit()
    return {"id": str(doc.id), "status": doc.status, "rejection_reason": doc.rejection_reason}


@router.get("/documents/{document_id}/shares")
async def list_document_shares(
    request: Request,
    document_id: str,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    try:
        uuid.UUID(document_id)
    except Exception:
        raise NotFoundError(f"Document {document_id} not found")
    doc = db.get(Document, document_id)
    if doc is None or str(doc.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Document {document_id} not found")
    from app.models import DocumentShare
    shares = db.query(DocumentShare).filter(DocumentShare.document_id == doc.id).all()
    return [
        {
            "id": str(s.id),
            "token": s.token,
            "expires_at": s.expires_at.isoformat() if s.expires_at else None,
            "max_downloads": s.max_downloads,
            "download_count": s.download_count,
            "shared_with_email": s.shared_with_email,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in shares
    ]


@router.post("/documents/{document_id}/shares", dependencies=[Depends(require_permission("document.share"))])
async def create_document_share(
    request: Request,
    document_id: str,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    try:
        uuid.UUID(document_id)
    except Exception:
        raise NotFoundError(f"Document {document_id} not found")
    doc = db.get(Document, document_id)
    if doc is None or str(doc.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Document {document_id} not found")
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    from app.models import DocumentShare
    import secrets
    from datetime import timedelta, datetime
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=int(payload.get("expires_in_days") or 7))
    share = DocumentShare(
        tenant_id=tenant_id,
        document_id=doc.id,
        token=token,
        expires_at=expires_at,
        max_downloads=payload.get("max_downloads"),
        download_count=0,
        shared_with_email=payload.get("shared_with_email"),
        created_by_id=principal.id,
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return {
        "id": str(share.id),
        "token": share.token,
        "expires_at": share.expires_at.isoformat() if share.expires_at else None,
        "share_url": f"/share/documents/{share.token}",
    }


@router.delete("/documents/{document_id}/shares/{share_id}", dependencies=[Depends(require_permission("document.share"))])
async def revoke_document_share(
    request: Request,
    document_id: str,
    share_id: str,
    db: Session = Depends(get_db),
) -> Any:
    principal = await get_current_user(request, db)
    tenant_id = principal.tenant_id
    from app.models import DocumentShare
    share = db.get(DocumentShare, share_id)
    if share is None or str(share.tenant_id) != str(tenant_id) or str(share.document_id) != document_id:
        raise NotFoundError(f"Share {share_id} not found")
    db.delete(share)
    db.commit()
    return {"ok": True}


# Public share access (no auth required)
from fastapi import APIRouter as APIRouter2

public_share_router = APIRouter(tags=["public"])


@public_share_router.get("/share/documents/{token}")
async def get_shared_document(
    token: str,
    db: Session = Depends(get_db),
) -> Any:
    from app.models import DocumentShare, Document, DocumentVersion
    from datetime import datetime

    share = db.query(DocumentShare).filter(DocumentShare.token == token).first()
    if share is None:
        raise NotFoundError("Share not found")
    if share.expires_at and share.expires_at < datetime.utcnow():
        raise NotFoundError("Share expired")
    if share.max_downloads is not None and share.download_count >= share.max_downloads:
        raise NotFoundError("Share limit reached")

    doc = db.get(Document, share.document_id)
    if doc is None:
        raise NotFoundError("Document not found")

    version = db.get(DocumentVersion, doc.current_version_id) if doc.current_version_id else None
    return {
        "document_id": str(doc.id),
        "title": doc.title,
        "file_name": version.file_name if version else None,
        "size_bytes": int(version.size_bytes) if version and version.size_bytes else None,
        "mime_type": version.mime_type if version else None,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "download_url": f"/share/documents/{token}/download",
    }


@public_share_router.get("/share/documents/{token}/download")
async def download_shared_document(
    token: str,
    db: Session = Depends(get_db),
) -> Any:
    from app.models import DocumentShare, Document, DocumentVersion
    from datetime import datetime
    from fastapi.responses import Response

    share = db.query(DocumentShare).filter(DocumentShare.token == token).first()
    if share is None:
        raise NotFoundError("Share not found")
    if share.expires_at and share.expires_at < datetime.utcnow():
        raise NotFoundError("Share expired")
    if share.max_downloads is not None and share.download_count >= share.max_downloads:
        raise NotFoundError("Share limit reached")

    doc = db.get(Document, share.document_id)
    if doc is None:
        raise NotFoundError("Document not found")
    version = db.get(DocumentVersion, doc.current_version_id) if doc.current_version_id else None
    if version is None:
        raise NotFoundError("Version not found")

    # For local/dev, return placeholder or try to read blob; return generic response
    share.download_count = (share.download_count or 0) + 1
    db.commit()

    content = b"%PDF-1.4\n% Placeholder shared document\n"
    filename = version.file_name or doc.title or "document"
    return Response(
        content=content,
        media_type=version.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
