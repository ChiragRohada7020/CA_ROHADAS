import traceback
import asyncio
from app.core.db import SessionLocal
from app.models import Invoice, Client, Task

# Check if Invoice has the columns used in dashboard
print("Invoice columns:", [c.name for c in Invoice.__table__.columns])
print()
print("Checking columns used in reports.py:")
for col in ['tenant_id', 'outstanding', 'amount_paid', 'total', 'invoice_date', 'is_overdue']:
    print(f"  Invoice.{col}: {hasattr(Invoice, col)}")

print()
print("Client columns:", [c.name for c in Client.__table__.columns])
print("Task columns:", [c.name for c in Task.__table__.columns])
for col in ['tenant_id', 'status', 'is_overdue', 'filing_status', 'financial_year', 'assigned_to', 'actual_hours', 'category']:
    print(f"  Task.{col}: {hasattr(Task, col)}")

# Now test the actual dashboard query
from app.core.security import get_current_user, create_access_token, decode_token
from sqlalchemy import func, select
from app.core.clock import today_local

db = SessionLocal()
try:
    # Create token
    from app.models import User
    from sqlalchemy import select as _sel
    user = db.execute(_sel(User).where(User.email == 'admin@rohadas.test')).scalar_one()
    
    token = create_access_token(subject=user.id, tenant_id=user.tenant_id, roles=['firm_owner'], permissions=['report.read'])
    
    class FakeRequest:
        def __init__(self, t):
            self.headers = {'authorization': f'Bearer {t}'}
            self.cookies = {}
    req = FakeRequest(token)
    
    async def test():
        principal = await get_current_user(req, db)
        print("Principal:", principal.email, principal.id)
        
        # Try the dashboard queries
        active_clients = db.execute(
            select(func.count(Client.id))
            .where(Client.tenant_id == principal.tenant_id)
            .where(Client.status == "active")
        ).scalar() or 0
        print("active_clients:", active_clients)
        
        open_tasks = db.execute(
            select(func.count(Task.id))
            .where(Task.tenant_id == principal.tenant_id)
            .where(Task.status.notin_(["completed", "cancelled", "delivered"]))
        ).scalar() or 0
        print("open_tasks:", open_tasks)
        
    asyncio.run(test())
except Exception as e:
    traceback.print_exc()
finally:
    db.close()
