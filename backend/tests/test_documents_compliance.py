"""Tests for document and compliance record MCP operations."""
import json
import urllib.request
import uuid
from app.core.security import create_access_token


class TestComplianceRecordOperations:
    MCP_URL = "http://127.0.0.1:8000/mcp/"

    def _call_mcp(self, token, method_name, params):
        import urllib.error
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
        try:
            resp = urllib.request.urlopen(req, timeout=10)
        except urllib.error.HTTPError as e:
            return e.code, {"error": e.read().decode()}
        data = resp.read().decode()
        line = [l for l in data.split("\n") if l.startswith("data: ")][0]
        parsed = json.loads(line[6:])
        if parsed.get("result", {}).get("isError"):
            text = parsed["result"]["content"][0]["text"]
            try:
                return resp.status, json.loads(text)
            except json.JSONDecodeError:
                return resp.status, {"error": text}
        return resp.status, json.loads(parsed["result"]["content"][0]["text"])

    def test_create_list_get_update_compliance_record(self, test_token, tenant_ctx):
        from app.models import ComplianceRule
        from app.core.db import SessionLocal

        db = SessionLocal()
        rule = ComplianceRule(
            id=uuid.uuid4(),
            tenant_id=uuid.UUID(tenant_ctx["tenant_id"]),
            code="CR-TEST",
            name="Compliance Record Test",
            category="gst",
            default_frequency="monthly",
            lead_days=14,
            status="active",
        )
        db.add(rule)
        db.commit()
        db.close()

        # Create compliance record
        status, result = self._call_mcp(test_token, "create_compliance_record", {
            "client_id": tenant_ctx["client_id"],
            "rule_id": str(rule.id),
            "statutory_due_date": "2026-12-31T23:59:59+05:30",
        })
        assert status == 200
        record_id = result["id"]

        # List
        status, result = self._call_mcp(test_token, "list_compliance_records", {})
        assert status == 200
        assert any(r["id"] == record_id for r in result)

        # Get
        status, result = self._call_mcp(test_token, "get_compliance_record", {"record_id": record_id})
        assert status == 200
        assert result["statutory_due_date"] is not None

        # Update - mark verified
        status, result = self._call_mcp(test_token, "update_compliance_record", {
            "record_id": record_id, "verified": True
        })
        assert status == 200
        assert result["verified"] is True


class TestDocumentOperations:
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

    def test_create_document(self, test_token, tenant_ctx):
        status, result = self._call_mcp(test_token, "create_document", {
            "client_id": tenant_ctx["client_id"],
            "title": "Test Audit Document",
            "doc_type": "invoice",
            "category": "billing",
            "file_name": "test_audit.pdf",
            "mime_type": "application/pdf",
            "size_bytes": 2048,
        })
        assert status == 200
        assert result["title"] == "Test Audit Document"
        assert result["version_count"] == 1
        assert result["status"] == "requested"


