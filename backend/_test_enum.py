from app.core.db import SessionLocal
from app.models import Client
from app.models.client import ClientStatus
from sqlalchemy import select, func, text, cast, String

db = SessionLocal()

# Test 1: Client.status == ClientStatus.ACTIVE
try:
    count = db.execute(
        select(func.count(Client.id))
        .where(Client.tenant_id == '1075f794-2455-4f47-a220-ba3dfae17c53')
        .where(Client.status == ClientStatus.ACTIVE)
    ).scalar()
    print("Test 1 (ClientStatus.ACTIVE):", count)
except Exception as e:
    print("Test 1 error:", e)

# Test 2: Client.status == "active" (lowercase string)
try:
    count = db.execute(
        select(func.count(Client.id))
        .where(Client.tenant_id == '1075f794-2455-4f47-a220-ba3dfae17c53')
        .where(Client.status == "active")
    ).scalar()
    print("Test 2 (lowercase 'active'):", count)
except Exception as e:
    print("Test 2 error:", e)

# Test 3: cast(Client.status, String) == "active"
try:
    count = db.execute(
        select(func.count(Client.id))
        .where(Client.tenant_id == '1075f794-2455-4f47-a220-ba3dfae17c53')
        .where(cast(Client.status, String) == "active")
    ).scalar()
    print("Test 3 (cast):", count)
except Exception as e:
    print("Test 3 error:", e)

# Test 4: raw text
try:
    count = db.execute(text(
        "SELECT count(*) FROM clients WHERE tenant_id = '1075f794-2455-4f47-a220-ba3dfae17c53' AND status = 'active'"
    )).scalar()
    print("Test 4 (raw text):", count)
except Exception as e:
    print("Test 4 error:", e)

db.close()
