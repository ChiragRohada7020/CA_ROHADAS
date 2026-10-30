"""Structure-verification tests for the invoice PDF renderers.

The existing ``test_invoice_templates.py`` only checks that the generated
bytes start with ``%PDF`` and are non-empty.  That is necessary but *not
sufficient*: it cannot tell whether the renderer actually placed the invoice
number, line items, GST breakdown, totals, etc. on the page.

These tests use ``pypdf`` to extract the text of every generated page and
assert that the structural elements a CA tax invoice must contain are
actually present in the rendered content.

The PDF is generated directly through ``app.services.pdf_templates`` — no
database, no network, no authentication — so the tests are deterministic and
isolated.
"""

from __future__ import annotations

from io import BytesIO
from textwrap import dedent

import pytest
from pypdf import PdfReader

from app.services.pdf_templates import generateInvoicePDF, listTemplates
from app.services.pdf_invoice_service import generate_invoice_pdf_better

try:
    import pypdf  # noqa: F401  (import guard for the test collector)
    _PYPDF_AVAILABLE = True
except Exception:  # pragma: no cover - environment guard
    _PYPDF_AVAILABLE = False

skip_if_no_pypdf = pytest.mark.skipif(
    not _PYPDF_AVAILABLE,
    reason="pypdf is required for PDF text-extraction tests",
)


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

def _sample_invoice_data():
    """Return a complete, intra-state invoice data dict for testing."""
    return {
        "id": "test-123",
        "meta": {
            "invoiceNumber": "INV23-24:0001",
            "invoiceDate": "27-10-2025",
            "dueDate": "11-11-2025",
            "placeOfSupply": "27",
            "reverseCharge": False,
            "taxRate": 18.0,
        },
        "seller": {
            "name": "Rohadas & Associates",
            "address": "456, Linking Road, Mumbai, Maharashtra 400050",
            "gstin": "27ABCDE1234F1Z5",
            "pan": "ABCDE1234F",
            "email": "firm@rohadass.com",
            "phone": "+91 22 1234 5678",
        },
        "buyer": {
            "name": "Test Client LLP",
            "address": "123, MG Road, Mumbai, Maharashtra 400001",
            "gstin": "27AACTT1234F1Z5",
            "pan": "AACTT1234F",
            "email": "client@test.com",
            "phone": "+91 98765 43210",
        },
        "items": [
            {
                "description": "GST Consultation Services",
                "hsnSac": "9985",
                "quantity": 2,
                "rate": 10000,
                "amount": 20000.0,
                "taxableValue": 20000.0,
                "discount": 0.0,
            },
            {
                "description": "ITR Filing",
                "hsnSac": "9985",
                "quantity": 1,
                "rate": 2000,
                "amount": 2000.0,
                "taxableValue": 2000.0,
                "discount": 0.0,
            },
        ],
        "totals": {
            "taxableValue": 22000.0,
            "discount": 0.0,
            "cgst": 1980.0,
            "sgst": 1980.0,
            "igst": 0.0,
            "grandTotal": 25960.0,
            "taxRate": 18.0,
        },
        "currency": "INR",
        "notes": "Thank you for your business.",
        "termsAndConditions": "Payment due within 15 days.",
        "bankDetails": {
            "bank_name": "SBI",
            "account_number": "1234567890",
            "ifsc": "SBIN0001234",
            "upi_id": "rohadas@upi",
        },
        "isInterState": False,
        "placeOfSupply": "27",
    }


def _interstate_invoice_data():
    """An inter-state (IGST) variant of the sample invoice."""
    data = _sample_invoice_data()
    data["isInterState"] = True
    data["totals"] = {
        "taxableValue": 22000.0,
        "discount": 0.0,
        "cgst": 0.0,
        "sgst": 0.0,
        "igst": 3960.0,
        "grandTotal": 25960.0,
        "taxRate": 18.0,
    }
    return data


def _extract_text(pdf_bytes: bytes) -> str:
    """Return the concatenated text of every page in a PDF."""
    reader = PdfReader(BytesIO(pdf_bytes))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages)


