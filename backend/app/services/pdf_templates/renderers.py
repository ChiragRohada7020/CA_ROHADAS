"""PDF invoice template renderers using ReportLab.

Six genuinely distinct invoice template layouts for Indian CA firms:

- modern        : Modern Fintech — asymmetric composition, firm left / invoice # + amount right,
                   two-column billing + metadata, prominent totals panel.
- editorial     : Editorial Luxury — elegant typography, generous whitespace, unboxed billing,
                   fine horizontal dividers, sophisticated document composition.
- corporate     : Corporate GST — structured seller/buyer blocks, dedicated GST particulars panel
                   (CGST/SGST/IGST), bank details, declaration, authorised signatory area.
- corporate_premium : Split-Panel Premium — distinctive split composition with firm branding left
                       and invoice metadata right, visually separate billing / info / payment sections.
- minimal       : Minimal Architectural — strict grid, precise alignment, thin rules, no decorative
                   boxes, clean financial summaries.
- bold          : Bold Creative — oversized typography, strong visual hierarchy, amber-accented
                   header, emphasized grand-total panel.

All remaining template IDs (classic, compact, fintech, ca_professional, elegant, fresh, heritage)
are mapped onto one of these six core layouts while preserving their accent color theme.

GST compliance is preserved across all templates: seller/recipient GSTIN, place of supply,
SAC/HSN, taxable values, CGST/SGST/IGST breakdown, reverse-charge handling, and totals.
"""

from __future__ import annotations

from io import BytesIO
from decimal import Decimal

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable,
)

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _money(value):
    """Format a monetary value as `Rs.1,234.56` — Helvetica does not have the ₹ glyph."""
    if value is None:
        value = 0
    return f"Rs.{float(value):,.2f}"


def _styles(theme):
    primary = theme["primary"]
    text = theme["text"]
    muted = theme["muted"]
    border = theme["border"]
    accent = theme.get("accent", primary)
    return {
        "firmName": ParagraphStyle("firmName", fontName="Helvetica-Bold", fontSize=15, textColor=HexColor(primary), leading=18),
        "firmMeta": ParagraphStyle("firmMeta", fontName="Helvetica", fontSize=7.5, textColor=HexColor(muted), leading=9.5),
        "docTitle": ParagraphStyle("docTitle", fontName="Helvetica-Bold", fontSize=13, textColor=white, leading=16),
        "docMetaLabel": ParagraphStyle("docMetaLabel", fontName="Helvetica-Bold", fontSize=7, textColor=HexColor(muted), leading=9),
        "docMetaValue": ParagraphStyle("docMetaValue", fontName="Helvetica", fontSize=8, textColor=HexColor(text), leading=10, splitLongWords=1),
        "partyLabel": ParagraphStyle("partyLabel", fontName="Helvetica-Bold", fontSize=8, textColor=HexColor(primary), leading=10),
        "partyText": ParagraphStyle("partyText", fontName="Helvetica", fontSize=8, textColor=HexColor(text), leading=10, splitLongWords=1),
        "partySmall": ParagraphStyle("partySmall", fontName="Helvetica", fontSize=7, textColor=HexColor(muted), leading=9, splitLongWords=1),
        "tableHeader": ParagraphStyle("tableHeader", fontName="Helvetica-Bold", fontSize=7.5, textColor=HexColor(primary), leading=9.5, alignment=TA_LEFT),
        "tableCell": ParagraphStyle("tableCell", fontName="Helvetica", fontSize=7.5, textColor=HexColor(text), leading=9.5, alignment=TA_LEFT, splitLongWords=1),
        "tableCellRight": ParagraphStyle("tableCellRight", fontName="Helvetica", fontSize=7.5, textColor=HexColor(text), leading=9.5, alignment=TA_RIGHT, splitLongWords=1),
        "tableCellBold": ParagraphStyle("tableCellBold", fontName="Helvetica-Bold", fontSize=7.5, textColor=HexColor(text), leading=9.5, alignment=TA_LEFT),
        "tableCellRightBold": ParagraphStyle("tableCellRightBold", fontName="Helvetica-Bold", fontSize=7.5, textColor=HexColor(text), leading=9.5, alignment=TA_RIGHT),
        "tableTotalLabel": ParagraphStyle("tableTotalLabel", fontName="Helvetica-Bold", fontSize=8, textColor=HexColor(text), leading=10, alignment=TA_RIGHT),
        "tableTotalValue": ParagraphStyle("tableTotalValue", fontName="Helvetica-Bold", fontSize=8, textColor=HexColor(text), leading=10, alignment=TA_RIGHT),
        "sectionTitle": ParagraphStyle("sectionTitle", fontName="Helvetica-Bold", fontSize=8.5, textColor=HexColor(primary), leading=10.5),
        "noteText": ParagraphStyle("noteText", fontName="Helvetica", fontSize=7.5, textColor=HexColor(muted), leading=9.5),
        "bankText": ParagraphStyle("bankText", fontName="Helvetica", fontSize=7.5, textColor=HexColor(text), leading=9.5),
        "signatureLabel": ParagraphStyle("signatureLabel", fontName="Helvetica", fontSize=7.5, textColor=HexColor(muted), leading=9.5, alignment=TA_CENTER),
        "amountInWords": ParagraphStyle("amountInWords", fontName="Helvetica-Bold", fontSize=8, textColor=HexColor(text), leading=10),
    }


def _party_lines(s, party):
    """Return a list of Paragraphs for one party block."""
    lines = [
        Paragraph(party.get("name", ""), ParagraphStyle("pn", parent=s["partyText"], fontName="Helvetica-Bold")),
    ]
    addr_parts = [p for p in [party.get("address"), party.get("city"), party.get("state"), party.get("pincode")] if p]
    if addr_parts:
        lines.append(Paragraph(", ".join(addr_parts), s["partyText"]))
    id_parts = []
    if party.get("gstin"):
        id_parts.append(f"GSTIN: {party['gstin']}")
    if party.get("pan"):
        id_parts.append(f"PAN: {party['pan']}")
    if id_parts:
        lines.append(Paragraph(" | ".join(id_parts), ParagraphStyle("pid", parent=s["partySmall"])))
    if party.get("email"):
        lines.append(Paragraph(party["email"], s["partySmall"]))
    if party.get("phone"):
        lines.append(Paragraph(party["phone"], s["partySmall"]))
    return lines


def _party_block(s, label, party, theme):
    """Build a two-column party table cell (label + details)."""
    if not party:
        return ""
    details = _party_lines(s, party)
    return Table(
        [[Paragraph(label, ParagraphStyle("lbl", parent=s["partyLabel"], textColor=HexColor(theme["primary"])))]] + [[d] for d in details],
        colWidths=[CONTENT_W / 2],
    )


def _items_table(s, theme, items, compact=False):
    """Build the line-item table with repeated header row."""
    header = [
        Paragraph("S.No", s["tableHeader"]),
        Paragraph("Description of goods / services", s["tableHeader"]),
        Paragraph("HSN / SAC", s["tableHeader"]),
        Paragraph("Qty", ParagraphStyle("hq", parent=s["tableHeader"], alignment=TA_RIGHT)),
        Paragraph("Rate", ParagraphStyle("hr", parent=s["tableHeader"], alignment=TA_RIGHT)),
        Paragraph("Amount", ParagraphStyle("ha", parent=s["tableHeader"], alignment=TA_RIGHT)),
    ]
    data = [header]
    for idx, it in enumerate(items, start=1):
        data.append([
            Paragraph(str(idx), s["tableCell"]),
            Paragraph(it.get("description", ""), s["tableCell"]),
            Paragraph(it.get("hsnSac", ""), s["tableCell"]),
            Paragraph(str(it.get("quantity", "")), ParagraphStyle("cq", parent=s["tableCellRight"])),
            Paragraph(_money(it.get("rate", 0)), ParagraphStyle("cr", parent=s["tableCellRight"])),
            Paragraph(_money(it.get("amount", 0)), ParagraphStyle("ca", parent=s["tableCellRight"])),
        ])
    col_w = [10 * mm, 62 * mm, 20 * mm, 14 * mm, 28 * mm, 28 * mm] if not compact else [8 * mm, 70 * mm, 22 * mm, 12 * mm, 24 * mm, 24 * mm]
    tbl = Table(data, colWidths=col_w, repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor(theme["primary"])),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, HexColor(theme["border"])),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, HexColor(theme["rowAlt"])]),
    ]))
    return tbl


def _totals_table(s, theme, totals, is_inter, accent_color=None):
    """Build the totals panel. Returns a Table."""
    taxable = totals.get("taxableValue", 0)
    cgst = totals.get("cgst", 0)
    sgst = totals.get("sgst", 0)
    igst = totals.get("igst", 0)
    discount = totals.get("discount", 0)
    grand = totals.get("grandTotal", 0)

    rows = []
    if discount > 0:
        rows.append([Paragraph("Discount", s["tableTotalLabel"]), Paragraph(f"-{_money(discount)}", s["tableTotalValue"])])
    rows.append([Paragraph("Taxable Value", s["tableTotalLabel"]), Paragraph(_money(taxable), s["tableTotalValue"])])
    if is_inter:
        rows.append([Paragraph(f"IGST @ {totals.get('taxRate', 0)}%", s["tableTotalLabel"]), Paragraph(_money(igst), s["tableTotalValue"])])
    else:
        rows.append([Paragraph(f"CGST @ {totals.get('taxRate', 0) / 2}%", s["tableTotalLabel"]), Paragraph(_money(cgst), s["tableTotalValue"])])
        rows.append([Paragraph(f"SGST @ {totals.get('taxRate', 0) / 2}%", s["tableTotalLabel"]), Paragraph(_money(sgst), s["tableTotalValue"])])
    rows.append([Paragraph("Grand Total", ParagraphStyle("gt", parent=s["tableTotalLabel"], fontSize=9, textColor=HexColor(accent_color or theme["primaryDark"]))),
                 Paragraph(_money(grand), ParagraphStyle("gtv", parent=s["tableTotalValue"], fontSize=9, textColor=HexColor(accent_color or theme["primaryDark"])))])

    tbl = Table(rows, colWidths=[CONTENT_W - 40 * mm, 40 * mm])
    tbl.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
        ("LINEABOVE", (0, -1), (-1, -1), 1, HexColor(theme["primary"])),
        ("LINEBELOW", (0, -1), (-1, -1), 1, HexColor(theme["primary"])),
    ]))
    return tbl


def _footer(canvas, doc_, theme, invoice_number):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(HexColor(theme["muted"]))
    canvas.drawString(MARGIN, 10 * mm, "This is a computer-generated invoice.")
    if invoice_number:
        canvas.drawRightString(PAGE_W - MARGIN, 10 * mm, f"Invoice {invoice_number}  ·  Page {doc_.page}")
    else:
        canvas.drawRightString(PAGE_W - MARGIN, 10 * mm, f"Page {doc_.page}")
    canvas.restoreState()


# ---------------------------------------------------------------------------
# Template 1: MODERN (Modern Fintech) — asymmetric composition
# ---------------------------------------------------------------------------

