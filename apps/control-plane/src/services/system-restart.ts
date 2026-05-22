import { spawn } from "node:child_process";
import { resolve } from "node:path";

export type ProjectRestarter = () => void | Promise<void>;

export const restartProjectWithScript: ProjectRestarter = () => {
  const scriptPath = resolve(process.cwd(), "scripts", "restart-dev.ps1");
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", scriptPath],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    }
  );

  child.unref();
};