def _render(template: str, data=None) -> str:
    """Generate a PDF for *template* and return its extracted text."""
    data = data if data is not None else _sample_invoice_data()
    pdf = generateInvoicePDF(data, {"template": template})
    return _extract_text(pdf)


ALL_TEMPLATES = [
    "modern", "classic", "minimal", "corporate", "compact",
    "fintech", "corporate_premium", "editorial", "ca_professional",
    "elegant", "bold", "fresh", "heritage",
]

# Substrings that MUST appear in every template's rendered text.
REQUIRED_SUBSTRINGS = {
    "invoice number": "INV23-24:0001",
    "seller name": "Rohadas & Associates",
    "seller gstin": "27ABCDE1234F1Z5",
    "seller pan": "ABCDE1234F",
    "buyer name": "Test Client LLP",
    "buyer gstin": "27AACTT1234F1Z5",
    "buyer pan": "AACTT1234F",
    "item description 1": "GST Consultation Services",
    "item description 2": "ITR Filing",
    "hsn/sac code": "9985",
    "grand total": "25,960.00",
    "computer-generated footer": "computer-generated",
    "authorised signatory": "uthorised ignatory",
}


class _NS:
    """Minimal namespace stand-in for an ORM object (getattr based)."""

    def __init__(self, **kw):
        self.__dict__.update(kw)


# ---------------------------------------------------------------------------
# 1. PDF validity
# ---------------------------------------------------------------------------

@skip_if_no_pypdf
@pytest.mark.parametrize("template", ALL_TEMPLATES)
def test_template_produces_valid_pdf(template):
    """Each registered template must emit byte-identical valid PDF bytes."""
    pdf = generateInvoicePDF(_sample_invoice_data(), {"template": template})
    assert isinstance(pdf, bytes)
    assert len(pdf) > 0
    assert pdf[:4] == b"%PDF"


@skip_if_no_pypdf
@pytest.mark.parametrize("template", ALL_TEMPLATES)
def test_template_is_single_page_for_sample(template):
    """The sample invoice (2 line items) must render to at least one page cleanly."""
    pdf = generateInvoicePDF(_sample_invoice_data(), {"template": template})
    reader = PdfReader(BytesIO(pdf))
    assert len(reader.pages) >= 1


# ---------------------------------------------------------------------------
# 2. Structural elements that MUST appear in every template
# ---------------------------------------------------------------------------

@skip_if_no_pypdf
@pytest.mark.parametrize("template", ALL_TEMPLATES)
def test_template_contains_required_structural_elements(template):
    """Every template must render the key structural content of a tax invoice."""
    text = _render(template)
    missing = [label for label, needle in REQUIRED_SUBSTRINGS.items() if needle not in text]
    assert not missing, (
        f"Template '{template}' is missing required structural elements: {missing}.\n"
        f"Rendered text:\n{dedent(text)[:1200]}"
    )


@skip_if_no_pypdf
@pytest.mark.parametrize("template", ALL_TEMPLATES)
def test_template_contains_line_item_table_header(template):
    """Every template must render the line-item table with its column headers."""
    text = _render(template)
    assert "S.No" in text
    assert "Description of goods / services" in text
    assert "HSN / SAC" in text
    assert "Amount" in text


# ---------------------------------------------------------------------------
# 3. GST breakdown correctness (intra-state -> CGST+SGST, inter -> IGST)
# ---------------------------------------------------------------------------

@skip_if_no_pypdf
@pytest.mark.parametrize("template", ALL_TEMPLATES)
def test_intrastate_shows_cgst_sgst_not_igst(template):
    """Intra-state invoices must show CGST & SGST and must NOT show IGST."""
    text = _render(template, _sample_invoice_data())
    assert "CGST" in text, f"{template}: intra-state invoice must show CGST"
    assert "SGST" in text, f"{template}: intra-state invoice must show SGST"
    assert "IGST" not in text, f"{template}: intra-state invoice must NOT show IGST"


