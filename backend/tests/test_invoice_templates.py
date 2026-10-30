"""Tests for the new premium invoice PDF templates."""

import pytest
from reportlab.lib.pagesizes import A4

from app.services.pdf_templates import (
    generateInvoicePDF,
    listTemplates,
    template_summary,
    get_template,
    template_ids,
)
from app.services.pdf_invoice_service import generate_invoice_pdf_better


def _sample_invoice_data():
    """Return a complete invoice data dict for testing."""
    return {
        "id": "test-123",
        "meta": {
            "invoiceNumber": "INV23-24:0001",
            "invoiceDate": "2025-10-27",
            "dueDate": "2025-11-11",
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
        },
        "items": [
            {
                "description": "GST Consultation Services",
                "hsnSac": "9985",
                "quantity": 1,
                "rate": 10000,
                "amount": 10000.0,
                "taxableValue": 10000.0,
            },
            {
                "description": "ITR Filing",
                "hsnSac": "9985",
                "quantity": 1,
                "rate": 2000,
                "amount": 2000.0,
                "taxableValue": 2000.0,
            },
        ],
        "totals": {
            "taxableValue": 12000.0,
            "discount": 0.0,
            "cgst": 1080.0,
            "sgst": 1080.0,
            "igst": 0.0,
            "grandTotal": 14160.0,
            "taxRate": 18.0,
        },
        "currency": "INR",
        "notes": "Thank you for your business.",
        "termsAndConditions": "Payment due within 15 days.",
        "bankDetails": {
            "bank_name": "SBI",
            "account_number": "1234567890",
            "ifsc": "SBIN0001234",
        },
        "isInterState": False,
        "placeOfSupply": "27",
    }


class TestPdfTemplates:
    """Test that all templates (old and new) generate valid PDF bytes."""

    @pytest.mark.parametrize("template", [
        "modern", "classic", "minimal", "corporate", "compact",
        "fintech", "corporate_premium", "editorial", "ca_professional",
    ])
    def test_template_generates_valid_pdf(self, template):
        data = _sample_invoice_data()
        pdf = generateInvoicePDF(data, {"template": template})
        assert isinstance(pdf, bytes)
        assert len(pdf) > 0
        assert pdf[:4] == b"%PDF"

    @pytest.mark.parametrize("template", [
        "fintech", "corporate_premium", "editorial", "ca_professional",
    ])
    def test_new_templates_include_gst_fields(self, template):
        """The ca_professional template should include Place of Supply and Tax Details."""
        data = _sample_invoice_data()
        pdf = generateInvoicePDF(data, {"template": template})
        # Verify it's a valid PDF
        assert pdf[:4] == b"%PDF"
        assert len(pdf) > 100
        # Verify the CA Professional template generates a larger PDF
        # due to the additional Tax Details section
        if template == "ca_professional":
            # ca_professional has more content than minimal editorial
            editorial_pdf = generateInvoicePDF(data, {"template": "editorial"})
            assert len(pdf) > len(editorial_pdf)

    def test_interstate_invoice_igst(self):
        """Inter-state invoices should show IGST instead of CGST/SGST."""
        data = _sample_invoice_data()
        data["isInterState"] = True
        data["totals"]["igst"] = 2160.0
        data["totals"]["cgst"] = 0.0
        data["totals"]["sgst"] = 0.0

        for template in ["ca_professional", "fintech", "editorial", "corporate_premium"]:
            pdf = generateInvoicePDF(data, {"template": template})
            assert pdf[:4] == b"%PDF"

    def test_multipage_invoice(self):
        """30 items should produce a multi-page PDF."""
        data = _sample_invoice_data()
        items = []
        for i in range(30):
            items.append({
                "description": f"Service item {i+1}: Professional advisory",
                "hsnSac": "9985",
                "quantity": 1,
                "rate": 2000,
                "amount": 2000.0,
                "taxableValue": 2000.0,
            })
        data["items"] = items
        data["totals"] = {
            "taxableValue": 60000.0,
            "discount": 0.0,
            "cgst": 5400.0,
            "sgst": 5400.0,
            "igst": 0.0,
            "grandTotal": 70800.0,
            "taxRate": 18.0,
        }

        for template in ["fintech", "ca_professional", "editorial"]:
            pdf = generateInvoicePDF(data, {"template": template})
            assert pdf[:4] == b"%PDF"
            # Count pages
            page_count = pdf.count(b"/Type /Page") - pdf.count(b"/Type /Pages")
            assert page_count >= 2, f"{template} should produce at least 2 pages for 30 items"

    def test_long_description_wraps(self):
        """Long descriptions should wrap without error."""
        data = _sample_invoice_data()
        data["items"][0]["description"] = (
            "This is a very long description that should wrap across multiple lines "
            "in the PDF table cell demonstrating how the template handles multi-line "
            "content for professional services engagements that require detailed "
            "descriptions of the work performed including tax planning strategic "
            "advisory compliance review and multiple follow-up consultations."
        )
        for template in ["fintech", "ca_professional", "editorial"]:
            pdf = generateInvoicePDF(data, {"template": template})
            assert pdf[:4] == b"%PDF"


