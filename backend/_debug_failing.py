import traceback
import asyncio
from app.core.db import SessionLocal
from app.core.security import get_current_user, create_access_token
from app.models import User, Role, user_roles, Invoice
from sqlalchemy import select, func

db = SessionLocal()
try:
    user = db.execute(select(User).where(User.email == 'admin@rohadas.test')).scalar_one()
    token = create_access_token(
        subject=user.id,
        tenant_id=user.tenant_id,
        roles=['firm_owner'],
        permissions=['user.read', 'role.read', 'report.read'],
    )

    class FakeRequest:
        def __init__(self, token):
            self.headers = {'authorization': f'Bearer {token}'}
            self.cookies = {}

    req = FakeRequest(token)

    async def test():
        principal = await get_current_user(req, db)
        print(f"Principal: id={principal.id}, tenant={principal.tenant_id}")
        print(f"Roles: {principal.roles}")
        print(f"Permissions: {list(principal.permissions)}")

        # Test reports/dashboard logic
        print("\n=== Dashboard ====")
        from app.core.clock import today_local
        from app.models import Client, Task

        active_clients = db.execute(
            select(func.count(Client.id))
            .where(Client.tenant_id == principal.tenant_id)
            .where(Client.status == "active")
        ).scalar() or 0
        print(f"active_clients: {active_clients}")

        # Test users endpoint logic
        print("\n=== Users ====")
        role_codes = db.execute(
            select(Role.code).join(user_roles).where(user_roles.c.user_id == principal.id)
        ).scalars().all()
        print(f"role_codes: {role_codes}")

        from app.core.rbac import permissions_for_role
        permissions = []
        for rc in role_codes:
            p = permissions_for_role(rc)
            permissions.extend(p)
        permissions = list(set(permissions))
        print(f"permissions: {permissions}")

        # Test the list_users query
        print("\n=== List Users ====")
        from app.models import Branch
        stmt = select(User).where(User.tenant_id == principal.tenant_id)
        rows = db.execute(stmt.limit(5)).scalars().all()
        print(f"users count: {len(rows)}")
        for u in rows:
            print(f"  {u.email}: status={u.status}, is_partner={u.is_partner}")

        # Test roles endpoint
        print("\n=== List Roles ====")
        role_rows = db.execute(select(Role)).scalars().all()
        print(f"roles count: {len(role_rows)}")
        for r in role_rows:
            print(f"  code={r.code}, name={r.name}")

    asyncio.run(test())
    print("\nAll tests passed!")
except Exception as e:
    traceback.print_exc()
finally:
    db.close()
