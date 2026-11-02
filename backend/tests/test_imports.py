"""Tests for backend imports, module availability, and the client import endpoint."""
import importlib
import io
import json
import urllib.error
import urllib.request
from openpyxl import Workbook

from app.assistant.extract import extract_text

BASE = "http://127.0.0.1:8000/api"


def _post_json(token, path, body):
    """POST a JSON body to the API using stdlib."""
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{BASE}{path}", data=data, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }, method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read().decode())
        except Exception:
            return exc.code, {"error": str(exc)}


def _get(path, token):
    req = urllib.request.Request(
        f"{BASE}{path}", headers={"Authorization": f"Bearer {token}"}, method="GET",
    )
    resp = urllib.request.urlopen(req, timeout=10)
    return resp.status, json.loads(resp.read().decode())


def test_models_import():
    """All core models must be importable."""
    from app.models import (
        Client, Task, User, Invoice, InvoiceLine, Payment, Service,
        ComplianceRule, Deadline, FilingRecord, FinancialYear,
        Document, DocumentVersion, DocumentLink, DocumentRequest,
        Tenant, Branch, Contact, Registration, LegalEntity,
        TaskAssignment, TaskComment, TaskStep, TaskStatusHistory,
        TaskTemplate, TaskTemplateStep, TaskDependency, TaskWorkLog,
        WorkflowTemplate, WorkflowTransition, Engagement, ClientService,
        BillingSettings, Role, Permission, RolePermission,
        RefreshToken, Notification, Period,
    )
    assert Client is not None
    assert Task is not None
    assert User is not None
    assert Invoice is not None
    assert Payment is not None


def test_security_imports():
    """Security utilities must be importable and functional."""
    from app.core.security import (
        create_access_token, decode_token, hash_password, verify_password,
        TokenPayload, Principal, SecurityContext, get_bearer_token,
    )
    assert callable(create_access_token)
    assert callable(decode_token)
    assert callable(hash_password)
    assert callable(verify_password)


def test_compliance_engine_imports():
    """The compliance engine must import and run without errors."""
    from app.services.compliance_engine import (
        evaluate_rule_for_client, list_calendar_entries, DeadlineResult,
        _get_required_registration, _compute_next_due_date,
    )
    assert callable(evaluate_rule_for_client)
    assert callable(list_calendar_entries)
    assert callable(_get_required_registration)
    assert callable(_compute_next_due_date)


def test_mcp_server_imports():
    """The MCP server module must be importable."""
    from app.mcp_server.server import (
        _build_tool_definitions,
        _dispatch_tool,
        build_streamable_http_app,
        _TenantMiddleware,
        _extract_tenant_from_request,
        _current_tenant_id,
        _current_user_id,
        _current_permissions,
    )
    assert callable(_build_tool_definitions)
    assert callable(_dispatch_tool)
    assert callable(build_streamable_http_app)


