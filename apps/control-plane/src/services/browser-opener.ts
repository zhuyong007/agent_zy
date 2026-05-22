import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { win32 } from "node:path";

export type ExternalUrlOpener = (url: string) => void | Promise<void>;
export type BrowserCommand = {
  command: string;
  args: string[];
};

type WindowsBrowserCommandOptions = {
  pathValue?: string;
  pathExt?: string;
  localAppData?: string;
  programFiles?: string;
  programFilesX86?: string;
  exists?: (path: string) => boolean;
};

export function normalizeExternalUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value.trim());

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function findExecutableInPath(
  executable: string,
  options: Pick<WindowsBrowserCommandOptions, "pathValue" | "pathExt" | "exists">
) {
  const exists = options.exists ?? existsSync;
  const pathExts = (options.pathExt || ".EXE").split(";").filter(Boolean);

  for (const directory of (options.pathValue ?? "").split(win32.delimiter).filter(Boolean)) {
    for (const extension of pathExts) {
      const candidate = win32.join(
        directory,
        executable.endsWith(extension.toLowerCase()) ? executable : `${executable}${extension}`
      );

      if (exists(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

export function getWindowsBrowserCommand(options: WindowsBrowserCommandOptions = {}): BrowserCommand {
  const exists = options.exists ?? existsSync;
  const chromeFromPath = findExecutableInPath("chrome", {
    pathValue: options.pathValue ?? process.env.PATH,
    pathExt: options.pathExt ?? process.env.PATHEXT,
    exists
  });

  if (chromeFromPath) {
    return {
      command: chromeFromPath,
      args: []
    };
  }

  const candidates = [
    options.localAppData ? win32.join(options.localAppData, "Google", "Chrome", "Application", "chrome.exe") : null,
    options.programFiles ? win32.join(options.programFiles, "Google", "Chrome", "Application", "chrome.exe") : null,
    options.programFilesX86 ? win32.join(options.programFilesX86, "Google", "Chrome", "Application", "chrome.exe") : null
  ].filter((path): path is string => Boolean(path));

  const chromePath = candidates.find((path) => exists(path));

  if (chromePath) {
    return {
      command: chromePath,
      args: []
    };
  }

  return {
    command: "cmd.exe",
    args: ["/c", "start", "", "%URL%"]
  };
}

export const openExternalUrlInBrowser: ExternalUrlOpener = (url) => {
  if (process.platform === "win32") {
    const browser = getWindowsBrowserCommand({
      localAppData: process.env.LOCALAPPDATA,
      programFiles: process.env.ProgramFiles,
      programFilesX86: process.env["ProgramFiles(x86)"]
    });
    const args = browser.args.map((arg) => (arg === "%URL%" ? url : arg));
    const child = spawn(browser.command, [...args, ...(browser.args.includes("%URL%") ? [] : [url])], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();
    return;
  }

  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(opener, [url], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
};
