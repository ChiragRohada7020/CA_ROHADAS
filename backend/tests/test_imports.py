"""Tests for backend imports and module availability."""
import importlib


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
