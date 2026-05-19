$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$logDir = Join-Path $repoRoot ".agent-zy-data\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$mutex = New-Object System.Threading.Mutex($false, "Global\AgentZyDevServer")
if (-not $mutex.WaitOne(0)) {
  exit 0
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
