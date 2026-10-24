from sqlalchemy import text
from app.core.db import SessionLocal

db = SessionLocal()
try:
    db.rollback()

    # Check without tenant filter
    r = db.execute(text("SELECT count(id) FROM clients WHERE status = 'active'")).scalar()
    print("count without tenant:", r)

    # Check with tenant_id as UUID
    r2 = db.execute(text(
        "SELECT count(id) FROM clients WHERE tenant_id = '1075f794-2455-4f47-a220-ba3dfae17c53'::uuid AND status = 'active'"
    )).scalar()
    print("with uuid cast:", r2)

    # Check total clients
    r3 = db.execute(text("SELECT count(*) FROM clients")).scalar()
    print("total clients:", r3)

    # Check tenant_id values
    r4 = db.execute(text("SELECT DISTINCT tenant_id FROM clients LIMIT 5")).fetchall()
    print("tenant ids:", [str(row[0]) for row in r4])

    # Check one client row
    r5 = db.execute(text("SELECT id, tenant_id, status FROM clients WHERE status = 'active' LIMIT 3")).fetchall()
    for row in r5:
        print(f"  id={row[0]}, tenant_id={row[1]}, status={row[2]}")

except Exception as e:
    print("Error:", e)
finally:
    db.close()
