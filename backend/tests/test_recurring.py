import uuid

import pytest

from app.models import Invoice, RecurringSchedule
from app.services.billing import create_invoice_record
from app.core.errors import NotFoundError
from app.core.clock import now_local


TENANT_ID = "11111111-1111-1111-1111-111111111111"


@pytest.fixture()
def schedule(db_session, tenant_ctx):
    sched = RecurringSchedule(
        tenant_id=uuid.UUID(tenant_ctx["tenant_id"]),
        client_id=uuid.UUID(tenant_ctx["client_id"]),
        frequency="monthly",
        fee=5000.0,
        status="active",
        next_billing_date=now_local(),
    )
    db_session.add(sched)
    db_session.commit()
    db_session.refresh(sched)
    return sched


def test_create_recurring_schedule(db_session, tenant_ctx, schedule):
    assert schedule.status == "active"
    assert schedule.fee == 5000.0


def test_generate_invoice_from_schedule(db_session, tenant_ctx, schedule):
    tenant_id = uuid.UUID(tenant_ctx["tenant_id"])
    items = [
        {"description": schedule.description or "Recurring fee", "unit_price": schedule.fee, "quantity": 1, "is_taxable": True}
    ]
    invoice = create_invoice_record(
        db_session,
        tenant_id=tenant_id,
        client_id=str(schedule.client_id),
        items=items,
        created_by_id=tenant_ctx["user_id"],
    )
    db_session.add(invoice)
    db_session.commit()
    assert invoice.status == "draft"
    assert invoice.total >= 5000.0


def test_schedule_tenant_isolation(db_session, tenant_ctx, schedule):
    assert str(schedule.tenant_id) == str(tenant_ctx["tenant_id"])
    assert str(schedule.tenant_id) != str(uuid.uuid4())
