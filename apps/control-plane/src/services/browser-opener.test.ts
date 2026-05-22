import { describe, expect, it } from "vitest";

import { getWindowsBrowserCommand } from "./browser-opener";

describe("browser opener", () => {
  it("prefers the installed Chrome path when chrome.exe is not on PATH", () => {
    const command = getWindowsBrowserCommand({
      pathExt: "",
      pathValue: "",
      exists: (path) => path === "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      localAppData: "C:\\Users\\85143\\AppData\\Local",
      programFiles: "C:\\Program Files",
      programFilesX86: "C:\\Program Files (x86)"
    });

    expect(command).toEqual({
      command: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: []
    });
  });
});
