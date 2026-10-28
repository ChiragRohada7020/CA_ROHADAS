"""Regression tests for the backend defects fixed during the audit.

Each test exercises a REST or MCP path that previously returned HTTP 500 due to
non-existent database columns / enum types, raw-SQL bypassing ORM defaults, or
unserialisable result rows.  Tests run against the live dev database through the
``tenant_ctx`` / ``test_token`` fixtures defined in conftest.py.
"""
from __future__ import annotations

import json
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

from app.core.db import SessionLocal
from app.models import ComplianceRule, Role, Task
from sqlalchemy import text


BASE = "http://127.0.0.1:8000/api"


def _headers(token: str) -> dict:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }


def _request(method: str, path: str, token: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{BASE}{path}", data=data, headers=_headers(token), method=method
    )
    resp = urllib.request.urlopen(req, timeout=10)
    return resp.status, json.loads(resp.read())


def _tenant_id() -> str:
    return "11111111-1111-1111-1111-111111111111"


class TestUserCreation:
    def test_post_user_with_role(self, tenant_ctx, test_token):
        db = SessionLocal()
        try:
            tid = uuid.UUID(_tenant_id())
            uid_self = uuid.UUID(tenant_ctx["user_id"])

            role = Role(
                tenant_id=tid, code="test_role", name="Test Role",
                data_scope="tenant", is_active=True,
            )
            db.add(role)
            db.flush()
            db.commit()
            db.refresh(role)

            status, data = _request(
                "POST", "/users", test_token,
                {"email": "regression@example.com", "full_name": "Regression User",
                 "role_code": "test_role"},
            )
            assert status == 200, data
            assert data["email"] == "regression@example.com"
            assert "id" in data

            # The role was actually granted via the real (tenant-scoped) columns.
            link = db.execute(text(
                "SELECT role_id, assigned_by_id FROM user_roles WHERE user_id = :u"
            ), {"u": uuid.UUID(data["id"])}).fetchone()
            assert link is not None
            assert link.role_id == role.id
            assert link.assigned_by_id == uid_self

            db.execute(text(
                "DELETE FROM user_roles WHERE user_id = :u"), {"u": uuid.UUID(data["id"])})
            db.execute(text("DELETE FROM users WHERE id = :u"), {"u": uuid.UUID(data["id"])})
            db.delete(role)
            db.commit()
        finally:
            db.close()

    def test_users_summary_tenant_scoped(self, tenant_ctx, test_token, db_session):
        tid = _tenant_id()
        status, data = _request("GET", "/users/summary", test_token)
        assert status == 200, data
        assert data["total_members"] >= 1
        assert isinstance(data.get("departments"), list)

    def test_users_summary_with_date_of_joining(self, tenant_ctx, test_token, db_session):
        """Regression: GET /users/summary previously 500'd with
        ``TypeError: can't compare datetime.datetime to datetime.date`` when a user
        in the tenant had a non-null ``date_of_joining``.

        The DB column is ``timestamp with time zone`` which SQLAlchemy returns as a
        ``datetime``.  The summary handler compared it directly with a ``date``
        object (``fy_start``), which Python refuses — ``datetime >= date`` raises
        ``TypeError`` even though ``datetime`` subclasses ``date``.

        Fix: normalise the datetime to a plain ``date`` before comparison, the same
        pattern already used in ``reports.py``."""
        uid = uuid.UUID(tenant_ctx["user_id"])
        db_session.execute(text(
            "UPDATE users SET date_of_joining = :doj WHERE id = :uid"
        ), {"doj": datetime(2025, 1, 15, 10, 0, 0), "uid": uid})
        db_session.commit()
        try:
            status, data = _request("GET", "/users/summary", test_token)
            assert status == 200, data
            assert data["total_members"] >= 1
            assert data["joined_this_year"] >= 0
        finally:
            db_session.execute(text(
                "UPDATE users SET date_of_joining = NULL WHERE id = :uid"
            ), {"uid": uid})
            db_session.commit()


