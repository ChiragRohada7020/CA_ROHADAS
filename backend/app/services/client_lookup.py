"""Client lookup service — also serves as the MCP tool backend for client-related calls."""
from __future__ import annotations

import csv
import io
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import NotFoundError
from app.models import Client


def search_clients(
    db: Session,
    *,
    query: str = "",
    limit: int = 100,
    status: str | None = None,
    tenant_id: str | None = None,
) -> list[Client]:
    stmt = select(Client)
    if tenant_id:
        stmt = stmt.where(Client.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(Client.status == status)
    if query:
        pattern = f"%{query}%"
        stmt = stmt.where(
            or_(
                Client.legal_name.ilike(pattern),
                Client.trade_name.ilike(pattern),
                Client.client_code.ilike(pattern),
                Client.pan.ilike(pattern),
                Client.gstin.ilike(pattern),
            )
        )
    stmt = stmt.order_by(Client.legal_name).limit(limit)
    return db.execute(stmt).scalars().all()


def get_client_detail(db: Session, client_id: str, tenant_id: str | None = None) -> dict[str, Any]:
    from app.core.audit import snapshot

    stmt = select(Client).where(Client.id == client_id)
    if tenant_id:
        stmt = stmt.where(Client.tenant_id == tenant_id)
    client = db.execute(stmt).scalar_one_or_none()
    if client is None:
        raise NotFoundError(f"Client {client_id} not found")
    return snapshot(client)


async def mcp_list_clients(ctx: Any, **kwargs: Any) -> Any:
    db = next(get_db())
    try:
        results = search_clients(db, **kwargs)
        from mcp.server import types

        return types.CallToolResult(
            content=[
                types.TextContent(
                    type="text",
                    text=f"Found {len(results)} client(s):\n"
                    + "\n".join(
                        f"- {c.legal_name} (code: {c.client_code}, PAN: {c.pan or 'N/A'})"
                        for c in results
                    ),
                )
            ]
        )
    finally:
        db.close()


async def mcp_get_client(ctx: Any, **kwargs: Any) -> Any:
    db = next(get_db())
    try:
        result = get_client_detail(db, kwargs["client_id"])
        from mcp.server import types

        return types.CallToolResult(
            content=[types.TextContent(type="text", text=str(result))]
        )
    finally:
        db.close()


async def mcp_read_clients_csv(ctx: Any, **kwargs: Any) -> Any:
    blob_url = kwargs.get("blob_url")
    from mcp.server import types

    if not blob_url:
        return types.CallToolResult(
            content=[types.TextContent(type="text", text="Missing blob_url parameter")],
        )

    import httpx

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(blob_url)
        if resp.status_code != 200:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=f"Failed to fetch CSV: {resp.status_code}")],
            )
        text = resp.text

    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    preview = rows[:10]
    return types.CallToolResult(
        content=[
            types.TextContent(
                type="text",
                text=f"CSV preview: {len(rows)} rows total, showing first {len(preview)}:\n"
                + "\n".join(str(r) for r in preview),
            )
        ],
    )


def get_clients_for_select(
    db: Session,
    *,
    tenant_id: str | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    stmt = select(Client.id, Client.client_code, Client.legal_name, Client.trade_name, Client.status)
    if tenant_id:
        stmt = stmt.where(Client.tenant_id == tenant_id)
    stmt = stmt.where(Client.status != "closed").order_by(Client.legal_name).limit(limit)
    rows = db.execute(stmt).all()
    return [
        {
            "id": str(r.id),
            "client_code": r.client_code,
            "legal_name": r.legal_name,
            "trade_name": r.trade_name,
            "status": r.status,
        }
        for r in rows
    ]
