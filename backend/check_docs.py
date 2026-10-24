import sys
sys.path.insert(0, '.')
from app.core.db import SessionLocal
from app.core.security import create_access_token
from app.models import User
from sqlalchemy import select
from datetime import timedelta
import urllib.request
db = SessionLocal()
u = db.execute(select(User).where(User.email == 'admin@rohadas.test')).scalar_one()
token = create_access_token(subject=u.id, tenant_id=u.tenant_id, roles=['firm_owner'], permissions=[], expires_delta=timedelta(hours=8))
db.close()

import json
for path in ["/api/documents", "/api/documents/summary"]:
    url = f"http://localhost:3000{path}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        resp = urllib.request.urlopen(req, timeout=8)
        d = json.loads(resp.read())
        if "items" in d:
            ids = [i["id"] for i in d["items"]]
            print(path, "count:", len(ids), "unique:", len(set(ids)), "dupes:", len(ids)-len(set(ids)))
        else:
            print(path, "keys:", list(d.keys()))
    except Exception as e:
        print(path, "ERROR:", e)