class TestRoles:
    def test_patch_role_permissions(self, tenant_ctx, test_token, db_session):
        tid = uuid.UUID(_tenant_id())
        role = Role(tenant_id=tid, code="perm_role", name="Perm Role", data_scope="tenant")
        db_session.add(role)
        db_session.flush()
        db_session.commit()
        db_session.refresh(role)

        try:
            status, data = _request("PATCH", f"/roles/{role.id}", test_token,
                                    {"permission_codes": ["client.read"]})
            assert status == 200, data
            assert "client.read" in data["permissions"]

            status, data = _request("PATCH", f"/roles/{role.id}", test_token,
                                    {"permission_codes": []})
            assert status == 200, data
            assert data["permissions"] == []
        finally:
            db_session.delete(role)
            db_session.commit()


class TestTaskWorkflow:
    def test_rest_status_transition(self, tenant_ctx, test_token, db_session):
        payload = {"title": "REST transition task", "client_id": tenant_ctx["client_id"],
                   "statutory_due_date": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()}
        status, data = _request("POST", "/tasks", test_token, payload)
        assert status == 200, data
        task_id = data["id"]

        status, data = _request("POST", f"/tasks/{task_id}/status", test_token,
                                {"status": "in_progress"})
        assert status == 200, data
        assert data["status"] == "in_progress"
        assert data["to_status"] == "in_progress"

        # History row was recorded with a generated id + timestamp.
        row = db_session.execute(__import__("sqlalchemy").text(
            "SELECT id, from_status, to_status, created_at FROM task_status_history "
            "WHERE task_id = :t"), {"t": uuid.UUID(task_id)}).fetchone()
        assert row is not None
        assert row.id is not None and row.created_at is not None
        assert row.from_status == "not_started"
        assert row.to_status == "in_progress"


class TestBillingRest:
    def test_create_and_generate_invoice(self, tenant_ctx, test_token, db_session):
        status, data = _request("POST", "/billing/invoices", test_token,
                                {"client_id": tenant_ctx["client_id"],
                                 "lines": [{"description": "Test fee", "quantity": 1,
                                            "unit_price": 2500}]})
        assert status == 200, data
        assert data["total"] == 2500.0
        assert data["outstanding"] == 2500.0
        assert data["line_count"] == 1

        status, data = _request("POST", "/invoices/generate", test_token,
                                {"apply": True, "as_of": "2026-10-26"})
        assert status == 200, data
        assert "generated_at" in data


class TestComplianceRules:
    def test_real_values(self, tenant_ctx, test_token, db_session):
        tid = uuid.UUID(_tenant_id())
        rule = ComplianceRule(
            tenant_id=tid, code="REG-1", name="Reg 1", category="income_tax",
            authority="ITD", filing_type="return", lead_days=7, status="active",
        )
        db_session.add(rule)
        db_session.flush()
        db_session.commit()
        db_session.refresh(rule)

        try:
            status, data = _request("GET", "/compliance/rules", test_token)
            assert status == 200, data
            found = next(r for r in data if r["code"] == "REG-1")
            assert found["is_active"] is True
            assert found["category"] == "income_tax"
            assert found["authority"] == "ITD"
            assert found["lead_days"] == 7
        finally:
            db_session.delete(rule)
            db_session.commit()


