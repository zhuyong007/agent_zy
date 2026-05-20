// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

import type { NewsFeedItem } from "@agent-zy/shared-types";

vi.mock("@tanstack/react-router", async () => {
  const react = await import("react");

  return {
    Link: ({
      children,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => react.createElement("a", props, children)
  };
});

import { ManageModuleCard, ModelManagementSection, NewsPanel } from "./components/dashboard-page";

const sampleItems: NewsFeedItem[] = [
  {
    id: "news-1",
    title: "OpenAI 发布新模型",
    titleEn: null,
    url: "https://example.com/news-1",
    source: "AI HOT",
    publishedAt: "2026-05-14T08:00:00.000Z",
    summary: "测试摘要",
    category: "ai-models"
  }
];

describe("NewsPanel", () => {
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

  it("shows refresh button and disables it while refreshing", async () => {
    const onRefresh = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(NewsPanel, {
          items: sampleItems,
          updatedAt: "2026-05-14T08:05:00.000Z",
          size: "large",
          filter: "all",
          onFilterChange: () => undefined,
          onRefresh,
          isRefreshing: false,
          refreshError: null
        })
      );
    });

    const refreshButton = container.querySelector('button[aria-label="立即更新 AI 热点"]');

    expect(refreshButton).not.toBeNull();
    expect(refreshButton?.textContent).toBe("立即更新");

    await act(async () => {
      refreshButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        React.createElement(NewsPanel, {
          items: sampleItems,
          updatedAt: "2026-05-14T08:05:00.000Z",
          size: "large",
          filter: "all",
          onFilterChange: () => undefined,
          onRefresh,
          isRefreshing: true,
          refreshError: null
        })
      );
    });

    const disabledRefreshButton = container.querySelector('button[aria-label="立即更新 AI 热点"]');

    expect(disabledRefreshButton).not.toBeNull();
    expect(disabledRefreshButton?.textContent).toBe("更新中...");
    expect((disabledRefreshButton as HTMLButtonElement | null)?.disabled).toBe(true);
  });

  it("opens news items through the local browser bridge", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(NewsPanel, {
          items: sampleItems,
          updatedAt: "2026-05-14T08:05:00.000Z",
          size: "large",
          filter: "all",
          onFilterChange: () => undefined,
          onRefresh: () => undefined,
          isRefreshing: false,
          refreshError: null
        })
      );
    });

    const newsLink = container.querySelector(".news-mini-timeline__item");

    expect(newsLink).not.toBeNull();

    await act(async () => {
      newsLink?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/open-url"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com/news-1"
        })
      })
    );
  });
});

describe("ModelManagementSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders masked API key state without exposing plaintext and fills provider defaults", async () => {
    const onSave = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(ModelManagementSection, {
          providers: [
            {
              id: "modelscope",
              name: "ModelScope / 魔搭",
              defaultBaseUrl: "https://modelscope.example/v1",
              requiresApiKey: true,
              authType: "bearer",
              supportedCapabilities: ["chat", "text", "vision"],
              defaultModels: ["Qwen/Test"],
              docsHint: "",
              compatibleMode: "openai"
            },
            {
              id: "openai",
              name: "OpenAI",
              defaultBaseUrl: "https://api.openai.com/v1",
              requiresApiKey: true,
              authType: "bearer",
              supportedCapabilities: ["chat", "text", "embedding"],
              defaultModels: ["gpt-test"],
              docsHint: "",
              compatibleMode: "openai"
            }
          ],
          profiles: [
            {
              id: "profile-1",
              displayName: "OpenAI Mini",
              provider: "openai",
              modelName: "gpt-test",
              baseUrl: "https://api.openai.com/v1",
              apiKeyRef: "secret:profile-1",
              capabilities: ["chat", "text"],
              temperature: 0.2,
              maxTokens: 1200,
              enabled: true,
              isDefault: true,
              purpose: ["general"],
              createdAt: "2026-05-19T00:00:00.000Z",
              updatedAt: "2026-05-19T00:00:00.000Z",
              hasApiKey: true,
              maskedKey: "sk-****abcd",
              apiKeySource: "local"
            }
          ],
          onSave,
          onDelete: vi.fn(),
          onTest: vi.fn(),
          testResult: null
        })
      );
    });

    expect(container.textContent).toContain("模型管理");
    expect(container.textContent).not.toContain("模块默认模型");
    expect(container.textContent).toContain("sk-****abcd");
    expect(container.textContent).not.toContain("sk-test-secret-abcd");
    expect(container.querySelector(".manage-card-grid--models")).not.toBeNull();
    expect(container.querySelector(".model-profile-card")).not.toBeNull();
    expect(container.querySelector(".model-profile-row")).toBeNull();

    const addButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "添加模型"
    );

    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const providerSelect = Array.from(container.querySelectorAll("select")).find(
      (select) => (select as HTMLSelectElement).value === "modelscope"
    ) as HTMLSelectElement;
    providerSelect.value = "openai";

    await act(async () => {
      providerSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const inputs = Array.from(container.querySelectorAll("input")) as HTMLInputElement[];
    expect(inputs.some((input) => input.value === "gpt-test")).toBe(true);
    expect(inputs.some((input) => input.value === "https://api.openai.com/v1")).toBe(true);
  });
});

describe("ManageModuleCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders model configuration inside a sub-agent card", async () => {
    const onAgentDefaultModelChange = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(ManageModuleCard, {
          preference: {
            id: "history",
            visible: true,
            showInNavigation: false,
            size: "smaller",
            collapsed: false,
            order: 5
          },
          displayName: "历史知识",
          modelProfiles: [
            {
              id: "profile-1",
              displayName: "DeepSeek History",
              provider: "deepseek",
              modelName: "deepseek-chat",
              baseUrl: "https://api.deepseek.com",
              apiKeyRef: "secret:profile-1",
              capabilities: ["chat", "text"],
              temperature: 0.2,
              maxTokens: 1200,
              enabled: true,
              isDefault: false,
              purpose: [],
              createdAt: "2026-05-20T00:00:00.000Z",
              updatedAt: "2026-05-20T00:00:00.000Z",
              hasApiKey: true,
              maskedKey: "sk-****abcd",
              apiKeySource: "local"
            }
          ],
          agentDefaultProfileId: "",
          onVisibleChange: vi.fn(),
          onNavigationChange: vi.fn(),
          onSizeChange: vi.fn(),
          onNameChange: vi.fn(),
          onAgentDefaultModelChange
        })
      );
    });

    expect(container.textContent).toContain("配置模型");
    const modelSelect = Array.from(container.querySelectorAll("select")).find((select) =>
      Array.from(select.options).some((option) => option.value === "profile-1")
    ) as HTMLSelectElement;

    expect(modelSelect).toBeTruthy();
    modelSelect.value = "profile-1";

    await act(async () => {
      modelSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onAgentDefaultModelChange).toHaveBeenCalledWith("profile-1");
  });
});
