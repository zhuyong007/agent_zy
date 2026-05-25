param(
    [int]$PollSeconds = 30,

    [string]$LogPath = "E:\Project\agent_zy\.codex_shutdown_watch.log",

    [Parameter(Mandatory = $true)]
    [string[]]$SessionFiles
)

function Write-WatchLog {
    param([string]$Message)
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -LiteralPath $LogPath -Value "[$stamp] $Message"
}

function Test-CodexSessionCompleted {
    param([string]$SessionFile)

    if (-not (Test-Path -LiteralPath $SessionFile)) {
        return $false
    }

    $lastUserIndex = -1
    $finalAnswerAfterUser = $false
    $lines = Get-Content -LiteralPath $SessionFile -ErrorAction SilentlyContinue

    for ($i = 0; $i -lt $lines.Count; $i++) {
        try {
            $entry = $lines[$i] | ConvertFrom-Json -ErrorAction Stop
        } catch {
            continue
        }

        if ($entry.type -eq "response_item" -and $entry.payload.type -eq "message" -and $entry.payload.role -eq "user") {
            $lastUserIndex = $i
            $finalAnswerAfterUser = $false
            continue
        }

        if (
            $lastUserIndex -ge 0 -and
            $i -gt $lastUserIndex -and
            $entry.type -eq "response_item" -and
            $entry.payload.type -eq "message" -and
            $entry.payload.role -eq "assistant" -and
            $entry.payload.phase -eq "final_answer"
        ) {
            $finalAnswerAfterUser = $true
        }
    }

    return $finalAnswerAfterUser
}

Write-WatchLog "Watching Codex sessions: $($SessionFiles -join ' | ')"

while ($true) {
    $pending = @()
    foreach ($sessionFile in $SessionFiles) {
        if (-not (Test-CodexSessionCompleted -SessionFile $sessionFile)) {
            $pending += $sessionFile
        }
    }

    if ($pending.Count -eq 0) {
        Write-WatchLog "All watched Codex sessions completed. Shutting down."
        shutdown.exe /s /t 0 /c "Codex watched tasks completed"
        break
    }

    Write-WatchLog "Still pending: $($pending -join ' | ')"
    Start-Sleep -Seconds $PollSeconds
}