def _render_modern(ctx, theme, s):
    inv = ctx.get("invoice", ctx)
    meta = inv.get("meta", {})
    seller = inv.get("seller", {})
    buyer = inv.get("buyer", {})
    items = inv.get("items", [])
    totals = inv.get("totals", {})
    notes = inv.get("notes", "")
    terms = inv.get("termsAndConditions", "")
    bank = inv.get("bankDetails")
    is_inter = inv.get("isInterState", False)

    story = []

    # Asymmetric header: firm left, invoice # + amount right
    header = Table(
        [
            [
                Paragraph(seller.get("name", "CA Firm"), ParagraphStyle("fn", parent=s["firmName"], textColor=HexColor(theme["primary"]))),
                Paragraph("TAX INVOICE", ParagraphStyle("ti", parent=s["docTitle"], alignment=TA_RIGHT)),
            ],
        ],
        colWidths=[CONTENT_W - 55 * mm, 55 * mm],
    )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header)
    story.append(Spacer(1, 2 * mm))
    # Firm meta under name
    firm_meta_parts = []
    addr = ", ".join(filter(None, [seller.get("address"), seller.get("city"), seller.get("state"), seller.get("pincode")]))
    if addr:
        firm_meta_parts.append(addr)
    ids = []
    if seller.get("gstin"):
        ids.append(f"GSTIN: {seller['gstin']}")
    if seller.get("pan"):
        ids.append(f"PAN: {seller['pan']}")
    if ids:
        firm_meta_parts.append(" | ".join(ids))
    if seller.get("email"):
        firm_meta_parts.append(seller["email"])
    if seller.get("phone"):
        firm_meta_parts.append(seller["phone"])
    if firm_meta_parts:
        story.append(Paragraph(" · ".join(firm_meta_parts), s["firmMeta"]))
    story.append(Spacer(1, 4 * mm))
    story.append(HRFlowable(width="100%", thickness=2, color=HexColor(theme["primary"]), spaceAfter=4))

    # Invoice number + amount due on the right
    meta_rows = [
        [Paragraph(f"Invoice No: {meta.get('invoiceNumber', '')}", s["docMetaValue"]),
         Paragraph(_money(totals.get("grandTotal", 0)), ParagraphStyle("amt", parent=s["docMetaValue"], fontName="Helvetica-Bold", textColor=HexColor(theme["primary"])))],
        [Paragraph(f"Date: {meta.get('invoiceDate', '')}", s["docMetaValue"]), ""],
    ]
    if meta.get("dueDate"):
        meta_rows.append([Paragraph(f"Due Date: {meta['dueDate']}", s["docMetaValue"]), ""])
    meta_tbl = Table(meta_rows, colWidths=[CONTENT_W - 55 * mm, 55 * mm])
    meta_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    story.append(meta_tbl)
    story.append(Spacer(1, 6 * mm))

    # Two-column billing + metadata
    story.append(Paragraph("Bill to", ParagraphStyle("lbl", parent=s["partyLabel"], textColor=HexColor(theme["primary"]))))
    buyer_tbl = Table([_party_lines(s, buyer)], colWidths=[CONTENT_W / 2])
    buyer_tbl.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story.append(buyer_tbl)
    story.append(Spacer(1, 4 * mm))

    meta_panel_rows = [
        [Paragraph("Status", s["docMetaLabel"]), Paragraph("Issued", s["docMetaValue"])],
        [Paragraph("Tax type", s["docMetaLabel"]), Paragraph("Inter-state" if is_inter else "Intra-state", s["docMetaValue"])],
    ]
    if inv.get("placeOfSupply"):
        meta_panel_rows.append([Paragraph("Place of supply", s["docMetaLabel"]), Paragraph(inv["placeOfSupply"], s["docMetaValue"])])
    meta_panel = Table(meta_panel_rows, colWidths=[CONTENT_W / 2])
    meta_panel.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HexColor("#f5f5ff")),
        ("BOX", (0, 0), (-1, -1), 0.8, HexColor(theme["primary"])),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, HexColor("#e5e7eb")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    # Side-by-side: buyer left, meta panel right
    side_by_side = Table([[buyer_tbl, meta_panel]], colWidths=[CONTENT_W * 0.55, CONTENT_W * 0.45])
    side_by_side.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(side_by_side)
    story.append(Spacer(1, 8 * mm))

    # Line items
    story.append(_items_table(s, theme, items))
    story.append(Spacer(1, 6 * mm))

    # Prominent totals panel (right-aligned)
    totals_panel = Table([[Paragraph("Totals", ParagraphStyle("tot", parent=s["sectionTitle"], textColor=HexColor(theme["primary"])))], [_totals_table(s, theme, totals, is_inter)]], colWidths=[CONTENT_W])
    totals_panel.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor(theme["primary"])),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("BACKGROUND", (0, 1), (-1, 1), HexColor("#f5f5ff")),
        ("BOX", (0, 0), (-1, -1), 1, HexColor(theme["primary"])),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(totals_panel)
    story.append(Spacer(1, 6 * mm))

    # Payment info
    if bank:
        story.append(Paragraph("Payment information", s["sectionTitle"]))
        story.append(Spacer(1, 1 * mm))
        bank_lines = []
        if bank.get("bank_name"):
            bank_lines.append(f"Bank: {bank['bank_name']}")
        if bank.get("account_number"):
            bank_lines.append(f"A/c No: {bank['account_number']}")
        if bank.get("ifsc"):
            bank_lines.append(f"IFSC: {bank['ifsc']}")
        if bank.get("upi_id"):
            bank_lines.append(f"UPI ID: {bank['upi_id']}")
        if bank_lines:
            story.append(Paragraph(" | ".join(bank_lines), s["bankText"]))
            story.append(Spacer(1, 4 * mm))

    # Terms & notes
    if notes or terms:
        story.append(Paragraph("Terms & notes", s["sectionTitle"]))
        story.append(Spacer(1, 1 * mm))
        if notes:
            story.append(Paragraph(f"Notes: {notes}", s["noteText"]))
            story.append(Spacer(1, 1 * mm))
        if terms:
            story.append(Paragraph(f"Terms: {terms}", s["noteText"]))

    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=0.6, color=HexColor(theme["border"]), spaceAfter=2))
    story.append(Paragraph("Authorised Signatory", s["signatureLabel"]))

    return story


# ---------------------------------------------------------------------------
# Template 2: EDITORIAL (Editorial Luxury) — elegant typography, whitespace
# ---------------------------------------------------------------------------

def _render_editorial(ctx, theme, s):
    inv = ctx.get("invoice", ctx)
    meta = inv.get("meta", {})
    seller = inv.get("seller", {})
    buyer = inv.get("buyer", {})
    items = inv.get("items", [])
    totals = inv.get("totals", {})
    notes = inv.get("notes", "")
    terms = inv.get("termsAndConditions", "")
    is_inter = inv.get("isInterState", False)

    story = []

    # Large invoice heading, firm name prominent
    story.append(Paragraph(seller.get("name", "CA Firm"), ParagraphStyle("fn", parent=s["firmName"], fontSize=20, textColor=HexColor(theme["primary"]), leading=24)))
    story.append(Spacer(1, 2 * mm))
    addr = ", ".join(filter(None, [seller.get("address"), seller.get("city"), seller.get("state"), seller.get("pincode")]))
    if addr:
        story.append(Paragraph(addr, s["firmMeta"]))
    ids = []
    if seller.get("gstin"):
        ids.append(f"GSTIN: {seller['gstin']}")
    if seller.get("pan"):
        ids.append(f"PAN: {seller['pan']}")
    if ids:
        story.append(Paragraph(" | ".join(ids), s["firmMeta"]))
    story.append(Spacer(1, 5 * mm))
    story.append(HRFlowable(width="100%", thickness=0.6, color=HexColor(theme["border"]), spaceAfter=5))

    # Title right-aligned
    title_tbl = Table([[Paragraph("Tax invoice", ParagraphStyle("ti", parent=s["docTitle"], alignment=TA_RIGHT, fontSize=14))]], colWidths=[CONTENT_W])
    title_tbl.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story.append(title_tbl)
    story.append(Spacer(1, 2 * mm))
    meta_line = f"INV-{meta.get('invoiceNumber', '')}   ·   {meta.get('invoiceDate', '')}   ·   Due {meta.get('dueDate', '')}"
    story.append(Paragraph(meta_line, ParagraphStyle("ml", parent=s["docMetaValue"], fontSize=9, alignment=TA_RIGHT)))
    story.append(Spacer(1, 8 * mm))

    # Unboxed billing info — two columns, no boxes
    bill_tbl = Table([
        [Paragraph("Bill to", ParagraphStyle("bl", parent=s["partyLabel"], textColor=HexColor(theme["primary"]))),
         Paragraph("From", ParagraphStyle("fr", parent=s["partyLabel"], textColor=HexColor(theme["primary"])))],
        [_party_lines(s, buyer), _party_lines(s, seller)],
    ], colWidths=[CONTENT_W / 2, CONTENT_W / 2])
    bill_tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 1), (0, 1), 6)]))
    story.append(bill_tbl)
    story.append(Spacer(1, 6 * mm))

    # Metadata strip (unboxed)
    strip_rows = [
        [Paragraph("Status", s["docMetaLabel"]), Paragraph("Issued", s["docMetaValue"])],
        [Paragraph("Tax type", s["docMetaLabel"]), Paragraph("Inter-state" if is_inter else "Intra-state", s["docMetaValue"])],
    ]
    if inv.get("placeOfSupply"):
        strip_rows.append([Paragraph("Place of supply", s["docMetaLabel"]), Paragraph(inv["placeOfSupply"], s["docMetaValue"])])
    strip = Table(strip_rows, colWidths=[CONTENT_W * 0.3, CONTENT_W * 0.7])
    strip.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    story.append(strip)
    story.append(Spacer(1, 8 * mm))
    story.append(HRFlowable(width="100%", thickness=0.6, color=HexColor(theme["border"]), spaceAfter=5))

    # Line items
    story.append(_items_table(s, theme, items))
    story.append(Spacer(1, 8 * mm))

    # Editorial totals section (right-aligned, italic feel)
    totals_panel = Table([[Paragraph("Amount due", ParagraphStyle("ad", parent=s["sectionTitle"], textColor=HexColor(theme["primary"])))], [_totals_table(s, theme, totals, is_inter)]], colWidths=[CONTENT_W])
    totals_panel.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor(theme["background"])),
        ("BOX", (0, 0), (-1, -1), 0.6, HexColor(theme["border"])),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(totals_panel)
    story.append(Spacer(1, 8 * mm))

    if notes or terms:
        story.append(Paragraph("Terms & notes", s["sectionTitle"]))
        story.append(Spacer(1, 1 * mm))
        if notes:
            story.append(Paragraph(f"Notes: {notes}", s["noteText"]))
            story.append(Spacer(1, 1 * mm))
        if terms:
            story.append(Paragraph(f"Terms: {terms}", s["noteText"]))

    story.append(Spacer(1, 8 * mm))
    story.append(HRFlowable(width="100%", thickness=0.6, color=HexColor(theme["border"]), spaceAfter=2))
    story.append(Paragraph("Authorised Signatory", s["signatureLabel"]))

    return story


# ---------------------------------------------------------------------------
# Template 3: CORPORATE (Corporate GST) — structured GST breakdown
# ---------------------------------------------------------------------------

def _render_corporate(ctx, theme, s):
    inv = ctx.get("invoice", ctx)
    meta = inv.get("meta", {})
    seller = inv.get("seller", {})
    buyer = inv.get("buyer", {})
    items = inv.get("items", [])
    totals = inv.get("totals", {})
    notes = inv.get("notes", "")
    terms = inv.get("termsAndConditions", "")
    bank = inv.get("bankDetails")
    is_inter = inv.get("isInterState", False)

    story = []

    # Header band: firm left, title right
    header = Table(
        [
            [
                Paragraph(seller.get("name", "CA Firm").upper(), ParagraphStyle("fn", parent=s["firmName"], textColor=white)),
                Paragraph("TAX INVOICE", ParagraphStyle("ti", parent=s["docTitle"], alignment=TA_CENTER)),
            ],
        ],
        colWidths=[CONTENT_W - 50 * mm, 50 * mm],
    )
    header.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HexColor(theme["primary"])),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (0, 0), 8),
        ("RIGHTPADDING", (-1, -1), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(header)
    story.append(Spacer(1, 5 * mm))

    # Seller / buyer blocks
    seller_tbl = Table([_party_lines(s, seller)], colWidths=[CONTENT_W / 2])
    seller_tbl.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    buyer_tbl = Table([_party_lines(s, buyer)], colWidths=[CONTENT_W / 2])
    buyer_tbl.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    from_label = Paragraph("From (Seller)", ParagraphStyle("sl", parent=s["partyLabel"], textColor=HexColor(theme["primary"])))
    to_label = Paragraph("To (Buyer)", ParagraphStyle("tl", parent=s["partyLabel"], textColor=HexColor(theme["primary"])))
    parties = Table([[from_label, to_label], [seller_tbl, buyer_tbl]], colWidths=[CONTENT_W / 2, CONTENT_W / 2])
    parties.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 1), (0, 1), 4)]))
    story.append(parties)
    story.append(Spacer(1, 6 * mm))

    # GST particulars panel
    story.append(Paragraph("GST invoice particulars", ParagraphStyle("gst", parent=s["sectionTitle"], textColor=HexColor(theme["primary"]))))
    story.append(Spacer(1, 1 * mm))
    gst_rows = [
        [Paragraph("Place of supply", s["docMetaLabel"]), Paragraph(inv.get("placeOfSupply", "-") or "-", s["docMetaValue"])],
        [Paragraph("Reverse charge", s["docMetaLabel"]), Paragraph("No", s["docMetaValue"])],
        [Paragraph("Tax type", s["docMetaLabel"]), Paragraph("Inter-state (IGST)" if is_inter else "Intra-state (CGST + SGST)", s["docMetaValue"])],
        [Paragraph("GST rate", s["docMetaLabel"]), Paragraph(f'{totals.get("taxRate", 0)}%', s["docMetaValue"])],
    ]
    gst_tbl = Table(gst_rows, colWidths=[CONTENT_W * 0.35, CONTENT_W * 0.65])
    gst_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HexColor(theme["background"])),
        ("BOX", (0, 0), (-1, -1), 0.8, HexColor(theme["border"])),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, HexColor(theme["border"])),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(gst_tbl)
    story.append(Spacer(1, 8 * mm))

    # Line items
    story.append(_items_table(s, theme, items))
    story.append(Spacer(1, 6 * mm))

    # Amount due panel
    totals_panel = Table([[Paragraph("Amount due", ParagraphStyle("ad", parent=s["sectionTitle"], textColor=HexColor(theme["primary"])))], [_totals_table(s, theme, totals, is_inter)]], colWidths=[CONTENT_W])
    totals_panel.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor(theme["primary"])),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("BACKGROUND", (0, 1), (-1, 1), HexColor("#f8f9fc")),
        ("BOX", (0, 0), (-1, -1), 1, HexColor(theme["primary"])),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(totals_panel)
    story.append(Spacer(1, 8 * mm))

    # Bank details
    if bank:
        story.append(Paragraph("Bank details", ParagraphStyle("bd", parent=s["sectionTitle"], textColor=HexColor(theme["primary"]))))
        story.append(Spacer(1, 1 * mm))
        bank_lines = []
        if bank.get("bank_name"):
            bank_lines.append(f"Bank: {bank['bank_name']}")
        if bank.get("account_name"):
            bank_lines.append(f"Account name: {bank['account_name']}")
        if bank.get("account_number"):
            bank_lines.append(f"A/c No: {bank['account_number']}")
        if bank.get("ifsc"):
            bank_lines.append(f"IFSC: {bank['ifsc']}")
        if bank.get("upi_id"):
            bank_lines.append(f"UPI ID: {bank['upi_id']}")
        if bank_lines:
            story.append(Paragraph(" | ".join(bank_lines), s["bankText"]))
            story.append(Spacer(1, 4 * mm))

    # Terms / declaration
    if terms:
        story.append(Paragraph("Declaration", ParagraphStyle("dec", parent=s["sectionTitle"], textColor=HexColor(theme["primary"]))))
        story.append(Spacer(1, 1 * mm))
        story.append(Paragraph(terms, s["noteText"]))
        story.append(Spacer(1, 4 * mm))

    if notes:
        story.append(Paragraph("Notes", ParagraphStyle("nt", parent=s["sectionTitle"], textColor=HexColor(theme["primary"]))))
        story.append(Spacer(1, 1 * mm))
        story.append(Paragraph(notes, s["noteText"]))
        story.append(Spacer(1, 6 * mm))

    # Signature area
    sig = Table([[Paragraph("Authorised Signatory", s["signatureLabel"]), ""]], colWidths=[CONTENT_W / 2, CONTENT_W / 2])
    sig.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 14), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    story.append(sig)

    return story


