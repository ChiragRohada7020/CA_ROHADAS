from sqlalchemy import text
from app.core.db import SessionLocal

db = SessionLocal()

# Check the client_status enum values in the DB
r = db.execute(text("""
    SELECT enumlabel FROM pg_enum 
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'client_status') 
    ORDER BY enumsortorder
""")).fetchall()
print('DB client_status enum values:', [x[0] for x in r])

# Check actual values
r2 = db.execute(text('SELECT DISTINCT status FROM clients LIMIT 10')).fetchall()
print('Actual status values in clients table:', [x[0] for x in r2])

# Check if ClientStatus.ACTIVE works
from app.models import Client
from sqlalchemy import select
rows = db.execute(select(Client.id).limit(5)).fetchall()
print('Got rows:', len(rows))

# Try with ClientStatus
from app.models.client import ClientStatus
print('ClientStatus.ACTIVE:', ClientStatus.ACTIVE)
print('ClientStatus.ACTIVE.value:', ClientStatus.ACTIVE.value)
print('ClientStatus.ACTIVE.name:', ClientStatus.ACTIVE.name)

# Try querying with the enum value
try:
    count = db.execute(
        select(text('count(*)'))
        .select_from(text('clients'))
        .where(text("status = 'active'"))
    ).scalar()
    print('Count with lowercase active:', count)
except Exception as e:
    print('Error with lowercase:', e)

try:
    count = db.execute(
        select(text('count(*)'))
        .select_from(text('clients'))
        .where(text("status = 'ACTIVE'"))
    ).scalar()
    print('Count with uppercase ACTIVE:', count)
except Exception as e:
    print('Error with uppercase:', e)

db.close()
