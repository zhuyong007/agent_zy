// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

import { BrowserAutomationWorkspace } from "./browser-automation-page";

describe("BrowserAutomationWorkspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function renderWorkspace(actions: Parameters<typeof BrowserAutomationWorkspace>[0]) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(BrowserAutomationWorkspace, actions));
    });
  }

  function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function selectValue(select: HTMLSelectElement, value: string) {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), "value")?.set?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  it("loads workflows, saves form edits, runs a workflow, and shows run logs", async () => {
    const fetchAction = vi.fn().mockResolvedValue({
      workflows: [
        {
          id: "workflow-1",
          name: "等待网页状态示例",
          description: "等待页面完成",
          enabled: true,
          createdAt: "2026-06-04T00:00:00.000Z",
          updatedAt: "2026-06-04T00:00:00.000Z",
          steps: [
            {
              id: "open",
              type: "openUrl",
              url: "https://example.com"
            }
          ]
        }
      ],
      runs: [],
      triggerRules: [],
      lastUpdatedAt: null
    });
    const createAction = vi.fn().mockResolvedValue({
      id: "workflow-2",
      name: "新流程",
      description: "",
      enabled: true,
      steps: [],
      createdAt: "2026-06-04T00:00:00.000Z",
      updatedAt: "2026-06-04T00:00:00.000Z"
    });
    const runAction = vi.fn(async (workflowId: string) => ({
      id: "run-1",
      workflowId,
      workflowName: "新流程",
      status: "completed" as const,
      trigger: "user" as const,
      startedAt: "2026-06-04T00:00:00.000Z",
      finishedAt: "2026-06-04T00:00:01.000Z",
      error: null,
      extracted: {},
      lastObservation: {
        url: "https://example.com/",
        title: "Example",
        text: "ready",
        capturedAt: "2026-06-04T00:00:01.000Z"
      },
      logs: [
        {
          id: "log-1",
          stepId: "open",
          level: "info" as const,
          message: "ran openUrl",
          createdAt: "2026-06-04T00:00:01.000Z"
        }
      ]
    }));

    await renderWorkspace({
      fetchAction,
      createAction,
      updateAction: vi.fn(),
      runAction,
      stopAction: vi.fn(),
      createRuleAction: vi.fn()
    });

    expect(container.textContent).toContain("等待网页状态示例");
    expect(container.querySelector("textarea")).toBeNull();

    await act(async () => {
      container.querySelector('button[data-action="new-workflow"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const nameInput = container.querySelector('input[name="workflowName"]') as HTMLInputElement;
    const urlInput = container.querySelector('input[name="step-open-url"]') as HTMLInputElement;
    await act(async () => {
      typeInto(nameInput, "新流程");
      typeInto(urlInput, "https://example.com");
    });
    await act(async () => {
      container.querySelector('button[data-action="save-workflow"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(createAction).toHaveBeenCalledWith(expect.objectContaining({
      name: "新流程",
      steps: [
        expect.objectContaining({
          id: "open",
          type: "openUrl",
          url: "https://example.com"
        })
      ]
    }));

    await act(async () => {
      container.querySelector('button[data-action="run-workflow"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(runAction).toHaveBeenCalledWith("workflow-2");
    expect(container.textContent).toContain("completed");
    expect(container.textContent).toContain("ran openUrl");
  });

  it("turns uploaded click target images into workflow image targets", async () => {
    const createAction = vi.fn().mockResolvedValue({
      id: "workflow-image",
      name: "图片点击流程",
      description: "",
      enabled: true,
      steps: [],
      createdAt: "2026-06-04T00:00:00.000Z",
      updatedAt: "2026-06-04T00:00:00.000Z"
    });

    await renderWorkspace({
      fetchAction: vi.fn().mockResolvedValue({
        workflows: [],
        runs: [],
        triggerRules: [],
        lastUpdatedAt: null
      }),
      createAction,
      updateAction: vi.fn(),
      runAction: vi.fn(),
      stopAction: vi.fn(),
      createRuleAction: vi.fn()
    });

    await act(async () => {
      selectValue(container.querySelector("select") as HTMLSelectElement, "click");
    });

    expect(container.textContent).not.toContain("选择器 / #id");
    const imageInput = container.querySelector('input[name="step-click-image"]') as HTMLInputElement;
    const targetFile = new File(["target"], "target.png", { type: "image/png" });

    await act(async () => {
      Object.defineProperty(imageInput, "files", {
        value: [targetFile],
        configurable: true
      });
      imageInput.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const promptInput = container.querySelector(".browser-automation-target-prompt input") as HTMLInputElement;
    await act(async () => {
      typeInto(promptInput, "页面右上角的提交按钮");
    });

    await act(async () => {
      container.querySelector('button[data-action="save-workflow"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(createAction).toHaveBeenCalledWith(expect.objectContaining({
      steps: [
        expect.objectContaining({
          type: "click",
          imageTarget: {
            imageDataUrl: "data:image/png;base64,dGFyZ2V0"
          },
          targetPrompt: "页面右上角的提交按钮"
        })
      ]
    }));
  });

  it("turns pasted clipboard images into workflow image targets", async () => {
    const createAction = vi.fn().mockResolvedValue({
      id: "workflow-pasted-image",
      name: "粘贴图片流程",
      description: "",
      enabled: true,
      steps: [],
      createdAt: "2026-06-04T00:00:00.000Z",
      updatedAt: "2026-06-04T00:00:00.000Z"
    });

    await renderWorkspace({
      fetchAction: vi.fn().mockResolvedValue({
        workflows: [],
        runs: [],
        triggerRules: [],
        lastUpdatedAt: null
      }),
      createAction,
      updateAction: vi.fn(),
      runAction: vi.fn(),
      stopAction: vi.fn(),
      createRuleAction: vi.fn()
    });

    await act(async () => {
      selectValue(container.querySelector("select") as HTMLSelectElement, "click");
    });

    const pasteTarget = container.querySelector("[data-image-paste-target]") as HTMLDivElement;
    expect(pasteTarget).not.toBeNull();
    expect(pasteTarget.querySelector('input[type="file"]')).toBeNull();
    expect(container.querySelector("[data-image-upload-target] input[type=\"file\"]")).not.toBeNull();
    const targetFile = new File(["clipboard-target"], "clipboard-target.png", { type: "image/png" });
    const pasteEvent = new Event("paste", { bubbles: true }) as Event & {
      clipboardData: {
        files: File[];
        items: Array<{ kind: string; type: string; getAsFile: () => File }>;
      };
    };
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        files: [targetFile],
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => targetFile
          }
        ]
      }
    });

    await act(async () => {
      pasteTarget.dispatchEvent(pasteEvent);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("已粘贴剪贴板图片");

    await act(async () => {
      container.querySelector('button[data-action="save-workflow"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(createAction).toHaveBeenCalledWith(expect.objectContaining({
      steps: [
        expect.objectContaining({
          type: "click",
          imageTarget: {
            imageDataUrl: "data:image/png;base64,Y2xpcGJvYXJkLXRhcmdldA=="
          }
        })
      ]
    }));
  });

  it("keeps low-frequency step settings in an advanced section and supports collapsing steps", async () => {
    await renderWorkspace({
      fetchAction: vi.fn().mockResolvedValue({
        workflows: [],
        runs: [],
        triggerRules: [],
        lastUpdatedAt: null
      }),
      createAction: vi.fn(),
      updateAction: vi.fn(),
      runAction: vi.fn(),
      stopAction: vi.fn(),
      createRuleAction: vi.fn()
    });

    expect(container.querySelector("details.browser-automation-step-advanced")?.textContent).toContain("步骤 ID");

    const stepBody = container.querySelector("[data-step-body]");
    expect(stepBody).not.toBeNull();

    await act(async () => {
      container.querySelector('button[aria-label="折叠步骤 1"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector("[data-step-body]")).toBeNull();
    expect(container.querySelector('button[aria-label="展开步骤 1"]')).not.toBeNull();
  });

  it("opens desktop permission settings from dedicated controls", async () => {
    const openPermissionSettingsAction = vi.fn().mockResolvedValue({
      opened: true,
      message: "已打开辅助功能设置"
    });

    await renderWorkspace({
      fetchAction: vi.fn().mockResolvedValue({
        workflows: [],
        runs: [],
        triggerRules: [],
        lastUpdatedAt: null
      }),
      createAction: vi.fn(),
      updateAction: vi.fn(),
      runAction: vi.fn(),
      stopAction: vi.fn(),
      createRuleAction: vi.fn(),
      openPermissionSettingsAction
    });

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "打开辅助功能设置")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(openPermissionSettingsAction).toHaveBeenCalledWith("accessibility");
    expect(container.textContent).toContain("已打开辅助功能设置");
  });

  it("uses the tools workspace shell that owns page scrolling", async () => {
    await renderWorkspace({
      fetchAction: vi.fn().mockResolvedValue({
        workflows: [],
        runs: [],
        triggerRules: [],
        lastUpdatedAt: null
      }),
      createAction: vi.fn(),
      updateAction: vi.fn(),
      runAction: vi.fn(),
      stopAction: vi.fn(),
      createRuleAction: vi.fn()
    });

    expect(container.querySelector(".browser-automation-shell")).not.toBeNull();
  });

  it("links back to the tools catalog", async () => {
    await renderWorkspace({
      fetchAction: vi.fn().mockResolvedValue({
        workflows: [],
        runs: [],
        triggerRules: [],
        lastUpdatedAt: null
      }),
      createAction: vi.fn(),
      updateAction: vi.fn(),
      runAction: vi.fn(),
      stopAction: vi.fn(),
      createRuleAction: vi.fn()
    });

    const backLink = container.querySelector('a[data-action="back-to-tools"]');

    expect(backLink?.textContent).toContain("返回上级");
    expect(backLink?.getAttribute("href")).toBe("/tools");
  });
});
