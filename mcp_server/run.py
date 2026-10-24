#!/usr/bin/env python
"""Entry point for running the MCP server."""
import os, sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from mcp_server.config import DATABASE_URL

os.environ.setdefault("PYTHONPATH", str(PROJECT_ROOT / "backend"))
os.environ.setdefault("DATABASE_URL", DATABASE_URL)

if __name__ == "__main__":
    import asyncio
    from mcp_server.server import mcp
    
    print("Ca_software MCP Server starting...", flush=True)
    asyncio.run(mcp.run_stdio_async())
