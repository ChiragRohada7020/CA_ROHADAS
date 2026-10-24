"""Configuration for the MCP server."""
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
BACKEND_URL = "http://127.0.0.1:8000"
FRONTEND_DIR = PROJECT_ROOT / "frontend"
FRONTEND_URL = "http://127.0.0.1:3000"
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+psycopg://postgres@127.0.0.1:5432/ca_software")
COMPOSIO_API_KEY = os.environ.get("COMPOSIO_API_KEY", "")
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")
LOGS_DIR = PROJECT_ROOT / "logs"
LOGS_DIR.mkdir(exist_ok=True)
