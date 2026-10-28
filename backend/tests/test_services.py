"""Tests for the service catalogue endpoints.

These run against the live dev server on :8000 (same pattern as test_clients),
using the session-scoped test tenant from conftest.
"""
import json
import urllib.error
import urllib.request

from app.models import Service


class TestServiceDetail:
    BASE = "http://127.0.0.1:8000"

    def _auth_get(self, token, path):
        req = urllib.request.Request(
            f"{self.BASE}{path}",
            headers={"Authorization": f"Bearer {token}"},
        )
        try:
            resp = urllib.request.urlopen(req, timeout=10)
            return resp.status, json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            body = json.loads(exc.read().decode()) if exc.length else {}
            return exc.code, body

    def test_detail_returns_full_shape(self, test_token, tenant_ctx, db_session):
        # A service with no task templates and no client assignments. Before the
        # fix the endpoint returned a partial dict (vestigial field names, no
        # `templates`/`clients`/`client_count`), so the frontend's
        # `row.templates.flatMap(...)` threw "Cannot read properties of undefined
        # (reading 'flatMap')". This asserts the contract the drawer relies on.
        svc = Service(
            tenant_id=tenant_ctx["tenant_id"],
            code="TEST:001",
            name="Test Service For Detail",
            category="other",
            sac_code="9999",
        )
        db_session.add(svc)
        db_session.commit()

        status, body = self._auth_get(test_token, f"/api/services/{svc.id}")

        assert status == 200
        # The crash site: `templates` must be an array (empty here), never None.
        assert isinstance(body.get("templates"), list)
        assert isinstance(body.get("clients"), list)
        assert body["client_count"] == len(body["clients"])
        # Field names must match the frontend ServiceRow type, not the old
        # vestigial ones (default_fee / filing_frequency / is_statutory ...).
        for field in [
            "id", "code", "name", "category", "is_recurring",
            "default_frequency", "default_priority", "default_fee_model",
            "standard_fee", "sac_code", "is_active", "sort_order",
            "client_count", "clients", "templates",
        ]:
            assert field in body, f"missing field the frontend reads: {field}"

    def _auth_request(self, token, method, path, body=None):
        data = json.dumps(body) if body is not None else None
        headers = {"Authorization": f"Bearer {token}"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(
            f"{self.BASE}{path}",
            data=data.encode() if data else None,
            headers=headers,
            method=method,
        )
        try:
            resp = urllib.request.urlopen(req, timeout=10)
            return resp.status, json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode() if exc.length else "{}"
            try:
                return exc.code, json.loads(raw)
            except json.JSONDecodeError:
                return exc.code, {}

    def test_detail_rejects_cross_tenant(self, test_token, tenant_ctx, db_session):
        # A service id from another tenant must 404, not leak across tenants.
        import uuid
        svc = Service(
            id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),  # a different tenant
            code="TEST:002",
            name="Other Tenant Service",
            category="other",
            sac_code="9999",
        )
        db_session.add(svc)
        db_session.commit()
        try:
            status, body = self._auth_get(test_token, f"/api/services/{svc.id}")
            assert status == 404
        finally:
            db_session.delete(svc)
            db_session.commit()
