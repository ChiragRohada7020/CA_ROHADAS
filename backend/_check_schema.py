"""Find missing columns between models and DB."""
from sqlalchemy import text, inspect
from app.core.db import SessionLocal
from app.models import Invoice, User

db = SessionLocal()
insp = inspect(db.bind)

# Check invoices columns
db_invoice_cols = {c['name'] for c in insp.get_columns('invoices')}
model_invoice_cols = {c.name for c in Invoice.__table__.columns}
missing_invoice = model_invoice_cols - db_invoice_cols
extra_invoice = db_invoice_cols - model_invoice_cols
print(f"Invoice missing in DB: {missing_invoice}")
print(f"Invoice extra in DB: {extra_invoice}")

# Check users columns
db_user_cols = {c['name'] for c in insp.get_columns('users')}
model_user_cols = {c.name for c in User.__table__.columns}
missing_user = model_user_cols - db_user_cols
extra_user = db_user_cols - model_user_cols
print(f"User missing in DB: {missing_user}")
print(f"User extra in DB: {extra_user}")

# Check user_status enum
r = db.execute(text("""
    SELECT enumlabel FROM pg_enum 
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_status')
""")).fetchall()
print(f"user_status enum values: {[x[0] for x in r]}")

# Check users.status column type
for c in insp.get_columns('users'):
    if c['name'] == 'status':
        print(f"users.status column type: {c['type']}")

db.close()
