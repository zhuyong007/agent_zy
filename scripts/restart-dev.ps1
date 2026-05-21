$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$startScript = Join-Path $repoRoot "scripts\start-dev.ps1"
$logDir = Join-Path $repoRoot ".agent-zy-data\logs"
$ports = @(5173, 4378)
$mutexName = "Global\AgentZyDevServer"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir ("restart-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

function Write-RestartLog {
  param([string]$Message)
  "[$(Get-Date -Format o)] $Message" | Out-File -FilePath $logFile -Encoding utf8 -Append
}

function Get-ListeningPortOwners {
  $owners = @()
  $lines = netstat -ano -p tcp | Select-String -Pattern "LISTENING"

  foreach ($line in $lines) {
    $parts = ($line.ToString().Trim() -split "\s+")
    if ($parts.Count -lt 5) {
      continue
    }

    $localAddress = $parts[1]
    $processId = [int]$parts[4]
    $lastColon = $localAddress.LastIndexOf(":")
    if ($lastColon -lt 0) {
      continue
    }

    $portText = $localAddress.Substring($lastColon + 1)
    $port = 0
    if ([int]::TryParse($portText, [ref]$port) -and $ports -contains $port) {
      $owners += [pscustomobject]@{
        Port = $port
        ProcessId = $processId
      }
    }
  }

  return $owners
}

function Wait-PortsReleased {
  $deadline = (Get-Date).AddSeconds(20)

  while ((Get-Date) -lt $deadline) {
    if ((Get-ListeningPortOwners).Count -eq 0) {
      return
    }

    Start-Sleep -Milliseconds 500
  }

  $owners = Get-ListeningPortOwners
  throw "Ports are still occupied: $($owners | ConvertTo-Json -Compress)"
}

function Wait-DevServerMutexReleased {
  $mutex = New-Object System.Threading.Mutex($false, $mutexName)

  try {
    $deadline = (Get-Date).AddSeconds(20)

    while ((Get-Date) -lt $deadline) {
      if ($mutex.WaitOne(500)) {
        $mutex.ReleaseMutex()
        return
      }
    }

    throw "Dev server mutex was not released within timeout."
  }
  finally {
    $mutex.Dispose()
  }
}

Write-RestartLog "Restart requested for $repoRoot"

$owners = Get-ListeningPortOwners
$processIds = $owners | Select-Object -ExpandProperty ProcessId -Unique

foreach ($processId in $processIds) {
  Write-RestartLog "Stopping process $processId for project port."
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

Wait-PortsReleased
Wait-DevServerMutexReleased

Write-RestartLog "Starting project with $startScript"
Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $startScript) `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden
