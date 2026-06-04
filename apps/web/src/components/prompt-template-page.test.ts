// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

import { PromptTemplateWorkspace } from "./prompt-template-page";

describe("PromptTemplateWorkspace", () => {
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

  async function renderWorkspace(actions: Parameters<typeof PromptTemplateWorkspace>[0]) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(PromptTemplateWorkspace, actions));
    });
  }

  function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("creates a template, lets variables stay editable, and applies it", async () => {
    const createAction = vi.fn().mockResolvedValue({
      id: "template-1",
      title: "狮子图片",
      originalPrompt: "生成9:16的狮子的图片",
      templatePrompt: "生成 {{aspect_ratio}} 的 {{subject}} 图片",
      variables: [
        {
          id: "variable-aspect-ratio",
          key: "aspect_ratio",
          label: "画面比例",
          description: "替换画面比例",
          defaultValue: "9:16",
          required: true
        },
        {
          id: "variable-subject",
          key: "subject",
          label: "主体",
          description: "替换图片主体",
          defaultValue: "狮子",
          required: true
        }
      ],
      analysisStatus: "completed",
      analysisError: null,
      createdAt: "2026-06-04T00:00:00.000Z",
      updatedAt: "2026-06-04T00:00:00.000Z",
      lastUsedAt: null
    });
    const updateAction = vi.fn(async (_id: string, input: unknown) => ({
      ...await createAction.mock.results[0].value,
      ...(input as object)
    }));
    const applyAction = vi.fn().mockResolvedValue({
      templateId: "template-1",
      finalPrompt: "生成 1:1 的橘猫图片",
      values: {
        aspect_ratio: "1:1",
        subject: "橘猫"
      },
      generatedAt: "2026-06-04T00:01:00.000Z"
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText }
    });

    await renderWorkspace({
      fetchAction: vi.fn().mockResolvedValue({ items: [], lastUpdatedAt: null }),
      createAction,
      updateAction,
      deleteAction: vi.fn(),
      applyAction
    });

    await act(async () => {
      typeInto(container.querySelector('input[name="templateTitle"]') as HTMLInputElement, "狮子图片");
      typeInto(container.querySelector('textarea[name="originalPrompt"]') as HTMLTextAreaElement, "生成9:16的狮子的图片");
    });
    await act(async () => {
      container.querySelector('form[data-role="template-editor"]')
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(createAction).toHaveBeenCalledWith({
      title: "狮子图片",
      originalPrompt: "生成9:16的狮子的图片"
    });
    expect(container.textContent).toContain("画面比例");
    expect(container.textContent).toContain("主体");

    await act(async () => {
      typeInto(container.querySelector('input[name="variable-0-label"]') as HTMLInputElement, "图片比例");
    });
    await act(async () => {
      container.querySelector('button[data-action="save-variables"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(updateAction).toHaveBeenCalledWith("template-1", expect.objectContaining({
      variables: expect.arrayContaining([
        expect.objectContaining({ label: "图片比例" })
      ])
    }));

    await act(async () => {
      typeInto(container.querySelector('input[name="apply-aspect_ratio"]') as HTMLInputElement, "1:1");
      typeInto(container.querySelector('input[name="apply-subject"]') as HTMLInputElement, "橘猫");
    });
    await act(async () => {
      container.querySelector('form[data-role="template-apply"]')
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(applyAction).toHaveBeenCalledWith("template-1", {
      values: {
        aspect_ratio: "1:1",
        subject: "橘猫"
      }
    });
    expect(container.textContent).toContain("生成 1:1 的橘猫图片");

    await act(async () => {
      container.querySelector('button[data-action="copy-final-prompt"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenCalledWith("生成 1:1 的橘猫图片");
  });

  it("links back to the tools catalog", async () => {
    await renderWorkspace({
      fetchAction: vi.fn().mockResolvedValue({ items: [], lastUpdatedAt: null }),
      createAction: vi.fn(),
      updateAction: vi.fn(),
      deleteAction: vi.fn(),
      applyAction: vi.fn()
    });

    const backLink = container.querySelector('a[data-action="back-to-tools"]');

    expect(backLink?.textContent).toContain("返回上级");
    expect(backLink?.getAttribute("href")).toBe("/tools");
  });
});
