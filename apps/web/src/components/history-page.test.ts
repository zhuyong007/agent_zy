// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type {
  DashboardData,
  HistoryDynastyModuleType,
  HistoryPostPayload,
  NotificationRecord
} from "@agent-zy/shared-types";

vi.mock("@tanstack/react-router", async () => {
  const react = await import("react");

  return {
    Link: ({
      children,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => react.createElement("a", props, children)
  };
});

vi.mock("./data-sync-control", async () => {
  const react = await import("react");
  return {
    DataSyncControl: ({ module }: { module: string }) =>
      react.createElement("div", { "data-sync-module": module })
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
    cardCount: 2,
    cards: [
      {
        title: "Route map",
        imageText: "From Chang'an to the west",
        prompt: "丝绸之路商队穿过沙漠驿站，竖版小红书历史知识卡片，主体清晰居中，时代服饰和器物准确，暖金光线，青灰地图背景，画面上方预留标题，下方保留解释文字空间，细节丰富但不拥挤"
      },
      {
        title: "Exchange map",
        imageText: "Goods and ideas moved together",
        prompt: "丝绸之路沿线城市交流货物与思想，竖版小红书历史知识卡片，主体清晰居中，时代服饰和器物准确，暖金光线，青灰地图背景，画面上方预留标题，下方保留解释文字空间，细节丰富但不拥挤"
      }
    ],
    xiaohongshuCaption: "Caption body for history post",
    generatedAt: "2026-05-22T08:00:00.000Z"
  }
};

function createDynastyModule(type: HistoryDynastyModuleType, topic: string) {
  return {
    type,
    topic,
    summary: `${topic} 摘要`,
    cover: {
      title: topic,
      subtitle: "一套完整封面方案",
      imageText: `${topic}\n关键人物 / 时间线 / 影响`,
      prompt: `${topic}，竖版小红书历史知识首图封面，强标题层级，主体清晰居中，时代场景准确，适当留白`
    },
    cardCount: 3,
    cards: [
      {
        title: `${topic} 图1`,
        imageText: "先讲背景",
        prompt: `${topic} 图1，竖版小红书历史知识卡片，主体清晰居中，历史时代准确，适当留白`
      },
      {
        title: `${topic} 图2`,
        imageText: "再讲转折",
        prompt: `${topic} 图2，竖版小红书历史知识卡片，主体清晰居中，历史时代准确，适当留白`
      },
      {
        title: `${topic} 图3`,
        imageText: "最后讲影响",
        prompt: `${topic} 图3，竖版小红书历史知识卡片，主体清晰居中，历史时代准确，适当留白`
      }
    ],
    xiaohongshuCaption: `${topic} 小红书正文`,
    generatedAt: "2026-05-23T08:00:00.000Z"
  };
}

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

const dynastyNotification: NotificationRecord = {
  id: "history-dynasty-1",
  kind: "history-post",
  title: "朝代四件套：东汉",
  body: "已生成东汉朝代四件套。",
  createdAt: "2026-05-23T08:00:00.000Z",
  persistent: true,
  read: false,
  payload: {
    dynasty: "东汉",
    modules: [
      createDynastyModule("王朝兴衰录", "东汉是怎么一步步走向灭亡的"),
      createDynastyModule("皇帝图鉴", "看懂东汉只需要认识这几位皇帝"),
      createDynastyModule("风云人物", "改变东汉命运的5个人"),
      createDynastyModule("历史冷知识", "东汉公务员一个月赚多少钱？")
    ]
  }
};

const dynastyDashboard: DashboardData = {
  ...dashboard,
  notifications: [dynastyNotification]
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
  importHistoryXhsAnalytics: vi.fn(async () => dashboard),
  cancelNotification: vi.fn(async () => dashboardAfterDelete),
  openDashboardStream: vi.fn(() => () => undefined),
  restartProject: vi.fn(async () => ({ ok: true }))
}));

import { cancelNotification, fetchDashboard, importHistoryXhsAnalytics } from "../api";
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

  async function renderHistoryPage(currentDashboard = dashboard) {
    vi.mocked(fetchDashboard).mockResolvedValueOnce(currentDashboard);

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

    queryClient.setQueryData(["dashboard"], currentDashboard);
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

  it("shows the history data synchronization control", async () => {
    await renderHistoryPage();
    expect(container.querySelector('[data-sync-module="history"]')).not.toBeNull();
  });

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
    const secondCopyPromptButton = container.querySelector(
      'button[aria-label="复制第2张生图提示词"]'
    ) as HTMLButtonElement | null;

    expect(copyCaptionButton).toBeTruthy();
    expect(copyPromptButton).toBeTruthy();
    expect(secondCopyPromptButton).toBeTruthy();

    await act(async () => {
      copyCaptionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenCalledWith("Caption body for history post");

    await act(async () => {
      copyPromptButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenLastCalledWith((historyNotification.payload as HistoryPostPayload).cards[0]?.prompt);

    await act(async () => {
      secondCopyPromptButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(copyPromptButton?.classList.contains("history-copy-button--copied")).toBe(true);
    expect(secondCopyPromptButton?.classList.contains("history-copy-button--copied")).toBe(true);
    expect(copyPromptButton?.textContent).toContain("已复制");
    expect(secondCopyPromptButton?.textContent).toContain("已复制");
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

    expect(writeText).toHaveBeenLastCalledWith((historyNotification.payload as HistoryPostPayload).cover?.prompt);
    expect(copyCoverPromptButton?.classList.contains("history-copy-button--copied")).toBe(true);
    expect(copyCoverPromptButton?.textContent).toContain("已复制");
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

  it("shows xiaohongshu analytics and imports them from an Excel file", async () => {
    await renderHistoryPage();

    expect(container.textContent).toContain("小红书数据总览");
    expect(container.textContent).toContain("张骞出使西域");
    expect(container.textContent).toContain("1,200");

    const syncButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("导入 Excel")
    ) as HTMLButtonElement | undefined;
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;

    expect(syncButton).toBeTruthy();
    expect(fileInput).toBeTruthy();

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [new File(["xlsx"], "笔记列表明细表.xlsx")],
        configurable: true
      });
      fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(importHistoryXhsAnalytics).toHaveBeenCalledTimes(1);
  });

  it("renders and copies dynasty four-module payloads", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true
    });

    await renderHistoryPage(dynastyDashboard);

    expect(container.textContent).toContain("东汉");
    expect(container.textContent).toContain("朝代四件套");
    expect(container.textContent).toContain("王朝兴衰录");
    expect(container.textContent).toContain("皇帝图鉴");
    expect(container.textContent).toContain("风云人物");
    expect(container.textContent).toContain("历史冷知识");
    expect(container.textContent).toContain("东汉是怎么一步步走向灭亡的");
    expect(container.textContent).toContain("东汉是怎么一步步走向灭亡的 图1");
    expect(container.textContent).toContain("小红书正文");

    const copyJsonButton = container.querySelector(
      'button[aria-label="复制朝代四件套 JSON"]'
    ) as HTMLButtonElement | null;
    let copyContentButton = container.querySelector(
      'button[aria-label="复制王朝兴衰录小红书正文"]'
    ) as HTMLButtonElement | null;
    let copyPromptButton = container.querySelector(
      'button[aria-label="复制王朝兴衰录第1张生图提示词"]'
    ) as HTMLButtonElement | null;
    let copyCoverPromptButton = container.querySelector(
      'button[aria-label="复制王朝兴衰录封面生图提示词"]'
    ) as HTMLButtonElement | null;
    let copyFinalContentButton = container.querySelector(
      'button[aria-label="复制王朝兴衰录末尾正文"]'
    ) as HTMLButtonElement | null;

    expect(copyJsonButton).toBeTruthy();
    expect(copyContentButton).toBeTruthy();
    expect(copyPromptButton).toBeTruthy();
    expect(copyCoverPromptButton).toBeTruthy();
    expect(copyFinalContentButton).toBeTruthy();

    await act(async () => {
      copyJsonButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const copyCalls = writeText.mock.calls as unknown as string[][];
    expect(JSON.parse(String(copyCalls[0]?.[0]))).toEqual(dynastyNotification.payload);

    copyContentButton = container.querySelector(
      'button[aria-label="复制王朝兴衰录小红书正文"]'
    ) as HTMLButtonElement | null;

    expect(copyContentButton).toBeTruthy();

    await act(async () => {
      copyContentButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenLastCalledWith("东汉是怎么一步步走向灭亡的 小红书正文");

    copyPromptButton = container.querySelector(
      'button[aria-label="复制王朝兴衰录第1张生图提示词"]'
    ) as HTMLButtonElement | null;

    await act(async () => {
      copyPromptButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenLastCalledWith(
      "东汉是怎么一步步走向灭亡的 图1，竖版小红书历史知识卡片，主体清晰居中，历史时代准确，适当留白"
    );
    expect(copyPromptButton?.classList.contains("history-copy-button--copied")).toBe(true);
    expect(copyPromptButton?.textContent).toContain("已复制");

    copyCoverPromptButton = container.querySelector(
      'button[aria-label="复制王朝兴衰录封面生图提示词"]'
    ) as HTMLButtonElement | null;

    await act(async () => {
      copyCoverPromptButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenLastCalledWith(
      "东汉是怎么一步步走向灭亡的，竖版小红书历史知识首图封面，强标题层级，主体清晰居中，时代场景准确，适当留白"
    );
    expect(copyCoverPromptButton?.classList.contains("history-copy-button--copied")).toBe(true);
    expect(copyCoverPromptButton?.textContent).toContain("已复制");

    copyFinalContentButton = container.querySelector(
      'button[aria-label="复制王朝兴衰录末尾正文"]'
    ) as HTMLButtonElement | null;

    await act(async () => {
      copyFinalContentButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenLastCalledWith("东汉是怎么一步步走向灭亡的 小红书正文");
    expect(copyFinalContentButton?.textContent).toContain("已复制");
  });

  it("keeps the history archive list independently scrollable", () => {
    const css = readFileSync(join(process.cwd(), "apps/web/src/styles.css"), "utf8");
    const archiveListRules = Array.from(css.matchAll(/\.history-archive__list\s*\{(?<body>[^}]+)\}/g));
    const archiveListRule = archiveListRules.at(-1)?.groups?.body ?? "";

    expect(archiveListRule).toContain("min-height: 0");
    expect(archiveListRule).toContain("overflow-y: auto");
  });
});
