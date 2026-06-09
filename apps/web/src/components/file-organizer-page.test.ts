// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

import { FileOrganizerWorkspace } from "./file-organizer-page";

describe("FileOrganizerWorkspace", () => {
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

  async function renderWorkspace(actions: Parameters<typeof FileOrganizerWorkspace>[0]) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(FileOrganizerWorkspace, actions));
    });
  }

  function typeInto(input: HTMLInputElement, value: string) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("previews by month, confirms, executes, and undoes an organization batch", async () => {
    const previewAction = vi.fn().mockResolvedValue({
      previewToken: "preview-1",
      directoryPath: "C:\\files",
      mode: "time",
      timeGranularity: "month",
      createdAt: "2026-06-01T08:00:00.000Z",
      expiresAt: "2026-06-01T08:30:00.000Z",
      summary: { total: 1, move: 1, unchanged: 0, skipped: 0 },
      items: [
        {
          sourcePath: "C:\\files\\nested\\2025-01-note.txt",
          sourceName: "2025-01-note.txt",
          targetPath: "C:\\files\\2025_01\\2025-01-note.txt",
          targetName: "2025-01-note.txt",
          targetFolderName: "2025_01",
          status: "move",
          timeSource: "filename",
          size: 4,
          modifiedAt: "2025-01-01T04:00:00.000Z"
        }
      ]
    });
    const executeAction = vi.fn().mockResolvedValue({
      undoToken: "undo-1",
      summary: { moved: 1, failed: 0 },
      items: [
        {
          sourcePath: "C:\\files\\nested\\2025-01-note.txt",
          targetPath: "C:\\files\\2025_01\\2025-01-note.txt",
          status: "moved"
        }
      ]
    });
    const undoAction = vi.fn().mockResolvedValue({
      summary: { restored: 1, failed: 0 },
      items: [
        {
          sourcePath: "C:\\files\\nested\\2025-01-note.txt",
          targetPath: "C:\\files\\2025_01\\2025-01-note.txt",
          status: "restored"
        }
      ]
    });
    await renderWorkspace({ previewAction, executeAction, undoAction });

    const input = container.querySelector('input[name="directoryPath"]') as HTMLInputElement;
    await act(async () => {
      typeInto(input, "C:\\files");
    });
    await act(async () => {
      input.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(previewAction).toHaveBeenCalledWith({
      directoryPath: "C:\\files",
      mode: "time",
      timeGranularity: "month"
    });
    expect(container.textContent).toContain("2025-01-note.txt");
    expect(container.textContent).toContain("2025_01");

    const executeButton = container.querySelector('button[data-action="execute"]');
    await act(async () => {
      executeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(executeAction).not.toHaveBeenCalled();

    const confirmButton = container.querySelector('button[data-action="confirm-execute"]');
    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(executeAction).toHaveBeenCalledWith("preview-1");
    expect(container.textContent).toContain("已移动 1 个文件");

    const undoButton = container.querySelector('button[data-action="undo"]');
    await act(async () => {
      undoButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(undoAction).toHaveBeenCalledWith("undo-1");
    expect(container.textContent).toContain("已恢复 1 个文件");
  });

  it("switches to type organization and hides time granularity from preview input", async () => {
    const previewAction = vi.fn().mockResolvedValue({
      previewToken: "preview-type",
      directoryPath: "C:\\files",
      mode: "type",
      timeGranularity: null,
      createdAt: "2026-06-01T08:00:00.000Z",
      expiresAt: "2026-06-01T08:30:00.000Z",
      summary: { total: 1, move: 1, unchanged: 0, skipped: 0 },
      items: []
    });
    await renderWorkspace({
      previewAction,
      executeAction: vi.fn(),
      undoAction: vi.fn()
    });

    await act(async () => {
      container.querySelector('button[data-mode="type"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const input = container.querySelector('input[name="directoryPath"]') as HTMLInputElement;
    await act(async () => {
      typeInto(input, "C:\\files");
    });
    await act(async () => {
      input.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(previewAction).toHaveBeenCalledWith({
      directoryPath: "C:\\files",
      mode: "type",
      timeGranularity: undefined
    });
    expect(container.textContent).toContain("整理方式按类型");
  });

  it("shows preview errors and links back to the tools catalog", async () => {
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
    const backLink = container.querySelector('a[data-action="back-to-tools"]');
    expect(backLink?.textContent).toContain("返回上级");
    expect(backLink?.getAttribute("href")).toBe("/tools");
  });
});
