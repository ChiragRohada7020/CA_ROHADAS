# MCP Server startup script for Windows PowerShell
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $root

$env:PYTHONPATH = "$root\backend;$root"
$env:DATABASE_URL = "postgresql+psycopg://postgres@127.0.0.1:5432/ca_software"
$env:ENVIRONMENT = "development"

Write-Host "Starting Ca_software MCP Server..."
Write-Host "Project root: $root"

python -m mcp_server.server