# ---------------------------------------------------------------------------
# Template 4: CORPORATE_PREMIUM (Split-Panel Premium) — split composition
# ---------------------------------------------------------------------------

def _render_split_panel(ctx, theme, s):
    inv = ctx.get("invoice", ctx)
    meta = inv.get("meta", {})
    seller = inv.get("seller", {})
    buyer = inv.get("buyer", {})
    items = inv.get("items", [])
    totals = inv.get("totals", {})
    notes = inv.get("notes", "")
    terms = inv.get("termsAndConditions", "")
    bank = inv.get("bankDetails")
    is_inter = inv.get("isInterState", False)

    story = []

    # Split header: logo mark + firm branding left, invoice metadata right
    logo = Table([[Paragraph("C", ParagraphStyle("lg", fontName="Helvetica-Bold", fontSize=14, textColor=white, alignment=TA_CENTER))]], colWidths=[10 * mm], rowHeights=[10 * mm])
    logo.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), HexColor(theme["primary"])), ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    firm_head = Table([[logo, Paragraph(seller.get("name", "CA Firm"), ParagraphStyle("fh", parent=s["firmName"], textColor=HexColor(theme["primary"])))]], colWidths=[14 * mm, CONTENT_W - 14 * mm - 60 * mm])
    firm_head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story.append(firm_head)
    story.append(Spacer(1, 2 * mm))
    addr = ", ".join(filter(None, [seller.get("address"), seller.get("city"), seller.get("state"), seller.get("pincode")]))
    if addr:
        story.append(Paragraph(addr, s["firmMeta"]))
    ids = []
    if seller.get("gstin"):
        ids.append(f"GSTIN: {seller['gstin']}")
    if seller.get("pan"):
        ids.append(f"PAN: {seller['pan']}")
    if ids:
        story.append(Paragraph(" | ".join(ids), s["firmMeta"]))
    story.append(Spacer(1, 6 * mm))

    # Right side: invoice meta + amount due
    meta_rows = [
        [Paragraph("TAX INVOICE", ParagraphStyle("ti2", parent=s["docTitle"], alignment=TA_RIGHT, fontSize=12))],
        [Paragraph(f"INV-{meta.get('invoiceNumber', '')}", ParagraphStyle("in", fontName="Helvetica-Bold", fontSize=14, textColor=HexColor(theme["primary"]), alignment=TA_RIGHT))],
        [Paragraph(f"Date: {meta.get('invoiceDate', '')}", s["docMetaValue"])],
        [Paragraph(f"Due: {meta.get('dueDate', '')}", s["docMetaValue"])],
        [Paragraph(f"Amount due: {_money(totals.get('grandTotal', 0))}", ParagraphStyle("ad", fontName="Helvetica-Bold", fontSize=11, textColor=HexColor(theme["primary"]), alignment=TA_RIGHT))],
    ]
    meta_tbl = Table(meta_rows, colWidths=[60 * mm])
    meta_tbl.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    story.append(meta_tbl)
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=2, color=HexColor(theme["primary"]), spaceAfter=4))

    # Separate billing section
    story.append(Paragraph("Billing", ParagraphStyle("sec", parent=s["sectionTitle"], textColor=HexColor(theme["primary"]))))
    story.append(Spacer(1, 1 * mm))
    buyer_tbl = Table([_party_lines(s, buyer)], colWidths=[CONTENT_W])
    buyer_tbl.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story.append(buyer_tbl)
    story.append(Spacer(1, 2 * mm))
    meta_panel_rows = [
        [Paragraph("Tax type", s["docMetaLabel"]), Paragraph("Inter-state" if is_inter else "Intra-state", s["docMetaValue"])],
        [Paragraph("GST rate", s["docMetaLabel"]), Paragraph(f'{totals.get("taxRate", 0)}%', s["docMetaValue"])],
    ]
    if inv.get("placeOfSupply"):
        meta_panel_rows.append([Paragraph("Place of supply", s["docMetaLabel"]), Paragraph(inv["placeOfSupply"], s["docMetaValue"])])
    meta_panel = Table(meta_panel_rows, colWidths=[CONTENT_W / 2, CONTENT_W / 2])
    meta_panel.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HexColor(theme["background"])),
        ("BOX", (0, 0), (-1, -1), 0.8, HexColor(theme["border"])),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, HexColor(theme["border"])),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(meta_panel)
    story.append(Spacer(1, 8 * mm))

    # Line items
    story.append(_items_table(s, theme, items))
    story.append(Spacer(1, 8 * mm))

    # Payment summary panel
    totals_panel = Table([[Paragraph("Payment summary", ParagraphStyle("ps", parent=s["sectionTitle"], textColor=HexColor(theme["primary"])))], [_totals_table(s, theme, totals, is_inter)]], colWidths=[CONTENT_W])
    totals_panel.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor(theme["primary"])),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("BACKGROUND", (0, 1), (-1, 1), HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 1, HexColor(theme["primary"])),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(totals_panel)
    story.append(Spacer(1, 8 * mm))

    # Bank details + terms side by side
    bottom_rows = []
    left_cell = ""
    if bank:
        bank_lines = []
        if bank.get("bank_name"):
            bank_lines.append(f"Bank: {bank['bank_name']}")
        if bank.get("account_number"):
            bank_lines.append(f"A/c No: {bank['account_number']}")
        if bank.get("ifsc"):
            bank_lines.append(f"IFSC: {bank['ifsc']}")
        if bank.get("upi_id"):
            bank_lines.append(f"UPI ID: {bank['upi_id']}")
        if bank_lines:
            left_cell = Paragraph("<b>Payment details</b><br/>" + "<br/>".join(bank_lines), s["bankText"])
    right_cell = ""
    if terms:
        right_cell = Paragraph("<b>Terms</b><br/>" + terms, s["noteText"])
    bottom = Table([[left_cell, right_cell]], colWidths=[CONTENT_W / 2, CONTENT_W / 2])
    bottom.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story.append(bottom)
    story.append(Spacer(1, 8 * mm))

    if notes:
        story.append(Paragraph("Notes", ParagraphStyle("nt2", parent=s["sectionTitle"], textColor=HexColor(theme["primary"]))))
        story.append(Spacer(1, 1 * mm))
        story.append(Paragraph(notes, s["noteText"]))
        story.append(Spacer(1, 6 * mm))

    story.append(HRFlowable(width="100%", thickness=0.6, color=HexColor(theme["border"]), spaceAfter=2))
    story.append(Paragraph("Authorised signatory", s["signatureLabel"]))

    return story


# ---------------------------------------------------------------------------
# Template 5: MINIMAL (Minimal Architectural) — strict grid, thin rules
# ---------------------------------------------------------------------------

def _render_minimal(ctx, theme, s):
    inv = ctx.get("invoice", ctx)
    meta = inv.get("meta", {})
    seller = inv.get("seller", {})
    buyer = inv.get("buyer", {})
    items = inv.get("items", [])
    totals = inv.get("totals", {})
    notes = inv.get("notes", "")
    terms = inv.get("termsAndConditions", "")
    is_inter = inv.get("isInterState", False)

    story = []

    # Strict grid header: seller left 3 cols, invoice meta right 1 col
    header = Table([
        [
            Paragraph(seller.get("name", "CA Firm"), ParagraphStyle("fn", parent=s["firmName"], fontSize=13, textColor=HexColor(theme["primary"]))),
            Paragraph(f"INV-{meta.get('invoiceNumber', '')}", ParagraphStyle("in", fontName="Helvetica-Bold", fontSize=10, textColor=HexColor(theme["text"]), alignment=TA_RIGHT)),
        ],
        [
            Paragraph(", ".join(filter(None, [seller.get("address"), seller.get("city"), seller.get("state"), seller.get("pincode")]) or ""), s["firmMeta"]),
            Paragraph(f"Date: {meta.get('invoiceDate', '')}", ParagraphStyle("dt", parent=s["docMetaValue"], alignment=TA_RIGHT)),
        ],
    ], colWidths=[CONTENT_W * 0.72, CONTENT_W * 0.28])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LINEBELOW", (0, -1), (-1, -1), 0.8, HexColor(theme["border"])),
    ]))
    story.append(header)
    story.append(Spacer(1, 6 * mm))

    # Buyer block (minimal)
    story.append(Paragraph("Bill to", ParagraphStyle("bl", parent=s["partyLabel"], textColor=HexColor(theme["muted"]))))
    buyer_tbl = Table([_party_lines(s, buyer)], colWidths=[CONTENT_W])
    buyer_tbl.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story.append(buyer_tbl)
    story.append(Spacer(1, 8 * mm))

    # Line items — clean, thin rules
    story.append(_items_table(s, theme, items, compact=False))
    story.append(Spacer(1, 8 * mm))

    # Clean financial summary (right-aligned)
    totals_panel = Table([[_totals_table(s, theme, totals, is_inter)]], colWidths=[CONTENT_W])
    totals_panel.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, HexColor(theme["border"])),
    ]))
    story.append(totals_panel)
    story.append(Spacer(1, 10 * mm))

    if notes:
        story.append(Paragraph(notes, s["noteText"]))
        story.append(Spacer(1, 4 * mm))
    if terms:
        story.append(Paragraph(terms, s["noteText"]))

    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=0.4, color=HexColor(theme["border"]), spaceAfter=2))
    story.append(Paragraph("Authorised Signatory", s["signatureLabel"]))

    return story


# ---------------------------------------------------------------------------
# Template 6: BOLD (Bold Creative) — oversized typography, emphasized total
# ---------------------------------------------------------------------------