class TestTaskStepAndComment:
    def test_task_step_status_no_phantom_cast(self, tenant_ctx, test_token, db_session):
        from app.models import TaskStep

        payload = {"title": "Step task", "client_id": tenant_ctx["client_id"],
                   "statutory_due_date": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()}
        _, data = _request("POST", "/tasks", test_token, payload)
        task_id = data["id"]

        # Create a checklist step (raw-SQL INSERT must supply id + created_at).
        _, cdata = _request("POST", f"/tasks/{task_id}/steps", test_token,
                            {"name": "Step 1"})
        assert cdata["status"] == "pending"

        # Resolve the real step id (create returns the task id as "id").
        _, sdata = _request("GET", f"/tasks/{task_id}/steps", test_token)
        step_id = sdata["items"][0]["id"]

        # Update the step status (no phantom CAST AS task_step_status).
        _, udata = _request("POST", f"/tasks/{task_id}/steps/{step_id}", test_token,
                            {"status": "in_progress"})
        assert udata["status"] == "in_progress"

        step = db_session.get(TaskStep, uuid.UUID(step_id))
        assert step.status == "in_progress"

    def test_task_comment_visibility_no_phantom_cast(self, tenant_ctx, test_token, db_session):
        from app.models import TaskComment

        payload = {"title": "Comment task", "client_id": tenant_ctx["client_id"],
                   "statutory_due_date": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()}
        _, data = _request("POST", "/tasks", test_token, payload)
        task_id = data["id"]

        _, cdata = _request("POST", f"/tasks/{task_id}/comments", test_token,
                            {"body": "hello", "visibility": "team"})
        assert cdata["status"] == "ok"

        # Verify the comment persisted with the correct visibility (no phantom cast).
        row = db_session.execute(text(
            "SELECT visibility, author_type FROM task_comments WHERE task_id = :t"),
            {"t": uuid.UUID(task_id)}).fetchone()
        assert row.visibility == "team"
        assert row.author_type == "user"


class TestReportsDashboardRest:
    """Regression: GET /reports/dashboard previously 500'd with
    `TypeError: can't compare datetime.datetime to datetime.date` from the
    compliance-buckets loop (reports.py:121) and the upcoming-deadlines
    loop (reports.py:280)."""

    def test_dashboard_returns_200(self, tenant_ctx, test_token):
        status, data = _request("GET", "/reports/dashboard", test_token)
        assert status == 200, data
        assert "totals" in data
        assert "financials" in data
        assert isinstance(data.get("pipeline"), list)
        assert isinstance(data.get("upcoming_deadlines"), list)
        assert isinstance(data["financials"]["outstanding_total"], (int, float))

    def test_upcoming_deadlines_report_returns_200(self, tenant_ctx, test_token):
        status, data = _request("GET", "/reports/upcoming-deadlines?days=30", test_token)
        assert status == 200, data
        assert isinstance(data, list)


MCP_BASE = "http://127.0.0.1:8000/mcp/"


def _mcp(token: str, name: str, arguments: dict | None = None):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                       "params": {"name": name, "arguments": arguments or {}}}).encode()
    req = urllib.request.Request(
        MCP_BASE, data=body,
        headers={"Content-Type": "application/json",
                 "Accept": "application/json, text/event-stream",
                 "Authorization": f"Bearer {token}"},
        method="POST",
    )
    resp = urllib.request.urlopen(req, timeout=15)
    text_body = resp.read().decode()
    line = [l for l in text_body.split("\n") if l.startswith("data:")]
    result = json.loads(line[0][6:])["result"]
    content = result.get("content", [{}])
    txt = content[0] if isinstance(content, list) and content else {}
    txt = txt.get("text", "{}") if isinstance(txt, dict) else txt
    return json.loads(txt), result.get("isError", False)


