import traceback
import asyncio
from app.core.db import SessionLocal
from app.core.security import get_current_user, create_access_token
from app.models import User, Role, user_roles
from sqlalchemy import select

print("Starting test...")

db = SessionLocal()
try:
    user = db.execute(select(User).where(User.email == 'admin@rohadas.test')).scalar_one()
    print(f"User found: {user.id}, {user.email}")

    token = create_access_token(
        subject=user.id,
        tenant_id=user.tenant_id,
        roles=['firm_owner'],
        permissions=['user.read', 'role.read', 'report.read'],
    )
    print(f"Token created")

    class FakeRequest:
        def __init__(self, token):
            self.headers = {'authorization': f'Bearer {token}'}
            self.cookies = {}

    req = FakeRequest(token)

    async def test():
        principal = await get_current_user(req, db)
        print(f"Principal: id={principal.user_id}, email={principal.email}")
        print(f"Roles: {principal.roles}")
        print(f"Permissions: {principal.permissions}")

        role_codes = db.execute(
            select(Role.code).join(user_roles).where(user_roles.c.user_id == principal.user_id)
        ).scalars().all()
        print(f"Role codes: {role_codes}")

        # Now test auth/me endpoint returns
        from app.models import Permission as Perm
        user_perms = [p.code for p in db.execute(
            select(Perm.code).join(user_roles, user_roles.c.role_id == Perm.role_id)
            .where(user_roles.c.user_id == principal.user_id)
        ).scalars().all()]
        print(f"User perms from DB: {user_perms}")

    asyncio.run(test())
    print("Test completed successfully!")

except Exception as e:
    traceback.print_exc()
    print(f"Error: {e}")
finally:
    db.close()
