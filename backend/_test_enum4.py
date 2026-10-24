from app.core.db import SessionLocal
from sqlalchemy import select, func, text

db = SessionLocal()
try:
    db.rollback()

    # Test with text() in where clause only
    from app.models import Client
    count = db.execute(
        select(func.count(Client.id))
        .where(Client.tenant_id == '1075f794-2455-4f47-a220-ba3dfae17c53')
        .where(text("status = 'active'::client_status"))
    ).scalar()
    print("text where result:", count)

    # Test: Client.status == "active" but with native_enum=False behavior
    # Use the string value directly but force it
    from app.models.client import ClientStatus
    count2 = db.execute(text(
        "SELECT count(id) FROM clients WHERE tenant_id = '1075f794-2455-4f47-a220-ba3dfae17c53' AND status = :status_val"
    ), {"status_val": "active"}).scalar()
    print("parameterized text result:", count2)

except Exception as e:
    print("Error:", type(e).__name__, e)
finally:
    db.close()
