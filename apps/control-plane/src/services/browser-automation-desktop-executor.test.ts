import { describe, expect, it, vi } from "vitest";

import { createDesktopBrowserAutomationExecutor, type DesktopAutomationController } from "./browser-automation-desktop-executor";
import type { ModelRuntime } from "./model-runtime";

function createController(overrides: Partial<DesktopAutomationController> = {}): DesktopAutomationController {
  return {
    openUrlInNewTab: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue("data:image/png;base64,c2NyZWVu"),
    locateImageOnScreen: vi.fn().mockResolvedValue({ x: 120, y: 80, confidence: 0.96 }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    press: vi.fn().mockResolvedValue(undefined),
    delay: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

function createModelRuntime(text = "{\"x\":340,\"y\":220,\"confidence\":0.82,\"reason\":\"模型定位\"}"): ModelRuntime {
  return {
    chat: vi.fn().mockResolvedValue({ text }),
    generateText: vi.fn(),
    embedding: vi.fn(),
    execute: vi.fn(),
    testConnection: vi.fn()
  } as unknown as ModelRuntime;
}

describe("desktop browser automation executor", () => {
  it("opens URLs in a new tab of the current foreground browser", async () => {
    const controller = createController();
    const executor = createDesktopBrowserAutomationExecutor({
      controller
    });

    const result = await executor.runWorkflow({
      runId: "run-1",
      signal: new AbortController().signal,
      workflow: {
        id: "workflow-1",
        name: "打开当前浏览器",
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
    expect(controller.openUrlInNewTab).toHaveBeenCalledWith("https://example.com");
    expect(result.lastObservation?.url).toBe("desktop://foreground");
  });

  it("uses local image matching before falling back to the vision model", async () => {
    const controller = createController({
      locateImageOnScreen: vi.fn()
        .mockResolvedValueOnce({ x: 120, y: 80, confidence: 0.96 })
        .mockResolvedValueOnce(null)
    });
    const modelRuntime = createModelRuntime();
    const executor = createDesktopBrowserAutomationExecutor({
      controller,
      modelRuntime
    });

    const result = await executor.runWorkflow({
      runId: "run-1",
      signal: new AbortController().signal,
      workflow: {
        id: "workflow-1",
        name: "图片优先",
        description: "",
        enabled: true,
        createdAt: "2026-06-04T00:00:00.000Z",
        updatedAt: "2026-06-04T00:00:00.000Z",
        steps: [
          {
            id: "click-local",
            type: "click",
            imageTarget: {
              imageDataUrl: "data:image/png;base64,dGFyZ2V0",
              prompt: "提交按钮"
            },
            timeoutMs: 30000
          },
          {
            id: "click-model",
            type: "click",
            imageTarget: {
              imageDataUrl: "data:image/png;base64,bWlzc2luZw==",
              prompt: "登录按钮"
            },
            timeoutMs: 30000
          }
        ]
      }
    });

    expect(result.status).toBe("completed");
    expect(controller.locateImageOnScreen).toHaveBeenCalledTimes(2);
    expect(modelRuntime.chat).toHaveBeenCalledOnce();
    expect(controller.click).toHaveBeenNthCalledWith(1, 120, 80);
    expect(controller.click).toHaveBeenNthCalledWith(2, 340, 220);
    expect(result.logs.map((log) => log.message)).toContain("本地图片匹配点击：(120, 80) confidence=0.96");
    expect(result.logs.some((log) => log.message.includes("视觉模型定位点击：(340, 220)"))).toBe(true);
  });
});
