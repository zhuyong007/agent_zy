import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createControlPlaneStore } from "./store";

describe("control-plane store", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, {
        recursive: true,
        force: true
      });
    }
  });

  it("normalizes legacy news data to the AI HOT state shape during load", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-store-test-"));
    tempDirs.push(dataDir);

    writeFileSync(
      join(dataDir, "state.json"),
      JSON.stringify({
        tasks: [],
        messages: [],
        notifications: [],
        ledger: {
          entries: [],
          modules: []
        },
        schedule: {
          items: [],
          pendingReview: null
        },
        news: {
          items: [
            {
              id: "news-1",
              title: "placeholder",
              summary: "placeholder",
              category: "ai-products",
              importance: "low",
              sourceCount: 1,
              sources: ["AI Daily"],
              rawItemIds: ["raw-1"],
              updatedAt: "2026-04-23T10:00:00.000Z"
            }
          ],
          rawItems: [
            {
              id: "raw-1",
              sourceId: "source-1",
              sourceName: "AI Daily",
              category: "ai-products",
              title: "placeholder",
              url: "https://news.example.com/story",
              publishedAt: "2026-04-23T10:00:00.000Z",
              fetchedAt: "2026-04-23T10:05:00.000Z",
              fingerprint: "raw-1"
            }
          ],
          sources: [
            {
              id: "source-1",
              name: "AI Daily",
              url: "data:application/rss+xml;charset=utf-8,placeholder",
              category: "ai-products",
              enabled: true,
              createdAt: "2026-04-23T08:00:00.000Z"
            }
          ],
          lastFetchedAt: "2026-04-23T10:05:00.000Z",
          lastUpdatedAt: "2026-04-23T10:05:00.000Z",
          lastSummarizedAt: "2026-04-23T10:05:00.000Z",
          lastSummaryInputItemIds: ["raw-1"],
          lastSummaryProvider: "fallback",
          lastSummaryError: null,
          status: "idle"
        },
        newsBodies: [],
        nightlyReview: {
          lastTriggeredDate: null
        }
      }),
      "utf8"
    );

    const store = createControlPlaneStore(dataDir);
    const state = store.getState() as any;

    expect(state.news).toMatchObject({
      feed: {
        items: []
      },
      daily: null,
      dailyArchive: [],
      lastError: null,
      status: "idle"
    });
    expect("newsBodies" in state).toBe(false);
  });

  it("keeps persistent notifications until they are explicitly cancelled", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-store-test-"));
    tempDirs.push(dataDir);
    const store = createControlPlaneStore(dataDir);

    store.addNotifications([
      {
        id: "history-1",
        kind: "history-post",
        title: "每日历史知识点",
        body: "一条常驻历史推文策划",
        createdAt: "2026-05-07T07:00:00.000Z",
        read: false,
        persistent: true,
        payload: {
          topic: "玄奘取经为什么重要",
          summary: "玄奘西行推动了知识交流。",
          cardCount: 1,
          cards: [
            {
              title: "路线",
              imageText: "从长安到那烂陀",
              prompt: "小红书历史知识卡片"
            }
          ],
          xiaohongshuCaption: "今天讲玄奘西行。",
          generatedAt: "2026-05-07T07:00:00.000Z"
        }
      } as any
    ]);
    store.addNotifications(
      Array.from({ length: 25 }, (_, index) => ({
        id: `normal-${index}`,
        kind: "task-update",
        title: `普通通知 ${index}`,
        body: "普通通知",
        createdAt: `2026-05-07T08:${String(index).padStart(2, "0")}:00.000Z`,
        read: false
      }))
    );

    expect(store.getState().notifications.some((item) => item.id === "history-1")).toBe(true);

    store.cancelNotification("history-1");

    expect(store.getState().notifications.some((item) => item.id === "history-1")).toBe(false);
  });

  it("persists home layout custom names in state.json", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-store-test-"));
    tempDirs.push(dataDir);
    const store = createControlPlaneStore(dataDir);

    store.setHomeLayout([
      ...store.getState().homeLayout.map((item) =>
        item.id === "news"
          ? {
              ...item,
              customName: "",
              showInNavigation: true
            }
          : item
      )
    ]);

    const reloadedStore = createControlPlaneStore(dataDir);

    expect(reloadedStore.getState().homeLayout.find((item) => item.id === "news")).toMatchObject({
      customName: "",
      showInNavigation: true
    });
  });

  it("bootstraps legacy ledger entries into dedicated facts during store initialization", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-store-test-"));
    tempDirs.push(dataDir);

    writeFileSync(
      join(dataDir, "state.json"),
      JSON.stringify({
        tasks: [],
        messages: [],
        notifications: [],
        homeLayout: [],
        ledger: {
          entries: [
            {
              id: "legacy-entry-1",
              module: "生活",
              direction: "expense",
              amount: 32,
              note: "午饭 32 元",
              createdAt: "2026-05-14T12:00:00.000Z",
              taskId: "task-1"
            }
          ],
          modules: ["工作", "生活"]
        },
        schedule: {
          items: [],
          pendingReview: null
        },
        news: {
          feed: {
            count: 0,
            hasNext: false,
            nextCursor: null,
            items: []
          },
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
        historyPush: {
          lastTriggeredDate: null
        },
        nightlyReview: {
          lastTriggeredDate: null
        }
      }),
      "utf8"
    );

    const store = createControlPlaneStore(dataDir);

    expect(existsSync(join(dataDir, "ledger", "facts.json"))).toBe(true);
    expect(existsSync(join(dataDir, "ledger", "semantics.json"))).toBe(true);
    expect(existsSync(join(dataDir, "ledger", "stages.json"))).toBe(true);
    expect(existsSync(join(dataDir, "ledger", "reports.json"))).toBe(true);
    expect(existsSync(join(dataDir, "ledger", "memories.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(dataDir, "ledger", "facts.json"), "utf8"))).toEqual([
      {
        id: "legacy-entry-1",
        sourceType: "manual_edit",
        rawText: "午饭 32 元",
        normalizedText: "午饭 32 元",
        direction: "expense",
        amountCents: 3200,
        currency: "CNY",
        occurredAt: "2026-05-14T12:00:00.000Z",
        recordedAt: "2026-05-14T12:00:00.000Z",
        status: "confirmed",
        taskId: "task-1"
      }
    ]);
    expect(store.getState().ledger.dashboard).toEqual({
      todayIncomeCents: 0,
      todayExpenseCents: 0,
      rolling7dNetCents: 0,
      recentFacts: [],
      coachTip: null,
      pendingReviewCount: 0
    });
  });

  it("throws instead of rebuilding a corrupted state.json", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-store-test-"));
    tempDirs.push(dataDir);

    writeFileSync(join(dataDir, "state.json"), "{not-valid-json", "utf8");

    expect(() => createControlPlaneStore(dataDir)).toThrow(/state\.json/);
  });

  it("builds ledger dashboard summary from repository facts and semantics", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-store-test-"));
    tempDirs.push(dataDir);

    writeFileSync(
      join(dataDir, "state.json"),
      JSON.stringify({
        tasks: [],
        messages: [],
        notifications: [],
        homeLayout: [],
        ledger: {
          entries: [
            {
              id: "legacy-entry-1",
              module: "生活",
              direction: "expense",
              amount: 999,
              note: "不应驱动 dashboard",
              createdAt: "2026-05-14T08:00:00.000Z",
              taskId: "legacy-task"
            }
          ],
          modules: ["工作", "游戏", "生活"],
          dashboard: {
            todayIncomeCents: 1,
            todayExpenseCents: 2,
            rolling7dNetCents: 3,
            recentFacts: [],
            coachTip: "stale",
            pendingReviewCount: 99
          }
        },
        schedule: {
          items: [],
          pendingReview: null
        },
        news: {
          feed: {
            count: 0,
            hasNext: false,
            nextCursor: null,
            items: []
          },
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
        historyPush: {
          lastTriggeredDate: null
        },
        nightlyReview: {
          lastTriggeredDate: null
        }
      }),
      "utf8"
    );

    mkdirSync(join(dataDir, "ledger"), { recursive: true });
    writeFileSync(
      join(dataDir, "ledger", "facts.json"),
      JSON.stringify(
        [
          {
            id: "fact-1",
            sourceType: "chat",
            rawText: "昨天和老婆吃火锅花了 280",
            normalizedText: "昨天和老婆吃火锅花了 280",
            direction: "expense",
            amountCents: 28000,
            currency: "CNY",
            occurredAt: "2026-05-14T12:00:00.000+08:00",
            recordedAt: "2026-05-14T12:00:05.000+08:00",
            counterparty: "老婆",
            status: "confirmed"
          },
          {
            id: "fact-2",
            sourceType: "chat",
            rawText: "今天梦幻西游卖货赚了 500",
            normalizedText: "今天梦幻西游卖货赚了 500",
            direction: "income",
            amountCents: 50000,
            currency: "CNY",
            occurredAt: "2026-05-14T09:00:00.000+08:00",
            recordedAt: "2026-05-14T09:00:05.000+08:00",
            status: "confirmed"
          },
          {
            id: "fact-3",
            sourceType: "chat",
            rawText: "和同事吃面 66",
            normalizedText: "和同事吃面 66",
            direction: "expense",
            amountCents: 6600,
            currency: "CNY",
            occurredAt: "2026-05-12T20:00:00.000+08:00",
            recordedAt: "2026-05-12T20:00:03.000+08:00",
            status: "needs_review"
          },
          {
            id: "fact-6",
            sourceType: "chat",
            rawText: "昨天早餐 30",
            normalizedText: "昨天早餐 30",
            direction: "expense",
            amountCents: 3000,
            currency: "CNY",
            occurredAt: "2026-05-13T08:00:00.000+08:00",
            recordedAt: "2026-05-13T08:00:05.000+08:00",
            status: "confirmed"
          },
          {
            id: "fact-4",
            sourceType: "chat",
            rawText: "工资到账 1200",
            normalizedText: "工资到账 1200",
            direction: "income",
            amountCents: 120000,
            currency: "CNY",
            occurredAt: "2026-05-09T09:00:00.000+08:00",
            recordedAt: "2026-05-09T09:00:03.000+08:00",
            status: "confirmed"
          },
          {
            id: "fact-5",
            sourceType: "chat",
            rawText: "过期记录 10",
            normalizedText: "过期记录 10",
            direction: "expense",
            amountCents: 1000,
            currency: "CNY",
            occurredAt: "2026-05-05T10:00:00.000+08:00",
            recordedAt: "2026-05-05T10:00:03.000+08:00",
            status: "confirmed"
          }
        ],
        null,
        2
      ),
      "utf8"
    );
    writeFileSync(
      join(dataDir, "ledger", "semantics.json"),
      JSON.stringify(
        [
          {
            factId: "fact-1",
            primaryCategory: "餐饮",
            secondaryCategories: ["火锅"],
            tags: [],
            people: ["老婆"],
            scene: "火锅",
            lifeStageIds: [],
            confidence: 0.9,
            reasoningSummary: "规则命中火锅餐饮",
            parserVersion: "test-v1"
          },
          {
            factId: "fact-3",
            primaryCategory: "餐饮",
            secondaryCategories: [],
            tags: [],
            people: ["同事"],
            lifeStageIds: [],
            confidence: 0.7,
            reasoningSummary: "规则命中餐饮",
            parserVersion: "test-v1"
          },
          {
            factId: "fact-6",
            primaryCategory: "餐饮",
            secondaryCategories: ["早餐"],
            tags: [],
            people: [],
            lifeStageIds: [],
            confidence: 0.72,
            reasoningSummary: "规则命中早餐餐饮",
            parserVersion: "test-v1"
          }
        ],
        null,
        2
      ),
      "utf8"
    );

    const realDateNow = Date.now;
    Date.now = () => new Date("2026-05-14T14:30:00+08:00").valueOf();

    try {
      const store = createControlPlaneStore(dataDir);
      const dashboard = store.getDashboard([], []);

      expect(dashboard.ledger.summary).toEqual({
        todayExpense: 999,
        todayIncome: 0,
        balance: -999
      });
      expect(dashboard.ledger.dashboard).toEqual({
        todayIncomeCents: 50000,
        todayExpenseCents: 28000,
        rolling7dNetCents: 139000,
        recentFacts: [
          {
            id: "fact-1",
            direction: "expense",
            amountCents: 28000,
            occurredAt: "2026-05-14T12:00:00.000+08:00",
            summary: "餐饮 · 昨天和老婆吃火锅花了 280"
          },
          {
            id: "fact-2",
            direction: "income",
            amountCents: 50000,
            occurredAt: "2026-05-14T09:00:00.000+08:00",
            summary: "今天梦幻西游卖货赚了 500"
          },
          {
            id: "fact-6",
            direction: "expense",
            amountCents: 3000,
            occurredAt: "2026-05-13T08:00:00.000+08:00",
            summary: "餐饮 · 昨天早餐 30"
          }
        ],
        coachTip: "最近餐饮支出较频繁，留意外食节奏。",
        pendingReviewCount: 1
      });
    } finally {
      Date.now = realDateNow;
    }
  });

  it("falls back to pending review coach tip when no frequent dining pattern exists", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-store-test-"));
    tempDirs.push(dataDir);

    writeFileSync(
      join(dataDir, "state.json"),
      JSON.stringify({
        tasks: [],
        messages: [],
        notifications: [],
        homeLayout: [],
        ledger: {
          entries: [],
          modules: ["工作", "游戏", "生活"]
        },
        schedule: {
          items: [],
          pendingReview: null
        },
        news: {
          feed: {
            count: 0,
            hasNext: false,
            nextCursor: null,
            items: []
          },
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
        historyPush: {
          lastTriggeredDate: null
        },
        nightlyReview: {
          lastTriggeredDate: null
        }
      }),
      "utf8"
    );

    mkdirSync(join(dataDir, "ledger"), { recursive: true });
    writeFileSync(
      join(dataDir, "ledger", "facts.json"),
      JSON.stringify(
        [
          {
            id: "fact-a",
            sourceType: "chat",
            rawText: "打车 45",
            normalizedText: "打车 45",
            direction: "expense",
            amountCents: 4500,
            currency: "CNY",
            occurredAt: "2026-05-14T10:00:00.000+08:00",
            recordedAt: "2026-05-14T10:00:05.000+08:00",
            status: "needs_review"
          }
        ],
        null,
        2
      ),
      "utf8"
    );
    writeFileSync(join(dataDir, "ledger", "semantics.json"), JSON.stringify([], null, 2), "utf8");

    const realDateNow = Date.now;
    Date.now = () => new Date("2026-05-14T14:30:00+08:00").valueOf();

    try {
      const store = createControlPlaneStore(dataDir);
      const dashboard = store.getDashboard([], []);

      expect(dashboard.ledger.dashboard.coachTip).toBe(
        "你有待确认的账目，建议补充金额或场景。"
      );
      expect(dashboard.ledger.dashboard.todayExpenseCents).toBe(0);
      expect(dashboard.ledger.dashboard.rolling7dNetCents).toBe(0);
      expect(dashboard.ledger.dashboard.recentFacts).toEqual([]);
    } finally {
      Date.now = realDateNow;
    }
  });

  it("uses the same business-date rule for legacy summary and repository dashboard", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "agent-zy-store-test-"));
    tempDirs.push(dataDir);

    writeFileSync(
      join(dataDir, "state.json"),
      JSON.stringify({
        tasks: [],
        messages: [],
        notifications: [],
        homeLayout: [],
        ledger: {
          entries: [
            {
              id: "legacy-boundary-1",
              module: "生活",
              direction: "expense",
              amount: 10,
              note: "凌晨前夜宵",
              createdAt: "2026-05-13T16:30:00.000Z",
              taskId: "task-boundary"
            }
          ],
          modules: ["工作", "游戏", "生活"]
        },
        schedule: {
          items: [],
          pendingReview: null
        },
        news: {
          feed: {
            count: 0,
            hasNext: false,
            nextCursor: null,
            items: []
          },
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
        historyPush: {
          lastTriggeredDate: null
        },
        nightlyReview: {
          lastTriggeredDate: null
        }
      }),
      "utf8"
    );

    mkdirSync(join(dataDir, "ledger"), { recursive: true });
    writeFileSync(
      join(dataDir, "ledger", "facts.json"),
      JSON.stringify(
        [
          {
            id: "fact-boundary-1",
            sourceType: "chat",
            rawText: "凌晨前夜宵 10",
            normalizedText: "凌晨前夜宵 10",
            direction: "expense",
            amountCents: 1000,
            currency: "CNY",
            occurredAt: "2026-05-13T16:30:00.000Z",
            recordedAt: "2026-05-13T16:31:00.000Z",
            status: "confirmed"
          }
        ],
        null,
        2
      ),
      "utf8"
    );
    writeFileSync(join(dataDir, "ledger", "semantics.json"), JSON.stringify([], null, 2), "utf8");

    const realDateNow = Date.now;
    Date.now = () => new Date("2026-05-14T14:30:00+08:00").valueOf();

    try {
      const store = createControlPlaneStore(dataDir);
      const dashboard = store.getDashboard([], []);

      expect(dashboard.ledger.summary).toEqual({
        todayExpense: 10,
        todayIncome: 0,
        balance: -10
      });
      expect(dashboard.ledger.dashboard.todayExpenseCents).toBe(1000);
    } finally {
      Date.now = realDateNow;
    }
  });
});
