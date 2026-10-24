@echo off
REM Rohadas CA - Unified Start Script
REM Starts both backend and frontend together

set ROOT=%~dp0
set LOGDIR=%ROOT%logs
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

echo Starting Rohadas CA...
echo.

REM Kill any existing processes on ports 3000 and 8000
echo Cleaning up existing processes...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8000" ^| find "LISTENING"') do (
  taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
  taskkill /F /PID %%a 2>nul
)
timeout /t 2 /nobreak > nul

REM Start Backend
echo Starting Backend (http://localhost:8000)...
cd /d "%ROOT%backend"
set PYTHONPATH=%ROOT%backend
set DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:5432/ca_software
set ENVIRONMENT=development
set AI_PROVIDER=kilo
set AI_MODEL=kilo-auto/free
for /f "tokens=*" %%i in ('findstr /b "AI_API_KEY=" "%ROOT%backend\.env"') do set "%%i"
for /f "tokens=*" %%i in ('findstr /b "JWT_SECRET=" "%ROOT%backend\.env"') do set "%%i"
for /f "tokens=*" %%i in ('findstr /b "CRON_SECRET=" "%ROOT%backend\.env"') do set "%%i"
set AI_API_KEY=%AI_API_KEY:"=%
set JWT_SECRET=%JWT_SECRET:"=%
set CRON_SECRET=%CRON_SECRET:"=%
set WHATSAPP_PROVIDER=baileys
set WHATSAPP_API_URL=http://127.0.0.1:3001
start "CA-Backend" /min cmd /c "python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --timeout-keep-alive 120 > ..\logs\backend.log 2>&1"

REM Start MCP Server (stdio transport, runs as background process)
echo Starting MCP Server (stdio)...
cd /d "%ROOT%"
set PYTHONPATH=%ROOT%backend;%ROOT%
start "CA-MCP" /min cmd /c "python -m mcp_server.server > logs\mcp_server.log 2>&1"

REM Start Frontend
echo Starting Frontend (http://localhost:3000)...
cd /d "%ROOT%frontend"
start "CA-Frontend" /min cmd /c "npm run dev > ..\logs\frontend.log 2>&1"

echo.
echo Services starting...
echo Backend: http://localhost:8000/docs
echo MCP Server: stdio (for Claude Code / Cursor / Kilo MCP clients)
echo Frontend: http://localhost:3000
echo Logs in: %LOGDIR%
echo.
echo Press any key to stop all services...
pause > nul

REM Stop services
echo Stopping services...
taskkill /FI "WINDOWTITLE eq CA-Backend" 2>nul
taskkill /FI "WINDOWTITLE eq CA-MCP" 2>nul
taskkill /FI "WINDOWTITLE eq CA-Frontend" 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8000" ^| find "LISTENING"') do (
  taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
  taskkill /F /PID %%a 2>nul
)
echo Services stopped.

