$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$startScript = Join-Path $repoRoot "scripts\start-dev.ps1"
$stopScript = Join-Path $repoRoot "scripts\stop-dev.ps1"
$logDir = Join-Path $repoRoot ".agent-zy-data\logs"
$mutexName = "Global\AgentZyDevServer"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir ("restart-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

function Write-RestartLog {
  param([string]$Message)
  "[$(Get-Date -Format o)] $Message" | Out-File -FilePath $logFile -Encoding utf8 -Append
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
Write-RestartLog "Stopping project with $stopScript"
& "powershell.exe" -NoProfile -ExecutionPolicy Bypass -File $stopScript *>> $logFile
Wait-DevServerMutexReleased

Write-RestartLog "Starting project with $startScript"
Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $startScript) `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden
