import urllib.request, json, time

BASE = 'http://127.0.0.1:8000/api'

# Login
req = urllib.request.Request(f'{BASE}/auth/login',
    data=json.dumps({'email':'admin@rohadas.test','password':'admin123'}).encode(),
    headers={'Content-Type':'application/json'})
resp = urllib.request.urlopen(req)
token = json.loads(resp.read())['access_token']
headers = {'Authorization': f'Bearer {token}'}

# Test with verbose error - add debug parameter
for endpoint in ['/reports/dashboard', '/users?limit=5', '/roles']:
    req = urllib.request.Request(f'{BASE}{endpoint}', headers=headers)
    try:
        resp = urllib.request.urlopen(req)
        data = json.loads(resp.read())
        print(f'{endpoint}: OK - {json.dumps(data)[:200]}')
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f'{endpoint}: {e.code} - {body[:300]}')
