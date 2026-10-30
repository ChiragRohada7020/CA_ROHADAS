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
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
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
# Template registry: map every template id to one of the 6 core layouts
# ---------------------------------------------------------------------------

# DISABLED — all invoice template renderers removed pending new design.
# TEMPLATE_RENDERERS = {
#     "modern": _render_modern,
#     "fintech": _render_modern,
#     "fresh": _render_modern,
#     "editorial": _render_editorial,
#     "elegant": _render_editorial,
#     "corporate": _render_corporate,
#     "ca_professional": _render_corporate,
#     "heritage": _render_corporate,
#     "corporate_premium": _render_split_panel,
#     "minimal": _render_minimal,
#     "compact": _render_minimal,
#     "classic": _render_corporate,
#     "bold": _render_bold,
# }

# DISABLED — all invoice template themes removed pending new design.
# THEMES = {
#     "modern": {
#         "primary": "#2563eb", "primaryDark": "#1d4ed8", "text": "#111827", "muted": "#6b7280",
#         "border": "#e5e7eb", "background": "#ffffff", "rowAlt": "#f9fafb", "accent": "#0ea5e9",
#     },
#     "classic": {
#         "primary": "#1f4e79", "primaryDark": "#173a5c", "text": "#111111", "muted": "#6b6b6b",
#         "border": "#d9d9d9", "background": "#ffffff", "rowAlt": "#f7f7f7", "accent": "#8b4513",
#     },
#     "minimal": {
#         "primary": "#000000", "primaryDark": "#000000", "text": "#111111", "muted": "#6b6b6b",
#         "border": "#e5e7eb", "background": "#ffffff", "rowAlt": "#f9fafb", "accent": "#374151",
#     },
#     "corporate": {
#         "primary": "#1a237e", "primaryDark": "#0d1a5c", "text": "#1a237e", "muted": "#5c6bc0",
#         "border": "#c5cae9", "background": "#f8f9fc", "rowAlt": "#e8eaf6", "accent": "#3f51b5",
#     },
#     "compact": {
#         "primary": "#111827", "primaryDark": "#000000", "text": "#111827", "muted": "#6b7280",
#         "border": "#e5e7eb", "background": "#ffffff", "rowAlt": "#f9fafb", "accent": "#dc2626",
#     },
#     "fintech": {
#         "primary": "#635bff", "primaryDark": "#5046d6", "text": "#0a0a2e", "muted": "#6b7280",
#         "border": "#e5e7eb", "background": "#ffffff", "rowAlt": "#f5f5ff", "accent": "#00d4aa",
#     },
#     "corporate_premium": {
#         "primary": "#1e3a5f", "primaryDark": "#152942", "text": "#1a1a2e", "muted": "#5a6a85",
#         "border": "#d4dde8", "background": "#f8fafc", "rowAlt": "#eef2f7", "accent": "#c9a961",
#     },
#     "editorial": {
#         "primary": "#1a1a1a", "primaryDark": "#000000", "text": "#1a1a1a", "muted": "#6b6b6b",
#         "border": "#e0e0e0", "background": "#ffffff", "rowAlt": "#fafafa", "accent": "#8b7355",
#     },
#     "ca_professional": {
#         "primary": "#0b3d2e", "primaryDark": "#06281c", "text": "#0f1f1a", "muted": "#4a5a55",
#         "border": "#b8c4bd", "background": "#ffffff", "rowAlt": "#f0f5f3", "accent": "#d4a017",
#     },
#     "elegant": {
#         "primary": "#b45309", "primaryDark": "#92400e", "text": "#1c1917", "muted": "#78716c",
#         "border": "#e7d5ca", "background": "#fbf6ee", "rowAlt": "#f3e7cc", "accent": "#d4a373",
#     },
#     "bold": {
#         "primary": "#1f2933", "primaryDark": "#111827", "text": "#030712", "muted": "#6b7280",
#         "border": "#e5e7eb", "background": "#f3f4f6", "accent": "#d97706",
#     },
#     "fresh": {
#         "primary": "#0d9488", "primaryDark": "#0f766e", "text": "#0f172a", "muted": "#64748b",
#         "border": "#99f6e4", "background": "#ffffff", "rowAlt": "#ecfeff", "accent": "#14b8a6",
#     },
#     "heritage": {
#         "primary": "#7f1d1d", "primaryDark": "#450a0a", "text": "#4c0a0a", "muted": "#874141",
#         "border": "#fca5a5", "background": "#fdf5f0", "rowAlt": "#fdece2", "accent": "#dc2626",
#     },
# }


def render(ctx):
    """Render invoice PDF using the selected template.

    DISABLED — all invoice template styles removed pending new design.
    Returns a minimal empty PDF until the new design is implemented.
    """
    buf = BytesIO()
    doc = BaseDocTemplate(
        buf, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=14 * mm, bottomMargin=16 * mm, title="Invoice",
    )
    doc.build([])
    return buf.getvalue()


# Export listTemplates for the registry
def listTemplates():
    return []  # DISABLED — all templates removed pending new design


def registerTemplate(name, renderer):
    pass  # kept for API compatibility
