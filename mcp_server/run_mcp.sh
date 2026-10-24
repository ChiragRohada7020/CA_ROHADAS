#!/bin/bash
# MCP Server startup script
export PYTHONPATH="$(pwd)/backend:$(pwd)"
export DATABASE_URL="postgresql+psycopg://postgres@127.0.0.1:5432/ca_software"
export ENVIRONMENT="development"

python -m mcp_server.server
