#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start the backend and frontend for local development.

.DESCRIPTION
    Starts uvicorn on :8000 and the Next.js dev server on :3000, writing logs to
    ./logs/. Frees the two ports first, so a stale process from an earlier run does
    not silently keep serving old code.

    The database is pinned explicitly. `DATABASE_URL` is easy to inherit by accident
    — the test suite and scripts/smoke_frontend.py both set it — and starting the API
    against the test database looks like data loss rather than a misconfiguration.
    Run `python backend/scripts/db_status.py` to confirm what is bound.

.EXAMPLE
    ./start-dev.ps1
#>
[CmdletBinding()]
param(
    # Skip the backend (useful when you are running it under a debugger).
    [switch]$FrontendOnly,
    # Skip the frontend.
    [switch]$BackendOnly
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

function Stop-Listener {
    param([int[]]$Ports)
    foreach ($port in $Ports) {
        Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
            ForEach-Object {
                $process = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
                if ($process -and $process.ProcessName -in @('python', 'node', 'python3')) {
                    Write-Host "  freeing :$port (pid $($_.OwningProcess), $($process.ProcessName))"
                    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
                }
                else {
                    Write-Warning "  :$port is held by '$($process.ProcessName)' which is not python or node - leaving it alone"
                }
            }
    }
}

Write-Host 'Freeing ports 3000 and 8000...'
Stop-Listener -Ports 3000, 8000
Start-Sleep -Seconds 1

if (-not $FrontendOnly) {
    $env:PYTHONPATH = Join-Path $root 'backend'
    $env:DATABASE_URL = 'postgresql+psycopg://postgres@127.0.0.1:5432/ca_software'
    $env:ENVIRONMENT = 'development'
    $env:AI_PROVIDER = 'kilo'
    $env:AI_MODEL = 'kilo-auto/free'
    $env:AI_API_KEY = (Get-Content (Join-Path $root 'backend\.env') | Where-Object { $_ -match '^AI_API_KEY=' } | ForEach-Object { ($_ -split '=', 2)[1] }).Trim('"')
    $env:JWT_SECRET = (Get-Content (Join-Path $root 'backend\.env') | Where-Object { $_ -match '^JWT_SECRET=' } | ForEach-Object { ($_ -split '=', 2)[1] }).Trim('"')
    $env:CRON_SECRET = (Get-Content (Join-Path $root 'backend\.env') | Where-Object { $_ -match '^CRON_SECRET=' } | ForEach-Object { ($_ -split '=', 2)[1] }).Trim('"')
    $env:WHATSAPP_PROVIDER = 'baileys'
    $env:WHATSAPP_API_URL = 'http://127.0.0.1:3001'

    Write-Host 'Starting backend on http://127.0.0.1:8000 ...'
    # --timeout-keep-alive is not a tuning detail here.
    #
    # uvicorn's default is 5 seconds. The Next.js dev server proxies /api/* to
    # this port and *pools* the connection, but it does not retry a request
    # whose pooled socket the backend has already closed. So any assistant turn
    # that arrives more than 5s after the previous proxied request dies with
    # ECONNRESET, and Next answers a plain-text 500 that the page reports as
    # "Server error (500)" - which reads like an application bug and is not one.
    #
    # Assistant turns also take 15-30s (model latency), so a short keep-alive
    # makes that failure routine rather than rare. 120s exceeds any realistic
    # idle gap between a browser's requests.
    Start-Process -FilePath 'python' `
        -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000', '--timeout-keep-alive', '120', '--reload' `
        -WorkingDirectory (Join-Path $root 'backend') `
        -RedirectStandardOutput (Join-Path $logs 'backend.log') `
        -RedirectStandardError (Join-Path $logs 'backend.err.log') `
        -WindowStyle Hidden
}

if (-not $BackendOnly) {
    Write-Host 'Starting frontend on http://localhost:3000 ...'
    Start-Process -FilePath 'npm.cmd' `
        -ArgumentList 'run', 'dev' `
        -WorkingDirectory (Join-Path $root 'frontend') `
        -RedirectStandardOutput (Join-Path $logs 'frontend.log') `
        -RedirectStandardError (Join-Path $logs 'frontend.err.log') `
        -WindowStyle Hidden
}

Write-Host ''
Write-Host 'Waiting for both to answer...'
$deadline = (Get-Date).AddSeconds(90)
$backendUp = $false
$frontendUp = $false
while ((Get-Date) -lt $deadline -and -not ($backendUp -and $frontendUp)) {
    Start-Sleep -Seconds 2
    if (-not $backendUp) {
        $code = curl.exe -s -o NUL -w '%{http_code}' --max-time 4 http://127.0.0.1:8000/api/health 2>$null
        $backendUp = ($code -eq '200')
    }
    if (-not $frontendUp) {
        # The first request to a dev server compiles the route, so this is slow once.
        $code = curl.exe -s -o NUL -w '%{http_code}' --max-time 60 http://127.0.0.1:3000/login 2>$null
        $frontendUp = ($code -eq '200')
    }
}

Write-Host ''
if ($backendUp) { Write-Host '  backend   http://127.0.0.1:8000  (docs at /docs)' } else { Write-Warning '  backend did not answer - see logs/backend.err.log' }
if ($frontendUp) { Write-Host '  frontend  http://localhost:3000' } else { Write-Warning '  frontend did not answer - see logs/frontend.err.log' }
Write-Host ''
Write-Host 'Logs: ./logs/   Stop with: ./stop-dev.ps1'
Write-Host 'Verify: cd backend; python scripts/check_running.py'

