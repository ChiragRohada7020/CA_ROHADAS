from app.core.db import SessionLocal
from sqlalchemy import inspect, text
import app.routers.billing as billing

db = SessionLocal()
insp = inspect(db.bind)

# Check role_permissions columns
cols = [c['name'] for c in insp.get_columns('role_permissions')]
print("role_permissions columns:", cols)

# Check roles columns
cols2 = [c['name'] for c in insp.get_columns('roles')]
print("roles columns:", cols2)

# Check permissions columns
cols3 = [c['name'] for c in insp.get_columns('permissions')]
print("permissions columns:", cols3)

# Check billing router paths
print("\nBilling router routes:")
for route in billing.router.routes:
    print(f"  {route.path}")

db.close()
