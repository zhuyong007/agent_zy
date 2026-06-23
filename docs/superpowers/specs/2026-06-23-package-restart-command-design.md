# Package Restart Command Design

## Goal

Add an npm entry point so `npm run restart` restarts the local Agent ZY development project.

## Design

- Add a `restart` script to the root `package.json`.
- Invoke the existing `scripts/restart-dev.ps1` with Windows PowerShell, `-NoProfile`, and an execution-policy bypass.
- Keep all process management in the existing PowerShell script. It already stops listeners on ports 5173 and 4378, waits for shutdown, and starts the web and control-plane processes in the background.
- Do not duplicate port or process logic in `package.json`.

The script value will be:

```json
"restart": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/restart-dev.ps1"
```

## Error Handling

PowerShell returns a non-zero exit code if the restart script cannot release the required ports or cannot launch the startup script. Existing restart logs remain under `.agent-zy-data/logs`.

## Verification

- Parse `package.json` and assert that the `restart` script exactly targets `scripts/restart-dev.ps1`.
- Do not execute the restart command during automated verification because it intentionally terminates processes using the project ports.