class TestReadClientsCsvSecurity:
    """Security and validation tests for the read_clients_csv MCP tool."""

    MCP_URL = "http://127.0.0.1:8000/mcp/"

    def _call_mcp(self, token, method_name, params):
        from app.core.config import settings
        import os

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
        text = parsed["result"]["content"][0]["text"]
        try:
            return resp.status, json.loads(text)
        except json.JSONDecodeError:
            return resp.status, {"error": text}

    def test_valid_csv_in_import_dir(self, test_token):
        from app.core.config import settings
        import os

        import_dir = settings.IMPORT_DIR
        os.makedirs(import_dir, exist_ok=True)
        csv_path = os.path.join(import_dir, "test_valid.csv")
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write("legal_name,client_code,pan,status\n")
            f.write("Acme Corp,ACME001,27AABCT1234F,active\n")
            f.write("Beta Traders,BETA002,27AABCT5678F,inactive\n")

        try:
            status, result = self._call_mcp(test_token, "read_clients_csv", {"file_path": csv_path})
            assert status == 200
            assert result["count"] == 2
            assert result["records"][0]["legal_name"] == "Acme Corp"
        finally:
            os.unlink(csv_path)

    def test_arbitrary_file_read_blocked(self, test_token):
        status, result = self._call_mcp(test_token, "read_clients_csv", {"file_path": "/etc/passwd"})
        assert status == 200
        assert "error" in result
        assert "import directory" in result["error"].lower()

    def test_path_traversal_blocked(self, test_token):
        from app.core.config import settings
        import os

        import_dir = settings.IMPORT_DIR
        os.makedirs(import_dir, exist_ok=True)
        traversal_path = os.path.join(import_dir, "..", "..", "etc", "passwd")
        status, result = self._call_mcp(test_token, "read_clients_csv", {"file_path": traversal_path})
        assert status == 200
        assert "error" in result
        assert "import directory" in result["error"].lower()

    def test_missing_file_path(self, test_token):
        status, result = self._call_mcp(test_token, "read_clients_csv", {})
        assert status == 200
        assert result["error"] == "file_path is required"

    def test_nonexistent_file(self, test_token):
        from app.core.config import settings
        import os

        import_dir = settings.IMPORT_DIR
        os.makedirs(import_dir, exist_ok=True)
        fake_path = os.path.join(import_dir, "nonexistent.csv")
        status, result = self._call_mcp(test_token, "read_clients_csv", {"file_path": fake_path})
        assert status == 200
        assert "error" in result
        assert "not found" in result["error"].lower()

    def test_empty_csv(self, test_token):
        from app.core.config import settings
        import os

        import_dir = settings.IMPORT_DIR
        os.makedirs(import_dir, exist_ok=True)
        csv_path = os.path.join(import_dir, "test_empty.csv")
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write("")

        try:
            status, result = self._call_mcp(test_token, "read_clients_csv", {"file_path": csv_path})
            assert status == 200
            assert result["count"] == 0
        finally:
            os.unlink(csv_path)

    def test_malformed_csv_missing_columns(self, test_token):
        from app.core.config import settings
        import os

        import_dir = settings.IMPORT_DIR
        os.makedirs(import_dir, exist_ok=True)
        csv_path = os.path.join(import_dir, "test_malformed.csv")
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write("legal_name,client_code,pan\n")
            f.write("Acme Corp,ACME001,27AABCT1234F\n")
            f.write("Bad Row,ONLY_TWO\n")

        try:
            status, result = self._call_mcp(test_token, "read_clients_csv", {"file_path": csv_path})
            assert status == 200
            assert result["count"] == 2
            assert result["records"][0]["pan"] == "27AABCT1234F"
            assert result["records"][1]["pan"] is None
        finally:
            os.unlink(csv_path)

    def test_invalid_encoding_blocked(self, test_token):
        from app.core.config import settings
        import os

        import_dir = settings.IMPORT_DIR
        os.makedirs(import_dir, exist_ok=True)
        csv_path = os.path.join(import_dir, "test_binary.csv")
        with open(csv_path, "wb") as f:
            f.write(b"\x80\x81\x82\x83")

        try:
            status, result = self._call_mcp(test_token, "read_clients_csv", {"file_path": csv_path})
            assert status == 200
            assert "error" in result
            assert "utf-8" in result["error"].lower()
        finally:
            os.unlink(csv_path)

    def test_no_database_writes(self, test_token):
        from app.core.config import settings
        from app.core.db import SessionLocal
        from app.models import Client
        import os

        import_dir = settings.IMPORT_DIR
        os.makedirs(import_dir, exist_ok=True)
        csv_path = os.path.join(import_dir, "test_no_write.csv")
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write("legal_name,client_code,pan,status\n")
            f.write("NoWrite Corp,NOWRIT001,27AABCNOWR01,active\n")

        db = SessionLocal()
        existing = db.query(Client).filter(Client.tenant_id == "11111111-1111-1111-1111-111111111111").count()

        try:
            self._call_mcp(test_token, "read_clients_csv", {"file_path": csv_path})
            after = db.query(Client).filter(Client.tenant_id == "11111111-1111-1111-1111-111111111111").count()
            assert after == existing, "CSV read created client records!"
            print(f"\n  Clients before: {existing}, after: {after} — no writes occurred")
        finally:
            db.close()
            os.unlink(csv_path)
