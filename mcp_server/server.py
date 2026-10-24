#!/usr/bin/env python
"""MCP Server for Ca_software project.

Usage: python -m mcp_server.server

Exposes filesystem, git, backend API, Composio, and project management tools.
"""
from __future__ import annotations
import os, sys, asyncio, urllib.request, urllib.error, json, fnmatch, re, subprocess, time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from mcp_server.config import (
    BACKEND_DIR, BACKEND_URL, FRONTEND_DIR, LOGS_DIR,
    COMPOSIO_API_KEY, DATABASE_URL,
)

import mcp.types as types
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.context import Context

mcp = MCPServer("ca_software_mcp")

# ─── Utils ────────────────────────────────────────────────────────────

def safe_path(rel_path: str) -> Path:
    path = (PROJECT_ROOT / rel_path).resolve()
    if not str(path).startswith(str(PROJECT_ROOT)):
        raise ValueError(f"Path '{rel_path}' escapes project root")
    return path

def truncate(text: str, max_len: int = 5000) -> str:
    return text if len(text) <= max_len else text[:max_len] + f"\n... [truncated, {len(text) - max_len} more chars]"

def run_cmd(cmd: list, cwd: Path, timeout: int = 60) -> tuple:
    import subprocess
    env = os.environ.copy()
    env["PYTHONPATH"] = str(BACKEND_DIR)
    env["DATABASE_URL"] = DATABASE_URL
    try:
        p = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout, env=env)
        return p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired:
        return -1, "", f"Timed out after {timeout}s"
    except Exception as e:
        return -1, "", str(e)

# ─── Filesystem Tools ─────────────────────────────────────────────────

@mcp.tool(description="Read a file. Path relative to project root.")
async def read_file(ctx: Context, path: str, start_line: int = None, end_line: int = None) -> str:
    sp = safe_path(path)
    if not sp.exists():
        return f"Error: File not found: {path}"
    try:
        with open(sp, "r", encoding="utf-8", errors="replace") as f:
            if start_line or end_line:
                lines = f.readlines()
                start = (start_line or 1) - 1
                end = end_line if end_line else len(lines)
                content = "".join(lines[start:end])
            else:
                content = f.read()
    except Exception as e:
        return f"Error: {e}"
    return truncate(content, 50000)

