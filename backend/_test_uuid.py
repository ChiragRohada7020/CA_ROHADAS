from sqlalchemy import text
from app.core.db import SessionLocal

db = SessionLocal()
try:
    # Original format that worked before
    r = db.execute(text(
        "SELECT count(*) FROM clients WHERE tenant_id = '1075f794-2455-4f47-a220-ba3dfae17c53' AND status = 'active'"
    )).scalar()
    print("original format count:", r)

    # With explicit uuid cast
    r2 = db.execute(text(
        "SELECT count(*) FROM clients WHERE tenant_id = '1075f794-2455-4f47-a220-ba3dfae17c53'::uuid AND status = 'active'"
    )).scalar()
    print("with ::uuid cast:", r2)
    
    # Direct UUID comparison
    r3 = db.execute(text(
        "SELECT count(*) FROM clients WHERE tenant_id = '1075f794-2455-4f47-a220-ba3dfae17c53'::text AND status = 'active'"
    )).scalar()
    print("with ::text cast:", r3)

    # Using LIKE for tenant
    r4 = db.execute(text(
        "SELECT count(*) FROM clients WHERE tenant_id LIKE '1075f794-2455-4f47-a220-ba3dfae17c53' AND status = 'active'"
    )).scalar()
    print("with LIKE:", r4)

except Exception as e:
    print("Error:", e)
finally:
    db.close()
