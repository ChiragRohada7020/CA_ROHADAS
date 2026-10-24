"""Test all endpoints that were previously returning 500 errors."""
import urllib.request
import urllib.error
import json

BASE = "http://127.0.0.1:8000/api"

# 1. Login
print("1. POST /api/auth/login")
req = urllib.request.Request(f"{BASE}/auth/login",
    data=json.dumps({"email": "admin@rohadas.test", "password": "admin123"}).encode(),
    headers={"Content-Type": "application/json"})
try:
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    token = data["access_token"]
    print(f"   OK - token: {token[:30]}...")
except urllib.error.HTTPError as e:
    print(f"   ERROR {e.code}: {e.read().decode()[:200]}")
    exit(1)

headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# 2. Auth/me
print("2. GET /api/auth/me")
req = urllib.request.Request(f"{BASE}/auth/me", headers=headers)
try:
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    print(f"   OK - user: {data.get('email')}, id: {data.get('id')}")
except urllib.error.HTTPError as e:
    print(f"   ERROR {e.code}: {e.read().decode()[:300]}")

# 3. Reports/dashboard
print("3. GET /api/reports/dashboard")
req = urllib.request.Request(f"{BASE}/reports/dashboard", headers=headers)
try:
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    print(f"   OK - active_clients: {data.get('active_clients')}, open_tasks: {data.get('open_tasks')}")
except urllib.error.HTTPError as e:
    print(f"   ERROR {e.code}: {e.read().decode()[:300]}")

# 4. Clients
print("4. GET /api/clients?limit=5")
req = urllib.request.Request(f"{BASE}/clients?limit=5", headers=headers)
try:
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    print(f"   OK - got {data.get('meta', {}).get('total', '?')} clients")
except urllib.error.HTTPError as e:
    print(f"   ERROR {e.code}: {e.read().decode()[:300]}")

# 5. Tasks
print("5. GET /api/tasks?limit=5")
req = urllib.request.Request(f"{BASE}/tasks?limit=5", headers=headers)
try:
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    print(f"   OK - got {data.get('meta', {}).get('total', '?')} tasks")
except urllib.error.HTTPError as e:
    print(f"   ERROR {e.code}: {e.read().decode()[:300]}")

# 6. Invoices
print("6. GET /api/invoices?limit=5")
req = urllib.request.Request(f"{BASE}/invoices?limit=5", headers=headers)
try:
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    print(f"   OK - got {data.get('meta', {}).get('total', '?')} invoices")
except urllib.error.HTTPError as e:
    print(f"   ERROR {e.code}: {e.read().decode()[:300]}")

# 7. Financial years
print("7. GET /api/financial-years")
req = urllib.request.Request(f"{BASE}/financial-years", headers=headers)
try:
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    print(f"   OK - got {len(data)} financial years")
except urllib.error.HTTPError as e:
    print(f"   ERROR {e.code}: {e.read().decode()[:300]}")

# 8. Notifications
print("8. GET /api/notifications/unread-count")
req = urllib.request.Request(f"{BASE}/notifications/unread-count", headers=headers)
try:
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    print(f"   OK - unread_count: {data.get('unread_count', '?')}")
except urllib.error.HTTPError as e:
    print(f"   ERROR {e.code}: {e.read().decode()[:300]}")

# 9. Compliance dashboard
print("9. GET /api/compliance/dashboard")
req = urllib.request.Request(f"{BASE}/compliance/dashboard", headers=headers)
try:
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    print(f"   OK - overdue: {data.get('overdue', '?')}, filed: {data.get('filed', '?')}")
except urllib.error.HTTPError as e:
    print(f"   ERROR {e.code}: {e.read().decode()[:300]}")

# 10. Documents
print("10. GET /api/documents?limit=5")
req = urllib.request.Request(f"{BASE}/documents?limit=5", headers=headers)
try:
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    print(f"   OK - got {data.get('meta', {}).get('total', '?')} documents")
except urllib.error.HTTPError as e:
    print(f"   ERROR {e.code}: {e.read().decode()[:300]}")

# 11. Users
print("11. GET /api/users?limit=5")
req = urllib.request.Request(f"{BASE}/users?limit=5", headers=headers)
try:
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    print(f"   OK - got {data.get('meta', {}).get('total', '?')} users")
except urllib.error.HTTPError as e:
    print(f"   ERROR {e.code}: {e.read().decode()[:300]}")

# 12. Roles
print("12. GET /api/roles")
req = urllib.request.Request(f"{BASE}/roles", headers=headers)
try:
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    print(f"   OK - got {len(data)} roles")
except urllib.error.HTTPError as e:
    print(f"   ERROR {e.code}: {e.read().decode()[:300]}")

print("\nAll endpoint tests complete!")