def _render_bold(ctx, theme, s):
    inv = ctx.get("invoice", ctx)
    meta = inv.get("meta", {})
    seller = inv.get("seller", {})
    buyer = inv.get("buyer", {})
    items = inv.get("items", [])
    totals = inv.get("totals", {})
    notes = inv.get("notes", "")
    terms = inv.get("termsAndConditions", "")
    bank = inv.get("bankDetails")
    is_inter = inv.get("isInterState", False)

    story = []

    # Oversized header band: firm name + TAX INVOICE
    header = Table(
        [
            [
                Paragraph(seller.get("name", "CA Firm").upper(), ParagraphStyle("fn", fontName="Helvetica-Bold", fontSize=18, textColor=white, leading=22)),
                Paragraph("TAX INVOICE", ParagraphStyle("ti", fontName="Helvetica-Bold", fontSize=14, textColor=white, alignment=TA_RIGHT)),
            ],
        ],
        colWidths=[CONTENT_W - 55 * mm, 55 * mm],
    )
    header.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HexColor(theme["primary"])),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (0, 0), 10),
        ("RIGHTPADDING", (-1, -1), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ]))
    story.append(header)
    story.append(Spacer(1, 6 * mm))

    # Firm details under band
    addr = ", ".join(filter(None, [seller.get("address"), seller.get("city"), seller.get("state"), seller.get("pincode")]))
    if addr:
        story.append(Paragraph(addr, ParagraphStyle("addr", parent=s["firmMeta"], fontSize=8, textColor=HexColor(theme["muted"]))))
    ids = []
    if seller.get("gstin"):
        ids.append(f"GSTIN: {seller['gstin']}")
    if seller.get("pan"):
        ids.append(f"PAN: {seller['pan']}")
    if ids:
        story.append(Paragraph(" | ".join(ids), ParagraphStyle("ids", parent=s["firmMeta"], fontSize=8, textColor=HexColor(theme["muted"]))))
    story.append(Spacer(1, 8 * mm))
    story.append(HRFlowable(width="100%", thickness=3, color=HexColor(theme.get("accent", theme["primary"])), spaceAfter=4))

    # Bill to + From
    seller_tbl = Table([_party_lines(s, seller)], colWidths=[CONTENT_W / 2])
    seller_tbl.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    buyer_tbl = Table([_party_lines(s, buyer)], colWidths=[CONTENT_W / 2])
    buyer_tbl.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    from_label = Paragraph("From", ParagraphStyle("fl", parent=s["partyLabel"], fontSize=9, textColor=HexColor(theme["primary"])))
    to_label = Paragraph("Bill to", ParagraphStyle("bl", parent=s["partyLabel"], fontSize=9, textColor=HexColor(theme["primary"])))
    parties = Table([[from_label, to_label], [seller_tbl, buyer_tbl]], colWidths=[CONTENT_W / 2, CONTENT_W / 2])
    parties.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 1), (0, 1), 4)]))
    story.append(parties)
    story.append(Spacer(1, 6 * mm))

    # Particulars strip
    strip_rows = [
        [Paragraph("Place of supply", s["docMetaLabel"]), Paragraph(inv.get("placeOfSupply", "-") or "-", s["docMetaValue"])],
        [Paragraph("Tax type", s["docMetaLabel"]), Paragraph("Inter-state" if is_inter else "Intra-state", s["docMetaValue"])],
    ]
    strip = Table(strip_rows, colWidths=[CONTENT_W * 0.3, CONTENT_W * 0.7])
    strip.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.6, HexColor(theme["border"])), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    story.append(strip)
    story.append(Spacer(1, 8 * mm))

    # Line items
    story.append(_items_table(s, theme, items))
    story.append(Spacer(1, 8 * mm))

    # Emphasized grand total panel (colored background)
    totals_rows = []
    if totals.get("discount", 0) > 0:
        totals_rows.append([Paragraph("Discount", s["tableTotalLabel"]), Paragraph(f"-{_money(totals['discount'])}", s["tableTotalValue"])])
    totals_rows.append([Paragraph("Taxable Value", s["tableTotalLabel"]), Paragraph(_money(totals.get("taxableValue", 0)), s["tableTotalValue"])])
    if is_inter:
        totals_rows.append([Paragraph(f"IGST @ {totals.get('taxRate', 0)}%", s["tableTotalLabel"]), Paragraph(_money(totals.get("igst", 0)), s["tableTotalValue"])])
    else:
        totals_rows.append([Paragraph(f"CGST @ {totals.get('taxRate', 0) / 2}%", s["tableTotalLabel"]), Paragraph(_money(totals.get("cgst", 0)), s["tableTotalValue"])])
        totals_rows.append([Paragraph(f"SGST @ {totals.get('taxRate', 0) / 2}%", s["tableTotalLabel"]), Paragraph(_money(totals.get("sgst", 0)), s["tableTotalValue"])])
    totals_rows.append([Paragraph("GRAND TOTAL", ParagraphStyle("gt", parent=s["tableTotalLabel"], fontSize=10, textColor=white)), Paragraph(_money(totals.get("grandTotal", 0)), ParagraphStyle("gtv", parent=s["tableTotalValue"], fontSize=11, textColor=white))])

    totals_panel = Table(totals_rows, colWidths=[CONTENT_W - 40 * mm, 40 * mm])
    totals_panel.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BACKGROUND", (0, 0), (-1, -1), HexColor(theme["primary"])),
        ("TEXTCOLOR", (0, 0), (-1, -1), white),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEABOVE", (0, -1), (-1, -1), 1, HexColor(theme.get("accent", theme["primary"]))),
    ]))
    story.append(totals_panel)
    story.append(Spacer(1, 8 * mm))

    # Terms
    if terms:
        story.append(Paragraph("Terms", ParagraphStyle("tm", parent=s["sectionTitle"], textColor=HexColor(theme["primary"]))))
        story.append(Spacer(1, 1 * mm))
        story.append(Paragraph(terms, s["noteText"]))
        story.append(Spacer(1, 4 * mm))

    if notes:
        story.append(Paragraph(notes, s["noteText"]))
        story.append(Spacer(1, 6 * mm))

    story.append(HRFlowable(width="100%", thickness=2, color=HexColor(theme.get("accent", theme["primary"])), spaceAfter=2))
    story.append(Paragraph("Authorised signatory", ParagraphStyle("sig", parent=s["signatureLabel"], textColor=HexColor(theme["primary"]))))

    return story


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _money(value):
    """Format a monetary value as `₹1,234.56`."""
    if value is None:
        value = 0
    return f"₹{float(value):,.2f}"


def _P(text, style):
    return Paragraph(text, style)


def _render_modern_gst(ctx, theme, s):
    """Modern Indian GST Invoice — your exact reportlab template code."""
    from reportlab.lib import colors as _colors

    inv = ctx.get("invoice", ctx)
    meta = inv.get("meta", {})
    seller = inv.get("seller", {})
    buyer = inv.get("buyer", {})
    items = inv.get("items", [])
    totals = inv.get("totals", {})
    notes = inv.get("notes", "")
    terms = inv.get("termsAndConditions", "")
    bank = inv.get("bankDetails")
    is_inter = inv.get("isInterState", False)
    currency = inv.get("currency", "INR")

    NAVY = HexColor("#172B4D")
    BLUE = HexColor("#315EFB")
    PALE = HexColor("#F3F6FC")
    INK = HexColor("#243247")
    MUTED = HexColor("#68778D")
    LINE = HexColor("#E3E8F0")
    WHITE = _colors.white
    GREEN = HexColor("#14866D")

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Brand", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=NAVY))
    styles.add(ParagraphStyle(name="SmallMuted", parent=styles["Normal"], fontSize=8, leading=11, textColor=MUTED))
    styles.add(ParagraphStyle(name="Section", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=NAVY))
    styles.add(ParagraphStyle(name="BodySmall", parent=styles["Normal"], fontSize=8.5, leading=12, textColor=INK))
    styles.add(ParagraphStyle(name="RightSmall", parent=styles["BodySmall"], alignment=TA_RIGHT))
    styles.add(ParagraphStyle(name="TotalBig", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=WHITE, alignment=TA_RIGHT))
    styles.add(ParagraphStyle(name="WhiteSmall", parent=styles["Normal"], fontSize=8, leading=11, textColor=HexColor("#DCE6FF"), alignment=TA_RIGHT))
    styles.add(ParagraphStyle(name="TableHead", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=WHITE))
    styles.add(ParagraphStyle(name="TableCell", parent=styles["Normal"], fontSize=8, leading=10, textColor=INK))
    styles.add(ParagraphStyle(name="TableCellRight", parent=styles["TableCell"], alignment=TA_RIGHT))
    styles.add(ParagraphStyle(name="Footer", parent=styles["Normal"], fontSize=7.5, leading=10, textColor=MUTED))

    def P(txt, style="BodySmall"):
        return Paragraph(txt, styles[style])

    story = []

    # Header band
    header_left = [
        P(seller.get("name", "YOUR FIRM NAME"), "Brand"),
        P("Chartered Accountants", "SmallMuted"),
        Spacer(1, 4),
    ]
    firm_meta_parts = []
    addr = ", ".join(filter(None, [seller.get("address"), seller.get("city"), seller.get("state"), seller.get("pincode")]))
    if addr:
        firm_meta_parts.append(addr)
    ids = []
    if seller.get("gstin"):
        ids.append(f"GSTIN: {seller['gstin']}")
    if seller.get("pan"):
        ids.append(f"PAN: {seller['pan']}")
    if ids:
        firm_meta_parts.append(" | ".join(ids))
    if firm_meta_parts:
        header_left.append(P(" · ".join(firm_meta_parts), "SmallMuted"))

    header_right = [
        P("TAX INVOICE", "RightSmall"),
        P(f"<b>{meta.get('invoiceNumber', 'INV-2026-001')}</b>", "RightSmall"),
    ]
    meta_right_parts = []
    if meta.get("invoiceDate"):
        meta_right_parts.append(f"Invoice Date: {meta['invoiceDate']}")
    if meta.get("dueDate"):
        meta_right_parts.append(f"Due Date: {meta['dueDate']}")
    if inv.get("placeOfSupply"):
        meta_right_parts.append(f"Place of Supply: {inv['placeOfSupply']}")
    if meta_right_parts:
        header_right.append(P("<br/>".join(meta_right_parts), "RightSmall"))

    t = Table([[header_left, header_right]], colWidths=[105*mm, 71*mm])
    t.setStyle(TableStyle([
        ("VALIGN",(0,0),(-1,-1),"TOP"),
        ("ALIGN",(1,0),(1,0),"RIGHT"),
        ("LEFTPADDING",(0,0),(-1,-1),0),
        ("RIGHTPADDING",(0,0),(-1,-1),0),
        ("BOTTOMPADDING",(0,0),(-1,-1),10),
    ]))
    story.append(t)
    story.append(HRFlowable(width="100%", thickness=1.4, color=BLUE, spaceAfter=10))

    # Bill to / invoice meta
    left = [
        P("BILL TO", "Section"),
        Spacer(1,3),
    ]
    buyer_lines = []
    if buyer.get("name"):
        buyer_lines.append(f"<b>{buyer['name']}</b>")
    if buyer.get("contact_person"):
        buyer_lines.append(f"Contact Person: {buyer['contact_person']}")
    if buyer.get("address") or buyer.get("city") or buyer.get("state") or buyer.get("pincode"):
        buyer_lines.append(", ".join(filter(None, [buyer.get("address"), buyer.get("city"), buyer.get("state"), buyer.get("pincode")])))
    if buyer.get("gstin"):
        buyer_lines.append(f"GSTIN: {buyer['gstin']}")
    if buyer.get("pan"):
        buyer_lines.append(f"PAN: {buyer['pan']}")
    if buyer_lines:
        left.append(P("<br/>".join(buyer_lines), "BodySmall"))

    right = [
        P("INVOICE DETAILS", "Section"),
        Spacer(1,3),
    ]
    detail_lines = []
    detail_lines.append(f"Invoice No.: <b>{meta.get('invoiceNumber', 'INV-2026-001')}</b>")
    if meta.get("financialYear"):
        detail_lines.append(f"Financial Year: <b>{meta['financialYear']}</b>")
    if buyer.get("client_code"):
        detail_lines.append(f"Client Code: <b>{buyer['client_code']}</b>")
    if meta.get("servicePeriod"):
        detail_lines.append(f"Service Period: {meta['servicePeriod']}")
    if meta.get("paymentTerms"):
        detail_lines.append(f"Payment Terms: {meta['paymentTerms']}")
    if detail_lines:
        right.append(P("<br/>".join(detail_lines), "BodySmall"))

    t = Table([[left,right]], colWidths=[88*mm,88*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(0,0),PALE), ("BACKGROUND",(1,0),(1,0),PALE),
        ("BOX",(0,0),(-1,-1),0.6,LINE), ("INNERGRID",(0,0),(-1,-1),0.6,WHITE),
        ("VALIGN",(0,0),(-1,-1),"TOP"), ("LEFTPADDING",(0,0),(-1,-1),10),
        ("RIGHTPADDING",(0,0),(-1,-1),10), ("TOPPADDING",(0,0),(-1,-1),9),
        ("BOTTOMPADDING",(0,0),(-1,-1),9)
    ]))
    story.append(t)
    story.append(Spacer(1,12))

    story.append(P("SERVICES & CHARGES", "Section"))
    story.append(Spacer(1,5))
    data = [
        [P("DESCRIPTION", "TableHead"), P("SAC", "TableHead"), P("PERIOD", "TableHead"), P("QTY", "TableHead"), P(f"RATE ({currency})", "TableHead"), P(f"AMOUNT ({currency})", "TableHead")],
    ]
    for idx, line in enumerate(items):
        desc = line.get("description", "")
        hsn = line.get("hsnSac", "")
        period = line.get("period", "")
        qty = line.get("quantity", 1)
        rate = f"{float(line.get('rate', 0)):,.2f}"
        amount = f"{float(line.get('amount', 0)):,.2f}"
        data.append([
            P(f"<b>{desc}</b>", "TableCell"),
            P(str(hsn), "TableCell"),
            P(str(period), "TableCell"),
            P(str(qty), "TableCellRight"),
            P(rate, "TableCellRight"),
            P(amount, "TableCellRight"),
        ])
    tbl = Table(data, colWidths=[58*mm,19*mm,25*mm,12*mm,29*mm,33*mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),NAVY), ("VALIGN",(0,0),(-1,-1),"TOP"),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,PALE]),
        ("LINEBELOW",(0,0),(-1,0),0.5,NAVY), ("LINEBELOW",(0,1),(-1,-1),0.5,LINE),
        ("LEFTPADDING",(0,0),(-1,-1),6), ("RIGHTPADDING",(0,0),(-1,-1),6),
        ("TOPPADDING",(0,0),(-1,-1),8), ("BOTTOMPADDING",(0,0),(-1,-1),8),
    ]))
    story.append(tbl)
    story.append(Spacer(1,12))

    # Notes and totals side by side
    notes_block = [
        P("NOTES", "Section"),
        Spacer(1,4),
    ]
    if notes:
        notes_block.append(P(notes, "BodySmall"))
        notes_block.append(Spacer(1,7))
    notes_block.append(P("<b>Amount in words:</b>", "BodySmall"))
    grand = float(totals.get("grandTotal", 0))
    words = _amount_in_words(grand, currency)
    notes_block.append(P(words, "BodySmall"))

    tot_data = [
        [P("Taxable Amount", "BodySmall"), P(f"Rs. {float(totals.get('taxableValue', 0)):,.2f}", "RightSmall")],
    ]
    discount = float(totals.get("discount", 0))
    if discount > 0:
        tot_data.append([P("Discount", "BodySmall"), P(f"-Rs. {discount:,.2f}", "RightSmall")])
    tax_rate = float(totals.get("taxRate", 0))
    if is_inter:
        tot_data.append([P(f"IGST @ {tax_rate}%", "BodySmall"), P(f"Rs. {float(totals.get('igst', 0)):,.2f}", "RightSmall")])
    else:
        cgst = float(totals.get("cgst", 0))
        sgst = float(totals.get("sgst", 0))
        if cgst > 0:
            tot_data.append([P(f"CGST @ {tax_rate / 2}%", "BodySmall"), P(f"Rs. {cgst:,.2f}", "RightSmall")])
        if sgst > 0:
            tot_data.append([P(f"SGST @ {tax_rate / 2}%", "BodySmall"), P(f"Rs. {sgst:,.2f}", "RightSmall")])
    round_off = float(totals.get("roundOff", 0))
    if round_off != 0:
        tot_data.append([P("Round Off", "BodySmall"), P(f"Rs. {round_off:,.2f}", "RightSmall")])
    tot_data.append([P("GRAND TOTAL", "TableHead"), P(f"Rs. {grand:,.2f}", "TotalBig")])

    tot = Table(tot_data, colWidths=[42*mm,34*mm])
    tot.setStyle(TableStyle([
        ("LINEBELOW",(0,0),(-1,-1),0.45,LINE), ("LEFTPADDING",(0,0),(-1,-1),5),
        ("RIGHTPADDING",(0,0),(-1,-1),5), ("TOPPADDING",(0,0),(-1,-1),6),
        ("BOTTOMPADDING",(0,0),(-1,-1),6),
        ("BACKGROUND",(0,-1),(-1,-1),NAVY), ("TEXTCOLOR",(0,-1),(-1,-1),WHITE),
    ]))
    right_block = [tot, Spacer(1,7)]
    if bank:
        bank_lines = []
        if bank.get("bank_name"):
            bank_lines.append(f"<b>Bank:</b> {bank['bank_name']}")
        if bank.get("account_name"):
            bank_lines.append(f"<b>Account Name:</b> {bank['account_name']}")
        if bank.get("account_number"):
            bank_lines.append(f"<b>A/C No.:</b> {bank['account_number']}")
        if bank.get("ifsc"):
            bank_lines.append(f"<b>IFSC:</b> {bank['ifsc']}")
        if bank.get("upi_id"):
            bank_lines.append(f"<b>UPI:</b> {bank['upi_id']}")
        if bank_lines:
            right_block.append(P("<br/>".join(bank_lines), "BodySmall"))
            right_block.append(Spacer(1,4))
    right_block.append(P(f"Balance Due: <b>Rs. {grand:,.2f}</b>", "RightSmall"))

    bottom = Table([[notes_block, right_block]], colWidths=[100*mm,76*mm])
    bottom.setStyle(TableStyle([
        ("VALIGN",(0,0),(-1,-1),"TOP"), ("LEFTPADDING",(0,0),(-1,-1),0),
        ("RIGHTPADDING",(0,0),(-1,-1),0), ("TOPPADDING",(0,0),(-1,-1),0)
    ]))
    story.append(bottom)
    story.append(Spacer(1,15))

    # Terms + signature
    story.append(HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=8))
    terms_block = [
        P("TERMS & CONDITIONS", "Section"),
    ]
    if terms:
        terms_block.append(P(terms, "Footer"))
    else:
        terms_block.append(P("1. Payment is due by the due date mentioned above.  2. Any discrepancy should be reported within 7 days.  3. Services are subject to the agreed engagement terms.", "Footer"))

    sig_block = [
        P(f"FOR {seller.get('name', 'YOUR FIRM NAME').upper()}", "RightSmall"),
        Spacer(1,27),
        P("<b>Authorized Signatory</b>", "RightSmall"),
    ]
    last = Table([[terms_block, sig_block]], colWidths=[112*mm,64*mm])
    last.setStyle(TableStyle([
        ("VALIGN",(0,0),(-1,-1),"TOP"), ("LEFTPADDING",(0,0),(-1,-1),0),
        ("RIGHTPADDING",(0,0),(-1,-1),0)
    ]))
    story.append(last)
    story.append(Spacer(1,10))
    story.append(P("This is a computer-generated invoice template. Replace all sample details and verify GST, SAC, tax rate and place-of-supply treatment before issuing.", "Footer"))

    return story


