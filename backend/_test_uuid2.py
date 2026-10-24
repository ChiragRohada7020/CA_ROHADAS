from sqlalchemy import text
from app.core.db import SessionLocal

db = SessionLocal()
try:
    # Get all client rows with full details
    rows = db.execute(text("SELECT id, tenant_id, status FROM clients")).fetchall()
    for row in rows:
        print(f"  id={row[0]}, tenant_id={repr(row[1])}, status={repr(row[2])}")

    # Check what the auth token uses as tenant_id
    print("\nToken tenant_id: 1075f794-2455-4f47-a220-ba3dfae17c53")
    
    # Try exact match
    rows2 = db.execute(text("SELECT count(*) FROM clients WHERE tenant_id = '1075f794-2455-4f47-a220-ba3dfae17c53'")).fetchone()
    print(f"Count for tenant_id (string): {rows2[0]}")
    
    # Check UUID cast
    rows3 = db.execute(text("SELECT count(*) FROM clients WHERE tenant_id::text = '1075f794-2455-4f47-a220-ba3dfae17c53'")).fetchone()
    print(f"Count for tenant_id (cast to text): {rows3[0]}")

except Exception as e:
    print("Error:", e)
finally:
    db.close()
