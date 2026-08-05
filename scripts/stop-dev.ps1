param(
  [int[]]$Ports = @(5173, 4378),
  [string]$TaskName = "Agent ZY Dev Servers",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$logDir = Join-Path $repoRoot ".agent-zy-data\logs"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir ("stop-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

function Write-StopLog {
  param([string]$Message)
  "[$(Get-Date -Format o)] $Message" | Out-File -FilePath $logFile -Encoding utf8 -Append
}

function Get-ListeningPortOwners {
  param([int[]]$TargetPorts)

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
    if ([int]::TryParse($portText, [ref]$port) -and $TargetPorts -contains $port) {
      $owners += [pscustomobject]@{
        Port = $port
        ProcessId = $processId
      }
    }
  }

  return $owners
}

function Stop-StartupTaskIfRunning {
  param([string]$Name)

  try {
    $task = Get-ScheduledTask -TaskName $Name -ErrorAction Stop
  } catch {
    Write-StopLog "Startup task '$Name' was not found."
    return
  }

  try {
    $info = Get-ScheduledTaskInfo -TaskName $Name -ErrorAction Stop
    if ($info.State -eq "Running") {
      Write-StopLog "Stopping scheduled task '$Name'."
      if (-not $DryRun) {
        Stop-ScheduledTask -TaskName $Name -ErrorAction Stop
      }
    } else {
      Write-StopLog "Scheduled task '$Name' is not running."
    }
  } catch {
    Write-StopLog "Unable to inspect or stop scheduled task '$Name': $($_.Exception.Message)"
  }
}

function Wait-PortsReleased {
  param([int[]]$TargetPorts)

  $deadline = (Get-Date).AddSeconds(20)

  while ((Get-Date) -lt $deadline) {
    if ((Get-ListeningPortOwners -TargetPorts $TargetPorts).Count -eq 0) {
      return
    }

    Start-Sleep -Milliseconds 500
  }

  $owners = Get-ListeningPortOwners -TargetPorts $TargetPorts
  throw "Ports are still occupied: $($owners | ConvertTo-Json -Compress)"
}

Write-StopLog "Stop requested for $repoRoot on ports: $($Ports -join ', ')"

Stop-StartupTaskIfRunning -Name $TaskName

$owners = Get-ListeningPortOwners -TargetPorts $Ports
if ($owners.Count -eq 0) {
  Write-StopLog "No listening processes were found on target ports."
  Write-Host "agent-zy dev server is not running on ports $($Ports -join ', ')."
  exit 0
}

$processIds = $owners | Select-Object -ExpandProperty ProcessId -Unique
foreach ($processId in $processIds) {
  Write-StopLog "Stopping process $processId for project port."
  if (-not $DryRun) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
}

if ($DryRun) {
  Write-Host "Dry run only. Matching processes: $($processIds -join ', ')"
  exit 0
}

Wait-PortsReleased -TargetPorts $Ports

Write-StopLog "Ports released successfully."
Write-Host "Stopped agent-zy dev server on ports $($Ports -join ', ')."