# ---------------------------------------------------------------------------
# Amount-in-words helper (Indian numbering system)
# ---------------------------------------------------------------------------

_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
         "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
         "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _convert_less_than_thousand(n):
    words = []
    if n >= 100:
        words.append(_ONES[n // 100])
        words.append("Hundred")
        n %= 100
    if n >= 20:
        words.append(_TENS[n // 10])
        n %= 10
    if n > 0:
        words.append(_ONES[n])
    return " ".join(words)


def _amount_in_words(amount, currency="INR"):
    rupees = int(amount)
    paise = int(round((amount - rupees) * 100))
    parts = []
    if rupees == 0:
        parts.append("Zero")
    else:
        # Indian numbering: crore, lakh, thousand
        crore = rupees // 10000000
        rupees %= 10000000
        lakh = rupees // 100000
        rupees %= 100000
        thousand = rupees // 1000
        rupees %= 1000
        if crore:
            parts.append(f"{_convert_less_than_thousand(crore)} Crore")
        if lakh:
            parts.append(f"{_convert_less_than_thousand(lakh)} Lakh")
        if thousand:
            parts.append(f"{_convert_less_than_thousand(thousand)} Thousand")
        if rupees:
            parts.append(_convert_less_than_thousand(rupees))
        parts.append("Rupees")
    if paise:
        parts.append(f"and {_convert_less_than_thousand(paise)} Paise")
    parts.append("Only")
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Template registry: map every template id to one of the 6 core layouts
# ---------------------------------------------------------------------------
# render() — main entry point
# ---------------------------------------------------------------------------

# Template registry and themes (defined here so all renderer functions exist first)


# ---------------------------------------------------------------------------
# Wave style CA GST invoice — canvas-drawn header wave + footer stripes
# ---------------------------------------------------------------------------

def _draw_wave_header(canvas, doc):
    """Canvas callback: draws the teal/navy wave header and footer stripes."""
    canvas.saveState()
    W, H = canvas._pagesize

    # Header wave background (teal)
    canvas.setFillColor(HexColor("#56C9C1"))
    path = canvas.beginPath()
    path.moveTo(0, H)
    path.lineTo(W, H)
    path.lineTo(W, H - 33 * mm)
    path.curveTo(W - 40 * mm, H - 57 * mm, W - 85 * mm, H - 25 * mm, W - 125 * mm, H - 35 * mm)
    path.curveTo(W - 155 * mm, H - 42 * mm, 35 * mm, H - 27 * mm, 0, H - 63 * mm)
    path.close()
    canvas.drawPath(path, fill=1, stroke=0)

    # Navy wave layered below teal
    canvas.setFillColor(HexColor("#173F6B"))
    path2 = canvas.beginPath()
    path2.moveTo(W, H - 2 * mm)
    path2.lineTo(W, H - 50 * mm)
    path2.curveTo(W - 38 * mm, H - 28 * mm, W - 77 * mm, H - 50 * mm, W - 113 * mm, H - 42 * mm)
    path2.curveTo(W - 143 * mm, H - 35 * mm, W - 165 * mm, H - 48 * mm, W - 176 * mm, H - 54 * mm)
    path2.curveTo(W - 139 * mm, H - 72 * mm, W - 90 * mm, H - 69 * mm, W - 52 * mm, H - 66 * mm)
    path2.curveTo(W - 24 * mm, H - 64 * mm, 10 * mm, H - 69 * mm, 0, H - 80 * mm)
    path2.lineTo(0, H - 63 * mm)
    path2.curveTo(35 * mm, H - 27 * mm, 75 * mm, H - 20 * mm, 112 * mm, H - 30 * mm)
    path2.curveTo(153 * mm, H - 41 * mm, 177 * mm, H - 24 * mm, W, H - 2 * mm)
    path2.close()
    canvas.drawPath(path2, fill=1, stroke=0)

    # Thin white separation accent
    canvas.setStrokeColor(white)
    canvas.setLineWidth(1.4)
    p = canvas.beginPath()
    p.moveTo(0, H - 63 * mm)
    p.curveTo(32 * mm, H - 25 * mm, 70 * mm, H - 18 * mm, 111 * mm, H - 29 * mm)
    p.curveTo(151 * mm, H - 40 * mm, 177 * mm, H - 24 * mm, W, H - 2 * mm)
    canvas.drawPath(p, stroke=1, fill=0)

    # Footer stripes
    canvas.setFillColor(HexColor("#56C9C1"))
    canvas.rect(0, 8 * mm, W, 3 * mm, fill=1, stroke=0)
    canvas.setFillColor(HexColor("#173F6B"))
    canvas.rect(0, 3 * mm, W, 5 * mm, fill=1, stroke=0)

    # Brand mark text
    canvas.setFillColor(white)
    canvas.setFont("Helvetica-Bold", 19)
    canvas.drawString(19 * mm, H - 29 * mm, "YOUR LOGO")
    canvas.setFont("Helvetica", 7)
    canvas.drawString(19 * mm, H - 35 * mm, "CHARTERED ACCOUNTANTS  |  TAX & ADVISORY")
    canvas.restoreState()


def _render_wave(ctx, theme, s):
    """Wave style CA GST invoice — your exact template code adapted as a renderer."""
    from reportlab.lib import colors as _colors

    inv = ctx.get("invoice", ctx)
    meta = inv.get("meta", {})
    seller = inv.get("seller", {})
    buyer = inv.get("buyer", {})
    items = inv.get("items", [])
    totals = inv.get("totals", {})
    notes = inv.get("notes", "")
    terms = inv.get("termsAndConditions", "")
    bank = inv.get("bankDetails")
    currency = inv.get("currency", "INR")

    # Store canvas callback on context so render() passes it to doc.build()
    ctx["_on_first_page"] = _draw_wave_header
    ctx["_on_later_page"] = _draw_wave_header

    NAVY = HexColor("#173F6B")
    TEAL = HexColor("#56C9C1")
    INK = HexColor("#243746")
    MUTED = HexColor("#65727E")
    PALE = HexColor("#F5F9FA")
    LINE = HexColor("#D8E2E7")
    WHITE = _colors.white

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Logo", fontName="Helvetica-Bold", fontSize=21, leading=24, textColor=WHITE))
    styles.add(ParagraphStyle(name="InvoiceTitle", fontName="Helvetica-Bold", fontSize=21, leading=24, textColor=NAVY, alignment=TA_RIGHT))
    styles.add(ParagraphStyle(name="SectionHead", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=NAVY))
    styles.add(ParagraphStyle(name="Small", fontName="Helvetica", fontSize=7.4, leading=10, textColor=MUTED))
    styles.add(ParagraphStyle(name="Body", fontName="Helvetica", fontSize=8, leading=11, textColor=INK))
    styles.add(ParagraphStyle(name="BodyBold", fontName="Helvetica-Bold", fontSize=8.4, leading=11, textColor=INK))
    styles.add(ParagraphStyle(name="Meta", fontName="Helvetica", fontSize=7.6, leading=11, textColor=INK))
    styles.add(ParagraphStyle(name="TableHead", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=WHITE))
    styles.add(ParagraphStyle(name="TableBody", fontName="Helvetica", fontSize=7.8, leading=10, textColor=INK))
    styles.add(ParagraphStyle(name="TableRight", fontName="Helvetica", fontSize=7.8, leading=10, textColor=INK, alignment=TA_RIGHT))
    styles.add(ParagraphStyle(name="Right", fontName="Helvetica", fontSize=8, leading=11, textColor=INK, alignment=TA_RIGHT))
    styles.add(ParagraphStyle(name="Grand", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=WHITE, alignment=TA_RIGHT))
    styles.add(ParagraphStyle(name="GrandLabel", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=HexColor("#D9F4F1")))
    styles.add(ParagraphStyle(name="FooterSmall", fontName="Helvetica", fontSize=7, leading=9, textColor=MUTED))

    def P(text, style="Body"):
        return Paragraph(text, styles[style])

    story = []

    # Invoice to and invoice metadata
    left = [
        P("INVOICE TO", "SectionHead"), Spacer(1, 3),
        P("<b>" + (buyer.get("name", "Client Business Name")) + "</b>", "BodyBold"),
        P(
            ", ".join(filter(None, [buyer.get("address"), buyer.get("city"), buyer.get("state"), buyer.get("pincode")])) + ", India<br/>"
            + (f"GSTIN: {buyer.get('gstin')}<br/>" if buyer.get("gstin") else "")
            + (f"PAN: {buyer.get('pan')}" if buyer.get("pan") else ""),
            "Body")
    ]
    right = [
        P("TAX INVOICE", "InvoiceTitle"), Spacer(1, 3),
        P(f"<b>Invoice No.</b> &nbsp;&nbsp; {meta.get('invoiceNumber', 'INV/2026-27/001')}", "Right"),
        P(f"<b>Invoice Date</b> &nbsp;&nbsp; {meta.get('invoiceDate', '31/10/2026')}", "Right"),
        P(f"<b>Due Date</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {meta.get('dueDate', '14/11/2026')}", "Right"),
        P(f"<b>Place of Supply</b> &nbsp; {inv.get('placeOfSupply', 'Maharashtra (27)')}", "Right"),
        P(f"<b>Service Period</b> &nbsp;&nbsp; {meta.get('servicePeriod', 'Oct 2026')}", "Right")
    ]
    top = Table([[left, right]], colWidths=[89 * mm, 89 * mm])
    top.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8)
    ]))
    story.append(top)
    story.append(Spacer(1, 7))
    story.append(P("SERVICE DETAILS", "SectionHead"))
    story.append(Spacer(1, 5))

    rows = [
        [P("DESCRIPTION", "TableHead"), P("SAC", "TableHead"), P("QTY", "TableHead"),
         P(f"RATE (Rs.)", "TableHead"), P(f"AMOUNT (Rs.)", "TableHead")],
    ]
    for line in items:
        desc = line.get("description", "")
        hsn = line.get("hsnSac", "")
        period = line.get("period", "")
        qty = line.get("quantity", 1)
        rate = f"{float(line.get('rate', 0)):,.2f}"
        amount = f"{float(line.get('amount', 0)):,.2f}"
        rows.append([
            P(f"<b>{desc}</b><br/><font color='#65727E'>{period}</font>", "TableBody"),
            P(str(hsn), "TableBody"),
            P(str(qty), "TableRight"),
            P(rate, "TableRight"),
            P(amount, "TableRight"),
        ])
    items_tbl = Table(rows, colWidths=[83 * mm, 19 * mm, 14 * mm, 29 * mm, 33 * mm], repeatRows=1)
    items_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, HexColor("#F8FBFC")]),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, NAVY),
        ("LINEBELOW", (0, 1), (-1, -1), 0.6, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9)
    ]))
    story.append(items_tbl)
    story.append(Spacer(1, 10))

    # Payment details and totals
    payment = [
        P("PAYMENT INFO", "SectionHead"), Spacer(1, 4),
        P(
            (f"<b>Bank:</b> {bank.get('bank_name', 'Your Bank Name')}<br/>"
             f"<b>Account Name:</b> {bank.get('account_name', 'Your Firm Name')}<br/>"
             f"<b>Account No.:</b> {bank.get('account_number', 'XXXX XXXX XXXX')}<br/>"
             f"<b>IFSC:</b> {bank.get('ifsc', 'ABCD0001234')}<br/>"
             f"<b>UPI:</b> {bank.get('upi_id', 'yourfirm@upi')}")
            if bank else
            "<b>Bank:</b> Your Bank Name<br/><b>Account Name:</b> Your Firm Name<br/><b>Account No.:</b> XXXX XXXX XXXX<br/><b>IFSC:</b> ABCD0001234<br/><b>UPI:</b> yourfirm@upi",
            "Body"),
        Spacer(1, 7),
        P("TERMS &amp; CONDITIONS", "SectionHead"),
        P(terms if terms else "Payment is due by the due date. Please quote the invoice number while paying. Any discrepancy should be reported within 7 days.", "Small")
    ]

    tax_rows = [
        [P("Subtotal", "Body"), P(f"Rs. {float(totals.get('taxableValue', 0)):,.2f}", "Right")],
    ]
    discount = float(totals.get("discount", 0))
    if discount > 0:
        tax_rows.append([P("Discount", "Body"), P(f"-Rs. {discount:,.2f}", "Right")])
    tax_rows.append([P("Taxable Value", "BodyBold"), P(f"Rs. {float(totals.get('taxableValue', 0)):,.2f}", "Right")])
    tax_rate = float(totals.get("taxRate", 0))
    is_inter = inv.get("isInterState", False)
    if is_inter:
        tax_rows.append([P(f"IGST @ {tax_rate}%", "Body"), P(f"Rs. {float(totals.get('igst', 0)):,.2f}", "Right")])
    else:
        cgst = float(totals.get("cgst", 0))
        sgst = float(totals.get("sgst", 0))
        if cgst > 0:
            tax_rows.append([P(f"CGST @ {tax_rate / 2}%", "Body"), P(f"Rs. {cgst:,.2f}", "Right")])
        if sgst > 0:
            tax_rows.append([P(f"SGST @ {tax_rate / 2}%", "Body"), P(f"Rs. {sgst:,.2f}", "Right")])
    round_off = float(totals.get("roundOff", 0))
    if round_off != 0:
        tax_rows.append([P("Round Off", "Body"), P(f"Rs. {round_off:,.2f}", "Right")])
    tax = Table(tax_rows, colWidths=[38 * mm, 38 * mm])
    tax.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.45, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)
    ]))
    grand_total = float(totals.get("grandTotal", 0))
    grand = Table([[P("GRAND TOTAL", "GrandLabel"), P(f"Rs. {grand_total:,.2f}", "Grand")]], colWidths=[34 * mm, 42 * mm])
    grand.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9)
    ]))

    words = _amount_in_words(grand_total, currency)
    totals_list = [tax, Spacer(1, 6), grand, Spacer(1, 4),
                   P(f"Amount in words:<br/><b>{words}</b>", "Small")]
    bottom = Table([[payment, totals_list]], colWidths=[102 * mm, 76 * mm])
    bottom.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)
    ]))
    story.append(bottom)
    story.append(Spacer(1, 11))

    # Signature and closing
    sig = [
        P(f"<b>For {seller.get('name', 'YOUR FIRM NAME')}</b>", "Right"),
        Spacer(1, 20),
        P("Authorized Signatory", "Right")
    ]
    closing = Table([[
        P("<b>Thank you for your business.</b><br/><font color='#65727E'>We appreciate the opportunity to serve you.</font>", "Body"),
        sig
    ]], colWidths=[105 * mm, 73 * mm])
    closing.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(closing)
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE))
    story.append(Spacer(1, 4))
    story.append(P("Phone: +91 00000 00000 &nbsp;&nbsp;&nbsp; Email: accounts@yourfirm.in &nbsp;&nbsp;&nbsp; Website: www.yourfirm.in &nbsp;&nbsp;&nbsp; Address: Nashik, Maharashtra", "FooterSmall"))
    story.append(Spacer(1, 3))
    story.append(P("Computer-generated invoice template. Replace sample details and verify SAC, GST rates, place of supply and statutory requirements before issuing.", "FooterSmall"))

    return story


