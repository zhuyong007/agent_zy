// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

import { PhotoRenamerWorkspace } from "./photo-renamer-page";

describe("PhotoRenamerWorkspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  async function renderWorkspace(actions: Parameters<typeof PhotoRenamerWorkspace>[0]) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PhotoRenamerWorkspace, actions));
    });
  }

  function typeInto(input: HTMLInputElement, value: string) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("previews, confirms, executes, and undoes a photo rename batch", async () => {
    const previewAction = vi.fn().mockResolvedValue({
      previewToken: "preview-1",
      directoryPath: "C:\\photos",
      createdAt: "2026-06-01T08:00:00.000Z",
      expiresAt: "2026-06-01T08:30:00.000Z",
      summary: { total: 1, rename: 1, unchanged: 0, skipped: 0 },
      items: [
        {
          sourcePath: "C:\\photos\\holiday.jpg",
          sourceName: "holiday.jpg",
          targetPath: "C:\\photos\\20260101_12_23_24.jpg",
          targetName: "20260101_12_23_24.jpg",
          status: "rename",
          timeSource: "file-mtime",
          capturedAt: "2026-01-01T04:23:24.000Z",
          size: 5,
          modifiedAt: "2026-01-01T04:23:24.000Z"
        }
      ]
    });
    const executeAction = vi.fn().mockResolvedValue({
      undoToken: "undo-1",
      summary: { renamed: 1, failed: 0 },
      items: [
        {
          sourcePath: "C:\\photos\\holiday.jpg",
          targetPath: "C:\\photos\\20260101_12_23_24.jpg",
          status: "renamed"
        }
      ]
    });
    const undoAction = vi.fn().mockResolvedValue({
      summary: { restored: 1, failed: 0 },
      items: [
        {
          sourcePath: "C:\\photos\\holiday.jpg",
          targetPath: "C:\\photos\\20260101_12_23_24.jpg",
          status: "restored"
        }
      ]
    });
    await renderWorkspace({ previewAction, executeAction, undoAction });

    const input = container.querySelector('input[name="directoryPath"]') as HTMLInputElement;
    await act(async () => {
      typeInto(input, "C:\\photos");
    });
    await act(async () => {
      input.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(previewAction).toHaveBeenCalledWith("C:\\photos", "all");
    expect(container.textContent).toContain("holiday.jpg");
    expect(container.textContent).toContain("20260101_12_23_24.jpg");

    const executeButton = container.querySelector('button[data-action="execute"]');
    await act(async () => {
      executeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(executeAction).not.toHaveBeenCalled();

    const cancelButton = container.querySelector('button[data-action="cancel-execute"]');
    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(executeAction).not.toHaveBeenCalled();

    await act(async () => {
      executeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(executeAction).not.toHaveBeenCalled();

    await act(async () => {
      executeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const confirmButton = container.querySelector('button[data-action="confirm-execute"]');
    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(executeAction).toHaveBeenCalledWith("preview-1");
    expect(container.textContent).toContain("已重命名 1 个文件");

    const undoButton = container.querySelector('button[data-action="undo"]');
    await act(async () => {
      undoButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(undoAction).toHaveBeenCalledWith("undo-1");
    expect(container.textContent).toContain("已恢复 1 个文件");
  });

  it("scans only the selected video scope and shows it in the confirmation dialog", async () => {
    const previewAction = vi.fn().mockResolvedValue({
      previewToken: "preview-video",
      directoryPath: "C:\\media",
      createdAt: "2026-06-01T08:00:00.000Z",
      expiresAt: "2026-06-01T08:30:00.000Z",
      summary: { total: 1, rename: 1, unchanged: 0, skipped: 0 },
      items: []
    });
    await renderWorkspace({
      previewAction,
      executeAction: vi.fn(),
      undoAction: vi.fn()
    });

    const videoScope = container.querySelector('button[data-media-scope="videos"]');
    await act(async () => {
      videoScope?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const input = container.querySelector('input[name="directoryPath"]') as HTMLInputElement;
    await act(async () => {
      typeInto(input, "C:\\media");
    });
    await act(async () => {
      input.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(previewAction).toHaveBeenCalledWith("C:\\media", "videos");
    expect(container.textContent).toContain("当前范围视频");

    await act(async () => {
      container.querySelector('button[data-action="execute"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("视频文件");
  });

  it("shows preview errors", async () => {
    const previewAction = vi.fn().mockRejectedValue(new Error("目录不存在"));
    await renderWorkspace({
      previewAction,
      executeAction: vi.fn(),
      undoAction: vi.fn()
    });

    const input = container.querySelector('input[name="directoryPath"]') as HTMLInputElement;
    await act(async () => {
      typeInto(input, "C:\\missing");
    });
    await act(async () => {
      input.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain("目录不存在");
  });
});
