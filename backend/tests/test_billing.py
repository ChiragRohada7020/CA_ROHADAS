"""Tests for service and billing MCP operations."""
import json
import urllib.request
from app.core.security import create_access_token


class TestServiceOperations:
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
            "Authorization": f"Bearer {token}",
        }
        req = urllib.request.Request(self.MCP_URL, data=payload.encode(), headers=headers, method="POST")
        resp = urllib.request.urlopen(req, timeout=10)
        data = resp.read().decode()
        line = [l for l in data.split("\n") if l.startswith("data: ")][0]
        parsed = json.loads(line[6:])
        return resp.status, json.loads(parsed["result"]["content"][0]["text"])

    def test_create_get_update_service(self, test_token, tenant_ctx):
        # Create
        status, result = self._call_mcp(test_token, "create_service", {
            "code": "TEST-SVC",
            "name": "Test Service",
            "category": "gst",
            "sac_code": "9985",
            "standard_fee": 3000,
        })
        assert status == 200
        service_id = result["id"]

        # Get
        status, result = self._call_mcp(test_token, "get_service", {"service_id": service_id})
        assert status == 200
        assert result["name"] == "Test Service"
        assert result["sac_code"] == "9985"

        # Update
        status, result = self._call_mcp(test_token, "update_service", {
            "service_id": service_id, "name": "Updated Service", "standard_fee": 3500
        })
        assert status == 200
        assert result["name"] == "Updated Service"


class TestInvoiceOperations:
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
            "Authorization": f"Bearer {token}",
        }
        req = urllib.request.Request(self.MCP_URL, data=payload.encode(), headers=headers, method="POST")
        resp = urllib.request.urlopen(req, timeout=10)
        data = resp.read().decode()
        line = [l for l in data.split("\n") if l.startswith("data: ")][0]
        parsed = json.loads(line[6:])
        return resp.status, json.loads(parsed["result"]["content"][0]["text"])

    def test_create_invoice_and_payment(self, test_token, tenant_ctx):
        client_id = tenant_ctx["client_id"]

        # Create invoice
        status, result = self._call_mcp(test_token, "create_invoice", {
            "client_id": client_id,
            "items": [
                {"description": "Consultation", "unit_price": 10000, "sac_code": "9985", "quantity": 1},
                {"description": "Filing", "unit_price": 2000, "sac_code": "9985", "quantity": 1},
            ],
            "due_days": 15,
        })
        assert status == 200
        assert result["total"] == 12000.0
        assert result["outstanding"] == 12000.0
        invoice_id = result["id"]

        # Record partial payment
        status, result = self._call_mcp(test_token, "create_payment", {
            "invoice_id": invoice_id,
            "amount": 5000,
            "method": "bank_transfer",
            "reference": "TEST-REF-1",
        })
        assert status == 200
        assert result["new_outstanding"] == 7000.0
        assert result["new_status"] == "partially_paid"

        # Verify via get_invoice
        status, inv = self._call_mcp(test_token, "get_invoice", {"invoice_id": invoice_id})
        assert status == 200
        assert inv["amount_paid"] == 5000.0
        assert inv["outstanding"] == 7000.0
        assert inv["status"] == "partially_paid"
        assert len(inv["payments"]) == 1

        # Record final payment
        status, result = self._call_mcp(test_token, "create_payment", {
            "invoice_id": invoice_id,
            "amount": 7000,
            "method": "upi",
            "reference": "TEST-REF-2",
        })
        assert status == 200
        assert result["new_outstanding"] == 0.0
        assert result["new_status"] == "paid"

        # Verify full payment
        status, inv = self._call_mcp(test_token, "get_invoice", {"invoice_id": invoice_id})
        assert inv["status"] == "paid"
        assert inv["amount_paid"] == 12000.0
        assert inv["outstanding"] == 0.0
        assert len(inv["payments"]) == 2

    def test_overpayment_rejected(self, test_token, tenant_ctx):
        client_id = tenant_ctx["client_id"]

        status, result = self._call_mcp(test_token, "create_invoice", {
            "client_id": client_id,
            "items": [{"description": "Test", "unit_price": 1000, "sac_code": "9985"}],
            "due_days": 15,
        })
        invoice_id = result["id"]

        status, result = self._call_mcp(test_token, "create_payment", {
            "invoice_id": invoice_id,
            "amount": 5000,
            "method": "cash",
        })
        assert "error" in result