# ---------------------------------------------------------------------------
# render() — main entry point
# ---------------------------------------------------------------------------

# Template registry and themes (defined here so all renderer functions exist first)
TEMPLATE_RENDERERS = {
    "modern_gst": _render_modern_gst,
    "modern": _render_modern_gst,
    "gst": _render_modern_gst,
    "ca": _render_modern_gst,
    "wave": _render_wave,
}

THEMES = {
    "modern_gst": {
        "primary": "#172B4D",
        "primaryDark": "#0f1f36",
        "accent": "#315EFB",
        "text": "#243247",
        "muted": "#68778D",
        "border": "#E3E8F0",
        "background": "#F3F6FC",
        "rowAlt": "#FFFFFF",
    },
    "modern": {
        "primary": "#172B4D",
        "primaryDark": "#0f1f36",
        "accent": "#315EFB",
        "text": "#243247",
        "muted": "#68778D",
        "border": "#E3E8F0",
        "background": "#F3F6FC",
        "rowAlt": "#FFFFFF",
    },
    "gst": {
        "primary": "#172B4D",
        "primaryDark": "#0f1f36",
        "accent": "#315EFB",
        "text": "#243247",
        "muted": "#68778D",
        "border": "#E3E8F0",
        "background": "#F3F6FC",
        "rowAlt": "#FFFFFF",
    },
    "ca": {
        "primary": "#172B4D",
        "primaryDark": "#0f1f36",
        "accent": "#315EFB",
        "text": "#243247",
        "muted": "#68778D",
        "border": "#E3E8F0",
        "background": "#F3F6FC",
        "rowAlt": "#FFFFFF",
    },
    "wave": {
        "primary": "#173F6B",
        "primaryDark": "#0f2a4a",
        "accent": "#56C9C1",
        "text": "#243746",
        "muted": "#65727E",
        "border": "#D8E2E7",
        "background": "#F5F9FA",
        "rowAlt": "#FFFFFF",
    },
    "studio": {
        "primary": "#101C2C",
        "primaryDark": "#1C3046",
        "accent": "#00B69B",
        "text": "#1B2A3A",
        "muted": "#718096",
        "border": "#DFE6EC",
        "background": "#F4F7F9",
        "rowAlt": "#FFFFFF",
    },
    "grid_v6": {
        "primary": "#20262E",
        "primaryDark": "#303A45",
        "accent": "#C7F36B",
        "text": "#202A34",
        "muted": "#7D8791",
        "border": "#E4E8E2",
        "background": "#FAFBF8",
        "rowAlt": "#F1F4EE",
    },
}


# ---------------------------------------------------------------------------
# Studio style CA GST invoice — canvas-drawn dark masthead, client cards,
# service table, payment & summary panels
# ---------------------------------------------------------------------------

def _draw_studio_header(canvas, doc):
    """Canvas callback: draws the dark masthead and footer stripe."""
    canvas.saveState()
    W, H = canvas._pagesize

    D = HexColor("#101C2C")
    D2 = HexColor("#1C3046")
    T = HexColor("#00B69B")

    # Masthead
    canvas.setFillColor(D)
    canvas.rect(0, H - 53 * mm, W, 53 * mm, fill=1, stroke=0)

    # Diagonal accent shape on right side of masthead
    p = canvas.beginPath()
    p.moveTo(W * 0.60, H)
    p.lineTo(W, H)
    p.lineTo(W, H - 53 * mm)
    p.lineTo(W * 0.78, H - 53 * mm)
    p.close()
    canvas.setFillColor(D2)
    canvas.drawPath(p, fill=1, stroke=0)

    # Teal accent block at far right of masthead
    canvas.setFillColor(T)
    canvas.rect(W - 11 * mm, H - 53 * mm, 11 * mm, 53 * mm, fill=1, stroke=0)

    # Brand mark text
    canvas.setFillColor(white)
    canvas.setFont("Helvetica-Bold", 20)
    canvas.drawString(18 * mm, H - 19 * mm, "YOUR FIRM")
    canvas.setFont("Helvetica", 7.2)
    canvas.setFillColor(HexColor("#B9C8D6"))
    canvas.drawString(18 * mm, H - 25 * mm, "CHARTERED ACCOUNTANTS  /  TAX  /  AUDIT  /  ADVISORY")
    canvas.setFillColor(white)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(18 * mm, H - 37 * mm, "Office 204, Business Centre, Nashik, Maharashtra – 422001")
    canvas.setFillColor(HexColor("#B9C8D6"))
    canvas.drawString(18 * mm, H - 42 * mm, "GSTIN 27AAAAA0000A1Z5   |   PAN AAAAA0000A")

    # Right side metadata
    canvas.setFillColor(HexColor("#9CEBDD"))
    canvas.setFont("Helvetica-Bold", 7)
    canvas.drawRightString(W - 18 * mm, H - 15 * mm, "ACCOUNTS RECEIVABLE  /  2026–27")
    canvas.setFillColor(white)
    canvas.setFont("Helvetica-Bold", 25)
    canvas.drawRightString(W - 18 * mm, H - 27 * mm, "TAX INVOICE")
    canvas.setFillColor(HexColor("#D8E2EC"))
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawRightString(W - 18 * mm, H - 34 * mm, "INV-26-27-001")
    canvas.setFont("Helvetica", 7.2)
    canvas.drawRightString(W - 18 * mm, H - 41 * mm, "ISSUED  31 OCT 2026   •   DUE  14 NOV 2026")

    # Footer stripe
    canvas.setFillColor(T)
    canvas.rect(0, 0, W, 2.5 * mm, fill=1, stroke=0)

    canvas.restoreState()


