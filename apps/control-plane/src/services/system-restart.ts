import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ProjectRestarter = () => void | Promise<void>;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export const restartProjectWithScript: ProjectRestarter = () => {
  const scriptPath = resolve(repoRoot, "scripts", "restart-dev.ps1");

  if (!existsSync(scriptPath)) {
    throw new Error(`Restart script not found: ${scriptPath}`);
  }

  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", scriptPath],
    {
      cwd: repoRoot,
      detached: true,
      stdio: "ignore",
      windowsHide: true
    }
  );

  child.unref();
};
