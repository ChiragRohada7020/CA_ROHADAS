# MCP Server for Ca_software

## Overview

This MCP (Model Context Protocol) server exposes all project tools for use with **any MCP-compatible client**, including Claude (Claude Code, Claude Desktop), Kilo, Cursor, and custom clients.

The server uses stdio transport and works with any MCP client that supports the standard `mcpServers` configuration format.

## Available Tools (21 total)

### Filesystem Operations
- **read_file** - Read a file from the project
- **write_file** - Write/overwrite a file
- **list_directory** - List directory contents
- **search_code** - Search for a pattern in files
- **grep** - Search with regex

### Git Operations
- **git_status** - Show git status
- **git_log** - Show recent commits
- **git_commit** - Commit changes with a message
- **git_diff** - Show git diff

### Backend API
- **backend_health** - Check backend health
- **api_call** - Make API calls to the backend

### Project Management
- **run_tests** - Run backend pytest suite
- **typecheck** - TypeScript type checking
- **frontend_build** - Build the frontend
- **restart_backend** - Restart backend server
- **restart_frontend** - Restart frontend dev server
- **project_info** - Show project structure

### Composio Integrations
- **composio_status** - Check connection status
- **composio_manage_connections** - Connect to external services
- **list_composio_tools** - List available Composio tools
- **composio_execute_tool** - Execute any Composio tool

## Setup

### 1. Install Dependencies
```bash
pip install -r mcp_server/requirements.txt
```

### 2. Get Composio API Key
```bash
pip install composio
# Set COMPOSIO_API_KEY=<your_key> in environment
```

### 3. Configure Your MCP Client

The server works with **any MCP-compatible client** including Claude Code, Claude Desktop, Kilo, Cursor, and custom clients.

#### For Kilo
Add the `mcp_config.json` to your Kilo MCP settings, or manually add:

```json
{
  "mcpServers": {
    "ca_software": {
      "command": "python",
      "args": ["-m", "mcp_server.server"],
      "env": {
        "PYTHONPATH": "backend;.",
        "DATABASE_URL": "postgresql+psycopg://postgres@127.0.0.1:5432/ca_software",
        "COMPOSIO_API_KEY": "<YOUR_API_KEY>"
      },
      "cwd": "d:/rohadas_organisagtion/Ca_software"
    }
  }
}
```

#### For Claude Code
Add to your Claude Code config (`~/.config/Code/User/globalStorage/anthropic/claude-code/settings.json` or `claude_config.json`):

```json
{
  "mcpServers": {
    "ca_software": {
      "command": "python",
      "args": ["-m", "mcp_server.server"],
      "env": {
        "PYTHONPATH": "backend;.",
        "DATABASE_URL": "postgresql+psycopg://postgres@127.0.0.1:5432/ca_software",
        "COMPOSIO_API_KEY": "<YOUR_API_KEY>"
      },
      "cwd": "d:/rohadas_organisagtion/Ca_software"
    }
  }
}
```

#### Run Directly
```bash
# Windows
python -m mcp_server.server

# Or via PowerShell
.\mcp_server\run_mcp.ps1
```

## Using Your Own AI Model (Kilo Alternative)

Instead of using Claude Code or Kilo, you can use your own AI model API key to interact with the MCP server. This allows you to use the MCP tools without relying on any external AI assistant.

### MCP Client with Your Own AI Key

The `mcp_client.py` file provides a standalone client that:
- Uses your own API key (OpenAI, Anthropic, Groq, Kilo Gateway)
- Connects directly to the MCP server via stdio
- Can run in interactive mode or single-command mode

### Setup

1. Install your AI provider SDK:
```bash
pip install openai         # For OpenAI and Kilo Gateway
pip install anthropic      # For Anthropic API
pip install groq           # For Groq API
```

2. Set your API key and provider:
```bash
# For Kilo Gateway
set AI_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
set AI_PROVIDER=kilo
set AI_MODEL=kilo-auto/free

# For OpenAI
set AI_API_KEY=sk-...
set AI_PROVIDER=openai
set AI_MODEL=gpt-4o-mini

# For Anthropic
set AI_API_KEY=sk-ant-...
set AI_PROVIDER=anthropic

# For Groq
set AI_API_KEY=gsk_...
set AI_PROVIDER=groq
```

3. Use in single-command mode:
```bash
python mcp_client.py "show git status"
python mcp_client.py "list files in frontend"
python mcp_client.py "run tests"
```

4. Or use interactively:
```bash
python mcp_client.py
# Then type: show git status
# Or: list frontend files
# Or: run the tests
```

### How It Works

The client works by:
1. Starting the MCP server as a subprocess (stdio transport)
2. Sending your command to your AI model with the tool descriptions
3. The AI model responds with tool calls (formatted as `TOOL:{"name": ..., "arguments": ...}`)
4. The client executes the tool via MCP and returns results to the AI
5. The AI model produces a final response based on the tool results

This is fully self-contained - only your own API key is needed.

## Kilo Gateway

Using your Kilo API key as the AI model backend:

```bash
set AI_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbnYiOiJwcm9kdWN0aW9uIiwia2lsb1VzZXJJZCI6Ijk3ZjJkOWFlLTdjMjgtNDFiYy04OWZjLWFiNjQ3ZTgzZTc4ZCIsImFwaVRva2VuUGVwcGVyIjpudWxsLCJ2ZXJzaW9uIjozLCJpYXQiOjE3OTI1MDczOTQsImV4cCI6MTk1MDE4NzM5NH0.dF4VGVqQFqR9CITwVidG6hb_tdbYNi3mBuA6rkRi5iU
set AI_PROVIDER=kilo
set AI_MODEL=kilo-auto/free
python mcp_client.py "show git status"
```

The client works by:
1. Starting the MCP server as a subprocess via stdio
2. Sending your command to Kilo AI via the OpenAI-compatible API
3. The AI responds with tool calls in `TOOL:{"name": "...", "arguments": {...}}` format
4. The client executes the tool via MCP and returns results to the AI
5. The AI produces a final response based on the tool results

This is fully self-contained - you only need your Kilo API key.

## Files

```
mcp_server/
├── server.py          # Main MCP server with all 21 tools
├── config.py          # Configuration
├── run.py             # Entry point
├── run_mcp.sh         # Unix startup script
├── run_mcp.ps1        # Windows startup script
├── requirements.txt   # Python dependencies
└── __init__.py
mcp_client.py          # Custom AI client (uses your own API key)
```
