#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stop the development servers started by ./start-dev.ps1

.DESCRIPTION
    Stops whatever is listening on :3000, :3100 and :8000 — but only if the process is
    python or node. Anything else on those ports is left alone and reported, so this
    cannot quietly kill an unrelated service.

    It then also kills *orphaned* backend children. Uvicorn spawns multiprocessing
    children on Windows, and those children inherit the listening socket. When the
    parent is killed the socket table still names the dead parent as the owner, so a
    script that only kills the reported owner leaves the port bound — and a later
    server that fails to bind leaves the *previous* one answering. That silently sent
    an end-to-end test run at the development database once.

    Finally it waits for the ports to actually become free and reports honestly if
    they did not, rather than claiming success it cannot observe.
#>
[CmdletBinding()]
param(
    [int[]] $Ports = @(3000, 3100, 8000)
)

$stopped = 0
$blocked = @()

# ── 1. The processes that own the ports ──
foreach ($port in $Ports) {
    $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $listeners) {
        Write-Host "  :$port nothing listening"
        continue
    }
    foreach ($listener in $listeners) {
        $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
        if (-not $process) {
            # The owner is already gone but the entry remains: an orphaned child holds
            # the socket. Step 2 deals with it.
            Write-Host "  :$port owner pid $($listener.OwningProcess) is already gone (stale entry)"
            continue
        }
        if ($process.ProcessName -in @('python', 'node', 'python3')) {
            Write-Host "  :$port stopping pid $($process.Id) ($($process.ProcessName))"
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            $stopped++
        }
        else {
            Write-Warning "  :$port held by '$($process.ProcessName)' - not python or node, leaving it alone"
            $blocked += $port
        }
    }
}

# ── 2. Orphaned backend children that inherited the socket ──
# Matched narrowly on this project's own invocation, so no unrelated Python is harmed.
$orphans = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match 'multiprocessing-fork|uvicorn|app\.main:app' }
foreach ($orphan in $orphans) {
    Write-Host "  stopping orphaned backend child pid $($orphan.ProcessId)"
    Stop-Process -Id $orphan.ProcessId -Force -ErrorAction SilentlyContinue
    $stopped++
}

# ── 2b. MCP server (stdio transport, no port to detect) ──
$mcp_procs = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match 'mcp_server\.server' }
foreach ($mcp in $mcp_procs) {
    Write-Host "  stopping MCP server pid $($mcp.ProcessId)"
    Stop-Process -Id $mcp.ProcessId -Force -ErrorAction SilentlyContinue
    $stopped++
}

# ── 3. Verify, rather than assume ──
$deadline = (Get-Date).AddSeconds(15)
do {
    Start-Sleep -Milliseconds 500
    $stillListening = foreach ($port in $Ports) {
        $found = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($found) { $port }
    }
} while ($stillListening -and (Get-Date) -lt $deadline)

Write-Host ''
Write-Host "$stopped process(es) stopped."

if ($stillListening) {
    $held = ($stillListening | ForEach-Object { ":$($_)" }) -join ', '
    Write-Warning "  still listening after 15s: $held"
    Write-Warning "  a new server on these ports would fail to bind and leave the old one answering."
    exit 1
}

$all = ($Ports | ForEach-Object { ":$($_)" }) -join ', '
Write-Host "  all ports free: $all"


