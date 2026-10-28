import uuid

import pytest
from app.models import Invoice, CreditNote
from app.services.billing import create_invoice_record, issue_invoice
from app.services.credit_note import create_credit_note, issue_credit_note, apply_credit_note, cancel_credit_note
from app.core.errors import NotFoundError, ValidationError


TENANT_ID = "11111111-1111-1111-1111-111111111111"


@pytest.fixture()
def invoice(db_session, tenant_ctx):
    tenant_id = uuid.UUID(tenant_ctx["tenant_id"])
    client_id = uuid.UUID(tenant_ctx["client_id"])
    inv = create_invoice_record(
        db_session,
        tenant_id=tenant_id,
        client_id=client_id,
        items=[{"description": "Consultation", "unit_price": 1000, "quantity": 1}],
    )
    db_session.add(inv)
    db_session.commit()
    db_session.refresh(inv)
    return inv


def test_credit_note_requires_issued_invoice(db_session, invoice, tenant_ctx):
    tenant_id = uuid.UUID(tenant_ctx["tenant_id"])
    try:
        create_credit_note(
            db_session,
            tenant_id=tenant_id,
            invoice_id=str(invoice.id),
            items=[{"description": "Correction", "unit_price": 200, "quantity": 1}],
        )
    except ValidationError:
        pass
    else:
        assert False, "Expected ValidationError for draft invoice"


def test_create_and_issue_credit_note(db_session, invoice, tenant_ctx):
    tenant_id = uuid.UUID(tenant_ctx["tenant_id"])
    invoice_issue = issue_invoice(db_session, tenant_id, str(invoice.id))
    cn = create_credit_note(
        db_session,
        tenant_id=tenant_id,
        invoice_id=str(invoice.id),
        items=[{"description": "Correction", "unit_price": 200, "quantity": 1}],
        reason="Overcharged",
    )
    assert cn.status == "draft"
    assert cn.total == 200.0
    assert cn.note_number is not None
    issue_credit_note(db_session, tenant_id, str(cn.id))
    db_session.refresh(cn)
    assert cn.status == "issued"


def test_apply_credit_note_reduces_outstanding(db_session, invoice, tenant_ctx):
    from decimal import Decimal
    tenant_id = uuid.UUID(tenant_ctx["tenant_id"])
    issue_invoice(db_session, tenant_id, str(invoice.id))
    cn = create_credit_note(
        db_session,
        tenant_id=tenant_id,
        invoice_id=str(invoice.id),
        items=[{"description": "Correction", "unit_price": 300, "quantity": 1}],
        reason="Overcharged",
    )
    issue_credit_note(db_session, tenant_id, str(cn.id))
    result = apply_credit_note(db_session, tenant_id, str(cn.id))
    inv = result["invoice"]
    assert float(inv.outstanding) == 700.0
    assert inv.status == "issued"


def test_credit_note_tenant_isolation(db_session, invoice, tenant_ctx):
    other_tenant = uuid.uuid4()
    try:
        create_credit_note(
            db_session,
            tenant_id=other_tenant,
            invoice_id=str(invoice.id),
            items=[{"description": "Correction", "unit_price": 200, "quantity": 1}],
        )
    except NotFoundError:
        pass
    else:
        assert False, "Expected NotFoundError for wrong tenant"


def test_cancel_credit_note(db_session, invoice, tenant_ctx):
    tenant_id = uuid.UUID(tenant_ctx["tenant_id"])
    issue_invoice(db_session, tenant_id, str(invoice.id))
    cn = create_credit_note(
        db_session,
        tenant_id=tenant_id,
        invoice_id=str(invoice.id),
        items=[{"description": "Correction", "unit_price": 200, "quantity": 1}],
    )
    issue_credit_note(db_session, tenant_id, str(cn.id))
    cancel_credit_note(db_session, tenant_id, str(cn.id))
    db_session.refresh(cn)
    assert cn.status == "cancelled"