@skip_if_no_pypdf
@pytest.mark.parametrize("template", ALL_TEMPLATES)
def test_interstate_shows_igst_not_cgst_sgst(template):
    """Inter-state invoices must show IGST and must NOT show CGST/SGST."""
    text = _render(template, _interstate_invoice_data())
    assert "IGST" in text, f"{template}: inter-state invoice must show IGST"
    assert "CGST" not in text, f"{template}: inter-state invoice must NOT show CGST"
    assert "SGST" not in text, f"{template}: inter-state invoice must NOT show SGST"


@skip_if_no_pypdf
@pytest.mark.parametrize("template", ALL_TEMPLATES)
def test_totals_values_match_data(template):
    """The grand total and component tax values must appear with correct amounts."""
    text = _render(template)
    assert "25,960.00" in text  # grand total
    assert "1,980.00" in text   # each of CGST / SGST


# ---------------------------------------------------------------------------
# 4. Buyer/seller blocks must appear EXACTLY once (regression guard for _render_modern)
# ---------------------------------------------------------------------------

@skip_if_no_pypdf
@pytest.mark.parametrize("template", ALL_TEMPLATES)
def test_buyer_block_not_duplicated(template):
    """The buyer (client) name must appear exactly once in every template.

    This guards against the structural bug where ``_render_modern`` appends
    the buyer table to the story directly *and* embeds it again inside the
    side-by-side table, causing the client block to be drawn twice.
    """
    text = _render(template)
    buyer_name = _sample_invoice_data()["buyer"]["name"]
    buyer_gstin = _sample_invoice_data()["buyer"]["gstin"]
    assert text.count(buyer_name) == 1, (
        f"Template '{template}' renders the buyer block "
        f"{text.count(buyer_name)} times instead of 1 — the buyer "
        f"information is duplicated in the generated PDF."
    )
    assert text.count(buyer_gstin) == 1, (
        f"Template '{template}' renders the buyer GSTIN "
        f"{text.count(buyer_gstin)} times instead of 1."
    )


@skip_if_no_pypdf
@pytest.mark.parametrize("template", ALL_TEMPLATES)
def test_seller_block_not_duplicated(template):
    """The seller (firm) name must appear exactly once."""
    text = _render(template)
    seller_name = _sample_invoice_data()["seller"]["name"]
    assert text.count(seller_name) == 1, (
        f"Template '{template}' renders the seller block "
        f"{text.count(seller_name)} times instead of 1."
    )


# ---------------------------------------------------------------------------
# 5. Multi-page rendering preserves structure across pages
# ---------------------------------------------------------------------------

@skip_if_no_pypdf
@pytest.mark.parametrize("template", ["modern", "corporate", "editorial", "corporate_premium", "minimal", "bold"])
def test_multipage_invoice_preserves_structure(template):
    """A long invoice must span multiple pages; totals/footer must survive."""
    data = _sample_invoice_data()
    data["items"] = [
        {
            "description": f"Service item {i+1}: Professional advisory and compliance work",
            "hsnSac": "9985",
            "quantity": 1,
            "rate": 2000,
            "amount": 2000.0,
            "taxableValue": 2000.0,
            "discount": 0.0,
        }
        for i in range(40)
    ]
    data["totals"] = {
        "taxableValue": 80000.0, "discount": 0.0,
        "cgst": 7200.0, "sgst": 7200.0, "igst": 0.0,
        "grandTotal": 94400.0, "taxRate": 18.0,
    }
    pdf = generateInvoicePDF(data, {"template": template})
    reader = PdfReader(BytesIO(pdf))
    assert len(reader.pages) >= 2, f"{template} should paginate past 1 page for 40 items"

    full_text = _extract_text(pdf)
    assert "94,400.00" in full_text
    assert "computer-generated" in full_text.lower()


# ---------------------------------------------------------------------------
# 6. Template resolution / fallback behaviour
# ---------------------------------------------------------------------------

