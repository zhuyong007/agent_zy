// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { DashboardData, NotificationRecord } from "@agent-zy/shared-types";

vi.mock("@tanstack/react-router", async () => {
  const react = await import("react");

  return {
    Link: ({
      children,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => react.createElement("a", props, children)
  };
});

const historyNotification: NotificationRecord = {
  id: "history-1",
  kind: "history-post",
  title: "Daily history topic",
  body: "A compact summary",
  createdAt: "2026-05-22T08:00:00.000Z",
  persistent: true,
  read: false,
  payload: {
    topic: "Silk Road",
    summary: "A compact summary",
    cover: {
      title: "Silk Road",
      subtitle: "A trade route that moved ideas",
      imageText: "Silk Road\nroutes / exchanges / long-term impact",
      prompt: "丝绸之路，竖版小红书历史知识首图封面，强标题层级，主体清晰居中，时代服饰和器物准确，背景包含地图、书卷、驿站与柔和光线，暖金与青灰配色，画面上方预留醒目中文标题区域，中部留出副标题和知识标签，下方保留简短解释文字空间，适合信息流首屏点击"
    },
    cardCount: 1,
    cards: [
      {
        title: "Route map",
        imageText: "From Chang'an to the west",
        prompt: "丝绸之路商队穿过沙漠驿站，竖版小红书历史知识卡片，主体清晰居中，时代服饰和器物准确，暖金光线，青灰地图背景，画面上方预留标题，下方保留解释文字空间，细节丰富但不拥挤"
      }
    ],
    xiaohongshuCaption: "Caption body for history post",
    generatedAt: "2026-05-22T08:00:00.000Z"
  }
};

const dashboard: DashboardData = {
  notifications: [historyNotification],
  homeLayout: [],
  recentTasks: [],
  historyXhs: {
    posts: [
      {
        id: "note-1",
        title: "张骞出使西域",
        publishedAt: "2026-05-20T08:00:00.000Z",
        url: "https://www.xiaohongshu.com/explore/note-1",
        views: 1200,
        likes: 88,
        collects: 19,
        comments: 7,
        shares: 3
      }
    ],
    overview: {
      postCount: 1,
      totalViews: 1200,
      totalLikes: 88,
      totalCollects: 19,
      totalComments: 7,
      totalShares: 3,
      engagementRate: 117 / 1200
    },
    lastSyncedAt: "2026-05-24T08:00:00.000Z",
    status: "idle",
    lastError: null,
    sourceUrl: "https://creator.xiaohongshu.com/statistics/data-analysis"
  }
} as unknown as DashboardData;

const dashboardAfterDelete: DashboardData = {
  ...dashboard,
  notifications: []
};

vi.mock("../api", () => ({
  fetchDashboard: vi.fn(async () => dashboard),
  fetchHomeLayout: vi.fn(async () => []),
  saveHomeLayout: vi.fn(async (layout) => layout),
  generateHistory: vi.fn(async () => dashboard),
  reportClientEvent: vi.fn(async () => ({ ok: true })),
  syncHistoryXhsAnalytics: vi.fn(async () => dashboard),
  cancelNotification: vi.fn(async () => dashboardAfterDelete),
  openDashboardStream: vi.fn(() => () => undefined),
  restartProject: vi.fn(async () => ({ ok: true }))
}));

import { cancelNotification, syncHistoryXhsAnalytics } from "../api";
import { HistoryPage } from "./history-page";

describe("HistoryPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  async function renderHistoryPage() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        },
        mutations: {
          retry: false
        }
      }
    });

    queryClient.setQueryData(["dashboard"], dashboard);
    queryClient.setQueryData(["home-layout"], []);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(HistoryPage)
        )
      );
    });
  }

  it("copies caption and image prompt text from the selected history item", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true
    });

    await renderHistoryPage();

    const copyCaptionButton = container.querySelector(
      'button[aria-label="复制正文"]'
    ) as HTMLButtonElement | null;
    const copyPromptButton = container.querySelector(
      'button[aria-label="复制第1张生图提示词"]'
    ) as HTMLButtonElement | null;

    expect(copyCaptionButton).toBeTruthy();
    expect(copyPromptButton).toBeTruthy();

    await act(async () => {
      copyCaptionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenCalledWith("Caption body for history post");

    await act(async () => {
      copyPromptButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenLastCalledWith(historyNotification.payload?.cards[0]?.prompt);
  });

  it("shows and copies xiaohongshu cover plan text from the selected history item", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true
    });

    await renderHistoryPage();

    expect(container.textContent).toContain("封面方案");
    expect(container.textContent).toContain("Silk Road");
    expect(container.textContent).toContain("A trade route that moved ideas");

    const copyCoverTextButton = container.querySelector(
      'button[aria-label="复制封面文案"]'
    ) as HTMLButtonElement | null;
    const copyCoverPromptButton = container.querySelector(
      'button[aria-label="复制封面生图提示词"]'
    ) as HTMLButtonElement | null;

    expect(copyCoverTextButton).toBeTruthy();
    expect(copyCoverPromptButton).toBeTruthy();

    await act(async () => {
      copyCoverTextButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenCalledWith(
      "Silk Road\nA trade route that moved ideas\nSilk Road\nroutes / exchanges / long-term impact"
    );

    await act(async () => {
      copyCoverPromptButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenLastCalledWith(historyNotification.payload?.cover?.prompt);
  });

  it("deletes an archived history notification from the history list", async () => {
    await renderHistoryPage();

    const deleteButton = container.querySelector(
      'button[aria-label="删除 Silk Road"]'
    ) as HTMLButtonElement | null;

    expect(deleteButton).toBeTruthy();

    await act(async () => {
      deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(cancelNotification).toHaveBeenCalledWith("history-1");
  });

  it("shows xiaohongshu analytics and syncs them on demand", async () => {
    await renderHistoryPage();

    expect(container.textContent).toContain("小红书数据总览");
    expect(container.textContent).toContain("张骞出使西域");
    expect(container.textContent).toContain("1,200");

    const syncButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("获取小红书数据")
    ) as HTMLButtonElement | undefined;

    expect(syncButton).toBeTruthy();

    await act(async () => {
      syncButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(syncHistoryXhsAnalytics).toHaveBeenCalledTimes(1);
  });
});
