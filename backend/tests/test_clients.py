"""Tests for client operations through MCP."""
import json
import urllib.request
from app.core.security import create_access_token


class TestClientOperations:
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

    def test_create_and_retrieve_client(self, test_token, tenant_ctx):
        # Create
        status, result = self._call_mcp(test_token, "create_client", {
            "client_type": "legal_entity",
            "legal_name": "Workflow Test Client",
            "pan": "AABCT1234F",
            "city": "Mumbai",
            "state": "Maharashtra",
            "state_code": "MH",
        })
        assert status == 200
        assert "id" in result
        client_id = result["id"]

        # Retrieve
        status, result = self._call_mcp(test_token, "get_client", {"client_id": client_id})
        assert status == 200
        assert result["legal_name"] == "Workflow Test Client"
        assert result["pan"] == "AABCT1234F"

    def test_update_client(self, test_token, tenant_ctx):
        # Create then update
        status, result = self._call_mcp(test_token, "create_client", {
            "client_type": "legal_entity", "legal_name": "Update Test Client"
        })
        client_id = result["id"]

        status, result = self._call_mcp(test_token, "update_client", {
            "client_id": client_id, "status": "active", "kyc_status": "completed"
        })
        assert status == 200
        assert result["status"] == "active"
        assert result["kyc_status"] == "completed"

    def test_search_clients(self, test_token, tenant_ctx):
        status, result = self._call_mcp(test_token, "create_client", {
            "client_type": "legal_entity", "legal_name": "Searchable Corp"
        })
        status, result = self._call_mcp(test_token, "list_clients", {"search": "Searchable"})
        assert status == 200
        found = [c for c in result if "Searchable" in c["legal_name"]]
        assert len(found) >= 1
