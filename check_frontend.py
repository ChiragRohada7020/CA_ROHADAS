import urllib.request, urllib.error

try:
    r = urllib.request.urlopen("http://localhost:3000/team/roles", timeout=15)
    html = r.read().decode()
    print("status", r.status, "len", len(html))
    print("has error overlay:", "compiles-error" in html.lower())
    print("has Roles text:", "Roles" in html)
    print("has checkbox:", "checkbox" in html.lower())
    print("has Create Role:", "Create Role" in html)
except urllib.error.HTTPError as e:
    print("error:", e.code, e.read().decode()[:300])
