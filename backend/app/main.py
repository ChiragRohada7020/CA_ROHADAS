#!/usr/bin/env python
"""
Main entry point for the CA Software backend.

The backend is intentionally modular: routers handle HTTP, services hold the
business logic, models map tables and core wires the cross-cutting concerns.
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings, assert_production_ready
from app.core.errors import AppError
from app.core.db import init_db
from app.core.security import SecurityContext
from app.core.rbac import Permission
from app.core.audit import AuditLog
from app.core.validation import validate_identifier
from app.core.clock import today_local

from app.routers.assistant import router as assistant_router
from app.routers.attendance import router as attendance_router
from app.routers.auth import router as auth_router
from app.routers.billing import router as billing_router
from app.routers.credit_notes import router as credit_notes_router
from app.routers.invoice_pdf import router as invoice_pdf_router
from app.routers.clients import router as clients_router
from app.routers.compliance import router as compliance_router
from app.routers.communications import router as communications_router
from app.routers.documents import router as documents_router
from app.routers.document_requests import router as document_requests_router
from app.routers.financial_years import router as financial_years_router
from app.routers.imports import router as imports_router
from app.routers.integrations import router as integrations_router
from app.routers.notifications import router as notifications_router
from app.routers.reports import router as reports_router
from app.routers.services import router as services_router
from app.routers.task_templates import router as task_templates_router
from app.routers.tasks import router as tasks_router
from app.routers.users import router as users_router
from app.routers.roles import router as roles_router
from app.routers.whatsapp import router as whatsapp_router
from app.routers.documents import public_share_router

from app.mcp_server.server import (
    MCPMount,
    build_streamable_http_app,
    get_session_manager,
    get_mcp_session_manager,
)

logger = logging.getLogger("ca_software")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _mcp_session_mgr = get_mcp_session_manager()
    async with _mcp_session_mgr.run():
        yield


def create_app() -> FastAPI:
    """Build and return the FastAPI application."""
    assert_production_ready(settings)

    app = FastAPI(
        title="CA Software API",
        description="API for CA Software — an operating system for Indian CA firms.",
        version="0.1.0",
        lifespan=lifespan,
    )

    # ── CORS ─────────────────────────────────────────────────────────────
    origins: list[str] = settings.CORS_ORIGINS or ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Error handling ───────────────────────────────────────────────────
    @app.exception_handler(AppError)
    async def _handle_app_error(request, exc: AppError):
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
        )

    @app.exception_handler(Exception)
    async def _handle_unexpected(request, exc: Exception):
        logger.exception("Unhandled error: %s", exc)
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error", "code": "internal", "detail": str(exc)},
        )

    # ── Health ───────────────────────────────────────────────────────────
    @app.get("/api/health")
    async def health() -> dict:
        return {"status": "ok", "service": "CA Software backend"}

    @app.get("/api/health/db")
    async def health_db() -> dict:
        try:
            from app.core.db import SessionLocal
            db = SessionLocal()
            try:
                db.execute(__import__("sqlalchemy").text("SELECT 1"))
                return {"status": "ok", "database": True}
            finally:
                db.close()
        except Exception as exc:
            logger.error("Database health check failed: %s", exc)
            return {"status": "degraded", "database": False, "error": str(exc)}

    # ── API routers ──────────────────────────────────────────────────────
    for router in (
        auth_router,
        assistant_router,
        attendance_router,
        billing_router,
        credit_notes_router,
        invoice_pdf_router,
        clients_router,
        compliance_router,
        communications_router,
        documents_router,
        document_requests_router,
        financial_years_router,
        imports_router,
        integrations_router,
        notifications_router,
        reports_router,
        services_router,
        task_templates_router,
        tasks_router,
        users_router,
        roles_router,
        whatsapp_router,
    ):
        app.include_router(router, prefix="/api")
    app.include_router(public_share_router)

    # ── MCP server mount ─────────────────────────────────────────────────
    _session_manager = get_session_manager()
    _mcp_app = build_streamable_http_app(_session_manager)
    app.mount("/mcp/", app=_mcp_app, name="mcp")

    logger.info("CA Software backend created — %d routers registered",
                len(app.routes))
    return app


app = create_app()
