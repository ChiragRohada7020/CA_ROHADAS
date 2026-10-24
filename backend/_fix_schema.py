"""Add missing columns and convert remaining enum columns to VARCHAR."""
from sqlalchemy import text
from app.core.db import SessionLocal

db = SessionLocal()
try:
    # 1. Convert users.status from enum to VARCHAR
    try:
        db.execute(text("ALTER TABLE users ALTER COLUMN status TYPE VARCHAR(50) USING status::text"))
        db.commit()
        print("Converted users.status to VARCHAR")
    except Exception as e:
        db.rollback()
        print(f"users.status: {e}")

    # 2. Add missing invoice columns
    invoice_cols = {
        "ageing_bucket": "VARCHAR(20)",
        "client_name": "VARCHAR(200)",
        "outstanding": "NUMERIC(15,2)",
        "days_overdue": "INTEGER",
        "is_overdue": "BOOLEAN DEFAULT FALSE",
        "client_code": "VARCHAR(50)",
    }
    
    for col_name, col_type in invoice_cols.items():
        try:
            db.execute(text(f"ALTER TABLE invoices ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
            db.commit()
            print(f"Added invoices.{col_name} ({col_type})")
        except Exception as e:
            db.rollback()
            print(f"invoices.{col_name}: {e}")

    # Verify
    from sqlalchemy import inspect
    insp = inspect(db.bind)
    
    user_cols = {c['name']: str(c['type']) for c in insp.get_columns('users')}
    print(f"\nusers.status type: {user_cols.get('status')}")
    
    invoice_cols_db = {c['name'] for c in insp.get_columns('invoices')}
    missing = set(invoice_cols) - invoice_cols_db
    print(f"Missing invoice columns: {missing}")

finally:
    db.close()