@mcp.tool(description="Write or overwrite a file in the project.")
async def write_file(ctx: Context, path: str, content: str) -> str:
    sp = safe_path(path)
    try:
        sp.parent.mkdir(parents=True, exist_ok=True)
        with open(sp, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Written {len(content)} bytes to {path}"
    except Exception as e:
        return f"Error: {e}"

@mcp.tool(description="List contents of a directory.")
async def list_directory(ctx: Context, path: str = ".") -> str:
    import fnmatch as fn
    sp = safe_path(path)
    if not sp.is_dir():
        return f"Error: Not a directory: {path}"
    entries = []
    for entry in sorted(sp.iterdir()):
        icon = "DIR " if entry.is_dir() else "FILE"
        size = f" ({entry.stat().st_size} bytes)" if entry.is_file() else ""
        entries.append(f"{icon}  {entry.name}{size}")
    return "\n".join(entries) if entries else "Empty directory"

@mcp.tool(description="Search for a case-insensitive pattern in files.")
async def search_code(ctx: Context, pattern: str, path: str = ".", file_pattern: str = "*", max_results: int = 50) -> str:
    import fnmatch
    sp = safe_path(path)
    if not sp.is_dir():
        return f"Error: Not a directory: {path}"
    results = []
    pat_lower = pattern.lower()
    for root, dirs, files in os.walk(sp):
        dirs[:] = [d for d in dirs if d not in {".next", "__pycache__", "node_modules", ".git", "dist", "build"}]
        for fn in files:
            if not fnmatch.fnmatch(fn, file_pattern):
                continue
            fp_full = os.path.join(root, fn)
            try:
                with open(fp_full, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
                if pat_lower in content.lower():
                    rel = os.path.relpath(fp_full, sp)
                    for i, line in enumerate(content.splitlines(), 1):
                        if pat_lower in line.lower():
                            results.append(f"{rel}:{i}: {line.strip()[:120]}")
                            if len(results) >= max_results:
                                break
                    if len(results) >= max_results:
                        break
            except Exception:
                continue
        if len(results) >= max_results:
            break
    return f"Found {len(results)} matches:\n" + "\n".join(results) if results else f"No matches found for '{pattern}'"

@mcp.tool(description="Search for a regex pattern in files (case-insensitive).")
async def grep(ctx: Context, pattern: str, path: str = ".", file_pattern: str = "*.py,*.ts,*.tsx,*.js,*.jsx", max_results: int = 50) -> str:
    import re, fnmatch
    sp = safe_path(path)
    patterns = [p.strip() for p in file_pattern.split(",")]
    results = []
    try:
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        return f"Invalid regex: {e}"
    for root, dirs, files in os.walk(sp):
        dirs[:] = [d for d in dirs if d not in {".next", "__pycache__", "node_modules", ".git", "dist", "build"}]
        for fn in files:
            if not any(fnmatch.fnmatch(fn, p) for p in patterns):
                continue
            fp_full = os.path.join(root, fn)
            try:
                with open(fp_full, "r", encoding="utf-8", errors="replace") as f:
                    for i, line in enumerate(f, 1):
                        if regex.search(line):
                            rel = os.path.relpath(fp_full, sp)
                            results.append(f"{rel}:{i}: {line.rstrip()[:120]}")
                            if len(results) >= max_results:
                                break
                if len(results) >= max_results:
                    break
            except Exception:
                continue
        if len(results) >= max_results:
            break
    return f"Found {len(results)} matches:\n" + "\n".join(results) if results else f"No matches for regex: {pattern}"

# ─── Git Tools ────────────────────────────────────────────────────────────────

@mcp.tool(description="Show git status of the project.")
async def git_status(ctx: Context) -> str:
    code, out, err = run_cmd(["git", "status", "--short"], PROJECT_ROOT)
    return f"```\n{out.strip() or 'Clean working tree'}\n```" if code == 0 else f"Error: {err}"

@mcp.tool(description="Show recent git commits.")
async def git_log(ctx: Context, n: int = 10, oneline: bool = True) -> str:
    cmd = ["git", "log", f"-{n}"]
    if oneline:
        cmd.append("--oneline")
    code, out, err = run_cmd(cmd, PROJECT_ROOT)
    return f"```\n{out.strip()}\n```" if code == 0 else f"Error: {err}"

@mcp.tool(description="Commit changes with a message.")
async def git_commit(ctx: Context, message: str, add_all: bool = True) -> str:
    if add_all:
        run_cmd(["git", "add", "-A"], PROJECT_ROOT)
    code, out, err = run_cmd(["git", "commit", "-m", message], PROJECT_ROOT)
    return f"Committed: {message}\n```\n{out.strip()}\n```" if code == 0 else f"Error: {err}"

@mcp.tool(description="Show git diff.")
async def git_diff(ctx: Context, staged_only: bool = False, max_lines: int = 100) -> str:
    cmd = ["git", "diff"]
    if staged_only:
        cmd.append("--staged")
    code, out, err = run_cmd(cmd, PROJECT_ROOT)
    if code == 0:
        lines = out.splitlines()
        if len(lines) > max_lines:
            out = "\n".join(lines[:max_lines]) + f"\n... [{len(lines) - max_lines} more]"
        return f"```\n{out.strip() or 'No changes'}\n```"
    return f"Error: {err}"

# ─── Backend API Tools ────────────────────────────────────────────────────────

@mcp.tool(description="Check the health of the backend API.")
async def backend_health(ctx: Context) -> str:
    status, body = _http_get(f"{BACKEND_URL}/api/health")
    if status == 200:
        return f"Backend healthy\n```json\n{body}\n```"
    return f"Backend unreachable (status={status})\n{body}"

def _http_get(url: str, timeout: int = 30) -> tuple:
    import urllib.request
    try:
        resp = urllib.request.urlopen(url, timeout=timeout)
        return resp.status, resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        return -1, str(e)

@mcp.tool(description="Make an API call to the backend.")
async def api_call(ctx: Context, path: str, method: str = "GET", body: str = None, cookie: str = None) -> str:
    url = f"{BACKEND_URL}{path}"
    headers = {}
    if cookie:
        headers["Cookie"] = cookie
    data = None
    if body and method in ("POST", "PUT", "PATCH"):
        data = body.encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method)
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        status, response_body = resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        status, response_body = e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return f"Request failed: {e}"
    return f"HTTP {status}\n```\n{truncate(response_body, 10000)}\n```"

# ─── Project Tools ────────────────────────────────────────────────────────────

@mcp.tool(description="Run backend pytest test suite.")
async def run_tests(ctx: Context, test_path: str = "tests/", verbose: bool = True) -> str:
    cmd = ["python", "-m", "pytest", test_path]
    if verbose:
        cmd.append("-v")
    code, out, err = run_cmd(cmd, BACKEND_DIR, timeout=300)
    result = f"Exit code: {code}\n"
    if out:
        result += "\n```\n" + truncate(out, 20000) + "\n```"
    if err:
        result += "\n```stderr\n" + truncate(err, 10000) + "\n```"
    return result

@mcp.tool(description="Run TypeScript type checking (tsc --noEmit).")
async def typecheck(ctx: Context) -> str:
    code, out, err = run_cmd(["npx", "tsc", "--noEmit"], FRONTEND_DIR, timeout=120)
    result = f"Exit code: {code}\n"
    if out:
        result += "\n```\n" + truncate(out, 10000) + "\n```"
    if err:
        result += "\n```stderr\n" + truncate(err, 10000) + "\n```"
    return result

@mcp.tool(description="Build the Next.js frontend.")
async def frontend_build(ctx: Context) -> str:
    code, out, err = run_cmd(["npm", "run", "build"], FRONTEND_DIR, timeout=300)
    result = f"Exit code: {code}\n"
    if out:
        result += "\n```\n" + truncate(out, 20000) + "\n```"
    if err:
        result += "\n```stderr\n" + truncate(err, 10000) + "\n```"
    return result

# ─── Server Management ───────────────────────────────────────────────────────

@mcp.tool(description="Restart backend server on port 8000.")
async def restart_backend(ctx: Context) -> str:
    subprocess.run(["powershell", "-Command", "taskkill /F /IM python.exe /T 2>nul"], capture_output=True)
    time.sleep(2)
    env = {**os.environ, "PYTHONPATH": str(BACKEND_DIR), "DATABASE_URL": DATABASE_URL}
    cmd = ["python", "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"]
    proc = subprocess.Popen(cmd, cwd=str(BACKEND_DIR), env=env,
        stdout=open(LOGS_DIR / "backend.log", "a"),
        stderr=open(LOGS_DIR / "backend.err.log", "a"))
    for _ in range(15):
        time.sleep(2)
        try:
            resp = urllib.request.urlopen("http://127.0.0.1:8000/api/health", timeout=5)
            return f"Backend started on port 8000\n```json\n{resp.read().decode()}\n```"
        except Exception:
            continue
    return f"Backend failed to start (PID {proc.pid}). Check logs/backend.err.log"

@mcp.tool(description="Restart frontend dev server on port 3000.")
async def restart_frontend(ctx: Context) -> str:
    subprocess.run(["powershell", "-Command", "taskkill /F /IM node.exe /T 2>nul"], capture_output=True)
    time.sleep(2)
    proc = subprocess.Popen(["npm", "run", "dev"], cwd=str(FRONTEND_DIR),
        stdout=open(LOGS_DIR / "frontend.log", "a"),
        stderr=open(LOGS_DIR / "frontend.err.log", "a"))
    for _ in range(15):
        time.sleep(2)
        try:
            resp = urllib.request.urlopen("http://127.0.0.1:3000/login", timeout=10)
            if resp.status == 200:
                return "Frontend started on port 3000"
        except Exception:
            continue
    return f"Frontend failed to start (PID {proc.pid}). Check logs/frontend.err.log"

@mcp.tool(description="Show project structure overview.")
async def project_info(ctx: Context) -> str:
    lines = ["## Ca_software Project"]
    lines.append(f"Backend: {BACKEND_DIR} on port 8000")
    lines.append(f"Frontend: {FRONTEND_DIR} on port 3000\n")
    lines.append("### Backend structure:")
    for entry in sorted(BACKEND_DIR.iterdir()):
        if entry.name.startswith('.') or entry.name == '__pycache__':
            continue
        icon = "DIR " if entry.is_dir() else "FILE"
        lines.append(f"  {icon}  {entry.name}")
    lines.append("\n### Frontend structure:")
    for entry in sorted(FRONTEND_DIR.iterdir()):
        if entry.name.startswith('.') and entry.name != '.env.local':
            continue
        icon = "DIR " if entry.is_dir() else "FILE"
        lines.append(f"  {icon}  {entry.name}")
    return "\n".join(lines)

# ─── Composio Tools ───────────────────────────────────────────────────────────

@mcp.tool(description="Check Composio connection status and list available toolkits.")
async def composio_status(ctx: Context) -> str:
    result = ["## Composio Connection Status\n"]
    if not COMPOSIO_API_KEY:
        result.append("No COMPOSIO_API_KEY found. Set it to use external services.")
    else:
        result.append("COMPOSIO_API_KEY is set.")
    available = [
        ("github", "Code repos, PRs, issues"),
        ("gmail", "Send and read emails"),
        ("googlesheets", "Spreadsheet operations"),
        ("googlecalendar", "Calendar events"),
        ("slack", "Messages and channels"),
        ("notion", "Docs and databases"),
        ("linkedin", "LinkedIn posts"),
        ("trello", "Boards and cards"),
        ("asana", "Tasks and projects"),
        ("dropbox", "File storage"),
        ("googledrive", "Google Drive files"),
    ]
    result.append("\nAvailable toolkits:")
    for toolkit, desc in available:
        result.append(f"  - {toolkit}: {desc}")
    result.append("\nTo connect a toolkit, use composio_manage_connections with action=toolkit_name")
    return "\n".join(result)

@mcp.tool(description="Check Composio connections or initiate a connection for a toolkit.")
async def composio_manage_connections(ctx: Context, action: str = "check") -> str:
    try:
        from composio import Composio
        client = Composio(api_key=COMPOSIO_API_KEY or "")
    except ImportError:
        return "Composio SDK not installed. Run: pip install composio"
    except Exception as e:
        return f"Error: {e}"
    
    if action == "check":
        try:
            conns = client.connections.get()
            result = ["## Active Composio Connections\n"]
            if not conns:
                result.append("No active connections.")
            else:
                for c in conns:
                    app = getattr(c, "app_unique_id", getattr(c, "app_id", "unknown"))
                    status = getattr(c, "status", "unknown")
                    result.append(f"  - {app}: {status}")
            return "\n".join(result)
        except Exception as e:
            return f"Error: {e}"
    else:
        try:
            conn_req = client.connections.initiate(app=action, redirect_url="http://localhost:3000/callback")
            redirect = getattr(conn_req, "redirect_url", None)
            if redirect:
                return f"Click to authenticate with {action}:\n\n{redirect}\n\nAfter authenticating, reply to proceed."
            return f"Connection initiated for {action}. Check your email."
        except Exception as e:
            return f"Error: {e}"

@mcp.tool(description="List all available Composio tools.")
async def list_composio_tools(ctx: Context) -> str:
    try:
        from composio import Composio
        client = Composio(api_key=COMPOSIO_API_KEY or "")
        tools = client.tools.list()
        result = ["## Available Composio Tools\n"]
        for t in tools:
            desc = getattr(t, "description", "No description")
            if desc and len(desc) > 100:
                desc = desc[:100] + "..."
            result.append(f"  - {t.name}: {desc}")
        return "\n".join(result)
    except ImportError:
        return "Composio SDK not installed. Run: pip install composio"
    except Exception as e:
        return f"Error: {e}"

@mcp.tool(description="Execute a Composio tool by name.")
async def composio_execute_tool(ctx: Context, tool_name: str, arguments: str = None) -> str:
    try:
        from composio import Composio
        client = Composio(api_key=COMPOSIO_API_KEY or "")
        args = json.loads(arguments) if arguments else {}
        result = client.tools.execute(tool_name=tool_name, arguments=args)
        return f"Result from {tool_name}:\n```json\n{json.dumps(result, indent=2, default=str)[:10000]}\n```"
    except ImportError:
        return "Composio SDK not installed. Run: pip install composio"
    except Exception as e:
        return f"Error: {e}"


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    print("Ca_software MCP Server starting...", file=sys.stderr, flush=True)
    asyncio.run(mcp.run_stdio_async())