def _render_studio(ctx, theme, s):
    """Studio style CA GST invoice — canvas-drawn dark masthead invoice."""
    from reportlab.lib import colors as _colors

    inv = ctx.get("invoice", ctx)
    meta = inv.get("meta", {})
    seller = inv.get("seller", {})
    buyer = inv.get("buyer", {})
    items = inv.get("items", [])
    totals = inv.get("totals", {})
    bank = inv.get("bankDetails")
    currency = inv.get("currency", "INR")

    # Store canvas callback on context so render() passes it to doc.build()
    ctx["_on_first_page"] = _draw_studio_header
    ctx["_on_later_page"] = _draw_studio_header

    D = HexColor("#101C2C")
    D2 = HexColor("#1C3046")
    T = HexColor("#00B69B")
    M = HexColor("#DFF8F2")
    B = HexColor("#F4F7F9")
    I = HexColor("#1B2A3A")
    U = HexColor("#718096")
    L = HexColor("#DFE6EC")
    WH = white

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4

    def text(x, y, s, size=8, col=I, font="Helvetica"):
        c.setFillColor(col)
        c.setFont(font, size)
        c.drawString(x, y, s)

    def rt(x, y, s, size=8, col=I, font="Helvetica"):
        c.setFillColor(col)
        c.setFont(font, size)
        c.drawRightString(x, y, s)

    def ln(x, y, x2, y2, col=L, w=0.5):
        c.setStrokeColor(col)
        c.setLineWidth(w)
        c.line(x, y, x2, y2)

    def box(x, y, w, h, col, stroke=None, r=0):
        c.setFillColor(col)
        if stroke:
            c.setStrokeColor(stroke)
            c.setLineWidth(0.6)
        if r:
            c.roundRect(x, y, w, h, r, fill=1, stroke=bool(stroke))
        else:
            c.rect(x, y, w, h, fill=1, stroke=bool(stroke))

    # Masthead (drawn by canvas callback too, but we keep data-driven text below)
    # We skip redrawing here since _draw_studio_header handles it via onPage.
    # The onPage callback draws static branding; data-driven text is drawn below
    # using Platypus story elements positioned with absolute coordinates isn't
    # possible with BaseDocTemplate, so we draw everything in the story below.

    # Client / invoice cards area
    y = H - 63 * mm
    box(17 * mm, y - 29 * mm, 108 * mm, 29 * mm, B, L, 2 * mm)
    box(127 * mm, y - 29 * mm, 68 * mm, 29 * mm, M, L, 2 * mm)
    text(22 * mm, y - 7 * mm, "BILL TO", 7, T, "Helvetica-Bold")
    text(22 * mm, y - 14 * mm, buyer.get("name", "Client / Business Name"), 11, D, "Helvetica-Bold")
    text(22 * mm, y - 19 * mm, "Attention: Client Contact Person", 7.3, I)
    text(22 * mm, y - 23.5 * mm, ", ".join(filter(None, [buyer.get("address"), buyer.get("city"), buyer.get("state"), buyer.get("pincode")])) or "Street address, City, State – PIN", 7.3, I)
    buyer_ids = []
    if buyer.get("gstin"):
        buyer_ids.append(f"GSTIN {buyer['gstin']}")
    if buyer.get("pan"):
        buyer_ids.append(f"PAN {buyer['pan']}")
    text(22 * mm, y - 27.5 * mm, "   •   ".join(buyer_ids) if buyer_ids else "GSTIN 27BBBBB1111B1Z6   •   PAN BBBBB1111B", 6.5, U)
    text(132 * mm, y - 7 * mm, "INVOICE SNAPSHOT", 7, T, "Helvetica-Bold")
    text(132 * mm, y - 14 * mm, "SERVICE PERIOD", 6.2, U, "Helvetica-Bold")
    text(132 * mm, y - 18 * mm, meta.get("servicePeriod", "October 2026"), 8.2, D, "Helvetica-Bold")
    text(132 * mm, y - 23 * mm, f"PLACE OF SUPPLY  {inv.get('placeOfSupply', 'Maharashtra (27)')}", 6.3, I)

    # Service table
    sy = y - 40 * mm
    text(17 * mm, sy, "01  /  PROFESSIONAL SERVICES", 9, D, "Helvetica-Bold")
    rt(195 * mm, sy, "FEES & CHARGES  •  INR", 7, U, "Helvetica-Bold")
    x = 17 * mm
    w = 178 * mm
    hy = sy - 8 * mm
    rh = 15 * mm
    box(x, hy - 9 * mm, w, 9 * mm, D2, r=1.2 * mm)
    text(x + 3 * mm, hy - 5.8 * mm, "SERVICE DESCRIPTION", 6.8, WH, "Helvetica-Bold")
    text(x + 88 * mm, hy - 5.8 * mm, "SAC", 6.8, WH, "Helvetica-Bold")
    text(x + 108 * mm, hy - 5.8 * mm, "QTY", 6.8, WH, "Helvetica-Bold")
    text(x + 124 * mm, hy - 5.8 * mm, "RATE", 6.8, WH, "Helvetica-Bold")
    rt(x + w - 3 * mm, hy - 5.8 * mm, "AMOUNT", 6.8, WH, "Helvetica-Bold")
    rows = []
    for line in items:
        rows.append((
            line.get("description", ""),
            line.get("period", ""),
            line.get("hsnSac", ""),
            str(line.get("quantity", 1)),
            f"{float(line.get('rate', 0)):,.2f}",
            f"{float(line.get('amount', 0)):,.2f}",
        ))
    start = hy - 9 * mm
    for i, r in enumerate(rows):
        top = start - i * rh
        if i % 2:
            box(x, top - rh, w, rh, B)
        text(x + 3 * mm, top - 5.7 * mm, r[0], 7.4, D, "Helvetica-Bold")
        text(x + 3 * mm, top - 10.2 * mm, r[1], 6.2, U)
        text(x + 88 * mm, top - 8 * mm, r[2], 6.8, I)
        rt(x + 117 * mm, top - 8 * mm, r[3], 6.8, I)
        rt(x + 149 * mm, top - 8 * mm, r[4], 6.8, I)
        rt(x + w - 3 * mm, top - 8 * mm, r[5], 6.8, I, "Helvetica-Bold")
        ln(x, top - rh, x + w, top - rh, L, 0.45)

    # Payment panel and summary panel
    by = start - 4 * rh - 8 * mm
    lx = 17 * mm
    lw = 94 * mm
    rx = 116 * mm
    rw = 79 * mm
    box(lx, by - 52 * mm, lw, 52 * mm, B, L, 2 * mm)
    text(lx + 5 * mm, by - 7 * mm, "02  /  PAYMENT & REMITTANCE", 8, T, "Helvetica-Bold")
    text(lx + 5 * mm, by - 15 * mm, "BANK TRANSFER", 6.3, U, "Helvetica-Bold")
    bank_name = bank.get("bank_name", "Your Bank Name") if bank else "Your Bank Name"
    acct_name = bank.get("account_name", "Your Firm Name") if bank else "Your Firm Name"
    acct_no = bank.get("account_number", "XXXX XXXX XXXX") if bank else "XXXX XXXX XXXX"
    ifsc = bank.get("ifsc", "ABCD0001234") if bank else "ABCD0001234"
    upi = bank.get("upi_id", "yourfirm@upi") if bank else "yourfirm@upi"
    text(lx + 5 * mm, by - 20 * mm, f"{bank_name}  •  A/C Name: {acct_name}", 7.1, I)
    text(lx + 5 * mm, by - 25 * mm, f"A/C No.: {acct_no}  •  IFSC: {ifsc}", 7.1, I)
    text(lx + 5 * mm, by - 34 * mm, "UPI PAYMENT", 6.3, U, "Helvetica-Bold")
    text(lx + 5 * mm, by - 39 * mm, upi, 8, D, "Helvetica-Bold")
    text(lx + 5 * mm, by - 47 * mm, "Due within 14 days. Quote invoice number with payment.", 6.1, U)

    tot = [
        ("Subtotal", f"₹ {float(totals.get('taxableValue', 0)):,.2f}"),
    ]
    discount = float(totals.get("discount", 0))
    if discount > 0:
        tot.append(("Discount", f"-₹ {discount:,.2f}"))
    tot.append(("Taxable value", f"₹ {float(totals.get('taxableValue', 0)):,.2f}"))
    tax_rate = float(totals.get("taxRate", 0))
    is_inter = inv.get("isInterState", False)
    if is_inter:
        tot.append((f"IGST @ {tax_rate}%", f"₹ {float(totals.get('igst', 0)):,.2f}"))
    else:
        cgst = float(totals.get("cgst", 0))
        sgst = float(totals.get("sgst", 0))
        if cgst > 0:
            tot.append((f"CGST @ {tax_rate / 2}%", f"₹ {cgst:,.2f}"))
        if sgst > 0:
            tot.append((f"SGST @ {tax_rate / 2}%", f"₹ {sgst:,.2f}"))
    round_off = float(totals.get("roundOff", 0))
    if round_off != 0:
        tot.append(("Round off", f"₹ {round_off:,.2f}"))
    grand_total = float(totals.get("grandTotal", 0))
    for i, (a, b) in enumerate(tot):
        yy = by - 2 * mm - i * 5.1 * mm
        is_total = a == "Taxable value"
        text(rx, yy, a, 7.1, D if is_total else U, "Helvetica-Bold" if is_total else "Helvetica")
        rt(rx + rw, yy, b, 7.1, D, "Helvetica-Bold" if is_total else "Helvetica")
        ln(rx, yy - 1.7 * mm, rx + rw, yy - 1.7 * mm, L, 0.35)

    box(rx, by - 47 * mm, rw, 13 * mm, D, r=2 * mm)
    text(rx + 4 * mm, by - 39.3 * mm, "TOTAL AMOUNT DUE", 6.5, HexColor("#B6C7D7"), "Helvetica-Bold")
    rt(rx + rw - 4 * mm, by - 44.2 * mm, f"₹ {grand_total:,.2f}", 15.5, WH, "Helvetica-Bold")

    words = _amount_in_words(grand_total, currency)
    text(rx, by - 51 * mm, f"Amount in words: {words}", 5.4, U)

    # Signoff and footer
    fy = by - 62 * mm
    ln(17 * mm, fy + 8 * mm, 195 * mm, fy + 8 * mm, L, 0.6)
    text(17 * mm, fy + 2 * mm, "Thank you for your trust.", 8, D, "Helvetica-Bold")
    text(17 * mm, fy - 3 * mm, "We appreciate the opportunity to support your business.", 6.8, U)
    rt(195 * mm, fy + 2 * mm, f"FOR {seller.get('name', 'YOUR FIRM NAME').upper()}", 7.5, D, "Helvetica-Bold")
    rt(195 * mm, fy - 5 * mm, "AUTHORIZED SIGNATORY", 6.7, U)
    ln(17 * mm, fy - 10 * mm, 195 * mm, fy - 10 * mm, L, 0.4)
    text(17 * mm, fy - 15 * mm, f"{seller.get('name', 'YOUR FIRM NAME')}  •  +91 00000 00000  •  accounts@yourfirm.in  •  www.yourfirm.in  •  Nashik, Maharashtra", 6.1, U)
    text(17 * mm, fy - 20 * mm, "Illustrative sample. Replace details and verify SAC, GST rates, place of supply and statutory invoice requirements before issuing.", 5.5, U)

    c.showPage()
    c.save()
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Grid v6 style CA GST invoice — graphite/lime palette with left brand rail,
# rounded cards, and clean service table
# ---------------------------------------------------------------------------