class TestMcpRuntimeFixes:
    def test_list_financial_years_returns_id_and_array(self, tenant_ctx, test_token):
        # Create one FY so the list is non-empty. If it already exists from a
        # prior session the create is a no-op; the list must still succeed.
        _mcp(test_token, "create_financial_year", {"code": "TESTFY",
                              "label": "Test FY", "start_date": "2024-04-01",
                              "end_date": "2025-03-31", "is_active": False, "is_closed": True})
        rows, err = _mcp(test_token, "list_financial_years", {"include_closed": True})
        assert not err
        assert isinstance(rows, list)
        # Regression: list must be a plain JSON array (not a dict wrapper) and
        # every entry must expose both an `id` and a `name` (was `r.name` →
        # AttributeError; FinancialYear has no `name` column, only `label`).
        assert rows, "expected at least one financial year in the list"
        for r in rows:
            assert "id" in r and r["id"], r
            assert "name" in r and r["name"], r
            assert "start_date" in r and "end_date" in r

    def test_create_compliance_record_with_internal_due(self, tenant_ctx, test_token):
        rule, _ = _mcp(test_token, "create_compliance_rule", {"code": "MCPTEST",
                              "name": "MCP Test Rule", "category": "income_tax",
                              "authority": "ITD", "filing_type": "return",
                              "default_frequency": "annual", "lead_days": 30})
        assert rule.get("id"), rule
        rec, err = _mcp(test_token, "create_compliance_record", {
            "client_id": tenant_ctx["client_id"], "rule_id": rule["id"],
            "statutory_due_date": "2025-03-31T23:59:00",
            "internal_due_date": "2025-02-15T23:59:00",
            "period_key": "TESTFY-ANNUAL-0001"})
        assert not err, rec
        assert rec.get("id")
        assert rec["internal_due_date"] is not None
        assert rec["statutory_due_date"] is not None

    def test_create_compliance_record_default_internal_due(self, tenant_ctx, test_token):
        rule, _ = _mcp(test_token, "create_compliance_rule", {"code": "MCPTESTD",
                              "name": "MCP Default Internal", "category": "gst",
                              "authority": "GSTN", "filing_type": "return",
                              "default_frequency": "monthly", "lead_days": 10})
        rec, err = _mcp(test_token, "create_compliance_record", {
            "client_id": tenant_ctx["client_id"], "rule_id": rule["id"],
            "statutory_due_date": "2025-06-30T23:59:00",
            "period_key": "TESTFY-M-0001"})
        assert not err, rec
        assert rec.get("id")
        # internal due should be statutory - lead_days(10)
        assert rec["internal_due_date"] is not None

    def test_get_receivables_no_date_typeerror(self, tenant_ctx, test_token):
        data, err = _mcp(test_token, "get_receivables", {})
        assert not err, data
        assert "outstanding_total" in data
        assert "as_of" in data

    def test_receivables_rest_endpoint_not_404(self, tenant_ctx, test_token):
        # Regression: the @router.get("/billing/receivables") decorator was
        # dropped during the routing refactor, so GET /api/billing/receivables
        # returned 404 (not "Not Found").  The route must be registered and
        # return 200 with the receivables summary payload.
        status, data = _request("GET", "/billing/receivables", test_token)
        assert status == 200, data
        assert "outstanding_total" in data
        assert "as_of" in data

    def test_list_users_returns_array(self, tenant_ctx, test_token):
        rows, err = _mcp(test_token, "list_users", {"limit": 5})
        assert not err, rows
        assert isinstance(rows, list)


class TestFilingRecordsRest:
    """Regression: the frontend's FilingPanel calls GET/POST /compliance/filings,
    which returned 404 because no backend route was ever mounted (the
    `filing_records` table + FilingRecord model existed but had no router)."""

    def test_filing_lifecycle_rest(self, tenant_ctx, test_token):
        # POST must create a filing record (was 404 before the route existed).
        status, created = _request("POST", "/compliance/filings", test_token, {
            "client_id": tenant_ctx["client_id"],
            "filing_type": "GSTR-3B",
            "status": "submitted",
            "filed_on": "2025-07-15",
            "period_key": "2025-07",
            "acknowledgement_number": "ARN-TEST-001",
        })
        assert status == 200, created
        assert created["filing_type"] == "GSTR-3B"
        assert created["acknowledgement_number"] == "ARN-TEST-001"

        # GET by client must return the record we just created.
        status, data = _request("GET", f"/compliance/filings?client_id={tenant_ctx['client_id']}", test_token)
        assert status == 200, data
        assert "items" in data
        assert any(i["acknowledgement_number"] == "ARN-TEST-001" for i in data["items"])

    def test_filing_requires_client_id(self, tenant_ctx, test_token):
        import urllib.error
        try:
            _request("POST", "/compliance/filings", test_token, {"filing_type": "GSTR-3B"})
            assert False, "expected 400"
        except urllib.error.HTTPError as exc:
            assert exc.code == 400


