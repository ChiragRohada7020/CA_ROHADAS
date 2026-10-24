#!/usr/bin/env python3
import os
import sys
import subprocess
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).parent
LOGS = ROOT / "logs"
LOGS.mkdir(exist_ok=True)

def kill_port(port):
    try:
        if sys.platform == "win32":
            result = subprocess.run(f"netstat -aon | findstr :{port} | findstr LISTENING", shell=True, capture_output=True, text=True)
            for line in result.stdout.splitlines():
                parts = line.split()
                if parts and parts[-1].isdigit():
                    pid = parts[-1]
                    subprocess.run(f"taskkill /F /PID {pid}", shell=True, capture_output=True)
    except Exception:
        pass

def main():
    # Kill existing processes
    for port in [8000, 3000]:
        kill_port(port)
    time.sleep(2)
    
    # Start backend
    backend_cmd = [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"]
    backend_proc = subprocess.Popen(backend_cmd, cwd=ROOT / "backend", 
                                   stdout=open(LOGS / "backend.log", "w"),
                                   stderr=open(LOGS / "backend.err.log", "w"))
    
    # Start frontend
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    frontend_proc = subprocess.Popen([npm_cmd, "run", "dev"], cwd=ROOT / "frontend",
                                    stdout=open(LOGS / "frontend.log", "w"),
                                    stderr=open(LOGS / "frontend.err.log", "w"))
    
    print("Rohadas CA starting...")
    print("Backend: http://localhost:8000")
    print("Frontend: http://localhost:3000")
    print("Logs:", LOGS)
    
    # Wait and open browser
    time.sleep(5)
    try:
        webbrowser.open("http://localhost:3000")
    except:
        pass
    
    try:
        while True:
            time.sleep(1)
            if backend_proc.poll() is not None or frontend_proc.poll() is not None:
                break
    except KeyboardInterrupt:
        pass
    finally:
        backend_proc.terminate()
        frontend_proc.terminate()

if __name__ == "__main__":
    main()


