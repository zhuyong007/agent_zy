// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) =>
    React.createElement("a", { className, href: to }, children)
}));

import { ToolsCatalog } from "./tools-page";

describe("ToolsCatalog", () => {
  let container: HTMLDivElement;
  let root: Root;

  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows the prompt template tool entry", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(ToolsCatalog));
    });

    const link = Array.from(container.querySelectorAll("a"))
      .find((item) => item.textContent?.includes("提示词模版"));

    expect(link?.getAttribute("href")).toBe("/tools/prompt-templates");
    expect(link?.textContent).toContain("保存优秀提示词");
  });

  it("shows the file organizer tool entry", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(ToolsCatalog));
    });

    const link = Array.from(container.querySelectorAll("a"))
      .find((item) => item.textContent?.includes("文件整理"));

    expect(link?.getAttribute("href")).toBe("/tools/file-organizer");
    expect(link?.textContent).toContain("按时间或类型");
  });
});