def test_assistant_imports():
    """The assistant modules must be importable with correct function names."""
    from app.assistant.ai import call_chat, format_system_prompt, build_tool_schema
    from app.assistant.chat import handle_chat_stream, SSE
    from app.assistant.transport import MCPTransport

    assert callable(call_chat)
    assert callable(format_system_prompt)
    assert callable(build_tool_schema)
    assert callable(handle_chat_stream)


    def test_mcp_client_imports():
        """The mcp_client.py CLI must not import nonexistent symbols."""
        import importlib.util, sys
        # Add project root to path so mcp_client can resolve app imports
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if project_root not in sys.path:
            sys.path.insert(0, project_root)
        backend_dir = os.path.join(project_root, "backend")
        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)

        spec = importlib.util.spec_from_file_location(
            "mcp_client",
            os.path.join(project_root, "mcp_client.py")
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert hasattr(mod, "get_ai_client")
        assert hasattr(mod, "run_chat_turn")
        assert hasattr(mod, "main")



def test_routers_import():
    """All application routers must be importable."""
    from app.routers import (
        auth, clients, tasks, billing, services, compliance,
        documents, notifications, reports, roles, users,
        financial_years, communications, document_requests, assistant,
    )
    assert auth.router is not None
    assert clients.router is not None
    assert tasks.router is not None
    assert billing.router is not None


class TestClientImport:
    def _make_xlsx(self, rows):
        wb = Workbook()
        ws = wb.active
        ws.append([
            "Name", "PAN", "Mobile Number", "Email ID", "Telephone No", "DOB/DOI/DOF",
            "Father name", "Address", "Area / Locality", "City", "State", "PIN / ZIP code",
            "Aadhaar No.", "Residential Status", "Status", "Passport No.", "File No.",
        ])
        for row in rows:
            ws.append(row)
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    def _import_json(self, token, filename, data, dry_run=True):
        """Extract text from xlsx and POST as JSON body."""
        text = extract_text(filename, data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        return _post_json(token, "/imports/clients", {
            "content": text,
            "provider": "winman",
            "source_ref": filename,
            "default_client_type": "individual",
            "data_type": "clients",
            "dry_run": dry_run,
        })

    def test_import_clients_from_xlsx(self, test_token):
        data = self._make_xlsx([[
            "Aachal Bharat Pursnani", "GZZPP1904E", "9028122760", "itr4321@gmail.com", "",
            "1989-07-11", "GULABCHAND MOTUMAL VARLANI",
            "MONDHALA ROAD, SINDHI COLONY, PACHORA", "PACHORA", "Jalgaon", "Maharashtra",
            "424201", "507041227510", "Resident", "Individual", "", "",
        ]])

        # Dry run (preview) first.
        status, plan = self._import_json(test_token, "clients.xlsx", data, dry_run=True)
        assert status == 200, plan
        assert plan["would_create"] == 1, plan
        assert plan["rows_rejected"] == 0, plan
        assert "legal_name" in plan["mapping"], plan
        assert plan["mapping"]["legal_name"] == "name", plan

        # Then commit.
        status, result = self._import_json(test_token, "clients.xlsx", data, dry_run=False)
        assert status == 200, result
        assert result["rows_imported"] == 1, result
        assert result["rows_rejected"] == 0, result
        assert len(result["created"]) == 1
        client = result["created"][0]
        assert client["legal_name"] == "Aachal Bharat Pursnani"
        assert client["status"] == "prospect"

        # The created client is readable via the detail endpoint with all MIS fields.
        status, detail = _get(f"/clients/{client['id']}", test_token)
        assert status == 200, detail
        assert detail["pan"] == "GZZPP1904E"
        assert detail["mobile"] == "9028122760"
        assert detail["email"] == "itr4321@gmail.com"
        assert detail["city"] == "Jalgaon"
        assert detail["state"] == "Maharashtra"
        assert detail["status"] == "prospect"
        assert detail["kyc_status"] == "not_started"

    def test_import_duplicate_pan_within_file(self, test_token):
        data = self._make_xlsx([
            ["Dup Client One", "DUPAN1234A", "9000000001", "one@example.com", "", "", "", "", "", "", "", "", "", "", "", "", ""],
            ["Dup Client Two", "DUPAN1234A", "9000000002", "two@example.com", "", "", "", "", "", "", "", "", "", "", "", "", ""],
        ])
        status, result = self._import_json(test_token, "dup.xlsx", data, dry_run=False)
        assert status == 200, result
        assert result["rows_imported"] == 1, result
        assert result["rows_rejected"] == 1, result
        assert "duplicate PAN" in result["rejected"][0]["reason"], result

    def test_import_missing_name_rejected(self, test_token):
        data = self._make_xlsx([[
            "", "NONAME1234A", "9000000003", "none@example.com", "", "", "", "", "", "", "", "", "", "", "", "", "",
        ]])
        status, result = self._import_json(test_token, "noname.xlsx", data, dry_run=False)
        assert status == 200, result
        assert result["rows_imported"] == 0, result
        assert result["rows_rejected"] == 1, result
        assert "legal_name" in result["rejected"][0]["reason"], result
