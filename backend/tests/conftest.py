"""Pytest configuration and shared fixtures for the CA Rohadas test suite.

Tests run against the development database. Each test uses a separate
transaction that is rolled back on teardown so the real data is never
modified.  A dedicated test tenant is created once per session and cleaned
up automatically.
"""
from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Ensure the backend package is on sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app.core.db import Base, get_db, SessionLocal
from app.core.security import create_access_token
from app.models import Tenant, User, Client, Task

TEST_TENANT_ID = "11111111-1111-1111-1111-111111111111"
TEST_USER_ID = "22222222-2222-2222-2222-222222222222"


@pytest.fixture(scope="session")
def _setup_test_tenant():
    """Create a dedicated test tenant and user at the start of the session."""
    db = SessionLocal()
    try:
        existing = db.get(Tenant, TEST_TENANT_ID)
        if existing:
            db.delete(existing)
            db.commit()

        tenant = Tenant(
            id=uuid.UUID(TEST_TENANT_ID),
            name="Test Tenant",
            legal_name="Test Tenant",
            slug="test-tenant-cla",
            status="active",
        )
        db.add(tenant)
        db.flush()

        user = User(
            id=uuid.UUID(TEST_USER_ID),
            tenant_id=uuid.UUID(TEST_TENANT_ID),
            email="test@example.com",
            full_name="Test User",
            password_hash="dummy",
            is_partner=True,
            status="active",
            designation="Partner",
            department="Test",
            employee_code="T001",
        )
        db.add(user)

        client = Client(
            id=uuid.uuid4(),
            tenant_id=uuid.UUID(TEST_TENANT_ID),
            client_code="CTEST:0001",
            client_type="legal_entity",
            legal_name="Test Client",
            status="active",
            kyc_status="completed",
        )
        db.add(client)

        db.commit()
        yield {
            "tenant_id": str(tenant.id),
            "user_id": str(user.id),
            "client_id": str(client.id),
        }
    finally:
        db = SessionLocal()
        tid = TEST_TENANT_ID
        db.execute(text(f"DELETE FROM task_assignments WHERE task_id IN (SELECT id FROM tasks WHERE tenant_id = '{tid}')"))
        db.execute(text(f"DELETE FROM task_status_history WHERE task_id IN (SELECT id FROM tasks WHERE tenant_id = '{tid}')"))
        db.execute(text(f"DELETE FROM tasks WHERE tenant_id = '{tid}'"))
        db.execute(text(f"DELETE FROM invoice_lines WHERE invoice_id IN (SELECT id FROM invoices WHERE tenant_id = '{tid}')"))
        db.execute(text(f"DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE tenant_id = '{tid}')"))
        db.execute(text(f"DELETE FROM credit_notes WHERE invoice_id IN (SELECT id FROM invoices WHERE tenant_id = '{tid}') OR tenant_id = '{tid}'"))
        db.execute(text(f"DELETE FROM invoices WHERE tenant_id = '{tid}'"))
        db.execute(text(f"DELETE FROM recurring_schedules WHERE tenant_id = '{tid}'"))
        db.execute(text(f"DELETE FROM receipts WHERE invoice_id IN (SELECT id FROM invoices WHERE tenant_id = '{tid}')"))
        db.execute(text(f"DELETE FROM payment_reminders WHERE invoice_id IN (SELECT id FROM invoices WHERE tenant_id = '{tid}')"))
        db.execute(text(f"DELETE FROM document_versions WHERE document_id IN (SELECT id FROM documents WHERE tenant_id = '{tid}')"))
        db.execute(text(f"DELETE FROM document_links WHERE document_id IN (SELECT id FROM documents WHERE tenant_id = '{tid}')"))
        db.execute(text(f"DELETE FROM documents WHERE tenant_id = '{tid}'"))
        db.execute(text(f"DELETE FROM compliance_rule_versions WHERE rule_id IN (SELECT id FROM compliance_rules WHERE tenant_id = '{tid}')"))
        db.execute(text(f"DELETE FROM deadlines WHERE tenant_id = '{tid}'"))
        db.execute(text(f"DELETE FROM compliance_rules WHERE tenant_id = '{tid}'"))
        db.execute(text(f"DELETE FROM services WHERE tenant_id = '{tid}'"))
        db.execute(text(f"DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE tenant_id = '{tid}') OR role_id IN (SELECT id FROM roles WHERE tenant_id = '{tid}')"))
        db.execute(text(f"DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE tenant_id = '{tid}')"))
        db.execute(text(f"DELETE FROM roles WHERE tenant_id = '{tid}'"))
        db.execute(text(f"DELETE FROM clients WHERE tenant_id = '{tid}'"))
        db.execute(text(f"DELETE FROM users WHERE tenant_id = '{tid}'"))
        db.execute(text(f"DELETE FROM tenants WHERE id = '{tid}'"))
        db.commit()
        db.close()


