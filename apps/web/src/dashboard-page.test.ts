// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { DashboardData, NewsFeedItem } from "@agent-zy/shared-types";
import { getDefaultHomeLayout } from "./home-layout";

vi.mock("@tanstack/react-router", async () => {
  const react = await import("react");

  return {
    Link: ({
      children,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => react.createElement("a", props, children)
  };
});

import { CinematicPanel, CommandRail, ManageModuleCard, ModelManagementSection, NewsPanel } from "./components/dashboard-page";

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

function createCinematicDashboard(): DashboardData {
  const project = {
    id: "cinematic-1",
    title: "凌晨两点的城市",
    concept: "孤独感的城市夜晚",
    mood: "孤独",
    script: "城市从不睡觉，只是把孤独留给凌晨两点的人。",
    storyboard: [
      {
        id: "shot-1",
        title: "雨后街口",
        purpose: "建立孤独空间",
        duration: "5 秒",
        cameraMovement: "缓慢推进",
        shotType: "环境人物镜头",
        composition: "人物偏右，大面积负空间",
        transition: "溶接",
        audioHint: "低频城市环境音",
        emotionalBeat: "压抑",
        prompt: {
          zh: "雨后街口，冷蓝霓虹，镜头缓慢推进，人物被压在画面边缘。",
          en: "Rainy neon city street, slow cinematic push in, lonely figure at the edge of frame."
        }
      }
    ],
    createdAt: "2026-05-22T08:00:00.000Z",
    updatedAt: "2026-05-22T08:00:00.000Z",
    tags: ["城市"],
    style: "冷蓝霓虹",
    pace: "缓慢",
    targetShotCount: 4
  };

  return {
    tasks: { todo: [], inProgress: [], waitingFeedback: [], done: [] },
    recentTasks: [],
    messages: [],
    notifications: [],
    homeLayout: [],
    ledger: {
      entries: [],
      modules: [],
      summary: { todayExpense: 0, todayIncome: 0, balance: 0 },
      dashboard: {
        todayIncomeCents: 0,
        todayExpenseCents: 0,
        rolling7dNetCents: 0,
        recentFacts: [],
        coachTip: null,
        pendingReviewCount: 0
      }
    },
    schedule: { items: [], pendingReview: null, todayItems: [] },
    news: {
      feed: { count: 0, hasNext: false, nextCursor: null, items: [] },
      daily: null,
      dailyArchive: [],
      lastFetchedAt: null,
      lastUpdatedAt: null,
      lastError: null,
      status: "idle"
    },
    topics: {
      dimensions: [],
      current: [],
      currentByDimension: [],
      history: [],
      lastGeneratedAt: null,
      status: "idle",
      strategy: "manual-curation",
      lastError: null
    },
    cinematic: {
      projects: [project],
      recentProjectIds: [project.id],
      lastGeneratedAt: project.updatedAt,
      status: "idle",
      lastError: null,
      dashboard: {
        projectCount: 1,
        recentProjects: [project],
        latestProject: project,
        lastGeneratedAt: project.updatedAt,
        totalShotCount: 1,
        todayInspiration: "孤独 · 冷蓝霓虹"
      }
    },
    classicShots: {
      projects: [],
      recentProjectIds: [],
      lastGeneratedAt: null,
      status: "idle",
      lastError: null,
      dashboard: {
        projectCount: 0,
        recentProjects: [],
        latestProject: null,
        lastGeneratedAt: null,
        totalStoryboardCount: 0,
        todayReference: "选择一个有明确出处的经典镜头"
      }
    },
    summary: {
      entries: [],
      drafts: [],
      lastUpdatedAt: null,
      settings: { defaultSummaryType: "daily" },
      dashboard: {
        todaySummaryStatus: "missing",
        weekSummaryStatus: "missing",
        latestSummary: null,
        recentKeywords: [],
        recentMoodTags: [],
        totalCount: 0,
        dailyCount: 0,
        weeklyCount: 0,
        monthlyCount: 0,
        yearlyCount: 0
      }
    },
    agents: []
  };
}

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

describe("CommandRail", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders a restart button beside the clock when provided", async () => {
    const onRestartProject = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(CommandRail, {
          activeSection: "home",
          expanded: true,
          onToggle: () => undefined,
          themeKey: "night",
          onThemeChange: () => undefined,
          rightMeta: [],
          clockLine: "2026-05-21 21:20:00 · 星期四 · 农历四月初五",
          onRestartProject
        })
      );
    });

    const restartButton = container.querySelector('button[aria-label="重启项目"]');

    expect(restartButton).not.toBeNull();

    await act(async () => {
      restartButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onRestartProject).toHaveBeenCalledTimes(1);
  });

  it("always renders the tools and structured logs navigation entries", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(CommandRail, {
          activeSection: "home",
          expanded: true,
          onToggle: () => undefined,
          themeKey: "night",
          onThemeChange: () => undefined,
          rightMeta: [],
          clockLine: "2026-05-21 21:20:00 · 星期四 · 农历四月初五",
          navigationLayout: []
        })
      );
    });

    expect(container.textContent).toContain("日志");
    expect(container.textContent).toContain("工具");
    });
  });

  it("renders browser automation navigation when enabled", async () => {
    const layout = getDefaultHomeLayout().map((item) => ({
      ...item,
      showInNavigation: item.id === "browserAutomation"
    }));
    const testContainer = document.createElement("div");
    document.body.appendChild(testContainer);
    const testRoot = createRoot(testContainer);

    await act(async () => {
      testRoot.render(React.createElement(CommandRail, {
        activeSection: "browserAutomation",
        expanded: true,
        onToggle: () => undefined,
        themeKey: "night",
        onThemeChange: () => undefined,
        rightMeta: [],
        clockLine: "2026-05-21 21:20:00 · 星期四 · 农历四月初五",
        navigationLayout: layout
      }));
    });

    const browserAutomationLink = Array.from(testContainer.querySelectorAll("a"))
      .find((link) => link.textContent?.includes("浏览器自动化"));

    expect(browserAutomationLink?.getAttribute("to")).toBe("/tools/browser-automation");

    act(() => {
      testRoot.unmount();
    });
    testContainer.remove();
  });

describe("CinematicPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders cinematic dashboard summary and quick generation entry", async () => {
    const queryClient = new QueryClient();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(CinematicPanel, {
            dashboard: createCinematicDashboard(),
            size: "large"
          })
        )
      );
    });

    expect(container.textContent).toContain("电影镜头");
    expect(container.textContent).toContain("今日灵感");
    expect(container.textContent).toContain("凌晨两点的城市");
    expect(container.querySelector('input[aria-label="快速生成电影分镜"]')).not.toBeNull();
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
    expect(container.querySelector(".manage-card--interactive")).not.toBeNull();

    const sizeSelect = Array.from(container.querySelectorAll("select")).find(
      (select) => (select as HTMLSelectElement).value === "smaller"
    ) as HTMLSelectElement;

    expect(sizeSelect).toBeTruthy();

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
