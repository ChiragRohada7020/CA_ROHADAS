"""Tests for client operations through MCP and REST."""
import json
import urllib.error
import urllib.request
from app.core.security import create_access_token


def _rest(method, path, token, body=None):
    """Issue a JSON request against the running backend at :8000/api."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"http://127.0.0.1:8000/api{path}",
        data=data,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method=method,
    )
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read().decode())
        except Exception:
            return exc.code, {"error": str(exc)}


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


class TestClientDelete:
    def test_soft_delete_client(self, test_token, tenant_ctx):
        status, result = _rest("POST", "/clients", test_token, {
            "client_type": "legal_entity",
            "legal_name": "To Be Deleted Ltd",
            "city": "Mumbai",
            "state": "Maharashtra",
        })
        assert status == 200, result
        client_id = result["id"]

        status, result = _rest("DELETE", f"/clients/{client_id}", test_token)
        assert status == 200, result
        assert result["status"] == "cancelled"
        assert result["id"] == client_id
        assert result["legal_name"] == "To Be Deleted Ltd"

        # Soft-deleted clients are excluded from detail and list.
        status, result = _rest("GET", f"/clients/{client_id}", test_token)
        assert status == 404, result

        status, result = _rest("GET", "/clients", test_token)
        assert status == 200, result
        assert client_id not in [c["id"] for c in result["items"]]

        # Deleting an already soft-deleted client is a 404.
        status, result = _rest("DELETE", f"/clients/{client_id}", test_token)
        assert status == 404, result
