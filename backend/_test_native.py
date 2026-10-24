from sqlalchemy import select, func, text
from app.core.db import SessionLocal
from app.models import Client

db = SessionLocal()
try:
    # Check the actual Python type info
    col = Client.__table__.columns['status']
    print("Column type:", type(col.type))
    print("native_enum:", getattr(col.type, 'native_enum', 'N/A'))
    
    # Test: compare with lowercase string
    try:
        count = db.execute(
            select(func.count(Client.id))
            .where(Client.tenant_id == '993ba7b8-160b-47ca-9c3b-158142837c21')
            .where(Client.status == "active")
        ).scalar()
        print("lowercase 'active' count:", count)
    except Exception as e:
        print("lowercase 'active' error:", e)
        
    db.rollback()
    
    # Test: compare with uppercase string
    try:
        count = db.execute(
            select(func.count(Client.id))
            .where(Client.tenant_id == '993ba7b8-160b-47ca-9c3b-158142837c21')
            .where(Client.status == "ACTIVE")
        ).scalar()
        print("uppercase 'ACTIVE' count:", count)
    except Exception as e:
        print("uppercase 'ACTIVE' error:", e)
        
    db.rollback()
    
    # Test: with literal string using text()
    try:
        count = db.execute(
            select(func.count(Client.id))
            .where(Client.tenant_id == '993ba7b8-160b-47ca-9c3b-158142837c21')
            .where(text("clients.status = 'active'"))
        ).scalar()
        print("text 'active' count:", count)
    except Exception as e:
        print("text 'active' error:", e)

finally:
    db.close()
