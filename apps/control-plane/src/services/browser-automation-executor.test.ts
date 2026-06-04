import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createPlaywrightBrowserAutomationExecutor } from "./browser-automation-executor";

const playwrightMock = {
  launchPersistentContext: vi.fn()
};

function createMockPage(initialUrl: string) {
  let currentUrl = initialUrl;
  const bodyLocator = {
    innerText: vi.fn().mockResolvedValue("ready"),
    click: vi.fn().mockResolvedValue(undefined)
  };

  return {
    goto: vi.fn(async (url: string) => {
      currentUrl = url;
    }),
    url: vi.fn(() => currentUrl),
    title: vi.fn().mockResolvedValue("Ready"),
    locator: vi.fn(() => bodyLocator),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("screenshot")),
    mouse: {
      click: vi.fn().mockResolvedValue(undefined)
    },
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined)
    }
  };
}

describe("Playwright browser automation executor", () => {
  const dataDirs: string[] = [];

  afterEach(() => {
    playwrightMock.launchPersistentContext.mockReset();
    for (const dir of dataDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("opens openUrl steps in a new tab of the existing Chrome context", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-browser-executor-"));
    dataDirs.push(dataDir);
    const existingPage = createMockPage("chrome://new-tab-page/");
    const openedPage = createMockPage("about:blank");
    const context = {
      pages: vi.fn(() => [existingPage]),
      newPage: vi.fn().mockResolvedValue(openedPage),
      close: vi.fn().mockResolvedValue(undefined)
    };
    playwrightMock.launchPersistentContext.mockResolvedValue(context);

    const executor = createPlaywrightBrowserAutomationExecutor({
      dataDir,
      playwright: {
        chromium: {
          launchPersistentContext: playwrightMock.launchPersistentContext
        }
      }
    });
    const result = await executor.runWorkflow({
      runId: "run-1",
      signal: new AbortController().signal,
      workflow: {
        id: "workflow-1",
        name: "打开新标签",
        description: "",
        enabled: true,
        createdAt: "2026-06-04T00:00:00.000Z",
        updatedAt: "2026-06-04T00:00:00.000Z",
        steps: [
          {
            id: "open",
            type: "openUrl",
            url: "https://example.com",
            timeoutMs: 30000
          }
        ]
      }
    });

    expect(result.status).toBe("completed");
    expect(context.newPage).toHaveBeenCalledOnce();
    expect(existingPage.goto).not.toHaveBeenCalled();
    expect(openedPage.goto).toHaveBeenCalledWith("https://example.com", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
    expect(result.lastObservation?.url).toBe("https://example.com");
  });

  it("keeps the automation Chrome context open and reuses it across workflow runs", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-browser-executor-"));
    dataDirs.push(dataDir);
    const existingPage = createMockPage("chrome://new-tab-page/");
    const firstOpenedPage = createMockPage("about:blank");
    const secondOpenedPage = createMockPage("about:blank");
    const context = {
      pages: vi.fn(() => [existingPage]),
      newPage: vi.fn()
        .mockResolvedValueOnce(firstOpenedPage)
        .mockResolvedValueOnce(secondOpenedPage),
      close: vi.fn().mockResolvedValue(undefined)
    };
    playwrightMock.launchPersistentContext.mockResolvedValue(context);

    const executor = createPlaywrightBrowserAutomationExecutor({
      dataDir,
      playwright: {
        chromium: {
          launchPersistentContext: playwrightMock.launchPersistentContext
        }
      }
    });
    const workflow = {
      id: "workflow-1",
      name: "复用登录态",
      description: "",
      enabled: true,
      createdAt: "2026-06-04T00:00:00.000Z",
      updatedAt: "2026-06-04T00:00:00.000Z",
      steps: [
        {
          id: "open",
          type: "openUrl",
          url: "https://example.com",
          timeoutMs: 30000
        } as const
      ]
    };

    await executor.runWorkflow({
      runId: "run-1",
      signal: new AbortController().signal,
      workflow
    });
    await executor.runWorkflow({
      runId: "run-2",
      signal: new AbortController().signal,
      workflow
    });

    expect(playwrightMock.launchPersistentContext).toHaveBeenCalledOnce();
    expect(context.newPage).toHaveBeenCalledTimes(2);
    expect(firstOpenedPage.goto).toHaveBeenCalledOnce();
    expect(secondOpenedPage.goto).toHaveBeenCalledOnce();
    expect(context.close).not.toHaveBeenCalled();
  });
});
