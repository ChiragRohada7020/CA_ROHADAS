"""WhatsApp business service — bridges CA Rohadas to the Baileys WhatsApp gateway.

All WhatsApp delivery goes through the standalone Baileys gateway
(``baileys-gateway/``) reached via HTTP at ``settings.WHATSAPP_API_URL``.  The
service is responsible for:

* querying gateway status / QR code
* pairing a phone number
* sending plain text messages
* generating an invoice PDF (reportlab) and sending it as a WhatsApp document
* looking up the client's WhatsApp number from their primary contact

No WhatsApp business data is ever written directly to the database here — the
gateway owns its own auth state (``baileys-gateway/auth_info/``).
"""
from __future__ import annotations

import json
import secrets
from typing import Any
from io import BytesIO

import httpx
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from app.core.config import settings
from sqlalchemy import select


class WhatsAppGatewayClient:
    """HTTP client for the Baileys WhatsApp gateway.

    Every method returns a dict.  On transport or gateway errors the dict
    carries an ``error`` key and a ``success: False`` flag — callers are
    expected to inspect that rather than catch exceptions.
    """

    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or settings.WHATSAPP_API_URL or "").rstrip("/")
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(30.0))

    async def _get(self, path: str) -> dict[str, Any]:
        if not self.base_url:
            return {"configured": False, "connected": False, "error": "WhatsApp gateway not configured"}
        try:
            resp = await self._client.get(f"{self.base_url}{path}")
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as exc:
            return {"configured": False, "connected": False, "error": str(exc)}
        except Exception as exc:  # noqa: BLE001
            return {"configured": False, "connected": False, "error": str(exc)}

    async def _post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.base_url:
            return {"success": False, "error": "WhatsApp gateway not configured"}
        try:
            resp = await self._client.post(f"{self.base_url}{path}", json=payload)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as exc:
            return {"success": False, "error": str(exc)}
        except Exception as exc:  # noqa: BLE001
            return {"success": False, "error": str(exc)}

    async def _post_multipart(
        self, path: str, data: dict[str, str], files: dict[str, tuple[str, bytes, str]]
    ) -> dict[str, Any]:
        if not self.base_url:
            return {"success": False, "error": "WhatsApp gateway not configured"}
        try:
            resp = await self._client.post(
                f"{self.base_url}{path}",
                data=data,
                files=files,
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as exc:
            return {"success": False, "error": str(exc)}
        except Exception as exc:  # noqa: BLE001
            return {"success": False, "error": str(exc)}

    async def status(self) -> dict[str, Any]:
        return await self._get("/status")

    async def qr(self) -> dict[str, Any]:
        return await self._get("/qr")

    async def pair(self, phone_number: str) -> dict[str, Any]:
        return await self._post_json("/pair", {"phone_number": phone_number})

    async def send_message(self, phone_number: str, message: str) -> dict[str, Any]:
        return await self._post_json("/send-message", {"phone_number": phone_number, "message": message})

    async def send_media(
        self,
        phone_number: str,
        file_bytes: bytes,
        file_name: str,
        caption: str | None = None,
    ) -> dict[str, Any]:
        return await self._post_multipart(
            "/send-media",
            data={"phone_number": phone_number, "caption": caption or ""},
            files={"file": (file_name, file_bytes, "application/pdf")},
        )

    async def aclose(self) -> None:
        await self._client.aclose()


# ── Module-level gateway client (lazily created) ──────────────────────────

_gateway_client: WhatsAppGatewayClient | None = None


def _gateway() -> WhatsAppGatewayClient:
    global _gateway_client
    if _gateway_client is None:
        _gateway_client = WhatsAppGatewayClient()
    return _gateway_client


# ── Status / QR / pairing ─────────────────────────────────────────────────


async def get_whatsapp_status() -> dict[str, Any]:
    """Return the WhatsApp gateway connection status."""
    return await _gateway().status()


async def get_whatsapp_qr() -> dict[str, Any]:
    """Return the WhatsApp pairing QR code (data URL) if available."""
    return await _gateway().qr()


async def pair_whatsapp(phone_number: str) -> dict[str, Any]:
    """Request a pairing code for the given phone number."""
    return await _gateway().pair(phone_number)


async def send_whatsapp_message(phone_number: str, message: str) -> dict[str, Any]:
    """Send a plain-text WhatsApp message to a phone number."""
    return await _gateway().send_message(phone_number, message)


# ── Invoice PDF generation (reportlab) ────────────────────────────────────

def _money(value: float | None) -> str:
    if value is None:
        return "0.00"
    return f"{value:,.2f}"


def generate_invoice_pdf(
    invoice: dict[str, Any],
    client: dict[str, Any] | None,
    firm: dict[str, Any] | None,
    lines: list[dict[str, Any]],
) -> bytes:
    """Generate an invoice PDF as bytes using reportlab.

    Layout (A4 portrait):
      * Firm letterhead (name, address, GSTIN, phone, email)
      * Client "billed to" block
      * Invoice meta (number, date, due date)
      * Line item table (description, SAC, qty, rate, amount)
      * Tax breakdown (CGST/SGST/IGST), total
      * Footer note
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Invoice {invoice.get('invoice_number') or ''}",
        author=firm.get("legal_name") if firm else "CA Firm",
    )

    styles = {
        "firm_name": ParagraphStyle("firm_name", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=colors.HexColor("#0f172a")),
        "firm_sub": ParagraphStyle("firm_sub", fontName="Helvetica", fontSize=9, leading=12, textColor=colors.HexColor("#475569")),
        "section": ParagraphStyle("section", fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=colors.HexColor("#0f172a"), spaceBefore=10, spaceAfter=4),
        "label": ParagraphStyle("label", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=colors.HexColor("#475569")),
        "value": ParagraphStyle("value", fontName="Helvetica", fontSize=9, leading=12, textColor=colors.HexColor("#0f172a")),
        "invoice_title": ParagraphStyle("invoice_title", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=colors.HexColor("#0f172a"), alignment=2),
        "meta": ParagraphStyle("meta", fontName="Helvetica", fontSize=9, leading=12, textColor=colors.HexColor("#0f172a")),
        "total_label": ParagraphStyle("total_label", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=colors.HexColor("#0f172a"), alignment=2),
        "total_value": ParagraphStyle("total_value", fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=colors.HexColor("#0f172a"), alignment=2),
    }

    story: list[Any] = []

    # ── Firm letterhead ─────────────────────────────────────────────────
    firm = firm or {}
    client = client or {}
    firm_name = firm.get("legal_name") or "CA Firm"
    firm_lines = [firm_name]
    if firm.get("trade_name"):
        firm_lines.append(firm["trade_name"])
    addr_parts = [firm.get("address_line1"), firm.get("address_line2")]
    addr = ", ".join(p for p in addr_parts if p)
    if addr:
        firm_lines.append(addr)
    city_state = ", ".join(p for p in [firm.get("city"), firm.get("state"), firm.get("pincode")] if p)
    if city_state:
        firm_lines.append(city_state)
    contact_parts = []
    if firm.get("gstin"):
        contact_parts.append(f"GSTIN: {firm['gstin']}")
    if firm.get("phone"):
        contact_parts.append(f"Ph: {firm['phone']}")
    if firm.get("email"):
        contact_parts.append(f"Email: {firm['email']}")
    if contact_parts:
        firm_lines.append(" | ".join(contact_parts))

    story.append(Paragraph(firm_lines[0], styles["firm_name"]))
    for line in firm_lines[1:]:
        story.append(Paragraph(line, styles["firm_sub"]))
    story.append(Spacer(1, 6))
    story.append(Paragraph("TAX INVOICE", styles["invoice_title"]))
    story.append(Spacer(1, 10))

    # ── Client block ────────────────────────────────────────────────────
    client_name = client.get("name") or client.get("legal_name") or "Client"
    client_blocks = [
        [Paragraph("BILLED TO", styles["section"]), Paragraph("INVOICE DETAILS", styles["section"])],
        [
            Paragraph(client_name, styles["value"]),
            Paragraph(f"<b>Invoice No:</b> {invoice.get('invoice_number') or '—'}", styles["meta"]),
        ],
    ]
    client_addr_parts = [
        client.get("address_line1"),
        client.get("address_line2"),
        ", ".join(p for p in [client.get("city"), client.get("state"), client.get("pincode")] if p),
    ]
    client_addr = [p for p in client_addr_parts if p]
    for line in client_addr:
        client_blocks[1].append(Paragraph(line, styles["meta"]))
    if client.get("gstin"):
        client_blocks[1].append(Paragraph(f"<b>GSTIN:</b> {client['gstin']}", styles["meta"]))
    client_blocks[1].append(Paragraph(f"<b>Date:</b> {invoice.get('invoice_date') or '—'}", styles["meta"]))
    client_blocks[1].append(Paragraph(f"<b>Due Date:</b> {invoice.get('due_date') or '—'}", styles["meta"]))

    info_table = Table(client_blocks, colWidths=[90 * mm, 95 * mm])
    info_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 10))

    # ── Line items ──────────────────────────────────────────────────────
    story.append(Paragraph("LINE ITEMS", styles["section"]))
    header = ["#", "Description", "SAC Code", "Qty", "Rate (₹)", "Amount (₹)"]
    rows = [header]
    for idx, line in enumerate(lines, start=1):
        rows.append([
            str(idx),
            line.get("description", ""),
            line.get("sac_code") or "—",
            str(line.get("quantity", 1)),
            _money(line.get("unit_price", 0)),
            _money(line.get("amount", 0)),
        ])

    col_widths = [10 * mm, 70 * mm, 25 * mm, 15 * mm, 30 * mm, 30 * mm]
    items_table = Table(rows, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("FONTNAME", (0, 1), (0, -1), "Helvetica"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]
    items_table.setStyle(TableStyle(style_cmds))
    story.append(items_table)
    story.append(Spacer(1, 10))

    # ── Totals ──────────────────────────────────────────────────────────
    subtotal = float(invoice.get("subtotal") or 0)
    cgst = float(invoice.get("cgst_amount") or 0)
    sgst = float(invoice.get("sgst_amount") or 0)
    igst = float(invoice.get("igst_amount") or 0)
    total = float(invoice.get("total") or 0)

    tax_rows = [
        ["Subtotal", _money(subtotal)],
    ]
    if cgst > 0:
        tax_rows.append(["CGST", _money(cgst)])
    if sgst > 0:
        tax_rows.append(["SGST", _money(sgst)])
    if igst > 0:
        tax_rows.append(["IGST", _money(igst)])
    tax_rows.append(["Total", _money(total)])

    totals_table = Table(tax_rows, colWidths=[140 * mm, 45 * mm])
    totals_table.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (0, 0), (0, -2), "Helvetica"),
        ("FONTNAME", (1, 0), (1, -2), "Helvetica"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.HexColor("#0f172a")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    # Right-align the totals table
    totals_table._width = [140 * mm, 45 * mm]
    story.append(totals_table)
    story.append(Spacer(1, 12))

    # ── Footer ──────────────────────────────────────────────────────────
    footer = (
        "This is a computer-generated invoice and does not require a physical signature. "
        "Please share any payment reference (UTR / cheque number) with the firm for reconciliation."
    )
    story.append(Paragraph(footer, ParagraphStyle("footer", fontName="Helvetica", fontSize=7.5, leading=10, textColor=colors.HexColor("#64748b"))))

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


def generate_receipt_pdf(db, invoice, receipt) -> bytes:
    """Generate a receipt PDF as bytes using reportlab."""
    from io import BytesIO
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    from app.models import BillingSettings, Payment

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Receipt {receipt.receipt_number or ''}",
        author="CA Firm",
    )

    styles = {
        "firm_name": ParagraphStyle("firm_name", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=colors.HexColor("#0f172a")),
        "firm_sub": ParagraphStyle("firm_sub", fontName="Helvetica", fontSize=9, leading=12, textColor=colors.HexColor("#475569")),
        "section": ParagraphStyle("section", fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=colors.HexColor("#0f172a"), spaceBefore=10, spaceAfter=4),
        "label": ParagraphStyle("label", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=colors.HexColor("#475569")),
        "value": ParagraphStyle("value", fontName="Helvetica", fontSize=9, leading=12, textColor=colors.HexColor("#0f172a")),
        "receipt_title": ParagraphStyle("receipt_title", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=colors.HexColor("#0f172a"), alignment=2),
        "meta": ParagraphStyle("meta", fontName="Helvetica", fontSize=9, leading=12, textColor=colors.HexColor("#0f172a")),
    }

    story = []

    # ── Firm letterhead ─────────────────────────────────────────────────
    settings_row = db.execute(
        select(BillingSettings).where(BillingSettings.tenant_id == invoice.tenant_id)
    ).scalars().first()
    firm = {
        "legal_name": settings_row.legal_name if settings_row else None,
        "trade_name": settings_row.trade_name if settings_row else None,
        "gstin": settings_row.gstin if settings_row else None,
        "address_line1": settings_row.address_line1 if settings_row else None,
        "address_line2": settings_row.address_line2 if settings_row else None,
        "city": settings_row.city if settings_row else None,
        "state": settings_row.state if settings_row else None,
        "pincode": settings_row.pincode if settings_row else None,
        "phone": settings_row.phone if settings_row else None,
        "email": settings_row.email if settings_row else None,
    }
    firm_name = firm.get("legal_name") or "CA Firm"
    firm_lines = [firm_name]
    if firm.get("trade_name"):
        firm_lines.append(firm["trade_name"])
    addr_parts = [firm.get("address_line1"), firm.get("address_line2")]
    addr = ", ".join(p for p in addr_parts if p)
    if addr:
        firm_lines.append(addr)
    city_state = ", ".join(p for p in [firm.get("city"), firm.get("state"), firm.get("pincode")] if p)
    if city_state:
        firm_lines.append(city_state)
    contact_parts = []
    if firm.get("gstin"):
        contact_parts.append(f"GSTIN: {firm['gstin']}")
    if firm.get("phone"):
        contact_parts.append(f"Ph: {firm['phone']}")
    if firm.get("email"):
        contact_parts.append(f"Email: {firm['email']}")
    if contact_parts:
        firm_lines.append(" | ".join(contact_parts))

    story.append(Paragraph(firm_lines[0], styles["firm_name"]))
    for line in firm_lines[1:]:
        story.append(Paragraph(line, styles["firm_sub"]))
    story.append(Spacer(1, 6))
    story.append(Paragraph("RECEIPT", styles["receipt_title"]))
    story.append(Spacer(1, 10))

    # ── Receipt meta ────────────────────────────────────────────────────
    payment = None
    if receipt.payment_id:
        payment = db.get(Payment, receipt.payment_id)

    meta_rows = [
        [Paragraph("RECEIPT DETAILS", styles["section"]), Paragraph("PAYMENT DETAILS", styles["section"])],
        [
            Paragraph(f"<b>Receipt No:</b> {receipt.receipt_number or '—'}", styles["meta"]),
            Paragraph(f"<b>Amount:</b> ₹{payment.amount if payment else 0:,.2f}" if payment else "<b>Amount:</b> —", styles["meta"]),
        ],
        [
            Paragraph(f"<b>Date:</b> {receipt.issued_at.strftime('%d %b %Y') if receipt.issued_at else '—'}", styles["meta"]),
            Paragraph(f"<b>Method:</b> {payment.method.replace('_', ' ').title() if payment else '—'}", styles["meta"]),
        ],
        [
            Paragraph(f"<b>Invoice:</b> {invoice.invoice_number or '—'}", styles["meta"]),
            Paragraph(f"<b>Reference:</b> {payment.reference or '—'}" if payment else "<b>Reference:</b> —", styles["meta"]),
        ],
    ]

    info_table = Table(meta_rows, colWidths=[90 * mm, 95 * mm])
    info_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 10))

    # ── Footer ──────────────────────────────────────────────────────────
    footer = "This receipt is computer-generated and valid without a signature."
    story.append(Paragraph(footer, ParagraphStyle("footer", fontName="Helvetica", fontSize=7.5, leading=10, textColor=colors.HexColor("#64748b"))))

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


# ── Send invoice via WhatsApp ─────────────────────────────────────────────

def _fetch_invoice_for_send(db, tenant_id: str, invoice_id: str):
    """Load the invoice, its client, primary contact, lines, and firm settings.

    Returns (invoice, client, contact, lines, settings) or raises
    NotFoundError / ValidationError.
    """
    from app.core.errors import NotFoundError, ValidationError
    from app.models import Invoice, Client, BillingSettings, Contact as _Contact
    from sqlalchemy import select

    invoice = db.get(Invoice, invoice_id)
    if invoice is None or str(invoice.tenant_id) != str(tenant_id):
        raise NotFoundError(f"Invoice {invoice_id} not found")

    if invoice.status == "cancelled":
        raise ValidationError("A cancelled invoice cannot be sent via WhatsApp.")

    client = db.get(Client, invoice.client_id) if invoice.client_id else None

    contact = None
    if client:
        contact = db.execute(
            select(_Contact)
            .where(_Contact.client_id == invoice.client_id, _Contact.tenant_id == tenant_id)
            .order_by(_Contact.is_primary.desc())
            .limit(1)
        ).scalars().first()

    settings_row = db.execute(
        select(BillingSettings).where(BillingSettings.tenant_id == tenant_id)
    ).scalars().first()

    lines = []
    if invoice.lines:
        for l in invoice.lines:
            lines.append({
                "description": l.description,
                "sac_code": l.sac_code,
                "quantity": l.quantity,
                "unit_price": float(l.unit_price),
                "discount": float(l.discount),
                "amount": float(l.amount),
            })

    return invoice, client, contact, lines, settings_row


async def send_invoice_via_whatsapp(
    db,
    tenant_id: str,
    invoice_id: str,
    message: str | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Send an invoice PDF to the client's WhatsApp number.

    Looks up the client's primary contact (whatsapp_number preferred, falling
    back to phone), generates a PDF of the invoice, and sends it as a WhatsApp
    document message through the Baileys gateway.

    Returns a dict with keys: invoice_id, invoice_number, recipient, status,
    detail.
    """
    from app.core.errors import NotFoundError, ValidationError

    invoice, client, contact, lines, settings_row = _fetch_invoice_for_send(db, tenant_id, invoice_id)

    # Resolve the recipient WhatsApp number.
    phone = None
    recipient_label = None
    if contact:
        phone = contact.whatsapp_number or contact.phone
        recipient_label = contact.name or phone or "Client"
    if not phone:
        return {
            "invoice_id": str(invoice.id),
            "invoice_number": invoice.invoice_number,
            "recipient": None,
            "status": "failed",
            "detail": "No WhatsApp number or phone on file for the client's primary contact.",
        }

    # Build firm details dict from billing settings.
    firm = {
        "legal_name": settings_row.legal_name if settings_row else None,
        "trade_name": settings_row.trade_name if settings_row else None,
        "gstin": settings_row.gstin if settings_row else None,
        "address_line1": settings_row.address_line1 if settings_row else None,
        "address_line2": settings_row.address_line2 if settings_row else None,
        "city": settings_row.city if settings_row else None,
        "state": settings_row.state if settings_row else None,
        "pincode": settings_row.pincode if settings_row else None,
        "phone": settings_row.phone if settings_row else None,
        "email": settings_row.email if settings_row else None,
    }

    # Build client details dict for the PDF.
    client_detail = {
        "name": client.legal_name if client else None,
        "legal_name": client.legal_name if client else None,
        "address_line1": client.address_line1 if client else None,
        "address_line2": client.address_line2 if client else None,
        "city": client.city if client else None,
        "state": client.state if client else None,
        "pincode": client.pincode if client else None,
        "gstin": client.gstin if client else None,
    } if client else None

    # Generate the PDF.
    pdf_bytes = generate_invoice_pdf(
        {
            "invoice_number": invoice.invoice_number,
            "invoice_date": invoice.invoice_date.isoformat() if invoice.invoice_date else None,
            "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
            "subtotal": invoice.subtotal,
            "cgst_amount": invoice.cgst_amount,
            "sgst_amount": invoice.sgst_amount,
            "igst_amount": invoice.igst_amount,
            "total": invoice.total,
        },
        client_detail,
        firm,
        lines,
    )

    file_name = f"Invoice_{invoice.invoice_number or invoice.id}.pdf".replace("/", "_").replace(":", "_")
    caption = f"Invoice {invoice.invoice_number}" + (f"\n{message}" if message else "")

    result = await _gateway().send_media(phone, pdf_bytes, file_name, caption)

    if not result.get("success"):
        return {
            "invoice_id": str(invoice.id),
            "invoice_number": invoice.invoice_number,
            "recipient": phone,
            "status": "failed",
            "detail": result.get("error", "Unknown gateway error"),
        }

    return {
        "invoice_id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "recipient": phone,
        "status": "sent",
        "detail": f"Invoice PDF sent to {recipient_label or phone}",
    }
