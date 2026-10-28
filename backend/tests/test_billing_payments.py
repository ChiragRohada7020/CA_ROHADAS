import uuid
import pytest
from decimal import Decimal
from app.core.db import SessionLocal
from app.models import Invoice, Client
from app.services.billing import create_invoice_record, record_payment
from app.core.errors import ValidationError, NotFoundError


TENANT_ID = "11111111-1111-1111-1111-111111111111"
USER_ID = "22222222-2222-2222-2222-222222222222"


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


def test_amount_must_be_positive(db_session, invoice, tenant_ctx):
    with pytest.raises(ValidationError):
        record_payment(db_session, TENANT_ID, invoice.id, 0, "cash")
    with pytest.raises(ValidationError):
        record_payment(db_session, TENANT_ID, invoice.id, -5, "cash")


def test_outstanding_cap(db_session, invoice, tenant_ctx):
    with pytest.raises(ValidationError):
        record_payment(db_session, TENANT_ID, invoice.id, float(invoice.total) + 1, "cash")


def test_status_transitions(db_session, invoice, tenant_ctx):
    # partial
    p1 = record_payment(db_session, TENANT_ID, invoice.id, 400, "cash")
    db_session.refresh(invoice)
    assert invoice.status == "partially_paid"
    # full remaining
    p2 = record_payment(db_session, TENANT_ID, invoice.id, float(invoice.outstanding), "upi")
    db_session.refresh(invoice)
    assert invoice.status == "paid"
    assert float(invoice.outstanding) == 0.0


def test_tenant_mismatch_rejected(db_session, invoice, tenant_ctx):
    other = "33333333-3333-3333-3333-333333333333"
    with pytest.raises(NotFoundError):
        record_payment(db_session, other, invoice.id, 100, "cash")


def test_rollback_on_failure(db_session, invoice, tenant_ctx):
    # Force failure by invalid method? Instead simulate by monkeypatching commit
    original_commit = db_session.commit
    def boom():
        raise RuntimeError("boom")
    db_session.commit = boom
    try:
        with pytest.raises(RuntimeError):
            record_payment(db_session, TENANT_ID, invoice.id, 100, "cash")
    finally:
        db_session.commit = original_commit
    db_session.rollback()
    # payment should not be persisted
    from app.models import Payment
    count = db_session.query(Payment).filter(Payment.invoice_id == invoice.id).count()
    assert count == 0
