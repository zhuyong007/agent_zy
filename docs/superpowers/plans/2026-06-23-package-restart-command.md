# Package Restart Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `npm run restart` as the root-package command for restarting the local web and control-plane development processes.

**Architecture:** Keep `package.json` as a thin command entry point and delegate all shutdown, port-release, background-start, and logging behavior to the existing `scripts/restart-dev.ps1`. Verification will inspect the package script without executing the intentionally disruptive restart operation.

**Tech Stack:** npm scripts, JSON, Windows PowerShell

---

### Task 1: Add and verify the restart package script

**Files:**
- Modify: `package.json:12-18`
- Reference: `scripts/restart-dev.ps1`
- Verify: inline Node.js assertion; no persistent test file is needed for this configuration-only change

- [x] **Step 1: Run the configuration assertion and verify it fails**

Run:

```powershell
node --input-type=module -e "import fs from 'node:fs'; const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); const expected='powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/restart-dev.ps1'; if(pkg.scripts?.restart !== expected) throw new Error('restart script is missing or incorrect')"
```

Expected: exit code 1 with `restart script is missing or incorrect`.

- [x] **Step 2: Add the minimal package script**

In the root `package.json`, add the `restart` entry immediately after `dev`:

```json
"dev": "concurrently -n control,web -c blue,magenta \"npm run dev:control-plane\" \"npm run dev:web\"",
"restart": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/restart-dev.ps1",
"dev:control-plane": "node --import tsx apps/control-plane/src/index.ts"
```

- [x] **Step 3: Re-run the configuration assertion and verify it passes**

Run the Step 1 command again.

Expected: exit code 0 with no output.

- [x] **Step 4: Validate JSON formatting and the final diff**

Run:

```powershell
node -e "JSON.parse(require('node:fs').readFileSync('package.json','utf8')); console.log('package.json valid')"
git diff --check
git diff -- package.json
```

Expected: `package.json valid`, no whitespace errors, and a diff containing only the new `restart` script entry.

- [x] **Step 5: Commit the implementation and plan**

```powershell
git add package.json docs/superpowers/plans/2026-06-23-package-restart-command.md
git commit -m "chore: add project restart command"
```
