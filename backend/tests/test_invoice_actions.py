"""Tests for invoice lifecycle endpoints: issue, send, cancel, share-link.

Covers the key user journey: a draft invoice can be sent to the client in a
single action (issue + send), and each action transitions state correctly.
"""
import json
import urllib.request

from app.core.db import SessionLocal
from app.core.security import create_access_token


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


def _create_draft_invoice(token, client_id):
    """Helper: create a draft invoice and return its id."""
    status, data = _request("POST", "/billing/invoices", token, {
        "client_id": client_id,
        "lines": [{"description": "Test fee", "quantity": 1, "unit_price": 5000}],
    })
    assert status == 200, data
    return data["id"]


class TestInvoiceActions:
    """Invoice lifecycle: issue, send (from draft), cancel, share-link."""

    def test_issue_draft_invoice(self, tenant_ctx, test_token):
        """POST /invoices/{id}/issue transitions a draft to issued."""
        invoice_id = _create_draft_invoice(test_token, tenant_ctx["client_id"])

        status, data = _request("POST", f"/invoices/{invoice_id}/issue", test_token)
        assert status == 200, data
        assert data["status"] == "issued"
        assert data["invoice_number"] is not None
        assert data["invoice_number"].startswith("INV")
        assert data["issued_at"] is not None

    def test_send_from_draft_issues_and_sends(self, tenant_ctx, test_token):
        """POST /invoices/{id}/send takes a draft straight to sent.

        This is the 'draft to sent' button the user asked for: issuing and
        sending happen in a single call.
        """
        invoice_id = _create_draft_invoice(test_token, tenant_ctx["client_id"])

        status, data = _request("POST", f"/invoices/{invoice_id}/send", test_token, {
            "message": "Please find the invoice attached.",
        })
        assert status == 200, data
        assert data["invoice_id"] == invoice_id
        assert data["invoice_number"] is not None
        assert data["invoice_number"].startswith("INV")
        assert "outcomes" in data
        assert "share_url" in data
        assert data["share_url"] is not None
        assert data["share_url"].startswith(f"/invoices/shared/")

        # Verify the invoice is now issued + sent in the DB.
        from app.models import Invoice
        db = SessionLocal()
        try:
            inv = db.get(Invoice, invoice_id)
            assert inv.status == "issued"
            assert inv.sent_at is not None
            assert inv.invoice_number is not None
        finally:
            db.close()

    def test_send_from_issued_invoice(self, tenant_ctx, test_token):
        """POST /invoices/{id}/send on an already-issued invoice just sends."""
        invoice_id = _create_draft_invoice(test_token, tenant_ctx["client_id"])

        # Issue first.
        _request("POST", f"/invoices/{invoice_id}/issue", test_token)

        # Then send.
        status, data = _request("POST", f"/invoices/{invoice_id}/send", test_token)
        assert status == 200, data
        assert data["share_url"] is not None

        from app.models import Invoice
        db = SessionLocal()
        try:
            inv = db.get(Invoice, invoice_id)
            assert inv.status == "issued"
            assert inv.sent_at is not None
        finally:
            db.close()

    def test_send_without_contact_info_still_works(self, tenant_ctx, test_token):
        """Send succeeds even if the client has no email or whatsapp — the
        share link is still returned so the URL can be copied manually."""
        invoice_id = _create_draft_invoice(test_token, tenant_ctx["client_id"])

        status, data = _request("POST", f"/invoices/{invoice_id}/send", test_token)
        assert status == 200, data
        # No contacts → no outcomes, but share_url is still generated.
        assert data["share_url"] is not None
        assert data["outcomes"] == []

    def test_cancel_draft_invoice(self, tenant_ctx, test_token):
        """POST /invoices/{id}/cancel transitions to cancelled with reason."""
        invoice_id = _create_draft_invoice(test_token, tenant_ctx["client_id"])

        status, data = _request("POST", f"/invoices/{invoice_id}/cancel", test_token, {
            "reason": "Raised against the wrong client",
        })
        assert status == 200, data
        assert data["status"] == "cancelled"
        assert data["cancelled_reason"] == "Raised against the wrong client"
        assert data["cancelled_at"] is not None

    def test_cancel_paid_invoice_rejected(self, tenant_ctx, test_token):
        """Cancelling an invoice with payments raises a ValidationError."""
        invoice_id = _create_draft_invoice(test_token, tenant_ctx["client_id"])

        # Issue and send.
        _request("POST", f"/invoices/{invoice_id}/issue", test_token)
        _request("POST", f"/invoices/{invoice_id}/send", test_token)

        # Record a payment.
        _request("POST", f"/invoices/{invoice_id}/payments", test_token, {
            "amount": 1000, "method": "cash", "paid_on": "2026-10-27",
        })

        # Attempt to cancel — should be rejected.
        req = urllib.request.Request(
            f"{BASE}/invoices/{invoice_id}/cancel",
            data=json.dumps({"reason": "Trying to cancel a paid invoice"}).encode(),
            headers=_headers(test_token),
            method="POST",
        )
        try:
            urllib.request.urlopen(req, timeout=10)
            assert False, "Expected 422 for cancelling a paid invoice"
        except urllib.error.HTTPError as e:
            assert e.code == 422
            body = json.loads(e.read())
            assert "cannot" in body["error"]["message"].lower()

    def test_share_link(self, tenant_ctx, test_token):
        """POST /invoices/{id}/share-link generates a client-facing URL."""
        invoice_id = _create_draft_invoice(test_token, tenant_ctx["client_id"])

        status, data = _request("POST", f"/invoices/{invoice_id}/share-link", test_token)
        assert status == 200, data
        assert data["invoice_id"] == invoice_id
        assert data["share_url"].startswith(f"/invoices/shared/")
        assert data["expires_at"] is not None

    def test_get_invoice_returns_full_detail(self, tenant_ctx, test_token):
        """GET /invoices/{id} returns all fields the frontend expects."""
        invoice_id = _create_draft_invoice(test_token, tenant_ctx["client_id"])

        status, data = _request("GET", f"/invoices/{invoice_id}", test_token)
        assert status == 200, data
        assert data["id"] == invoice_id
        assert data["status"] == "draft"
        # Fields the frontend InvoiceDetail expects.
        assert "client" in data
        assert "firm" in data
        assert "tax_note" in data
        assert "share_link_active" in data
        assert data["share_link_active"] is False
        assert data["cancelled_at"] is None
        assert data["cancelled_reason"] is None
        assert "services" in data
        assert "lines" in data and len(data["lines"]) > 0
        assert "payments" in data