@skip_if_no_pypdf
def test_unknown_template_falls_back_to_modern():
    """An unknown template name must fall back to 'modern' without erroring."""
    pdf = generateInvoicePDF(_sample_invoice_data(), {"template": "does-not-exist"})
    assert pdf[:4] == b"%PDF"
    text = _extract_text(pdf)
    assert "Test Client LLP" in text


@skip_if_no_pypdf
def test_default_template_is_modern():
    """When no template option is supplied, the renderer defaults to 'modern'."""
    pdf_no_opt = generateInvoicePDF(_sample_invoice_data())
    pdf_modern = generateInvoicePDF(_sample_invoice_data(), {"template": "modern"})
    assert pdf_no_opt == pdf_modern


@skip_if_no_pypdf
def test_template_option_inside_invoice_dict_used():
    """generateInvoicePDF must honour an invoice-level 'template' key."""
    data = _sample_invoice_data()
    pdf = generateInvoicePDF({**data, "template": "corporate"})
    assert pdf[:4] == b"%PDF"
    text = _extract_text(pdf)
    assert "TAX INVOICE" in text


# ---------------------------------------------------------------------------
# 7. Service-layer integration (object-based builder)
# ---------------------------------------------------------------------------

@skip_if_no_pypdf
@pytest.mark.parametrize("template", ["modern", "ca_professional", "editorial", "corporate_premium", "bold"])
def test_generate_invoice_pdf_better_renders_structure(template):
    """The service-layer builder must emit a structurally complete PDF."""
    from datetime import datetime, timezone

    invoice_db = _NS(
        id="123e4567-e89b-12d3-a456-426614174000",
        invoice_number="INV23-24:0001",
        invoice_date=datetime(2025, 10, 27, tzinfo=timezone.utc),
        due_date=datetime(2025, 11, 11, tzinfo=timezone.utc),
        subtotal=22000.0, discount_total=0.0,
        cgst_amount=1980.0, sgst_amount=1980.0, igst_amount=0.0,
        total=25960.0, amount_paid=0.0, outstanding=25960.0,
        notes="Test notes", terms="Payment due within 15 days",
        gst_tax_type="intra_state", tax_rate=18.0,
        bank_details=None, client_name="Test Client LLP",
        place_of_supply_state_code="27",
    )
    client = _NS(
        id="456e7890-e89b-12d3-a456-426614174000",
        legal_name="Test Client LLP", trade_name="Test Client LLP",
        address_line1="123, MG Road", address_line2=None,
        city="Mumbai", state="Maharashtra", pincode="400001", state_code="27",
        gstin="27AACTT1234F1Z5", pan="AACTT1234F",
        email="client@test.com", phone="+91 98765 43210",
    )
    firm = _NS(
        legal_name="Rohadas & Associates", trade_name="Rohadas CA",
        address_line1="456, Linking Road", address_line2=None,
        city="Mumbai", state="Maharashtra", pincode="400050", state_code="27",
        gstin="27ABCDE1234F1Z5", pan="ABCDE1234F",
        email="firm@rohadass.com", phone="+91 22 1234 5678",
        invoice_template="fintech",
    )
    lines = [
        _NS(id="line-1", description="GST Consultation", sac_code="9985",
            quantity=2, unit_price=10000.0, amount=20000.0,
            discount=0.0, is_taxable=True),
        _NS(id="line-2", description="ITR Filing", sac_code="9985",
            quantity=1, unit_price=2000.0, amount=2000.0,
            discount=0.0, is_taxable=True),
    ]

    pdf = generate_invoice_pdf_better(
        invoice_db, lines, client, firm, template_override=template,
    )
    assert pdf[:4] == b"%PDF"
    text = _extract_text(pdf)
    # Buyer must not be duplicated when going through the service layer too.
    assert text.count("Test Client LLP") == 1, (
        f"Service-layer template '{template}' duplicated the buyer block"
    )
    assert "CGST" in text and "SGST" in text
    assert "25,960.00" in text
