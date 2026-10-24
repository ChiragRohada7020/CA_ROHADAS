import subprocess
import sys
import os
import time
import requests

os.chdir('d:\\rohadas_organisagtion\\Ca_software\\backend')

proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
)

time.sleep(3)

if proc.poll() is None:
    print("Backend started successfully on http://127.0.0.1:8000")
    
    # Test health endpoint
    try:
        r = requests.get("http://127.0.0.1:8000/api/health", timeout=5)
        print(f"Health check: {r.status_code} - {r.json()}")
    except Exception as e:
        print(f"Health check failed: {e}")
    
    # Test OpenAPI schema
    try:
        r = requests.get("http://127.0.0.1:8000/openapi.json", timeout=5)
        if r.status_code == 200:
            schema = r.json()
            paths = sorted(schema.get("paths", {}).keys())
            print(f"\nAPI endpoints: {len(paths)}")
            for p in paths:
                methods = schema["paths"][p]
                print(f"  {p} -> {sorted(methods.keys())}")
    except Exception as e:
        print(f"OpenAPI check failed: {e}")
    
    proc.terminate()
    proc.wait()
    print("\nBackend terminated.")
else:
    stdout, stderr = proc.communicate()
    print(f"Backend failed to start:")
    print(f"STDOUT: {stdout}")
    print(f"STDERR: {stderr}")

