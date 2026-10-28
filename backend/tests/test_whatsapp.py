"""Tests for WhatsApp integration: PDF generation, service functions, and MCP tools."""

import io
import json
import urllib.request
from unittest.mock import patch, AsyncMock

import pytest
from reportlab.lib.pagesizes import A4

from app.core.security import create_access_token
from app.services.whatsapp_service import (
    generate_invoice_pdf,
    WhatsAppGatewayClient,
)

TEST_TENANT_ID = "11111111-1111-1111-1111-111111111111"
TEST_USER_ID = "22222222-2222-2222-2222-222222222222"


def _make_token():
    return create_access_token(
        subject=TEST_USER_ID,
        tenant_id=TEST_TENANT_ID,
        roles=["partner"],
        permissions=[
            "invoice.read", "invoice.write", "invoice.issue", "invoice.send",
            "invoice.share", "payment.write", "communication.send",
            "integration.read", "client.read", "client.write",
        ],
    )


# ── Unit tests: PDF generation ──────────────────────────────────────────

class TestInvoicePDF:
    def test_generate_invoice_pdf_returns_bytes(self):
        pdf = generate_invoice_pdf(
            {
                "invoice_number": "INV2510:0001",
                "invoice_date": "2025-10-27",
                "due_date": "2025-11-11",
                "subtotal": 12000.0,
                "cgst_amount": 1080.0,
                "sgst_amount": 1080.0,
                "igst_amount": 0.0,
                "total": 14160.0,
            },
            {
                "name": "Test Client",
                "legal_name": "Test Client LLP",
                "gstin": "27AACTT1234F1Z5",
                "address_line1": "123, MG Road",
                "city": "Mumbai",
                "state": "Maharashtra",
                "pincode": "400001",
            },
            {
                "legal_name": "Rohadas & Associates",
                "trade_name": "Rohadas CA",
                "gstin": "27ABCDE1234F1Z5",
                "address_line1": "456, Linking Road",
                "city": "Mumbai",
                "state": "Maharashtra",
                "pincode": "400050",
                "phone": "+91 22 1234 5678",
                "email": "firm@rohadass.com",
            },
            [
                {"description": "GST Consultation", "sac_code": "9985", "quantity": 1, "unit_price": 10000, "amount": 10000},
                {"description": "ITR Filing", "sac_code": "9985", "quantity": 1, "unit_price": 2000, "amount": 2000},
            ],
        )
        assert isinstance(pdf, bytes)
        assert len(pdf) > 0
        assert pdf[:4] == b"%PDF"  # PDF magic bytes

    def test_generate_invoice_pdf_interstate(self):
        pdf = generate_invoice_pdf(
            {
                "invoice_number": "INV2510:0002",
                "invoice_date": "2025-10-27",
                "due_date": "2025-11-11",
                "subtotal": 10000.0,
                "cgst_amount": 0.0,
                "sgst_amount": 0.0,
                "igst_amount": 1800.0,
                "total": 11800.0,
            },
            None,
            None,
            [
                {"description": "Advisory", "sac_code": "9985", "quantity": 1, "unit_price": 10000, "amount": 10000},
            ],
        )
        assert isinstance(pdf, bytes)
        assert pdf[:4] == b"%PDF"


# ── Unit tests: WhatsAppGatewayClient with mocked httpx ─────────────────

class TestWhatsAppGatewayClient:
    def test_status_not_configured(self):
        client = WhatsAppGatewayClient(base_url=None)
        result = json.loads(json.dumps({"success": False, "error": "WhatsApp gateway not configured"}))
        # When base_url is None, status() returns not-configured dict
        import asyncio
        result = asyncio.run(client.status())
        assert result["configured"] is False

    @pytest.mark.asyncio
    async def test_send_message_success(self):
        client = WhatsAppGatewayClient(base_url="http://127.0.0.1:3001")
        with patch.object(client._client, "post", new_callable=AsyncMock) as mock_post:
            mock_resp = AsyncMock()
            mock_resp.raise_for_status = lambda: None
            mock_resp.json = lambda: {"success": True, "recipient": "+919876543210"}
            mock_post.return_value = mock_resp
            result = await client.send_message("+919876543210", "Hello")
            assert result["success"] is True
            mock_post.assert_called_once()

    @pytest.mark.asyncio
    async def test_send_media_success(self):
        client = WhatsAppGatewayClient(base_url="http://127.0.0.1:3001")
        with patch.object(client._client, "post", new_callable=AsyncMock) as mock_post:
            mock_resp = AsyncMock()
            mock_resp.raise_for_status = lambda: None
            mock_resp.json = lambda: {"success": True, "recipient": "+919876543210"}
            mock_post.return_value = mock_resp
            result = await client.send_media("+919876543210", b"%PDF-1.4...", "invoice.pdf", "Invoice INV2510:0001")
            assert result["success"] is True
            call_kwargs = mock_post.call_args.kwargs
            assert "files" in call_kwargs


# ── Integration tests: MCP WhatsApp tools (needs running backend) ───────

MCP_URL = "http://127.0.0.1:8000/mcp/"


def _call_mcp(token, method_name, params):
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
    req = urllib.request.Request(MCP_URL, data=payload.encode(), headers=headers, method="POST")
    resp = urllib.request.urlopen(req, timeout=10)
    data = resp.read().decode()
    line = [l for l in data.split("\n") if l.startswith("data: ")][0]
    parsed = json.loads(line[6:])
    return resp.status, json.loads(parsed["result"]["content"][0]["text"])


class TestMCPWhatsAppTools:
    def test_whatsapp_status(self, test_token, tenant_ctx):
        status, result = _call_mcp(test_token, "whatsapp_status", {})
        assert status == 200
        assert "provider" in result or "error" in result

    def test_whatsapp_qr(self, test_token, tenant_ctx):
        status, result = _call_mcp(test_token, "whatsapp_qr", {})
        assert status == 200
        assert "connected" in result or "error" in result

    def test_whatsapp_send_message_missing_params(self, test_token, tenant_ctx):
        status, result = _call_mcp(test_token, "whatsapp_send_message", {})
        assert status == 200
        assert "error" in result

    def test_whatsapp_send_invoice_missing_id(self, test_token, tenant_ctx):
        status, result = _call_mcp(test_token, "whatsapp_send_invoice", {})
        assert status == 200
        assert "error" in result

    def test_whatsapp_send_invoice_not_found(self, test_token, tenant_ctx):
        status, result = _call_mcp(test_token, "whatsapp_send_invoice", {
            "invoice_id": "00000000-0000-0000-0000-000000000000",
        })
        assert status == 200
        assert "error" in result
