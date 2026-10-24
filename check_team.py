import urllib.request, json, http.cookiejar, urllib.error

cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def p(m, u, d=None):
    dt = json.dumps(d).encode() if d else None
    r = urllib.request.Request("http://localhost:3000" + u, data=dt,
        headers={"Content-Type": "application/json"})
    r.get_method = lambda: m
    try:
        rr = op.open(r, timeout=25)
        return rr.status, json.loads(rr.read())
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read())
        except: return e.code, None

print("=== /team page ===")
print("login:", p("POST", "/api/auth/login", {"email":"demo@example.test","password":"admin123"})[0])
print("users/summary:", p("GET", "/api/users/summary")[0])
print("users?group=partners:", p("GET", "/api/users?group=partners&include_inactive=true&limit=10")[0])
print("users?group=managers:", p("GET", "/api/users?group=managers&include_inactive=true&limit=10")[0])
print("users?group=seniors:", p("GET", "/api/users?group=seniors&include_inactive=true&limit=10")[0])
print("users?group=articles:", p("GET", "/api/users?group=articles&include_inactive=true&limit=10")[0])
print("users?group=assistants:", p("GET", "/api/users?group=assistants&include_inactive=true&limit=10")[0])

print("=== /team/roles page ===")
r = p("GET", "/api/roles")
print("roles:", r[0], "count:", len(r[1]["roles"]) if r[0]==200 else "ERR")
role_id = r[1]["roles"][0]["id"] if r[0]==200 else None
print("  firm_owner perms:", len(r[1]["roles"][0]["permissions"]) if r[0]==200 else "ERR")
print("  catalogue:", len(r[1]["catalogue"]) if r[0]==200 else "ERR")
print("GET /roles/{id}:", p("GET", "/api/roles/" + role_id)[0])
codes = p("GET", "/api/roles/" + role_id)[1]["permissions"]
print("PATCH /roles/{id}:", p("PATCH", "/api/roles/" + role_id, {"permission_codes": codes})[0])

print("=== client detail mutations ===")
cid = "234057fb-d5f0-4ada-ace7-039c3a1404eb"
print("PATCH edit client:", p("PATCH", "/api/clients/" + cid, {"legal_name":"ABC Traders","kyc_status":"verified"})[0])
print("POST change status:", p("POST", "/api/clients/" + cid + "/status", {"status":"active","reason":"test"})[0])
print("POST add contact (unique):", p("POST", "/api/clients/" + cid + "/contacts", {"name":"Test Contact","role":"finance"})[0])
print("POST request document:", p("POST", "/api/documents/request", {"client_id":cid,"title":"PAN","doc_type":"pan"})[0])

print("=== client detail reads ===")
print("GET clients/{id}:", p("GET", "/api/clients/" + cid)[0])
print("GET progress:", p("GET", "/api/clients/" + cid + "/progress")[0])
print("GET missing-docs:", p("GET", "/api/document-requests/missing?client_id=" + cid)[0])
print("GET documents:", p("GET", "/api/documents?client_id=" + cid + "&limit=10")[0])
print("GET clients/{id}/documents:", p("GET", "/api/clients/" + cid + "/documents")[0])
print("GET invoices:", p("GET", "/api/clients/" + cid + "/invoices")[0])
print("GET receivables:", p("GET", "/api/billing/receivables")[0])
print("GET unread-count:", p("GET", "/api/notifications/unread-count")[1])
print("ALL COMPLETE")
