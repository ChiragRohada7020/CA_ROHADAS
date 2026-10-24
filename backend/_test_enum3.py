from app.core.db import SessionLocal
from sqlalchemy import select, func, text

db = SessionLocal()
try:
    db.rollback()

    # Test with text() comparison - this is what works in raw SQL
    count = db.execute(
        select(func.count(func.cast(text('id'), text('INTEGER'))))
        .select_from(text('clients'))
        .where(text("tenant_id = '1075f794-2455-4f47-a220-ba3dfae17c53'"))
        .where(text("status = 'active'"))
    ).scalar()
    print("raw text count:", count)

    # Test: compare Client.status directly with string 'active' using ilike
    from app.models import Client
    count2 = db.execute(
        select(func.count(Client.id))
        .where(Client.tenant_id == '1075f794-2455-4f47-a220-ba3dfae17c53')
        .where(Client.status.op('::text').like('active'))  # PostgreSQL cast
    ).scalar()
    print("op ::text like result:", count2)

    # Alternative: use == with text
    count3 = db.execute(
        select(func.count(Client.id))
        .where(Client.tenant_id == '1075f794-2455-4f47-a220-ba3dfae17c53')
        .where(text("status = 'active'"))
    ).scalar()
    print("text where result:", count3)

except Exception as e:
    print("Error:", type(e).__name__, e)
finally:
    db.close()