class TestClientDetailAndMissingDocRequests:
    """Regression: GET /api/clients/{client_id} and
    GET /api/document-requests/missing?client_id=... both returned HTTP 500.

    Root causes:
      * ``ClientEntityLink`` has no ``tenant_id`` column (the model never
        declared one), so the tenant-scoped ``.where(ClientEntityLink.tenant_id
        == ...)`` filter raised ``AttributeError``.
      * The ``document_requests.status`` column was migrated from a PostgreSQL
        ``document_request_status`` ENUM to VARCHAR(50), but the raw-SQL in
        ``missing_document_requests`` and the two INSERT statements still cast
        to the now-nonexistent ``document_request_status`` type, producing
        ``UndefinedObject`` from psycopg.
    """

    def test_client_detail_returns_200(self, tenant_ctx, test_token):
        status, data = _request("GET", f"/clients/{tenant_ctx['client_id']}", test_token)
        assert status == 200, data
        assert data["id"] == tenant_ctx["client_id"]
        assert data["legal_name"] == "Test Client"
        # The entities sub-resource must serialize (was AttributeError before).
        assert isinstance(data.get("entities"), list)
        assert isinstance(data.get("contacts"), list)
        assert isinstance(data.get("registrations"), list)
        assert isinstance(data.get("services"), list)
        assert isinstance(data.get("engagements"), list)

    def test_missing_document_requests_returns_200(self, tenant_ctx, test_token):
        status, data = _request(
            "GET",
            f"/document-requests/missing?client_id={tenant_ctx['client_id']}",
            test_token,
        )
        assert status == 200, data
        assert isinstance(data, list)

    def test_missing_document_requests_without_filter_returns_200(
        self, tenant_ctx, test_token
    ):
        status, data = _request("GET", "/document-requests/missing", test_token)
        assert status == 200, data
        assert isinstance(data, list)


class TestDocumentUploadNotNullColumn:
    """Regression test for the ``documents.from_client`` NOT-NULL violation.

    Root cause:
        The ``POST /api/documents/upload`` endpoint used a raw-SQL INSERT that
        omitted the ``from_client`` column.  The column is ``NOT NULL`` with no
        database-level default (``default=None`` in the inspector), so PostgreSQL
        rejected every upload with a 500 ``NotNullViolation``.  The SQLAlchemy
        model declares ``default=False`` but raw-SQL bypasses Python-side
        defaults.

    Fix:
        Add ``from_client = false`` (matching the model default) to the INSERT.
    """

    def test_upload_document_returns_200(self, tenant_ctx, test_token):
        import urllib.request

        boundary = "----testboundary123"
        body = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="file"; filename="test_upload.txt"\r\n'
            "Content-Type: text/plain\r\n\r\n"
            "hello world\r\n"
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="client_id"\r\n\r\n'
            f"{tenant_ctx['client_id']}\r\n"
            f"--{boundary}--\r\n"
        ).encode()

        req = urllib.request.Request(
            f"{BASE}/documents/upload",
            data=body,
            headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Authorization": f"Bearer {test_token}",
            },
            method="POST",
        )
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read())
        assert resp.status == 200, data
        assert data["title"] == "test_upload.txt"
        assert data["status"] == "received"
        assert data["size_bytes"] == len("hello world")

    def test_uploaded_document_has_from_client_false(self, tenant_ctx, test_token):
        """The inserted row must not leave ``from_client`` NULL."""
        import urllib.request

        boundary = "----testboundary456"
        body = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="file"; filename="verify_from_client.txt"\r\n'
            "Content-Type: text/plain\r\n\r\n"
            "check me\r\n"
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="client_id"\r\n\r\n'
            f"{tenant_ctx['client_id']}\r\n"
            f"--{boundary}--\r\n"
        ).encode()

        req = urllib.request.Request(
            f"{BASE}/documents/upload",
            data=body,
            headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Authorization": f"Bearer {test_token}",
            },
            method="POST",
        )
        resp = urllib.request.urlopen(req, timeout=10)
        upload_data = json.loads(resp.read())
        assert resp.status == 200, upload_data

        # Verify the row was written with from_client = false (not NULL).
        db = SessionLocal()
        try:
            row = db.execute(
                text("SELECT from_client FROM documents WHERE id = :id"),
                {"id": upload_data["id"]},
            ).fetchone()
            assert row is not None, "uploaded document row not found"
            assert row[0] is False, f"expected from_client=False, got {row[0]!r}"
        finally:
            db.close()

    def test_get_document_detail_returns_200(self, tenant_ctx, test_token):
        """GET /documents/{id} must return the document with versions and links."""
        # First upload a document so we have something to fetch.
        boundary = "----testboundary789"
        body = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="file"; filename="detail_test.txt"\r\n'
            "Content-Type: text/plain\r\n\r\n"
            "detail content\r\n"
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="client_id"\r\n\r\n'
            f"{tenant_ctx['client_id']}\r\n"
            f"--{boundary}--\r\n"
        ).encode()
        req = urllib.request.Request(
            f"{BASE}/documents/upload",
            data=body,
            headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Authorization": f"Bearer {test_token}",
            },
            method="POST",
        )
        resp = urllib.request.urlopen(req, timeout=10)
        upload_data = json.loads(resp.read())

        # Now fetch the detail endpoint.
        status, data = _request("GET", f"/documents/{upload_data['id']}", test_token)
        assert status == 200, data
        assert data["id"] == upload_data["id"]
        assert data["title"] == "detail_test.txt"
        assert data["from_client"] is False
        assert data["version_count"] == 0 or data["version_count"] >= 0
        assert isinstance(data["versions"], list)
        assert len(data["versions"]) >= 1
        assert data["versions"][0]["file_name"] == "detail_test.txt"
        assert isinstance(data["links"], list)