@pytest.fixture()
def tenant_ctx(_setup_test_tenant):
    """Return test tenant/user/client context for the session."""
    return _setup_test_tenant


@pytest.fixture()
def test_token(tenant_ctx):
    """JWT token for the test tenant partner."""
    return create_access_token(
        subject=tenant_ctx["user_id"],
        tenant_id=tenant_ctx["tenant_id"],
        roles=["partner"],
        permissions=[
            # Clients / contacts / registrations
            "client.read", "client.write", "client.status",
            "contact.read", "contact.write",
            "registration.read", "registration.write",
            # Services / engagements
            "service.read", "service.write",
            "engagement.read", "engagement.write",
            # Tasks
            "task.read", "task.write", "task.approve", "task.assign",
            "task.comment", "task.close", "task.delete",
            # Compliance / documents
            "compliance.read", "compliance.write", "compliance.verify",
            "document.read", "document.write", "document.upload", "document.share",
            # Invoices / payments / billing
            "invoice.read", "invoice.write", "invoice.issue",
            "invoice.cancel", "invoice.send", "invoice.share",
            "payment.read", "payment.write",
            "billing.settings",
            # Users / roles / imports / reports / assistant
            "user.read", "user.write", "user.permission.manage",
            "role.read", "role.write",
            "import.read", "import.write",
            "integration.read", "integration.write",
            "communication.read", "communication.send",
            "notification.read", "notification.write",
            "report.read",
            "financial_year.read", "financial_year.write",
            "assistant.use", "mcp.tool_use",
        ],
    )


@pytest.fixture()
def db_session():
    """Provide a SQLAlchemy session with transactional rollback."""
    from app.core.db import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.rollback()
        db.close()


# ─── MCP fixtures (Phase 0.2) ───────────────────────────────────────────────

from app.mcp_server import server as mcp_server_module


@pytest.fixture
def mcp_tenant_seed(tenant_ctx):
    """Provide tenant seed info for MCP tests."""
    return tenant_ctx


@pytest.fixture
def mcp_context_setter(tenant_ctx):
    """Set MCP contextvars directly for in-process dispatch."""
    tokens = []
    tokens.append(mcp_server_module._current_tenant_id.set(tenant_ctx["tenant_id"]))
    tokens.append(mcp_server_module._current_user_id.set(tenant_ctx["user_id"]))
    # Give broad permissions for tests
    permissions = [
        "client.read", "client.write",
        "task.read", "task.write", "task.assign",
        "financial_year.read", "financial_year.write",
        "import.read",
        "user.read",
        "invoice.read", "invoice.write", "payment.write",
        "report.read",
        "service.read", "service.write",
        "compliance.read", "compliance.write",
        "document.read", "document.write",
        "assistant.use",
        "billing.settings",
    ]
    tokens.append(mcp_server_module._current_permissions.set(permissions))
    try:
        yield {
            "tenant_id": tenant_ctx["tenant_id"],
            "user_id": tenant_ctx["user_id"],
            "permissions": permissions,
        }
    finally:
        for t in reversed(tokens):
            # Need to reset the right contextvar - easier to track separately
            pass
        # Reset properly
        mcp_server_module._current_tenant_id.set(None)
        mcp_server_module._current_user_id.set(None)
        mcp_server_module._current_permissions.set([])


@pytest.fixture
def mcp_client(mcp_context_setter):
    """In-process MCP server client for invoking dispatch directly."""
    import asyncio
    from app.mcp_server.server import _dispatch_tool
    
    class MCPTestClient:
        def __init__(self, dispatch_func):
            self.dispatch = dispatch_func
        
        async def call_tool(self, name, arguments=None):
            if arguments is None:
                arguments = {}
            result = await self.dispatch(name, arguments)
            try:
                import json
                return json.loads(result)
            except Exception:
                return result
        
        def call(self, name, arguments=None):
            return asyncio.run(self.call_tool(name, arguments))
    
    return MCPTestClient(_dispatch_tool)
