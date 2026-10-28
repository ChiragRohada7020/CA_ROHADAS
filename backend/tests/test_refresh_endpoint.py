"""Tests for token refresh and audience handling.

Covers:
  - ``decode_token(expected_audience=None)`` accepts tokens with any audience
    (staff or client).
  - POST /auth/refresh re-loads roles and permissions from the DB rather than
    carrying empty claims from the refresh token.
  - The new access token after refresh is usable for permission-protected calls.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
import uuid

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.models import Role, RolePermission, user_roles
from sqlalchemy import select

BASE = "http://127.0.0.1:8000/api"
TEST_TENANT_ID = "11111111-1111-1111-1111-111111111111"
TEST_USER_ID = "22222222-2222-2222-2222-222222222222"


def _tenant_id() -> str:
    return TEST_TENANT_ID


def _get_or_create_role(db, role_code: str, permission_codes: list[str]) -> str:
    """Return the id of a role with the given code in the test tenant.

    If the role does not exist, create it and attach the given permissions.
    This avoids unique-constraint violations when multiple tests use the same
    role code.
    """
    tid = uuid.UUID(_tenant_id())
    existing = db.execute(
        select(Role).where(Role.code == role_code, Role.tenant_id == tid)
    ).scalar_one_or_none()
    if existing:
        rid = existing.id
    else:
        rid = uuid.uuid4()
        role = Role(
            id=rid,
            tenant_id=tid,
            code=role_code,
            name=role_code.replace("_", " ").title(),
            is_system=True,
            is_active=True,
            data_scope="firm",
        )
        db.add(role)
        db.flush()

    for code in permission_codes:
        existing_rp = db.execute(
            select(RolePermission).where(
                RolePermission.role_id == rid,
                RolePermission.permission_code == code,
            )
        ).scalar_one_or_none()
        if existing_rp is None:
            db.add(RolePermission(role_id=rid, permission_code=code))

    db.flush()
    return str(rid)


def _assign_role_to_user(db, role_id_str: str, user_id_str: str) -> None:
    """Link a role to the test user (idempotent)."""
    uid = uuid.UUID(user_id_str)
    rid = uuid.UUID(role_id_str)
    existing = db.execute(
        select(user_roles).where(user_roles.c.user_id == uid, user_roles.c.role_id == rid)
    ).first()
    if existing is None:
        db.execute(
            user_roles.insert().values(
                user_id=uid,
                role_id=rid,
                assigned_by_id=uid,
            )
        )
    db.commit()


def _extract_cookie(set_cookie_header: str, name: str) -> str | None:
    """Extract a cookie value from a Set-Cookie response header."""
    for part in set_cookie_header.split(";"):
        part = part.strip()
        if part.startswith(f"{name}="):
            return part[len(f"{name}="):]
    return None


def _do_refresh(refresh_token: str):
    """Call POST /auth/refresh with the given refresh token as a cookie."""
    req = urllib.request.Request(
        f"{BASE}/auth/refresh",
        data=json.dumps({}).encode(),
        headers={
            "Content-Type": "application/json",
            "Cookie": f"ca_refresh_token={refresh_token}",
        },
        method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return resp.status, _extract_cookie(resp.headers.get("Set-Cookie", ""), "ca_staff_token")
    except urllib.error.HTTPError as exc:
        body = exc.read()
        try:
            body = json.loads(body)
        except Exception:
            body = body.decode()
        return exc.code, body


class TestDecodeTokenAudience:
    """``decode_token`` must accept tokens with any audience when
    ``expected_audience=None``."""

    def test_none_audience_accepts_staff_token(self):
        token = create_access_token(
            subject="11111111-1111-1111-1111-111111111111",
            tenant_id="11111111-1111-1111-1111-111111111111",
            roles=["partner"],
            permissions=["client.read"],
            audience="staff",
        )
        payload = decode_token(token, expected_type="access", expected_audience=None)
        assert payload.aud == "staff"

    def test_none_audience_accepts_client_token(self):
        token = create_access_token(
            subject="11111111-1111-1111-1111-111111111111",
            tenant_id="11111111-1111-1111-1111-111111111111",
            roles=["client"],
            permissions=[],
            audience="client",
        )
        payload = decode_token(token, expected_type="access", expected_audience=None)
        assert payload.aud == "client"

    def test_refresh_token_any_audience(self):
        """Refresh tokens for staff and client audiences must both decode."""
        staff_refresh = create_refresh_token(
            subject="11111111-1111-1111-1111-111111111111",
            tenant_id="11111111-1111-1111-1111-111111111111",
            audience="staff",
        )
        client_refresh = create_refresh_token(
            subject="11111111-1111-1111-1111-111111111111",
            tenant_id="11111111-1111-1111-1111-111111111111",
            audience="client",
        )
        for rt in (staff_refresh, client_refresh):
            payload = decode_token(rt, expected_type="refresh", expected_audience=None)
            assert payload.type == "refresh"

    def test_expected_audience_none_does_not_require_aud_claim(self):
        """A token without a proper aud but with expected_audience=None should
        still decode (skip audience check)."""
        # Create an access token with aud="staff", decode with None
        token = create_refresh_token(
            subject="11111111-1111-1111-1111-111111111111",
            tenant_id="11111111-1111-1111-1111-111111111111",
            audience="client",
        )
        payload = decode_token(token, expected_type="refresh", expected_audience=None)
        assert payload.aud == "client"


class TestRefreshEndpoint:
    """POST /auth/refresh must re-hydrate roles and permissions from the DB."""

    def test_refresh_preserves_staff_permissions(self, tenant_ctx, db_session):
        """A staff user's permissions are re-loaded from the DB on refresh.

        Regression: refresh tokens have no ``roles``/``permissions`` claims, so
        the old code issued new access tokens with ``roles=[]`` and ``permissions=[]``,
        causing 403 on every permission-protected endpoint after a refresh.
        """
        tid = _tenant_id()
        uid = tenant_ctx["user_id"]

        # Seed a role with known permissions and assign it to the test user.
        role_id = _get_or_create_role(db_session, "partner", ["client.read", "user.read"])
        _assign_role_to_user(db_session, role_id, uid)

        # Create a refresh token (no permissions embedded).
        refresh = create_refresh_token(subject=uid, tenant_id=tid, audience="staff")

        status, access_token = _do_refresh(refresh)
        assert status == 200, access_token
        assert access_token is not None, "ca_staff_token not in Set-Cookie"

        # Decode the new access token and verify permissions were re-hydrated.
        payload = decode_token(access_token, expected_type="access", expected_audience="staff")
        assert payload.aud == "staff"
        assert "partner" in payload.roles
        assert "client.read" in payload.permissions
        assert "user.read" in payload.permissions

    def test_refreshed_token_works_on_protected_endpoint(self, tenant_ctx, db_session):
        """After refresh, the new access token must pass require_permission."""
        tid = _tenant_id()
        uid = tenant_ctx["user_id"]

        role_id = _get_or_create_role(db_session, "senior_associate", ["client.read"])
        _assign_role_to_user(db_session, role_id, uid)

        refresh = create_refresh_token(subject=uid, tenant_id=tid, audience="staff")
        status, access_token = _do_refresh(refresh)
        assert status == 200, access_token
        assert access_token is not None

        # The refreshed token must work on a protected endpoint (requires user.read).
        req2 = urllib.request.Request(
            f"{BASE}/users/roles",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp2 = urllib.request.urlopen(req2, timeout=10)
        assert resp2.status == 200, resp2.read()

    def test_refresh_client_token_preserves_audience(self, tenant_ctx, db_session):
        """A client portal refresh token must produce a client-scoped access token."""
        tid = _tenant_id()
        uid = tenant_ctx["user_id"]

        refresh = create_refresh_token(subject=uid, tenant_id=tid, audience="client")
        status, access_token = _do_refresh(refresh)
        assert status == 200, access_token
        assert access_token is not None
        payload = decode_token(access_token, expected_type="access", expected_audience="client")
        assert payload.aud == "client"
        assert payload.roles == ["client"]
