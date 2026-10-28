"""Tests for MCP server security and tenant isolation."""
import asyncio
import json
import urllib.request
import urllib.error

import pytest
from fastapi import HTTPException

from app.core.security import create_access_token, get_current_user
from app.mcp_server.server import _build_tool_definitions, _extract_tenant_from_request


class TestToolDefinitions:
    """Verify the MCP server exposes the expected tool set."""

    def test_all_expected_tools_present(self):
        tools = _build_tool_definitions()
        names = {t.name for t in tools}
        expected = {
            "list_clients", "get_client", "create_client",
            "list_tasks", "get_task", "create_task",
            "update_task", "assign_task", "update_task_status",
            "list_financial_years", "read_clients_csv",
            "list_users", "get_user_overview",
            "list_invoices", "get_receivables",
            "get_dashboard", "update_client",
            "list_services", "create_service", "get_service", "update_service",
            "list_compliance_rules", "list_deadlines",
            "create_compliance_record", "list_compliance_records",
            "get_compliance_record", "update_compliance_record",
            "create_invoice", "get_invoice", "create_payment",
            "create_document",
        }
        assert expected.issubset(names), f"Missing tools: {expected - names}"

    def test_tool_count(self):
        tools = _build_tool_definitions()
        assert len(tools) >= 31


class TestTenantMiddleware:
    """Verify the security middleware correctly validates bearer tokens."""

    def test_no_auth_header_returns_none(self):
        scope = {"type": "http", "headers": []}
        assert _extract_tenant_from_request(scope) is None

    def test_empty_bearer_returns_none(self):
        scope = {"type": "http", "headers": [(b"authorization", b"Bearer ")]}
        assert _extract_tenant_from_request(scope) is None

    def test_invalid_token_returns_none(self):
        scope = {"type": "http", "headers": [(b"authorization", b"Bearer invalid.token.here")]}
        assert _extract_tenant_from_request(scope) is None

    def test_valid_token_returns_tenant(self):
        token = create_access_token(
            subject="22222222-2222-2222-2222-222222222222",
            tenant_id="11111111-1111-1111-1111-111111111111",
            roles=["partner"],
            permissions=["client.read"],
        )
        scope = {"type": "http", "headers": [(b"authorization", f"Bearer {token}".encode())]}
        result = _extract_tenant_from_request(scope)
        assert result is not None
        tenant_id, user_id, perms = result
        assert tenant_id == "11111111-1111-1111-1111-111111111111"
        assert user_id == "22222222-2222-2222-2222-222222222222"


class TestHTTPTenantIsolation:
    """End-to-end tests against the running MCP server."""

    MCP_URL = "http://127.0.0.1:8000/mcp/"

    def _call_mcp(self, token, method_name, params):
        payload = json.dumps({
            "jsonrpc": "2.0", "id": 1,
            "method": "tools/call",
            "params": {"name": method_name, "arguments": params},
        })
        headers = {
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(self.MCP_URL, data=payload.encode(), headers=headers, method="POST")
        try:
            resp = urllib.request.urlopen(req, timeout=10)
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()
        data = resp.read().decode()
        line = [l for l in data.split("\n") if l.startswith("data: ")][0]
        parsed = json.loads(line[6:])
        return resp.status, json.loads(parsed["result"]["content"][0]["text"])

    def test_unauthenticated_rejected(self):
        status, _ = self._call_mcp(None, "list_clients", {})
        assert status == 401

    def test_authenticated_succeeds(self, test_token):
        status, result = self._call_mcp(test_token, "list_clients", {})
        assert status == 200

    def test_tenant_scoped_results(self, test_token, tenant_ctx):
        status, result = self._call_mcp(test_token, "list_clients", {})
        assert status == 200
        assert all(c.get("id") != "9b4f60e5-33d5-4629-a645-489b7da2c519" for c in result)

    def test_cross_tenant_access_blocked(self, test_token, tenant_ctx):
        status, result = self._call_mcp(test_token, "get_client", {"client_id": "9b4f60e5-33d5-4629-a645-489b7da2c519"})
        assert status == 200
        assert "error" in result


class TestGetCurrentUser:
    """get_current_user must reject malformed tokens with 401, never 500.

    Regression: a token whose ``sub`` is not a valid UUID previously made
    SQLAlchemy cast the parameter against the ``users.id`` UUID column, which
    raised ``psycopg.errors.InvalidTextRepresentation`` and surfaced as HTTP 500
    on GET /api/auth/me instead of a clean 401.
    """

    def _fake_request(self, token):
        class FakeRequest:
            def __init__(self, token):
                self.headers = {"authorization": f"Bearer {token}"}
                self.cookies = {}

        return FakeRequest(token)

    def test_non_uuid_sub_returns_401_not_500(self, db_session):
        token = create_access_token(
            subject="not-a-uuid",
            tenant_id="00000000-0000-0000-0000-000000000000",
            roles=[], permissions=[],
        )
        with pytest.raises(HTTPException) as exc:
            asyncio.run(get_current_user(self._fake_request(token), db_session))
        assert exc.value.status_code == 401
        assert exc.value.detail == "Invalid token"

    def test_valid_uuid_but_unknown_user_returns_401(self, db_session):
        token = create_access_token(
            subject="00000000-0000-0000-0000-000000000000",
            tenant_id="11111111-1111-1111-1111-111111111111",
            roles=[], permissions=[],
        )
        with pytest.raises(HTTPException) as exc:
            asyncio.run(get_current_user(self._fake_request(token), db_session))
        assert exc.value.status_code == 401

    def test_valid_token_returns_principal(self, tenant_ctx, db_session):
        token = create_access_token(
            subject=tenant_ctx["user_id"],
            tenant_id=tenant_ctx["tenant_id"],
            roles=["partner"], permissions=["client.read"],
        )
        principal = asyncio.run(get_current_user(self._fake_request(token), db_session))
        assert principal.id == tenant_ctx["user_id"]
        assert principal.email == "test@example.com"
        assert "client.read" in principal.permissions
