"""Assistant router — AI chat streaming and conversation sessions.

Endpoints:
  POST /assistant/chat/stream   — SSE stream for AI chat
  POST /assistant/chat          — non-streaming chat (buffer all content)
  DELETE /assistant/chat/{session_id} — clear a conversation session
  POST /assistant/upload        — upload a file and attach it to a chat session
"""
from __future__ import annotations

import logging
import sys
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.assistant.chat import handle_chat_stream
from app.assistant.file_reader import file_reader
from app.assistant.sessions import (
    add_uploaded_file,
    clear_session,
    get_or_create_session,
    get_session,
)
from app.core.db import get_db

router = APIRouter(tags=["assistant"])
logger = logging.getLogger("ca_software.assistant.upload")


def _diag(*args) -> None:
    """Write a diagnostic line to stderr, flushed.

    uvicorn's logging config can swallow logger output, and I need these
    lines to survive regardless of how the server is launched — they are the
    only way to see what the browser actually sent when a file fails to read.
    """
    print(*args, file=sys.stderr, flush=True)

#: Per-file cap. Kept well below the Vercel/Cloudflare request body limit so a
#: single oversized file is refused up front with a clear message.
MAX_UPLOAD_BYTES = file_reader.MAX_UPLOAD_BYTES


def _error(message: str, status_code: int) -> JSONResponse:
    """A JSON error with the right status code.

    Returning a ``(body, status)`` tuple from a FastAPI endpoint makes the
    status code 200 and wraps the body in an array, which is the classic way
    these "413" responses silently become 200s. ``JSONResponse`` is explicit.
    """
    return JSONResponse(status_code=status_code, content={"error": message})


@router.post("/assistant/upload")
async def upload_assistant_file(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    """Upload a file and attach its extracted text to a chat session.

    The file itself is not persisted to disk — only the extracted text is
    kept in the session store, which is what the model actually reads. This
    keeps the upload scoped to one conversation (it is cleared with the
    session) and avoids a growing blob store for a dev feature.

    Accepts multipart form data with a ``file`` field and an optional
    ``session_id``. If no session is supplied a new one is created, so a
    user can upload first and then chat.
    """
    principal = await _principal(request, db)

    content_type = request.headers.get("content-type", "")
    if "multipart" not in content_type:
        return _error("Upload a file as multipart form data (field name: file).", 400)

    form = await request.form()
    upload = None
    for _key, value in form.items():
        if hasattr(value, "filename") and hasattr(value, "read"):
            upload = value
            break
    if upload is None or not getattr(upload, "filename", None):
        return _error("No file was included in the upload.", 400)

    session_id = form.get("session_id")
    session = get_or_create_session(
        session_id,
        tenant_id=principal.tenant_id,
        user_id=principal.user_id,
    )

    file_bytes = await upload.read()
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        return _error(
            f"\"{upload.filename}\" is too large "
            f"({len(file_bytes)} bytes). The limit is {MAX_UPLOAD_BYTES} bytes.",
            413,
        )

    # Diagnostics: log the raw bytes so a "could not read" report can be
    # traced to exactly what the browser sent. The magic bytes distinguish a
    # real XLSX (PK) from a CSV mislabelled as .xlsx, which is the usual cause
    # of "bad offset for central directory".
    _diag(
        "upload received name=%r mime=%r bytes=%d magic=%r",
        upload.filename,
        upload.content_type,
        len(file_bytes),
        file_bytes[:8],
    )

    file_id = str(uuid.uuid4())
    # The FileReader is the single place a file becomes text: it is
    # format-aware (text, CSV, PDF, DOCX, XLSX, old .xls) and never raises,
    # so whatever the user uploads reaches the model as a readable string.
    record = file_reader.extract(upload.filename, file_bytes, upload.content_type or "")
    record["id"] = file_id
    add_uploaded_file(session.id, file_id, record)

    _diag(
        "upload extracted name=%r chars=%d starts_with_note=%r first80=%r",
        record["name"],
        record["chars"],
        record["text"].startswith("["),
        record["text"][:80],
    )
    if record["text"].startswith("[Could not read") and upload.filename.lower().endswith((".xlsx", ".xls")):
        from app.assistant.extract import _zip_local_entries

        entries = _zip_local_entries(file_bytes)
        _diag(
            "upload zip scan: local entries=%d names=%r",
            len(entries),
            sorted(entries.keys())[:12],
        )

    # Persist failing uploads so the bytes can be inspected offline. The
    # browser's copy of chirag.xlsx is a different file from the one on disk
    # (23431 vs 14368 bytes) and every converter rejects it — without saving
    # the bytes there is no way to know why.
    if record["text"].startswith("[Could not read"):
        try:
            import os

            dump_dir = "/tmp/ca_imports"
            os.makedirs(dump_dir, exist_ok=True)
            dump_path = os.path.join(dump_dir, f"failed-upload-{file_id[:8]}.xlsx")
            with open(dump_path, "wb") as fh:
                fh.write(file_bytes)
            _diag("upload dumped failing bytes to %s (%d bytes)", dump_path, len(file_bytes))
        except Exception as exc:  # pragma: no cover - best-effort diagnostic
            _diag("upload could not dump failing bytes: %s", exc)

    _diag(
        "upload extracted name=%r chars=%d starts_with_note=%r first80=%r",
        record["name"],
        record["chars"],
        record["text"].startswith("["),
        record["text"][:80],
    )

    return {
        "session_id": session.id,
        "file": {
            "id": file_id,
            "name": record["name"],
            "size_bytes": record["size_bytes"],
            "mime_type": record["mime_type"],
            "extracted_chars": record["chars"],
        },
    }


async def _principal(request: Request, db: Session):
    """Resolve the caller's principal, reusing the chat path's logic."""
    from app.core.security import get_current_user
    return await get_current_user(request, db)


@router.post("/assistant/chat/stream")
async def assistant_chat_stream(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    body = await request.json()
    return await handle_chat_stream(
        request,
        db=db,
        message=body.get("message", ""),
        session_id=body.get("session_id"),
        confirm=body.get("confirm", False),
        tool_args=body.get("tool_args"),
    )


@router.get("/assistant/chat/stream")
async def assistant_chat_stream_get(
    request: Request,
    db: Session = Depends(get_db),
    session_id: str | None = None,
    message: str | None = None,
    confirm: bool = False,
) -> Any:
    return await handle_chat_stream(
        request,
        db=db,
        message=message or "",
        session_id=session_id,
        confirm=confirm,
    )


@router.post("/assistant/chat")
async def assistant_chat(
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    body = await request.json()
    streaming_response = await handle_chat_stream(
        request,
        db=db,
        message=body.get("message", ""),
        session_id=body.get("session_id"),
    )
    buffer: list[str] = []
    async for chunk in streaming_response.body_iterator:
        buffer.append(chunk)
    content = "".join(buffer)
    return {"role": "assistant", "content": content}


@router.delete("/assistant/chat/{session_id}")
async def clear_chat_session(
    request: Request,
    session_id: str,
) -> Any:
    clear_session(session_id)
    return {"cleared": True, "session_id": session_id}