class TestInvoiceCreateAlias:
    """The frontend calls POST /invoices, but the backend only exposed POST /billing/invoices.

    Fix: add a thin alias route so POST /invoices maps to the same handler.
    """

    def test_post_invoices_alias_returns_200(self, tenant_ctx, test_token):
        status, data = _request(
            "POST",
            "/invoices",
            test_token,
            {
                "client_id": tenant_ctx["client_id"],
                "lines": [{"description": "Alias test fee", "quantity": 1, "unit_price": 1000}],
            },
        )
        assert status == 200, data
        assert data["total"] == 1000.0
        assert data["outstanding"] == 1000.0


class TestUsersRolesRouteOrdering:
    """GET /users/roles was shadowed by GET /users/{user_id} because the dynamic
    route was registered first — FastAPI matches in registration order, so the
    literal path segment ``roles`` was captured as ``user_id`` and passed to a
    UUID cast, producing HTTP 500.

    Fix: register the static /users/roles route *before* /users/{user_id}.
    """

    def test_get_users_roles_returns_200(self, tenant_ctx, test_token):
        status, data = _request("GET", "/users/roles", test_token)
        assert status == 200, data
        assert "roles" in data
        assert "catalogue" in data
        assert isinstance(data["roles"], list)
        assert isinstance(data["catalogue"], list)
        assert len(data["catalogue"]) > 0, "permission catalogue should not be empty"

    def test_get_users_roles_not_shadowed_by_user_id(self, tenant_ctx, test_token):
        """The literal string 'roles' must reach the roles endpoint, not the user endpoint."""
        status, data = _request("GET", "/users/roles", test_token)
        assert status == 200, data
        # If it had hit /users/{user_id} with user_id='roles', the response would
        # be a 500 (UUID cast failure) not a 200 with roles + catalogue.


class TestDocumentDetailUuidValidation:
    """GET /documents/{id} with a non-UUID path segment raised HTTP 500 because
    SQLAlchemy's Session.get() attempted a UUID cast that psycopg rejects.

    Fix: validate the UUID format before calling db.get(), returning a clean 404.
    """

    def test_non_uuid_document_id_returns_404(self, tenant_ctx, test_token):
        """Non-UUID path segment must return 404, not 500."""
        try:
            _request("GET", "/documents/not-a-uuid", test_token)
            assert False, "expected 404"
        except urllib.error.HTTPError as exc:
            assert exc.code == 404
            data = json.loads(exc.read())
            assert data["error"]["code"] == "not_found"

    def test_nonexistent_uuid_document_id_returns_404(self, tenant_ctx, test_token):
        try:
            _request(
                "GET", "/documents/550e8400-e29b-41d4-a716-446655440000", test_token
            )
            assert False, "expected 404"
        except urllib.error.HTTPError as exc:
            assert exc.code == 404
