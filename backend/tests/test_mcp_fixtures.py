"""Tests for MCP fixtures (Phase 0.2)."""
import json


class TestMcpFixtures:
    def test_mcp_context_setter_sets_context(self, mcp_context_setter):
        from app.mcp_server import server as mcp_server_module
        assert mcp_server_module._current_tenant_id.get() == mcp_context_setter["tenant_id"]
        assert mcp_server_module._current_user_id.get() == mcp_context_setter["user_id"]
        assert len(mcp_server_module._current_permissions.get()) > 0

    def test_mcp_tenant_seed(self, mcp_tenant_seed):
        assert "tenant_id" in mcp_tenant_seed
        assert "user_id" in mcp_tenant_seed
        assert "client_id" in mcp_tenant_seed

    def test_mcp_client_invokes_dispatch(self, mcp_client):
        # Should be able to call list_clients with context set
        result = mcp_client.call("list_clients", {"limit": 5})
        # Result may be a list or dict depending on implementation
        assert result is not None