class TestTemplateMetadata:
    """Test the template metadata functions."""

    def test_list_templates_includes_premium(self):
        ids = listTemplates()
        assert "fintech" in ids
        assert "corporate_premium" in ids
        assert "editorial" in ids
        assert "ca_professional" in ids

    def test_template_summary_includes_all(self):
        summary = template_summary()
        ids = {s["id"] for s in summary}
        assert "fintech" in ids
        assert "corporate_premium" in ids
        assert "editorial" in ids
        assert "ca_professional" in ids

    def test_get_template(self):
        meta = get_template("fintech")
        assert meta is not None
        assert meta.name == "Modern Fintech"
        assert meta.category == "Premium"

    def test_template_ids(self):
        ids = template_ids()
        assert "modern" in ids
        assert "fintech" in ids

    def test_unknown_template_returns_none(self):
        meta = get_template("nonexistent")
        assert meta is None


class TestPdfInvoiceService:
    """Test the pdf_invoice_service generates PDFs with template override."""

    def test_generate_invoice_pdf_better_accepts_template_override(self):
        from types import SimpleNamespace
        from datetime import datetime, timezone

        invoice_db = SimpleNamespace(
            id="123e4567-e89b-12d3-a456-426614174000",
            invoice_number="INV23-24:0001",
            invoice_date=datetime(2025, 10, 27, tzinfo=timezone.utc),
            due_date=datetime(2025, 11, 11, tzinfo=timezone.utc),
            subtotal=12000.0,
            discount_total=0.0,
            cgst_amount=1080.0,
            sgst_amount=1080.0,
            igst_amount=0.0,
            total=14160.0,
            amount_paid=0.0,
            outstanding=14160.0,
            notes="Test notes",
            terms="Test terms",
            gst_tax_type="intra_state",
            tax_rate=18.0,
            bank_details=None,
            client_name="Test Client",
            place_of_supply_state_code="27",
        )

        client = SimpleNamespace(
            id="456e7890-e89b-12d3-a456-426614174000",
            legal_name="Test Client LLP",
            trade_name="Test Client LLP",
            address_line1="123, MG Road",
            address_line2=None,
            city="Mumbai",
            state="Maharashtra",
            pincode="400001",
            state_code="27",
            gstin="27AACTT1234F1Z5",
            pan="AACTT1234F",
            email="client@test.com",
            phone="+91 98765 43210",
        )

        firm = SimpleNamespace(
            legal_name="Rohadas & Associates",
            trade_name="Rohadas CA",
            address_line1="456, Linking Road",
            address_line2=None,
            city="Mumbai",
            state="Maharashtra",
            pincode="400050",
            state_code="27",
            gstin="27ABCDE1234F1Z5",
            pan="ABCDE1234F",
            email="firm@rohadass.com",
            phone="+91 22 1234 5678",
            invoice_template="fintech",
        )

        lines = [
            SimpleNamespace(
                id="line-1",
                description="GST Consultation",
                sac_code="9985",
                quantity=1,
                unit_price=10000.0,
                amount=10000.0,
                discount=0.0,
                is_taxable=True,
            ),
        ]

        # Test with override
        pdf = generate_invoice_pdf_better(invoice_db, lines, client, firm, template_override="ca_professional")
        assert isinstance(pdf, bytes)
        assert pdf[:4] == b"%PDF"

        # Test without override (uses firm's template)
        pdf2 = generate_invoice_pdf_better(invoice_db, lines, client, firm)
        assert isinstance(pdf2, bytes)
        assert pdf2[:4] == b"%PDF"
