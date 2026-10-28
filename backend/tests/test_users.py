"""Regression tests for the users REST API and WhatsApp endpoint.

These tests verify that the users API endpoints do not return 500 errors
due to references to non-existent database columns (skills, system_access,
work_location, deleted_at, created_by_id, updated_by_id).
"""
import json
import urllib.request
from app.core.security import create_access_token
import uuid


BASE = "http://127.0.0.1:8000/api"


class TestUsersApi:
    """Verify /api/users endpoints return 200 and correct data."""

    def _headers(self, token):
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }

    def test_list_users(self, tenant_ctx, test_token):
        """GET /api/users should return 200, not 500 from missing columns."""
        req = urllib.request.Request(
            f"{BASE}/users?include_inactive=true",
            headers=self._headers(test_token),
        )
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read())

        assert resp.status == 200
        assert "items" in data
        assert "meta" in data
        assert data["meta"]["total"] > 0

        first = data["items"][0]
        for field in ["id", "email", "full_name", "designation", "department",
                      "employee_code", "phone", "is_partner", "status",
                      "date_of_joining", "weekly_capacity_hours", "last_login_at",
                      "roles"]:
            assert field in first, f"Missing field: {field}"

    def test_get_user(self, tenant_ctx, test_token):
        """GET /api/users/{user_id} should return 200 with user detail."""
        req = urllib.request.Request(
            f"{BASE}/users/{tenant_ctx['user_id']}",
            headers=self._headers(test_token),
        )
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read())

        assert resp.status == 200
        assert data["email"] == "test@example.com"
        assert "skills" in data
        assert "system_access" in data
        assert "work_location" in data
        assert data["skills"] == []
        assert data["work_location"] is None

    def test_whatsapp_status(self, tenant_ctx, test_token):
        """GET /api/whatsapp/status should return 200 with gateway status."""
        req = urllib.request.Request(
            f"{BASE}/whatsapp/status",
            headers=self._headers(test_token),
        )
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read())

        assert resp.status == 200
        assert "configured" in data
        assert "provider" in data
        assert "connected" in data
