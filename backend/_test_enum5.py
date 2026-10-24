from sqlalchemy import text
from app.core.db import SessionLocal

db = SessionLocal()
try:
    db.rollback()

    # Straight raw query
    r = db.execute(text(
        "SELECT count(id) FROM clients WHERE tenant_id = '1075f794-2455-4f47-a220-ba3dfae17c53' AND status = 'active'"
    )).scalar()
    print("raw count:", r)

    # Check what status values exist
    r2 = db.execute(text(
        "SELECT DISTINCT status FROM clients"
    )).fetchall()
    print("Distinct status values:", [row[0] for row in r2])

    # Try with ::text cast
    r3 = db.execute(text(
        "SELECT count(id) FROM clients WHERE tenant_id = '1075f794-2455-4f47-a220-ba3dfae17c53' AND status::text = 'active'"
    )).scalar()
    print("with ::text cast:", r3)

    # Try lower()
    r4 = db.execute(text(
        "SELECT count(id) FROM clients WHERE tenant_id = '1075f794-2455-4f47-a220-ba3dfae17c53' AND lower(status::text) = 'active'"
    )).scalar()
    print("with lower():", r4)

except Exception as e:
    print("Error:", e)
finally:
    db.close()
