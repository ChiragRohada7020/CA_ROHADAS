from app.core.db import SessionLocal
from app.models import Client
from app.models.client import ClientStatus
from sqlalchemy import select, func, text, cast, String

db = SessionLocal()
try:
    db.rollback()  # Clear any failed transaction state

    # Test with cast
    count = db.execute(
        select(func.count(Client.id))
        .where(Client.tenant_id == '1075f794-2455-4f47-a220-ba3dfae17c53')
        .where(cast(Client.status, String) == "active")
    ).scalar()
    print("cast result:", count)

    # Test with ClientStatus.ACTIVE.value
    count2 = db.execute(
        select(func.count(Client.id))
        .where(Client.tenant_id == '1075f794-2455-4f47-a220-ba3dfae17c53')
        .where(cast(Client.status, String) == ClientStatus.ACTIVE.value)
    ).scalar()
    print("cast with .value result:", count2)

except Exception as e:
    print("Error:", e)
finally:
    db.close()
