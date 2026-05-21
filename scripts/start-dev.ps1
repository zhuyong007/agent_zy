$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$logDir = Join-Path $repoRoot ".agent-zy-data\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Get-ListeningPortOwners {
  param([int[]]$Ports)

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
    if ([int]::TryParse($portText, [ref]$port) -and $Ports -contains $port) {
      $owners += [pscustomobject]@{
        Port = $port
        ProcessId = $processId
      }
    }
  }

  return $owners
}

$portOwners = Get-ListeningPortOwners -Ports @(5173, 4378)
if ($portOwners.Count -gt 0) {
  throw "Cannot start agent-zy because required ports are occupied: $($portOwners | ConvertTo-Json -Compress)"
}

$mutex = New-Object System.Threading.Mutex($false, "Global\AgentZyDevServer")
if (-not $mutex.WaitOne(0)) {
  throw "Cannot start agent-zy because another start-dev.ps1 instance is already running."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = Join-Path $logDir "dev-$timestamp.log"

try {
  Set-Location -LiteralPath $repoRoot

  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) {
    $npm = Get-Command npm -ErrorAction Stop
  }

  "[$(Get-Date -Format o)] Starting agent-zy dev servers in $repoRoot" | Out-File -FilePath $logFile -Encoding utf8
  & $npm.Source run dev *>> $logFile
}
finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
