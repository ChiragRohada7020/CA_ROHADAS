"""Tests for scoped per-user permission overrides and token invalidation.

Covers:
  - ``PATCH /users/{id}/permissions`` stores ``scope``/``module`` and expands a
    module-scoped override into every permission in that module.
  - A later ``revoke`` beats an earlier ``grant`` for the same key.
  - Saving overrides revokes the member's refresh tokens.
  - ``POST /users/{id}/permissions/invalidate-tokens`` revokes tokens.
  - ``GET /users/{id}/permissions`` returns the expanded ``covers`` list.
"""
import json
import urllib.request
import urllib.error

import pytest

BASE = "http://127.0.0.1:8000/api"


def _headers(token):
    return {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}


def _get(token, path):
    req = urllib.request.Request(f"{BASE}{path}", headers=_headers(token))
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read())


def _patch(token, path, body):
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(body).encode(),
        headers=_headers(token),
        method="PATCH",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read())


def _post(token, path, body):
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(body).encode(),
        headers=_headers(token),
        method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read())


def _token_for(roles, permissions):
    from app.core.security import create_access_token
    import uuid as _uuid
    return create_access_token(
        subject=str(_uuid.UUID("22222222-2222-2222-2222-222222222222")),
        tenant_id="11111111-1111-1111-1111-111111111111",
        roles=roles,
        permissions=permissions,
    )


OWNER_PERMS = [
    "client.read", "client.write", "user.read", "user.write",
    "role.read", "role.write", "user.permission.manage",
]


class TestScopedOverrides:
    def test_module_scope_expands(self, tenant_ctx, test_token):
        """A module-scoped grant covers every permission in that module."""
        user_id = tenant_ctx["user_id"]
        status, body = _patch(test_token, f"/users/{user_id}/permissions", {
            "overrides": [{
                "permission_code": "client.read",
                "action": "grant",
                "scope": "module",
                "module": "client",
            }],
        })
        assert status == 200, body
        assert "client.read" in body["effective_permissions"]
        assert "client.write" in body["effective_permissions"]
        assert "client.status" in body["effective_permissions"]

        status, detail = _get(test_token, f"/users/{user_id}/permissions")
        assert status == 200
        override = detail["overrides"][0]
        assert override["scope"] == "module"
        assert override["module"] == "client"
        assert set(override["covers"]) >= {
            "client.read", "client.write", "client.status",
        }

    def test_revoke_beats_grant(self, tenant_ctx, test_token):
        """A later revoke for the same key overrides an earlier grant."""
        user_id = tenant_ctx["user_id"]
        status, body = _patch(test_token, f"/users/{user_id}/permissions", {
            "overrides": [
                {"permission_code": "client.read", "action": "grant"},
                {"permission_code": "client.read", "action": "revoke"},
            ],
        })
        assert status == 200, body
        assert "client.read" not in body["effective_permissions"]

    def test_save_revokes_refresh_tokens(self, tenant_ctx, test_token):
        """Saving overrides invalidates the member's refresh tokens."""
        user_id = tenant_ctx["user_id"]
        status, body = _patch(test_token, f"/users/{user_id}/permissions", {
            "overrides": [{"permission_code": "client.read", "action": "grant"}],
        })
        assert status == 200, body
        assert body.get("tokens_invalidated") is True

    def test_invalidate_tokens_endpoint(self, tenant_ctx, test_token):
        """The dedicated endpoint revokes tokens and reports the count."""
        user_id = tenant_ctx["user_id"]
        status, body = _post(
            test_token,
            f"/users/{user_id}/permissions/invalidate-tokens",
            {},
        )
        assert status == 200, body
        assert "revoked" in body
        assert body["message"]

    def test_invalidate_tokens_requires_manage(self, tenant_ctx):
        """A caller without ``user.permission.manage`` cannot invalidate."""
        user_id = tenant_ctx["user_id"]
        token = _token_for(["manager"], ["user.read"])
        status, _ = _post(
            token,
            f"/users/{user_id}/permissions/invalidate-tokens",
            {},
        )
        assert status == 403

    def test_unknown_user_is_not_found(self, tenant_ctx, test_token):
        status, _ = _get(test_token, "/users/00000000-0000-0000-0000-000000000000/permissions")
        assert status == 404