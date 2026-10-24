import traceback
import asyncio
from app.core.config import settings
print("Settings loaded:", settings.JWT_SECRET[:10])

# Try auth/me 
from app.core.security import get_current_user, decode_token, create_access_token
from app.core.db import SessionLocal, get_db
from app.models import User
from sqlalchemy import select
from datetime import timedelta

# Create a token
db = SessionLocal()
try:
    user = db.execute(select(User).where(User.email == 'admin@rohadas.test')).scalar_one()
    roles = ['firm_owner']
    permissions = ['role.write', 'user.read']
    
    access_token = create_access_token(
        subject=user.id,
        tenant_id=user.tenant_id,
        roles=roles,
        permissions=permissions,
        expires_delta=timedelta(minutes=30)
    )
    print("Token created")
    
    # Decode it
    payload = decode_token(access_token, expected_type="access", expected_audience="staff")
    print("Token decoded:", payload.sub)
    
    # Now simulate get_current_user
    async def test():
        class FakeRequest:
            def __init__(self, token):
                self.headers = {'authorization': f'Bearer {token}'}
                self.cookies = {}
        req = FakeRequest(access_token)
        try:
            principal = await get_current_user(req, db)
            print("Principal:", principal.email, principal.roles)
        except Exception as e:
            traceback.print_exc()
            print("get_current_user error:", e)
    
    asyncio.run(test())
except Exception as e:
    traceback.print_exc()
finally:
    db.close()