def _render_grid_v6(ctx, theme, s):
    """Grid v6 style CA GST invoice — canvas-drawn graphite/lime design."""
    from reportlab.pdfgen import canvas as _canvas

    inv = ctx.get("invoice", ctx)
    meta = inv.get("meta", {})
    seller = inv.get("seller", {})
    buyer = inv.get("buyer", {})
    items = inv.get("items", [])
    totals = inv.get("totals", {})
    bank = inv.get("bankDetails")
    currency = inv.get("currency", "INR")

    ctx["_on_first_page"] = None
    ctx["_on_later_page"] = None

    buf = BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    W, H = A4

    GRAPHITE = HexColor("#20262E")
    GRAPHITE_2 = HexColor("#303A45")
    LIME = HexColor("#C7F36B")
    PAPER = HexColor("#FAFBF8")
    WH = white
    INK = HexColor("#202A34")
    MUTED = HexColor("#7D8791")
    LINE = HexColor("#E4E8E2")
    SOFT = HexColor("#F1F4EE")
    GREEN = HexColor("#567B2B")

    def rect(x, y, w, h, fill, stroke=None, radius=0):
        c.setFillColor(fill)
        if stroke:
            c.setStrokeColor(stroke)
            c.setLineWidth(0.6)
        if radius:
            c.roundRect(x, y, w, h, radius, fill=1, stroke=1 if stroke else 0)
        else:
            c.rect(x, y, w, h, fill=1, stroke=1 if stroke else 0)

    def txt(x, y, s, size=8, color=INK, font="Helvetica"):
        c.setFillColor(color)
        c.setFont(font, size)
        c.drawString(x, y, s)

    def rtxt(x, y, s, size=8, color=INK, font="Helvetica"):
        c.setFillColor(color)
        c.setFont(font, size)
        c.drawRightString(x, y, s)

    def ln(x1, y1, x2, y2, color=LINE, width=.5):
        c.setStrokeColor(color)
        c.setLineWidth(width)
        c.line(x1, y1, x2, y2)

    rect(0, 0, W, H, PAPER)
    rect(0, 0, 13 * mm, H, GRAPHITE)
    rect(0, H - 56 * mm, 13 * mm, 56 * mm, LIME)
    c.saveState()
    c.translate(6.5 * mm, H - 68 * mm)
    c.rotate(90)
    c.setFillColor(LIME)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(0, 0, f"{seller.get('name', 'YOUR FIRM')}  /  CA")
    c.restoreState()
    rect(4 * mm, 13 * mm, 5 * mm, 5 * mm, LIME, radius=1.2 * mm)

    x0 = 23 * mm
    right_edge = W - 18 * mm
    txt(x0, H - 20 * mm, seller.get("name", "YOUR FIRM NAME"), 19, GRAPHITE, "Helvetica-Bold")
    txt(x0, H - 26 * mm, "CHARTERED ACCOUNTANTS  /  TAX  /  AUDIT  /  ADVISORY", 7, MUTED, "Helvetica-Bold")
    firm_addr = ", ".join(filter(None, [seller.get("address"), seller.get("city"), seller.get("state"), seller.get("pincode")]))
    txt(x0, H - 37 * mm, firm_addr or "Office address, Nashik, Maharashtra – 422001", 7.5, INK)
    txt(x0, H - 42 * mm, f"GSTIN {seller.get('gstin', '27AAAAA0000A1Z5')}     PAN {seller.get('pan', 'AAAAA0000A')}", 7.2, MUTED)

    rtxt(right_edge, H - 19 * mm, "FY 2026—27", 7.5, GREEN, "Helvetica-Bold")
    rtxt(right_edge, H - 31 * mm, "INVOICE", 25, GRAPHITE, "Helvetica-Bold")
    rtxt(right_edge, H - 38 * mm, meta.get("invoiceNumber", "INV/26-27/001"), 9, INK, "Helvetica-Bold")
    rtxt(right_edge, H - 44 * mm, f"ISSUED {meta.get('invoiceDate', '31 OCT 2026')}  ·  DUE {meta.get('dueDate', '14 NOV 2026')}", 6.5, MUTED)

    rect(x0, H - 51 * mm, right_edge - x0, 1.4 * mm, LIME)
    txt(x0, H - 61 * mm, "01", 8, GREEN, "Helvetica-Bold")
    txt(x0 + 10 * mm, H - 61 * mm, "CLIENT & BILLING INFORMATION", 8, GRAPHITE, "Helvetica-Bold")

    card_y = H - 96 * mm
    rect(x0, card_y, 105 * mm, 27 * mm, WH, LINE, 2 * mm)
    rect(x0 + 108 * mm, card_y, right_edge - (x0 + 108 * mm), 27 * mm, SOFT, LINE, 2 * mm)

    txt(x0 + 5 * mm, card_y + 20 * mm, "BILL TO", 6.5, GREEN, "Helvetica-Bold")
    txt(x0 + 5 * mm, card_y + 13 * mm, buyer.get("name", "Client / Business Name"), 11, GRAPHITE, "Helvetica-Bold")
    txt(x0 + 5 * mm, card_y + 7.5 * mm, "Contact person · Street, City, State – PIN", 7, INK)
    buyer_ids = []
    if buyer.get("gstin"):
        buyer_ids.append(f"GSTIN {buyer['gstin']}")
    if buyer.get("pan"):
        buyer_ids.append(f"PAN {buyer['pan']}")
    txt(x0 + 5 * mm, card_y + 3 * mm, "   •   ".join(buyer_ids) if buyer_ids else "GSTIN 27BBBBB1111B1Z6  ·  PAN BBBBB1111B", 6.1, MUTED)

    mx = x0 + 113 * mm
    txt(mx + 4 * mm, card_y + 20 * mm, "SERVICE PERIOD", 6.1, MUTED, "Helvetica-Bold")
    txt(mx + 4 * mm, card_y + 14 * mm, meta.get("servicePeriod", "October 2026"), 8, GRAPHITE, "Helvetica-Bold")
    txt(mx + 4 * mm, card_y + 7 * mm, "PLACE OF SUPPLY", 6.1, MUTED, "Helvetica-Bold")
    txt(mx + 4 * mm, card_y + 2.5 * mm, inv.get("placeOfSupply", "Maharashtra (27)"), 7.2, GRAPHITE, "Helvetica-Bold")

    sec_y = card_y - 11 * mm
    txt(x0, sec_y, "02", 8, GREEN, "Helvetica-Bold")
    txt(x0 + 10 * mm, sec_y, "PROFESSIONAL SERVICES", 8, GRAPHITE, "Helvetica-Bold")
    rtxt(right_edge, sec_y, "CURRENCY  INR  (₹)", 6.5, MUTED, "Helvetica-Bold")

    table_x = x0
    table_w = right_edge - x0
    head_y = sec_y - 7 * mm
    rect(table_x, head_y - 9 * mm, table_w, 9 * mm, GRAPHITE, radius=1.5 * mm)
    col_desc = table_x + 4 * mm
    col_sac = table_x + 91 * mm
    col_qty = table_x + 111 * mm
    col_rate = table_x + 132 * mm
    col_amt = right_edge - 4 * mm
    txt(col_desc, head_y - 5.8 * mm, "SERVICE / DESCRIPTION", 6.4, WH, "Helvetica-Bold")
    txt(col_sac, head_y - 5.8 * mm, "SAC", 6.4, WH, "Helvetica-Bold")
    txt(col_qty, head_y - 5.8 * mm, "QTY", 6.4, WH, "Helvetica-Bold")
    rtxt(col_rate + 13 * mm, head_y - 5.8 * mm, "RATE", 6.4, WH, "Helvetica-Bold")
    rtxt(col_amt, head_y - 5.8 * mm, "AMOUNT", 6.4, LIME, "Helvetica-Bold")

    row_top = head_y - 9 * mm
    row_h = 15 * mm
    for i, line in enumerate(items):
        top = row_top - i * row_h
        if i % 2 == 1:
            rect(table_x, top - row_h, table_w, row_h, SOFT)
        desc = line.get("description", "")
        period = line.get("period", "")
        sac = line.get("hsnSac", "")
        qty = str(line.get("quantity", 1))
        rate = f"{float(line.get('rate', 0)):,.2f}"
        amount = f"{float(line.get('amount', 0)):,.2f}"
        txt(col_desc, top - 5.5 * mm, desc, 7.4, GRAPHITE, "Helvetica-Bold")
        txt(col_desc, top - 10 * mm, period, 6.1, MUTED)
        txt(col_sac, top - 7.8 * mm, sac, 6.8, INK)
        rtxt(col_qty + 9 * mm, top - 7.8 * mm, qty, 6.8, INK)
        rtxt(col_rate + 13 * mm, top - 7.8 * mm, rate, 6.8, INK)
        rtxt(col_amt, top - 7.8 * mm, amount, 6.8, GRAPHITE, "Helvetica-Bold")
        ln(table_x, top - row_h, right_edge, top - row_h, LINE, .4)

    bottom_top = row_top - 4 * row_h - 8 * mm
    left_w = 83 * mm
    right_w = table_w - left_w - 5 * mm
    rect(table_x, bottom_top - 47 * mm, left_w, 47 * mm, GRAPHITE, radius=2 * mm)
    txt(table_x + 5 * mm, bottom_top - 8 * mm, "03  /  PAYMENT DETAILS", 7.3, LIME, "Helvetica-Bold")
    txt(table_x + 5 * mm, bottom_top - 16 * mm, "BANK TRANSFER", 6, HexColor("#AEBBC7"), "Helvetica-Bold")
    bank_name = bank.get("bank_name", "Your Bank Name") if bank else "Your Bank Name"
    acct_name = bank.get("account_name", "Your Firm Name") if bank else "Your Firm Name"
    acct_no = bank.get("account_number", "XXXX XXXX XXXX") if bank else "XXXX XXXX XXXX"
    ifsc = bank.get("ifsc", "ABCD0001234") if bank else "ABCD0001234"
    upi = bank.get("upi_id", "yourfirm@upi") if bank else "yourfirm@upi"
    txt(table_x + 5 * mm, bottom_top - 21 * mm, bank_name, 7.2, WH, "Helvetica-Bold")
    txt(table_x + 5 * mm, bottom_top - 26 * mm, f"A/C: {acct_no}   ·   IFSC: {ifsc}", 6.1, HexColor("#E0E7ED"))
    txt(table_x + 5 * mm, bottom_top - 34 * mm, "UPI PAYMENT", 6, HexColor("#AEBBC7"), "Helvetica-Bold")
    txt(table_x + 5 * mm, bottom_top - 39 * mm, upi, 7.2, LIME, "Helvetica-Bold")
    txt(table_x + 5 * mm, bottom_top - 44 * mm, "Terms: Payable within 14 days", 6.1, HexColor("#E0E7ED"))

    rx = table_x + left_w + 5 * mm
    tot = [
        ("Subtotal", f"₹ {float(totals.get('taxableValue', 0)):,.2f}"),
    ]
    discount = float(totals.get("discount", 0))
    if discount > 0:
        tot.append(("Discount", f"-₹ {discount:,.2f}"))
    tot.append(("Taxable value", f"₹ {float(totals.get('taxableValue', 0)):,.2f}"))
    tax_rate = float(totals.get("taxRate", 0))
    is_inter = inv.get("isInterState", False)
    if is_inter:
        tot.append((f"IGST @ {tax_rate}%", f"₹ {float(totals.get('igst', 0)):,.2f}"))
    else:
        cgst = float(totals.get("cgst", 0))
        sgst = float(totals.get("sgst", 0))
        if cgst > 0:
            tot.append((f"CGST @ {tax_rate / 2}%", f"₹ {cgst:,.2f}"))
        if sgst > 0:
            tot.append((f"SGST @ {tax_rate / 2}%", f"₹ {sgst:,.2f}"))
    round_off = float(totals.get("roundOff", 0))
    if round_off != 0:
        tot.append(("Round off", f"₹ {round_off:,.2f}"))
    grand_total = float(totals.get("grandTotal", 0))
    for i, (label, value) in enumerate(tot):
        yy = bottom_top - 3 * mm - i * 5.7 * mm
        is_total_label = label == "Taxable value"
        txt(rx, yy, label, 7, GRAPHITE if is_total_label else MUTED, "Helvetica-Bold" if is_total_label else "Helvetica")
        rtxt(right_edge, yy, value, 7, GRAPHITE, "Helvetica-Bold" if is_total_label else "Helvetica")
        ln(rx, yy - 1.8 * mm, right_edge, yy - 1.8 * mm, LINE, .35)

    rect(rx, bottom_top - 47 * mm, right_w, 13 * mm, LIME, radius=2 * mm)
    txt(rx + 4 * mm, bottom_top - 39.2 * mm, "TOTAL PAYABLE", 6.3, GRAPHITE, "Helvetica-Bold")
    rtxt(right_edge - 4 * mm, bottom_top - 44.2 * mm, f"₹ {grand_total:,.2f}", 15, GRAPHITE, "Helvetica-Bold")

    words = _amount_in_words(grand_total, currency)
    txt(rx, bottom_top - 51 * mm, f"Amount in words: {words}", 5.6, MUTED)

    foot_y = bottom_top - 60 * mm
    ln(x0, foot_y + 7 * mm, right_edge, foot_y + 7 * mm, LINE, .6)
    txt(x0, foot_y + 1 * mm, "THANK YOU FOR YOUR TRUST.", 7.5, GRAPHITE, "Helvetica-Bold")
    txt(x0, foot_y - 4 * mm, "We appreciate the opportunity to support your business.", 6.5, MUTED)
    rtxt(right_edge, foot_y + 1 * mm, f"FOR {seller.get('name', 'YOUR FIRM NAME').upper()}", 7, GRAPHITE, "Helvetica-Bold")
    rtxt(right_edge, foot_y - 5 * mm, "AUTHORIZED SIGNATORY", 6, MUTED)
    ln(x0, foot_y - 10 * mm, right_edge, foot_y - 10 * mm, LINE, .4)
    text_footer1 = f"{seller.get('name', 'YOUR FIRM NAME')}  •  +91 00000 00000  •  accounts@yourfirm.in  •  www.yourfirm.in"
    txt(x0, foot_y - 15 * mm, text_footer1, 6, MUTED)
    txt(x0, foot_y - 20 * mm, "Illustrative template — verify service codes, GST rate and statutory particulars before issuing.", 5.5, MUTED)

    c.showPage()
    c.save()
    return buf.getvalue()


TEMPLATE_RENDERERS["grid_v6"] = _render_grid_v6


def render(ctx):
    """Render invoice PDF using the selected template."""
    template_name = ctx.get("template", "modern_gst")
    theme = THEMES.get(template_name, THEMES["modern_gst"])
    renderer = TEMPLATE_RENDERERS.get(template_name, _render_modern_gst)

    buf = BytesIO()
    doc = BaseDocTemplate(
        buf, pagesize=A4,
        leftMargin=17 * mm, rightMargin=17 * mm,
        topMargin=15 * mm, bottomMargin=15 * mm,
        title="Tax Invoice",
    )
    frame = Frame(
        doc.leftMargin, doc.bottomMargin,
        doc.width, doc.height,
        id="main",
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
    )
    story = renderer(ctx, theme, {})

    # Support canvas page callbacks (e.g. wave header/footer drawing)
    page_kwargs = {}
    on_first = ctx.get("_on_first_page")
    on_later = ctx.get("_on_later_page")
    if on_first or on_later:
        page_kwargs["onPage"] = on_first or on_later

    doc.addPageTemplates([PageTemplate(id="page", frames=[frame], **page_kwargs)])
    story = renderer(ctx, theme, {})

    # Canvas-based renderers return bytes directly; platypus renderers return a story list
    if isinstance(story, (bytes, bytearray)):
        return story

    doc.build(story)
    return buf.getvalue()


# Export listTemplates for the registry
def listTemplates():
    return list(TEMPLATE_RENDERERS.keys())


def registerTemplate(name, renderer):
    TEMPLATE_RENDERERS[name] = renderer
