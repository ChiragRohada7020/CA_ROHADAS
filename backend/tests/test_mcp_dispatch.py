"""Tests for MCP tool dispatch and schema validation."""
import json
from app.mcp_server.server import _build_tool_definitions


def _get_schema(tools, name):
    """Get the input schema from a tool, handling both attribute naming conventions."""
    tool = tools[name]
    if hasattr(tool, "input_schema"):
        return tool.input_schema
    return tool.inputSchema


class TestMcpToolSchemas:
    """Verify all MCP tools have valid JSON schemas and required fields."""

    def test_create_client_schema(self):
        tools = {t.name: t for t in _build_tool_definitions()}
        schema = _get_schema(tools, "create_client")
        assert "client_type" in schema["properties"]
        assert "legal_name" in schema["properties"]
        assert schema["required"] == ["client_type", "legal_name"]

    def test_create_task_schema(self):
        tools = {t.name: t for t in _build_tool_definitions()}
        schema = _get_schema(tools, "create_task")
        assert "name" in schema["properties"]
        assert "title" in schema["properties"]  # alias
        assert "financial_year" in schema["properties"]
        assert "financial_year_id" in schema["properties"]  # alias
        assert schema["required"] == ["client_id", "name"]

    def test_assign_task_schema(self):
        tools = {t.name: t for t in _build_tool_definitions()}
        schema = _get_schema(tools, "assign_task")
        assert "task_id" in schema["properties"]
        assert "role" in schema["properties"]
        assert "user_id" in schema["properties"]
        assert set(schema["required"]) == {"task_id", "role", "user_id"}
        assert set(schema["properties"]["role"]["enum"]) == {"preparer", "reviewer", "approver", "filer"}

    def test_create_invoice_schema(self):
        tools = {t.name: t for t in _build_tool_definitions()}
        schema = _get_schema(tools, "create_invoice")
        assert "client_id" in schema["properties"]
        assert "items" in schema["properties"]
        assert "items" in schema["required"]
        item_schema = schema["properties"]["items"]["items"]
        assert item_schema["required"] == ["description", "unit_price"]

    def test_create_payment_schema(self):
        tools = {t.name: t for t in _build_tool_definitions()}
        schema = _get_schema(tools, "create_payment")
        assert set(schema["required"]) == {"invoice_id", "amount", "method"}
        assert set(schema["properties"]["method"]["enum"]) == {"cash", "bank_transfer", "upi", "cheque", "card", "other"}

    def test_create_service_schema(self):
        tools = {t.name: t for t in _build_tool_definitions()}
        schema = _get_schema(tools, "create_service")
        assert set(schema["required"]) == {"code", "name", "category", "sac_code"}

    def test_create_document_schema(self):
        tools = {t.name: t for t in _build_tool_definitions()}
        schema = _get_schema(tools, "create_document")
        assert "title" in schema["required"]

    def test_create_compliance_record_schema(self):
        tools = {t.name: t for t in _build_tool_definitions()}
        schema = _get_schema(tools, "create_compliance_record")
        assert set(schema["required"]) == {"client_id", "rule_id", "statutory_due_date"}


class TestMcpNewTools:
    """Schema/registration tests for the tools added during the data-gen audit."""

    def test_create_financial_year_schema(self):
        tools = {t.name: t for t in _build_tool_definitions()}
        schema = _get_schema(tools, "create_financial_year")
        assert set(schema["required"]) == {"code", "label", "start_date", "end_date"}
        assert "assessment_year" in schema["properties"]
        assert "is_closed" in schema["properties"]

    def test_create_period_schema(self):
        tools = {t.name: t for t in _build_tool_definitions()}
        schema = _get_schema(tools, "create_period")
        assert set(schema["required"]) == {"rule_id", "label", "period_key", "start_date", "end_date"}
        assert "compliance_rule_id" not in schema["properties"]  # rule_id aliases it

    def test_create_compliance_rule_schema(self):
        tools = {t.name: t for t in _build_tool_definitions()}
        schema = _get_schema(tools, "create_compliance_rule")
        assert set(schema["required"]) == {"code", "name", "category", "lead_days"}
        assert schema["properties"]["status"]["default"] == "active"

    def test_create_client_service_schema(self):
        tools = {t.name: t for t in _build_tool_definitions()}
        schema = _get_schema(tools, "create_client_service")
        assert set(schema["required"]) == {"client_id", "service_id"}
        assert "engagement_id" in schema["properties"]

    def test_create_activity_log_schema(self):
        tools = {t.name: t for t in _build_tool_definitions()}
        schema = _get_schema(tools, "create_activity_log")
        assert set(schema["required"]) == {"entity_type", "action"}
        assert "entity_id" in schema["properties"]
        assert "summary" in schema["properties"]

    def test_create_billing_settings_schema(self):
        tools = {t.name: t for t in _build_tool_definitions()}
        schema = _get_schema(tools, "create_billing_settings")
        assert "state_code" in schema["required"]
        assert schema["properties"]["tax_rate"]["default"] == 18.0
        assert schema["properties"]["country"]["default"] == "India"

    def test_update_invoice_schema(self):
        tools = {t.name: t for t in _build_tool_definitions()}
        schema = _get_schema(tools, "update_invoice")
        assert "invoice_id" in schema["required"]
        assert set(schema["properties"]["status"]["enum"]) == {
            "draft", "issued", "partially_paid", "paid", "cancelled"}


class TestMcpDispatch:
    """Verify the dispatch function handles unknown tools and auth correctly."""

    def test_tenant_enforcement_at_dispatch(self):
        import asyncio
        from app.mcp_server.server import _dispatch_tool
        result = asyncio.run(_dispatch_tool("list_clients", {}))
        parsed = json.loads(result)
        assert "error" in parsed
        assert "Authentication" in parsed["error"]

    def test_unknown_tool(self):
        import asyncio
        from app.mcp_server.server import _dispatch_tool, _current_tenant_id
        # Set tenant context so we reach the dispatch (not auth check)
        token_var = _current_tenant_id.set("11111111-1111-1111-1111-111111111111")
        try:
            result = asyncio.run(_dispatch_tool("nonexistent_tool", {}))
            assert "Unknown tool" in result
        finally:
            _current_tenant_id.reset(token_var)
