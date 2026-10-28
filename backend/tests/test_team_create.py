"""Tests for the team-directory create + role-assignment policy.

Covers:
  - POST /users requires ``user.write`` (403 without it).
  - ``reporting_to_id`` is accepted and stored.
  - The role-assignment policy: a partner may not assign a partner-or-above
    role; a manager may only assign seniors and below; a firm owner may assign
    anything.
  - ``/roles`` returns an ``assignable`` list filtered to the caller's tier.
"""
import json
import urllib.request
import urllib.error

import pytest

BASE = "http://127.0.0.1:8000/api"


def _headers(token):
    return {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}


def _post(token, body):
    req = urllib.request.Request(
        f"{BASE}/users",
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


PARTNER_PERMS = [
    "client.read", "client.write", "user.read", "user.write",
    "role.read", "role.write", "user.permission.manage",
]


def _seed_role(code):
    """Ensure a system role with the given code exists in the test tenant.

    The test tenant only ever gets ``firm_owner`` from onboarding, so the
    tier-policy tests that assign a different built-in role need the role
    seeded first.
    """
    from sqlalchemy import text
    from app.core.db import SessionLocal
    import uuid as _uuid
    db = SessionLocal()
    try:
        tid = _uuid.UUID("11111111-1111-1111-1111-111111111111")
        existing = db.execute(text(
            "SELECT id FROM roles WHERE code = :c AND tenant_id = :t"
        ), {"c": code, "t": str(tid)}).scalar()
        if existing:
            return str(existing)
        rid = _uuid.uuid4()
        db.execute(text(
            "INSERT INTO roles (id, tenant_id, code, name, is_system, is_active, data_scope, created_at) "
            "VALUES (:id, :t, :c, :n, true, true, 'firm', NOW())"
        ), {"id": str(rid), "t": str(tid), "c": code, "n": code.replace("_", " ").title()})
        db.commit()
        return str(rid)
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def _seed_system_roles(_setup_test_tenant):
    """Seed every built-in role into the test tenant once per session."""
    for code in (
        "firm_owner", "branch_partner", "partner", "admin", "manager",
        "senior_associate", "ca_senior", "article_assistant",
        "accounts_staff", "accountant", "system_admin",
    ):
        _seed_role(code)
    yield


class TestCreateUserAuthz:
    def test_requires_user_write(self, tenant_ctx):
        """Without ``user.write`` the create endpoint refuses the request."""
        token = _token_for(["partner"], ["user.read", "role.read"])
        status, _ = _post(token, {
            "email": "no-perm@example.com", "full_name": "No Perm",
        })
        assert status == 403

    def test_reports_to_is_stored(self, tenant_ctx, test_token):
        """``reporting_to_id`` is accepted and persisted."""
        manager_id = tenant_ctx["user_id"]
        status, body = _post(test_token, {
            "email": "jr@example.com", "full_name": "Junior Reporter",
            "password": "secret123", "reporting_to_id": manager_id,
        })
        assert status == 200, body
        assert body["reporting_to_id"] == manager_id

    def test_role_assignment_policy_partner_cannot_assign_partner(
        self, tenant_ctx, test_token,
    ):
        """A partner may not assign a partner-or-above role."""
        status, body = _post(test_token, {
            "email": "newpartner@example.com", "full_name": "New Partner",
            "password": "secret123", "role_code": "partner",
        })
        assert status == 403, body

    def test_role_assignment_policy_manager_cannot_assign_manager(
        self, tenant_ctx,
    ):
        """A manager may not assign a manager role (only seniors and below)."""
        token = _token_for(["manager"], PARTNER_PERMS)
        status, body = _post(token, {
            "email": "newmanager@example.com", "full_name": "New Manager",
            "password": "secret123", "role_code": "manager",
        })
        assert status == 403, body

    def test_role_assignment_policy_manager_can_assign_senior(
        self, tenant_ctx,
    ):
        """A manager may assign a senior-associate role."""
        token = _token_for(["manager"], PARTNER_PERMS)
        status, body = _post(token, {
            "email": "newsenior@example.com", "full_name": "New Senior",
            "password": "secret123", "role_code": "senior_associate",
        })
        assert status == 200, body


class TestAssignableRoles:
    def test_firm_owner_sees_everything(self, tenant_ctx):
        from app.routers.roles import assignable_roles_for
        assert assignable_roles_for(type("P", (), {"roles": ["firm_owner"]})()) == {
            "firm_owner", "branch_partner", "partner", "admin", "manager",
            "senior_associate", "ca_senior", "article_assistant",
            "accounts_staff", "accountant", "system_admin",
        }

    def test_partner_cannot_assign_partner(self, tenant_ctx):
        from app.routers.roles import assignable_roles_for
        assignable = assignable_roles_for(type("P", (), {"roles": ["partner"]})())
        assert "partner" not in assignable
        assert "branch_partner" not in assignable
        assert "firm_owner" not in assignable
        assert "manager" in assignable

    def test_manager_only_seniors_and_below(self, tenant_ctx):
        from app.routers.roles import assignable_roles_for
        assignable = assignable_roles_for(type("P", (), {"roles": ["manager"]})())
        assert assignable == {
            "senior_associate", "ca_senior",
            "article_assistant", "accounts_staff", "accountant",
        }